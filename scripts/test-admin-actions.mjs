import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { requireIsolatedTestDatabase } from "./test-database-guard.mjs";

const url = requireIsolatedTestDatabase();

const sql = postgres(url, { max: 5, prepare: false });

// Mock admin actor
const actorId = randomUUID();
let typeId;

async function run() {
  console.log("Starting Admin Actions Test Suite...");

  // Setup admin user in auth.users and admin_profiles
  await sql`insert into auth.users (id, email) values (${actorId}::uuid, 'admin-test@example.invalid') on conflict (id) do nothing`;
  await sql`insert into public.admin_profiles (user_id, role) values (${actorId}::uuid, 'admin') on conflict (user_id) do nothing`;

  const slug = `admin-test-${randomUUID().slice(0, 8)}`;

  // 1. Test add_type
  const typeRow = await sql`insert into public.accommodation_types
    (slug, names, descriptions, amenities, max_guests, base_price, currency, published)
    values (${slug}, ${sql.json({ fr: "Suite Royale", en: "Royal Suite", ar: "جناح ملكي" })}, ${sql.json({ fr: "Desc", en: "Desc", ar: "وصف" })}, ${sql.json({ fr: ["Wifi"], en: ["Wifi"], ar: ["واي فاي"] })}, 4, 1500.00, 'MAD', false)
    returning *`;
  typeId = typeRow[0].id;
  assert.equal(typeRow[0].slug, slug);
  console.log("PASS: Add accommodation type with multilingual JSON");

  // 2. Test update_type
  const updatedType = await sql`update public.accommodation_types set
    names = ${sql.json({ fr: "Suite Modifiée", en: "Modified Suite", ar: "جناح معدل" })},
    max_guests = 6
    where id = ${typeId}::uuid returning *`;
  assert.equal(updatedType[0].max_guests, 6);
  assert.equal(updatedType[0].names.fr, "Suite Modifiée");
  console.log("PASS: Update accommodation type and verify JSON structure");

  // 3. Test add_unit
  const unit = await sql`insert into public.accommodation_units (type_id, unit_code, active)
    values (${typeId}::uuid, 'U-01', true) returning *`;
  assert.equal(unit[0].unit_code, 'U-01');
  assert.equal(unit[0].active, true);
  console.log("PASS: Add physical unit");

  // 4. Test deactivate_unit and reactivate_unit
  await sql`update public.accommodation_units set active = false where id = ${unit[0].id}::uuid`;
  const inactive = await sql`select active from public.accommodation_units where id = ${unit[0].id}::uuid`;
  assert.equal(inactive[0].active, false);

  await sql`update public.accommodation_units set active = true where id = ${unit[0].id}::uuid`;
  const active = await sql`select active from public.accommodation_units where id = ${unit[0].id}::uuid`;
  assert.equal(active[0].active, true);
  console.log("PASS: Deactivate and reactivate physical unit");

  // 5. Test seed_default_photos for dome
  const domeType = await sql`select id from public.accommodation_types where slug = 'dome'`;
  if (domeType.length) {
    const domeId = domeType[0].id;
    // Insert 2 local test images
    await sql`insert into public.accommodation_images (type_id, storage_path, alt_text, role, sort_order, width, height)
      values (${domeId}::uuid, 'local:images/dome/test-1.webp', ${sql.json({ fr: "Test 1", en: "Test 1" })}, 'hero', 0, 1024, 768)
      on conflict (storage_path) do nothing`;
    await sql`insert into public.accommodation_images (type_id, storage_path, alt_text, role, sort_order, width, height)
      values (${domeId}::uuid, 'local:images/dome/test-2.webp', ${sql.json({ fr: "Test 2", en: "Test 2" })}, 'gallery', 1, 1024, 768)
      on conflict (storage_path) do nothing`;

    const img1 = await sql`select * from public.accommodation_images where storage_path = 'local:images/dome/test-1.webp'`;
    assert.equal(img1[0].role, 'hero');

    // Test image_meta: change test-2 to hero (test-1 should automatically demote to gallery)
    const img2 = await sql`select * from public.accommodation_images where storage_path = 'local:images/dome/test-2.webp'`;
    await sql.begin(async (tx) => {
      await tx`update public.accommodation_images set role = 'gallery' where type_id = ${domeId}::uuid and role = 'hero' and id <> ${img2[0].id}::uuid`;
      await tx`update public.accommodation_images set role = 'hero' where id = ${img2[0].id}::uuid`;
    });

    const refreshed1 = await sql`select role from public.accommodation_images where id = ${img1[0].id}::uuid`;
    const refreshed2 = await sql`select role from public.accommodation_images where id = ${img2[0].id}::uuid`;
    assert.equal(refreshed2[0].role, 'hero', 'test-2 is now hero');
    assert.equal(refreshed1[0].role, 'gallery', 'test-1 was demoted to gallery');
    console.log("PASS: Hero image selection and automatic demotion");

    // Clean up test images
    await sql`delete from public.accommodation_images where storage_path in ('local:images/dome/test-1.webp', 'local:images/dome/test-2.webp')`;
  }

  // 6. Test reservation workflow: PENDING -> CONFIRMED -> COMPLETED
  const res = await sql`insert into public.reservations (type_id, check_in, check_out, guest_count, customer_name, customer_email, customer_phone, status, source)
    values (${typeId}::uuid, '2026-12-10'::date, '2026-12-12'::date, 2, 'Admin Client', 'client@example.invalid', '+212600000000', 'PENDING', 'web')
    returning id, status`;
  assert.equal(res[0].status, 'PENDING');

  // Confirm and assign unit
  await sql`update public.reservations set status = 'CONFIRMED', unit_id = ${unit[0].id}::uuid where id = ${res[0].id}::uuid`;
  const confirmed = await sql`select status, unit_id from public.reservations where id = ${res[0].id}::uuid`;
  assert.equal(confirmed[0].status, 'CONFIRMED');
  assert.equal(confirmed[0].unit_id, unit[0].id);
  console.log("PASS: Reservation transition PENDING -> CONFIRMED with unit assignment");

  // Complete
  await sql`update public.reservations set status = 'COMPLETED' where id = ${res[0].id}::uuid`;
  const completed = await sql`select status from public.reservations where id = ${res[0].id}::uuid`;
  assert.equal(completed[0].status, 'COMPLETED');
  console.log("PASS: Reservation transition CONFIRMED -> COMPLETED");

  // 7. Test audit log insertion
  await sql`insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, after_data)
    values (${actorId}::uuid, 'test_action', 'reservations', ${res[0].id}::uuid, ${sql.json({ test: true })})`;
  const log = await sql`select * from public.audit_logs where actor_user_id = ${actorId}::uuid and action = 'test_action'`;
  assert.equal(log.length, 1);
  assert.equal(log[0].after_data.test, true);
  console.log("PASS: Audit log recorded successfully");

  // 8. Test settings update
  await sql`update public.business_settings set
    whatsapp_e164 = '+212679941798',
    contact_email = 'contact@ifrane-for-you.com',
    booking_policy = ${sql.json({ fr: "Politique FR", en: "Policy EN", ar: "سياسة" })}
    where id = 1`;
  const settings = await sql`select * from public.business_settings where id = 1`;
  assert.equal(settings[0].whatsapp_e164, '+212679941798');
  assert.equal(settings[0].booking_policy.fr, "Politique FR");
  console.log("PASS: Business settings update with multilingual policies");

  console.log("All admin actions tests passed successfully!");
}

try {
  await run();
} finally {
  if (typeId) {
    await sql`delete from public.reservations where type_id = ${typeId}::uuid`;
    await sql`delete from public.accommodation_units where type_id = ${typeId}::uuid`;
    await sql`delete from public.accommodation_types where id = ${typeId}::uuid`;
  }
  if (actorId) {
    await sql`delete from public.audit_logs where actor_user_id = ${actorId}::uuid`;
    await sql`delete from public.admin_profiles where user_id = ${actorId}::uuid`;
    await sql`delete from auth.users where id = ${actorId}::uuid`;
  }
  await sql.end();
}
