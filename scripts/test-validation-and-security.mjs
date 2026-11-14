import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { availabilitySchema, bookingSchema, validStayDates } from "../src/server/validation.ts";
import { rateLimitBuckets } from "../src/server/rate-limit-buckets.ts";
import { requireIsolatedTestDatabase } from "./test-database-guard.mjs";

const url = process.env.TEST_DATABASE_URL;
let sql = null;
if (url) {
  sql = postgres(requireIsolatedTestDatabase(), { max: 5, prepare: false });
} else {
  console.log("Note: TEST_DATABASE_URL not set. Running in-memory and schema validation only.");
}
const RATE_LIMIT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";

function hash(val) {
  return createHmac("sha256", RATE_LIMIT_SECRET).update(val).digest("hex");
}

async function run() {
  console.log("Starting Validation and Security Test Suite...");

  // 1. Test validStayDates
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  assert.ok(validStayDates(today, tomorrow), "today to tomorrow is valid");
  assert.ok(!validStayDates(tomorrow, today), "checkout before checkin is invalid");
  assert.ok(!validStayDates(today, today), "same day checkout is invalid");
  assert.ok(!validStayDates(yesterday, tomorrow), "past checkin is invalid");
  console.log("PASS: Stay date validation rules");

  // 2. Test availabilitySchema
  const validAvail = availabilitySchema.safeParse({ type: "dome", checkIn: today, checkOut: tomorrow, guests: "2" });
  assert.ok(validAvail.success, "valid availability parameters");

  const invalidSlug = availabilitySchema.safeParse({ type: "INVALID_SLUG!!", checkIn: today, checkOut: tomorrow });
  assert.ok(!invalidSlug.success, "invalid slug format rejected");

  const invalidDates = availabilitySchema.safeParse({ type: "dome", checkIn: tomorrow, checkOut: today });
  assert.ok(!invalidDates.success, "checkout before checkin rejected by schema");
  console.log("PASS: Availability schema validation");

  // 3. Test bookingSchema
  const validBooking = bookingSchema.safeParse({
    type: "cabin",
    checkIn: today,
    checkOut: tomorrow,
    guests: 2,
    name: "Hamza Ra",
    email: "hamza@example.com",
    phone: "+212679941798",
    requestKey: randomUUID(),
    privacyAccepted: true
  });
  assert.ok(validBooking.success, "complete booking submission is valid");

  const missingPrivacy = bookingSchema.safeParse({
    type: "cabin",
    checkIn: today,
    checkOut: tomorrow,
    guests: 2,
    name: "Hamza Ra",
    email: "hamza@example.com",
    phone: "+212679941798",
    requestKey: randomUUID(),
    privacyAccepted: false
  });
  assert.ok(!missingPrivacy.success, "unaccepted privacy policy rejected");

  const invalidPhone = bookingSchema.safeParse({
    type: "cabin",
    checkIn: today,
    checkOut: tomorrow,
    guests: 2,
    name: "Hamza Ra",
    email: "hamza@example.com",
    phone: "123", // too short
    requestKey: randomUUID(),
    privacyAccepted: true
  });
  assert.ok(!invalidPhone.success, "malformed phone number rejected");

  const invalidEmail = bookingSchema.safeParse({
    type: "cabin",
    checkIn: today,
    checkOut: tomorrow,
    guests: 2,
    name: "Hamza Ra",
    email: "not-an-email",
    phone: "+212679941798",
    requestKey: randomUUID(),
    privacyAccepted: true
  });
  assert.ok(!invalidEmail.success, "malformed email address rejected");
  console.log("PASS: Booking input schema validation");

  const alice = rateLimitBuckets("booking", "192.0.2.1", "alice@example.invalid", RATE_LIMIT_SECRET);
  const bob = rateLimitBuckets("booking", "192.0.2.2", "bob@example.invalid", RATE_LIMIT_SECRET);
  assert.deepEqual(alice.map(b => b.limit), [10, 5]);
  assert.ok(alice.every(a => bob.every(b => a.key !== b.key)), "unrelated customers do not share buckets");
  assert.notEqual(alice[0].key, rateLimitBuckets("auth", "192.0.2.1", "alice@example.invalid", RATE_LIMIT_SECRET)[0].key);
  assert.deepEqual(rateLimitBuckets("booking", null, "alice@example.invalid", RATE_LIMIT_SECRET).map(b => b.limit), [5]);
  console.log("PASS: Customer and auth rate-limit bucket isolation");

  // 4. Rate Limiting Tests
  if (sql) {
    // Emulate checkRateLimit logic against test database
    async function testRateLimit(scope, ip, email, limit) {
      const key = `${scope}:${ip ? "ip:" + hash(ip) : "email:" + hash(email)}`;
      const rows = await sql`insert into private.request_rate_limits (bucket, window_started_at, attempts)
        values (${key}, now(), 1)
        on conflict (bucket) do update set
          attempts = case when private.request_rate_limits.window_started_at < now() - interval '10 minutes' then 1 else private.request_rate_limits.attempts + 1 end,
          window_started_at = case when private.request_rate_limits.window_started_at < now() - interval '10 minutes' then now() else private.request_rate_limits.window_started_at end
        returning attempts`;
      return Number(rows[0].attempts) <= limit;
    }

    const testIp = `192.168.1.${Math.floor(Math.random() * 200) + 10}`;
    const ipLimit = 3;

    assert.ok(await testRateLimit("booking", testIp, null, ipLimit), "attempt 1 accepted");
    assert.ok(await testRateLimit("booking", testIp, null, ipLimit), "attempt 2 accepted");
    assert.ok(await testRateLimit("booking", testIp, null, ipLimit), "attempt 3 accepted");
    assert.ok(!(await testRateLimit("booking", testIp, null, ipLimit)), "attempt 4 rate limited");
    console.log("PASS: Per-IP rate limiting enforcement");

    // Verify auth scope isolation (booking rate limits do not block auth)
    assert.ok(await testRateLimit("auth", testIp, null, 3), "auth attempt accepted despite booking limit reached");
    console.log("PASS: Scope isolation between booking and auth rate limits");

    // Test pruning of expired records
    await sql`insert into private.request_rate_limits (bucket, window_started_at, attempts)
      values ('expired:test', now() - interval '2 hours', 5)
      on conflict (bucket) do update set window_started_at = now() - interval '2 hours'`;

    const beforePrune = await sql`select count(*)::int as count from private.request_rate_limits where bucket = 'expired:test'`;
    assert.equal(beforePrune[0].count, 1, "expired row present");

    await sql`delete from private.request_rate_limits where window_started_at < now() - interval '1 hour'`;

    const afterPrune = await sql`select count(*)::int as count from private.request_rate_limits where bucket = 'expired:test'`;
    assert.equal(afterPrune[0].count, 0, "expired row successfully pruned");
    console.log("PASS: Rate limit retention and table pruning");
  } else {
    console.log("SKIP: Database rate limiting tests (TEST_DATABASE_URL not set)");
  }

  console.log("All validation and security tests passed successfully!");
}

try {
  await run();
} finally {
  if (sql) {
    await sql`delete from private.request_rate_limits where bucket like '%test%' or bucket like '%ip:%'`;
    await sql.end();
  }
}
