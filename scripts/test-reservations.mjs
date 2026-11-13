import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error('Set TEST_DATABASE_URL to an isolated database with the migration applied.'); process.exit(2); }
const host = new URL(url).hostname;
if (!['localhost','127.0.0.1','::1'].includes(host) && process.env.ALLOW_REMOTE_TEST_DATABASE !== 'yes') {
  console.error('Remote database test requires ALLOW_REMOTE_TEST_DATABASE=yes and must use an isolated non-production project.'); process.exit(2);
}
const sql = postgres(url, {max:5,prepare:false});
const slug = `qa-${randomUUID().slice(0,8)}`;
let typeId, unitId;
const start = new Date(); start.setUTCDate(start.getUTCDate()+30);
const day = offset => {const d=new Date(start);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const dateLabel = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
const guest = {name:'Reservation QA',email:'qa@example.invalid',phone:'+212600000000'};
async function create(status,from,to,unit=unitId) {
  return sql`insert into public.reservations (type_id,unit_id,check_in,check_out,guest_count,customer_name,customer_email,customer_phone,status,source)
    values (${typeId}::uuid,${unit}::uuid,${from}::date,${to}::date,2,${guest.name},${guest.email},${guest.phone},${status}::public.reservation_status,'admin') returning id`;
}
async function rejects(fn,label) {let failed=false;try{await fn()}catch{failed=true}assert.ok(failed,label);console.log('PASS',label)}
try {
  const type=await sql`insert into public.accommodation_types (slug,names,max_guests,published) values (${slug},${JSON.stringify({fr:'QA',en:'QA'})}::jsonb,2,false) returning id`;
  typeId=type[0].id;
  const unit=await sql`insert into public.accommodation_units (type_id,unit_code) values (${typeId}::uuid,'QA-1') returning id`;
  unitId=unit[0].id;
  const concurrent=await Promise.allSettled([create('CONFIRMED',day(0),day(3)),create('CONFIRMED',day(1),day(4))]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1,'one last-unit booking must win');
  assert.equal(concurrent.filter(x=>x.status==='rejected').length,1,'second booking must fail');
  console.log('PASS simultaneous bookings for last unit and overlapping dates');
  const firstId=concurrent.find(x=>x.status==='fulfilled').value[0].id;
  const first=await sql`select check_in,check_out from public.reservations where id=${firstId}::uuid`;
  const checkout=dateLabel(first[0].check_out);
  const adjacent=await create('CONFIRMED',checkout,day(6));
  assert.equal(adjacent.length,1);console.log('PASS same-day checkout/check-in');
  await rejects(()=>sql`insert into public.availability_blocks (unit_id,start_date,end_date,reason) values (${unitId}::uuid,${day(2)}::date,${day(3)}::date,'QA maintenance')`,'maintenance cannot overlap confirmation');
  await rejects(()=>sql`update public.accommodation_units set active=false where id=${unitId}::uuid`,'unit deactivation preserves future confirmation');
  await sql`update public.reservations set status='CANCELLED' where id in (${firstId}::uuid,${adjacent[0].id}::uuid)`;
  const block=await sql`insert into public.availability_blocks (unit_id,start_date,end_date,reason) values (${unitId}::uuid,${day(0)}::date,${day(3)}::date,'QA maintenance') returning id`;
  await rejects(()=>create('CONFIRMED',day(1),day(2)),'confirmation cannot overlap maintenance');
  await sql`update public.availability_blocks set active=false where id=${block[0].id}::uuid`;
  const afterCancel=await create('CONFIRMED',day(0),day(3));assert.equal(afterCancel.length,1);console.log('PASS cancellation releases inventory');
  await rejects(()=>sql.begin(async tx=>{await tx`set local role anon`;await tx`update public.reservations set customer_name='intruder' where id=${afterCancel[0].id}::uuid`;}),'public role cannot modify reservations');
  await sql`update public.reservations set status='CANCELLED' where id=${afterCancel[0].id}::uuid`;
  const pending=await sql`insert into public.reservations (type_id,check_in,check_out,guest_count,customer_name,customer_email,customer_phone) values (${typeId}::uuid,${day(0)}::date,${day(3)}::date,2,${guest.name},${guest.email},${guest.phone}),(${typeId}::uuid,${day(0)}::date,${day(3)}::date,2,${guest.name},${guest.email},${guest.phone}) returning id`;
  assert.equal(pending.length,2);console.log('PASS pending requests do not hold inventory');
  await sql`update public.reservations set unit_id=${unitId}::uuid,status='CONFIRMED' where id=${pending[0].id}::uuid`;
  await rejects(()=>sql`update public.reservations set unit_id=${unitId}::uuid,status='CONFIRMED' where id=${pending[1].id}::uuid`,'second pending approval cannot double book');
  console.log('Database concurrency checks complete.');
} finally {
  if (typeId) {
    await sql`delete from public.reservations where type_id=${typeId}::uuid`;
    await sql`delete from public.availability_blocks where unit_id=${unitId}::uuid`;
    await sql`delete from public.accommodation_units where type_id=${typeId}::uuid`;
    await sql`delete from public.accommodation_types where id=${typeId}::uuid`;
  }
  await sql.end();
}
