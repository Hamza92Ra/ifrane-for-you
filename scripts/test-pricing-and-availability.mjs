import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { requireIsolatedTestDatabase } from "./test-database-guard.mjs";

const url = requireIsolatedTestDatabase();

const sql = postgres(url, { max: 5, prepare: false });
const slug = `pricing-qa-${randomUUID().slice(0, 8)}`;
let typeId;

async function run() {
  console.log("Starting Pricing and Availability Test Suite...");

  // 1. Setup accommodation type with base price
  const typeRow = await sql`insert into public.accommodation_types
    (slug, names, descriptions, amenities, max_guests, base_price, currency, published)
    values (${slug}, ${sql.json({ fr: "Test Prix", en: "Price Test" })}, ${sql.json({})}, ${sql.json({})}, 4, 1200.00, 'MAD', true)
    returning id`;
  typeId = typeRow[0].id;

  // Add 2 active units
  const unit1 = await sql`insert into public.accommodation_units (type_id, unit_code, active) values (${typeId}::uuid, 'P-01', true) returning id`;
  const unit2 = await sql`insert into public.accommodation_units (type_id, unit_code, active) values (${typeId}::uuid, 'P-02', true) returning id`;

  // Test 1: Base price across 3 nights
  const checkIn = "2026-12-01";
  const checkOut = "2026-12-04"; // 3 nights

  // Helper pricing calculation matching availability.ts
  async function computePrice(tSlug, inD, outD) {
    const types = await sql`select id, base_price, currency from public.accommodation_types where slug = ${tSlug} and published`;
    if (!types.length) return null;
    const { id: tId, base_price, currency: baseCurrency } = types[0];
    const inDate = new Date(`${inD}T00:00:00Z`);
    const outDate = new Date(`${outD}T00:00:00Z`);
    const nights = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
    if (nights <= 0) return null;
    const rules = await sql`select start_date::text as start_date, end_date::text as end_date, nightly_price, currency, priority
      from public.pricing_rules
      where type_id = ${tId}::uuid and active
      and daterange(start_date, end_date, '[)') && daterange(${inD}::date, ${outD}::date, '[)')
      order by priority desc, created_at desc`;
    if (base_price === null && rules.length === 0) return null;
    let total = 0;
    let hasSpecialRates = false;
    let currency = (baseCurrency ? String(baseCurrency).trim() : "") || (rules[0]?.currency ? String(rules[0].currency).trim() : "") || "MAD";
    for (let i = 0; i < nights; i++) {
      const cur = new Date(inDate);
      cur.setUTCDate(cur.getUTCDate() + i);
      const dayStr = cur.toISOString().slice(0, 10);
      const match = rules.find((r) => dayStr >= r.start_date && dayStr < r.end_date);
      if (match) {
        total += Number(match.nightly_price);
        currency = String(match.currency).trim();
        hasSpecialRates = true;
      } else if (base_price !== null) {
        total += Number(base_price);
      } else {
        return null;
      }
    }
    return { nights, currency, total, basePrice: Number(base_price), hasSpecialRates };
  }

  const p1 = await computePrice(slug, checkIn, checkOut);
  assert.equal(p1.nights, 3, "should calculate 3 nights");
  assert.equal(p1.total, 3600, "3 nights * 1200 MAD = 3600");
  assert.equal(p1.hasSpecialRates, false, "no special rules yet");
  console.log("PASS: Base price multi-night calculation");

  // Test 2: Add special seasonal pricing rule
  // Rule for 2026-12-02 to 2026-12-03 (1 night) at 1800 MAD
  await sql`insert into public.pricing_rules
    (type_id, start_date, end_date, nightly_price, currency, priority)
    values (${typeId}::uuid, '2026-12-02'::date, '2026-12-03'::date, 1800.00, 'MAD', 1)`;

  const p2 = await computePrice(slug, checkIn, checkOut);
  // Night 1 (Dec 1): 1200, Night 2 (Dec 2): 1800, Night 3 (Dec 3): 1200 -> Total: 4200
  assert.equal(p2.total, 4200, "should reflect date-specific override rate");
  assert.equal(p2.hasSpecialRates, true, "should flag special seasonal rates");
  console.log("PASS: Date-specific pricing rule override");

  // Test 3: Priority override (higher priority rule supersedes lower)
  await sql`insert into public.pricing_rules
    (type_id, start_date, end_date, nightly_price, currency, priority)
    values (${typeId}::uuid, '2026-12-02'::date, '2026-12-03'::date, 2000.00, 'MAD', 5)`;

  const p3 = await computePrice(slug, checkIn, checkOut);
  // Night 2 should now use 2000 (priority 5 > priority 1) -> Total: 1200 + 2000 + 1200 = 4400
  assert.equal(p3.total, 4400, "higher priority rule must take precedence");
  console.log("PASS: Pricing rule priority resolution");

  // Test 4: Availability counting
  async function getAvailableCount(tSlug, inD, outD) {
    const rows = await sql`select
      (select count(*)::integer from public.accommodation_units u
        where u.type_id = t.id and u.active
        and not exists (select 1 from public.reservations r where r.unit_id = u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${inD}::date,${outD}::date,'[)'))
        and not exists (select 1 from public.availability_blocks b where b.unit_id = u.id and b.active and b.period && daterange(${inD}::date,${outD}::date,'[)'))
      ) as available
      from public.accommodation_types t where t.slug = ${tSlug} and t.published`;
    return rows[0]?.available ?? 0;
  }

  assert.equal(await getAvailableCount(slug, checkIn, checkOut), 2, "both units available");
  console.log("PASS: Initial unit count available");

  // Book unit 1
  await sql`insert into public.reservations
    (type_id, unit_id, check_in, check_out, guest_count, customer_name, customer_email, customer_phone, status, source)
    values (${typeId}::uuid, ${unit1[0].id}::uuid, '2026-12-01'::date, '2026-12-04'::date, 2, 'Client 1', 'client1@example.invalid', '+212611111111', 'CONFIRMED', 'admin')`;

  assert.equal(await getAvailableCount(slug, checkIn, checkOut), 1, "1 unit remaining after confirmation");
  console.log("PASS: Unit availability decrements on confirmed reservation");

  // Add maintenance block on unit 2
  const block1 = await sql`insert into public.availability_blocks
    (unit_id, start_date, end_date, reason, active)
    values (${unit2[0].id}::uuid, '2026-12-03'::date, '2026-12-05'::date, 'Entretien toiture', true)
    returning id`;

  assert.equal(await getAvailableCount(slug, checkIn, checkOut), 0, "0 units available when both are occupied or blocked");
  console.log("PASS: Availability accounts for active maintenance blocks");

  // Lift block
  await sql`update public.availability_blocks set active = false where id = ${block1[0].id}::uuid`;
  assert.equal(await getAvailableCount(slug, checkIn, checkOut), 1, "availability restores when block is lifted");
  console.log("PASS: Availability restores when block is deactivated");

  console.log("All pricing and availability tests passed successfully!");
}

try {
  await run();
} finally {
  if (typeId) {
    await sql`delete from public.reservations where type_id = ${typeId}::uuid`;
    await sql`delete from public.availability_blocks where unit_id in (select id from public.accommodation_units where type_id = ${typeId}::uuid)`;
    await sql`delete from public.pricing_rules where type_id = ${typeId}::uuid`;
    await sql`delete from public.accommodation_units where type_id = ${typeId}::uuid`;
    await sql`delete from public.accommodation_types where id = ${typeId}::uuid`;
  }
  await sql.end();
}
