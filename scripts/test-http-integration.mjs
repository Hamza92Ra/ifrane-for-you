import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { requireIsolatedTestDatabase } from "./test-database-guard.mjs";

const databaseUrl = requireIsolatedTestDatabase();
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.TEST_SITE_URL || "http://localhost:3000";
if (!apiUrl || !serviceKey || new URL(apiUrl).hostname !== "127.0.0.1" || new URL(siteUrl).hostname !== "localhost") {
  throw new Error("HTTP integration tests require local Supabase and a local web server");
}

const sql = postgres(databaseUrl, { max: 5, prepare: false });
const supabase = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const slug = `http-qa-${suffix}`;
const adminEmail = `admin-${suffix}@example.invalid`;
const password = `Test-${randomUUID()}-password`;
const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 30);
const checkout = new Date(tomorrow); checkout.setUTCDate(checkout.getUTCDate() + 2);
const checkIn = tomorrow.toISOString().slice(0, 10);
const checkOut = checkout.toISOString().slice(0, 10);
let typeId, adminId;
const uploadedPaths = [];

async function post(path, body, cookie = "", isJson = false, ip = "198.51.100.10") {
  return fetch(`${siteUrl}${path}`, {
    method: "POST", redirect: "manual",
    headers: { origin: siteUrl, "x-vercel-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...(isJson ? { "content-type": "application/json" } : {}) },
    body: isJson ? JSON.stringify(body) : body
  });
}

function form(values) { return new URLSearchParams(values); }
function booking(email, requestKey = randomUUID()) {
  return { type: slug, checkIn, checkOut, guests: 2, name: "Integration Guest", email,
    phone: "+212600000000", requestKey, privacyAccepted: true };
}

try {
  const types = await sql`insert into public.accommodation_types (slug,names,max_guests,published)
    values (${slug},${sql.json({ fr: "Test", en: "Test", ar: "تجربة" })},2,true) returning id`;
  typeId = types[0].id;
  await sql`insert into public.accommodation_units (type_id,unit_code) values (${typeId}::uuid,'HTTP-1')`;

  const sameEmail = `guest-${suffix}@example.invalid`;
  const firstRequest = booking(sameEmail);
  const first = await post("/api/reservations", firstRequest, "", true);
  assert.equal(first.status, 201);
  const created = await first.json();
  assert.equal(created.status, "PENDING");
  const duplicate = await post("/api/reservations", firstRequest, "", true);
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).reference, created.reference, "idempotency preserves the reference");
  for (let i = 0; i < 3; i++) assert.equal((await post("/api/reservations", booking(sameEmail), "", true)).status, 201);
  assert.equal((await post("/api/reservations", booking(sameEmail), "", true)).status, 429, "email abuse limit holds");
  const other = await post("/api/reservations", booking(`other-${suffix}@example.invalid`), "", true, "198.51.100.11");
  assert.equal(other.status, 201, "another customer can still book");
  const pending = await sql`select count(*)::int as count from public.reservations where type_id=${typeId}::uuid and status='PENDING'`;
  assert.equal(pending[0].count, 5, "pending requests do not hold inventory and retries do not duplicate rows");
  console.log("PASS: booking, idempotency, abuse isolation and pending inventory");

  const unauthorized = await post("/api/admin/actions", form({ action: "add_unit", type_id: typeId, unit_code: "NOPE" }));
  assert.equal(unauthorized.status, 403);
  const user = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (user.error || !user.data.user) throw user.error || new Error("ADMIN_CREATE_FAILED");
  adminId = user.data.user.id;
  await sql`insert into public.admin_profiles (user_id,role) values (${adminId}::uuid,'admin')`;
  const wrong = await post("/api/admin/login", form({ email: adminEmail, password: "incorrect" }));
  assert.equal(wrong.status, 303);
  assert.match(wrong.headers.get("location") || "", /error=invalid/);
  const login = await post("/api/admin/login", form({ email: adminEmail, password }));
  assert.equal(login.status, 303);
  assert.ok(!/error=/.test(login.headers.get("location") || ""), "admin signs in");
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie, "login sets a session cookie");
  const dashboard = await fetch(`${siteUrl}/admin`, { headers: { cookie }, redirect: "manual" });
  assert.equal(dashboard.status, 200, "authenticated admin page loads");
  const dashboardHtml = await dashboard.text();
  assert.ok(dashboardHtml.includes("admin-page"), "authenticated admin sees the dashboard, not the login form");
  assert.ok(dashboardHtml.includes("Vue d'ensemble"), "admin dashboard data renders");
  const added = await post("/api/admin/actions", form({ action: "add_unit", type_id: typeId, unit_code: "HTTP-2" }), cookie);
  assert.equal(added.status, 303);
  assert.match(added.headers.get("location") || "", /ok=unit_added/);
  const units = await sql`select unit_code from public.accommodation_units where type_id=${typeId}::uuid order by unit_code`;
  assert.deepEqual(units.map(row => row.unit_code), ["HTTP-1", "HTTP-2"]);
  console.log("PASS: admin authentication, authorization and action audit path");

  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#426348" } }).png().toBuffer();
  for (let i = 0; i < 2; i++) {
    const body = new FormData();
    body.set("type_id", typeId);
    body.set("alt_fr", `Photo ${i + 1}`);
    body.set("alt_en", `Photo ${i + 1}`);
    body.set("alt_ar", `صورة ${i + 1}`);
    body.set("file", new File([png], `photo-${i}.png`, { type: "image/png" }));
    const uploaded = await post("/api/admin/images", body, cookie);
    assert.equal(uploaded.status, 303);
    assert.match(uploaded.headers.get("location") || "", /ok=image_uploaded/);
  }
  const images = await sql`select id,storage_path,sort_order from public.accommodation_images where type_id=${typeId}::uuid order by sort_order`;
  assert.deepEqual(images.map(row => row.sort_order), [0, 1], "uploads append in order");
  uploadedPaths.push(...images.map(row => row.storage_path));
  const reordered = await post("/api/admin/actions", form({ action: "image_meta", id: images[1].id, role: "hero", sort_order: "-1" }), cookie);
  assert.match(reordered.headers.get("location") || "", /ok=image_updated/);
  const order = await sql`select id from public.accommodation_images where type_id=${typeId}::uuid order by sort_order,created_at`;
  assert.equal(order[0].id, images[1].id, "admin order changes the public query order");
  const removed = await fetch(`${siteUrl}/api/admin/images`, { method: "DELETE", headers: { origin: siteUrl, cookie, "content-type": "application/json" }, body: JSON.stringify({ id: images[0].id }) });
  assert.equal(removed.status, 200, await removed.text());
  assert.equal((await sql`select id from public.accommodation_images where id=${images[0].id}::uuid`).length, 0);
  const storageCheck = await supabase.storage.from("accommodation-images").download(images[0].storage_path);
  assert.ok(storageCheck.error, "deleted photo is removed from Storage");
  const dome = await sql`select id from public.accommodation_types where slug='dome'`;
  await sql`update public.accommodation_images set type_id=${dome[0].id}::uuid where id=${images[1].id}::uuid`;
  const managedPage = await (await fetch(`${siteUrl}/fr/stays/dome`)).text();
  assert.ok(managedPage.includes(images[1].storage_path.split("/").at(-1)), "managed photo renders");
  assert.ok(!managedPage.includes("panorama.webp"), "local fallback is hidden while a managed gallery exists");
  const lastRemoved = await fetch(`${siteUrl}/api/admin/images`, { method: "DELETE", headers: { origin: siteUrl, cookie, "content-type": "application/json" }, body: JSON.stringify({ id: images[1].id }) });
  assert.equal(lastRemoved.status, 200);
  const fallbackPage = await (await fetch(`${siteUrl}/fr/stays/dome`)).text();
  assert.ok(fallbackPage.includes("panorama.webp"), "local photos return only when the managed gallery is empty");
  console.log("PASS: upload order, admin reorder, photo removal and gallery fallback");
} finally {
  for (const path of uploadedPaths) await supabase.storage.from("accommodation-images").remove([path]);
  if (typeId) {
    await sql`delete from public.audit_logs where entity_id=${typeId}::uuid or entity_id in (select id from public.accommodation_images where type_id=${typeId}::uuid)`;
    await sql`delete from public.accommodation_images where type_id=${typeId}::uuid`;
    await sql`delete from public.reservations where type_id=${typeId}::uuid`;
    await sql`delete from public.accommodation_units where type_id=${typeId}::uuid`;
    await sql`delete from public.accommodation_types where id=${typeId}::uuid`;
  }
  if (adminId) {
    await sql`delete from public.audit_logs where actor_user_id=${adminId}::uuid`;
    await sql`delete from public.admin_profiles where user_id=${adminId}::uuid`;
    await supabase.auth.admin.deleteUser(adminId);
  }
  await sql.end();
}
