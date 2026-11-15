import "server-only";
import type postgres from "postgres";
import { z } from "zod";
import { db } from "./db";
import { validStayDates } from "./validation";
import { stays, isStaySlug } from "@/content/stays";
import { calculatePriceWith } from "./availability";

type Tx = postgres.TransactionSql;
export class ActionError extends Error { constructor(public code: string) { super(code); } }
const uuid = (value: FormDataEntryValue | null) => {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ActionError("INVALID_INPUT");
  return parsed.data;
};
const field = (data: FormData, key: string, max = 300) => String(data.get(key) ?? "").trim().slice(0, max);
const date = (data: FormData, key: string) => {
  const parsed = z.iso.date().safeParse(field(data, key, 10));
  if (!parsed.success) throw new ActionError("INVALID_DATES");
  return parsed.data;
};
const numberOrNull = (value: string) => value === "" ? null : Number(value);
function allowedSocialUrl(value:string, domain:string) {
  if(!value)return true;
  try { const url=new URL(value); return url.protocol==="https:" && (url.hostname===domain || url.hostname.endsWith(`.${domain}`)) && !url.username && !url.password; }
  catch { return false; }
}
async function audit(tx: Tx, actor: string, action: string, table: string, id: string | null, before: unknown, after: unknown) {
  await tx`insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, before_data, after_data)
    values (${actor}::uuid, ${action}, ${table}, ${id}::uuid, ${before ? tx.json(before as postgres.JSONValue) : null}, ${after ? tx.json(after as postgres.JSONValue) : null})`;
}
async function freeUnit(tx: Tx, typeId: string, checkIn: string, checkOut: string, selectedId?: string) {
  const units = await tx`select u.id from public.accommodation_units u where u.type_id = ${typeId}::uuid and u.active
    and (${selectedId ?? null}::uuid is null or u.id = ${selectedId ?? null}::uuid)
    and not exists (select 1 from public.reservations r where r.unit_id = u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${checkIn}::date,${checkOut}::date,'[)'))
    and not exists (select 1 from public.availability_blocks b where b.unit_id = u.id and b.active and b.period && daterange(${checkIn}::date,${checkOut}::date,'[)'))
    order by u.unit_code limit 1 for update of u`;
  return units[0]?.id as string | undefined;
}

export async function performAdminAction(data: FormData, actor: string): Promise<string> {
  const sql = db();
  const action = field(data, "action", 40);
  if (action === "reservation_status") {
    const id = uuid(data.get("id"));
    const status = field(data, "status", 20);
    if (!["CONFIRMED", "CANCELLED", "COMPLETED"].includes(status)) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      const hint = await tx`select type_id from public.reservations where id = ${id}::uuid`;
      if (!hint.length) throw new ActionError("NOT_FOUND");
      await tx`select id from public.accommodation_types where id = ${hint[0].type_id}::uuid for update`;
      const rows = await tx`select *,check_in::text as check_in_text,check_out::text as check_out_text from public.reservations where id = ${id}::uuid for update`;
      const row = rows[0];
      if (!row) throw new ActionError("NOT_FOUND");
      let updated;
      if (status === "CONFIRMED") {
        if (row.status !== "PENDING") throw new ActionError("INVALID_TRANSITION");
        const selected = data.get("unit_id") ? uuid(data.get("unit_id")) : undefined;
        const unit = await freeUnit(tx, row.type_id, row.check_in_text, row.check_out_text, selected);
        if (!unit) throw new ActionError("UNAVAILABLE");
        updated = await tx`update public.reservations set status = 'CONFIRMED', unit_id = ${unit}::uuid where id = ${id}::uuid returning *`;
      } else if (status === "COMPLETED") {
        if (row.status !== "CONFIRMED") throw new ActionError("INVALID_TRANSITION");
        updated = await tx`update public.reservations set status = 'COMPLETED' where id = ${id}::uuid returning *`;
      } else {
        if (row.status === "CANCELLED" || row.status === "COMPLETED") throw new ActionError("INVALID_TRANSITION");
        updated = await tx`update public.reservations set status = 'CANCELLED' where id = ${id}::uuid returning *`;
      }
      await audit(tx, actor, "reservation_status", "reservations", id, { status: row.status, unit_id: row.unit_id }, { status: updated[0].status, unit_id: updated[0].unit_id });
    });
    return "reservation_updated";
  }
  if (action === "reassign_unit") {
    const id=uuid(data.get("id")), selected=uuid(data.get("unit_id"));
    await sql.begin(async tx=>{
      const hint=await tx`select type_id from public.reservations where id=${id}::uuid`;
      if(!hint.length)throw new ActionError("NOT_FOUND");
      await tx`select id from public.accommodation_types where id=${hint[0].type_id}::uuid for update`;
      const rows=await tx`select *,check_in::text as check_in_text,check_out::text as check_out_text from public.reservations where id=${id}::uuid for update`;
      const row=rows[0];
      if(row.status!=="CONFIRMED")throw new ActionError("INVALID_TRANSITION");
      if(row.unit_id===selected)return;
      const unit=await freeUnit(tx,row.type_id,row.check_in_text,row.check_out_text,selected);
      if(!unit)throw new ActionError("UNAVAILABLE");
      await tx`update public.reservations set unit_id=${unit}::uuid where id=${id}::uuid`;
      await audit(tx,actor,"reassign_unit","reservations",id,{unit_id:row.unit_id},{unit_id:unit});
    });
    return "unit_reassigned";
  }
  if (action === "add_unit") {
    const typeId = uuid(data.get("type_id"));
    const code = field(data, "unit_code", 40);
    if (!code) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      await tx`select id from public.accommodation_types where id = ${typeId}::uuid for update`;
      const rows = await tx`insert into public.accommodation_units (type_id, unit_code) values (${typeId}::uuid, ${code}) returning id, type_id, unit_code`;
      await audit(tx, actor, "add_unit", "accommodation_units", rows[0].id, null, rows[0]);
    });
    return "unit_added";
  }
  if (action === "deactivate_unit" || action === "reactivate_unit") {
    const id = uuid(data.get("id"));
    await sql.begin(async (tx) => {
      const rows = await tx`select * from public.accommodation_units where id = ${id}::uuid for update`;
      if (!rows.length) throw new ActionError("NOT_FOUND");
      const active = action === "reactivate_unit";
      await tx`update public.accommodation_units set active = ${active} where id = ${id}::uuid`;
      await audit(tx, actor, action, "accommodation_units", id, { active: rows[0].active }, { active });
    });
    return "unit_updated";
  }
  if (action === "add_block") {
    const unitId = uuid(data.get("unit_id"));
    const start = date(data, "start_date"); const end = date(data, "end_date");
    const reason = field(data, "reason", 200);
    if (!validStayDates(start, end) || reason.length < 2) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      const rows = await tx`insert into public.availability_blocks (unit_id, start_date, end_date, reason) values (${unitId}::uuid, ${start}::date, ${end}::date, ${reason}) returning id, unit_id, start_date, end_date, reason`;
      await audit(tx, actor, "add_block", "availability_blocks", rows[0].id, null, rows[0]);
    });
    return "block_added";
  }
  if (action === "remove_block") {
    const id = uuid(data.get("id"));
    await sql.begin(async (tx) => {
      const rows = await tx`update public.availability_blocks set active = false where id = ${id}::uuid and active returning id, unit_id`;
      if (!rows.length) throw new ActionError("NOT_FOUND");
      await audit(tx, actor, "remove_block", "availability_blocks", id, { active: true }, { active: false });
    });
    return "block_removed";
  }
  if (action === "add_type" || action === "update_type") {
    const id = action === "update_type" ? uuid(data.get("id")) : null;
    const slug = field(data, "slug", 60);
    const names = { fr: field(data, "name_fr", 120), en: field(data, "name_en", 120), ar: field(data, "name_ar", 120) };
    const descriptions = { fr: field(data, "description_fr", 1000), en: field(data, "description_en", 1000), ar: field(data, "description_ar", 1000) };
    const amenities = Object.fromEntries((["fr","en","ar"] as const).map(locale => [locale,field(data, `amenities_${locale}`, 2000).split("\n").map(x => x.trim()).filter(Boolean)])) as Record<"fr"|"en"|"ar",string[]>;
    const maxGuests = numberOrNull(field(data, "max_guests", 3));
    const price = numberOrNull(field(data, "base_price", 12));
    const currency = price === null ? null : field(data, "currency", 3).toUpperCase();
    const published = data.get("published") === "on";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !names.fr || !names.en || published && !names.ar || published && !["dome","cabin"].includes(slug) && (!descriptions.fr || !descriptions.en || !descriptions.ar) || published && amenities.fr.length > 0 && (amenities.en.length !== amenities.fr.length || amenities.ar.length !== amenities.fr.length) || maxGuests !== null && (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 20) || price !== null && (!Number.isFinite(price) || price < 0 || price >= 10_000_000_000) || price !== null && !/^[A-Z]{3}$/.test(currency ?? "")) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      if (id) {
        const before = await tx`select * from public.accommodation_types where id = ${id}::uuid for update`;
        if (!before.length) throw new ActionError("NOT_FOUND");
        if (["dome","cabin"].includes(before[0].slug) && slug !== before[0].slug) throw new ActionError("CORE_SLUG_IMMUTABLE");
        if (published && !["dome","cabin"].includes(slug)) {
          const photos = await tx`select 1 from public.accommodation_images where type_id=${id}::uuid limit 1`;
          if (!photos.length) throw new ActionError("MISSING_PHOTO");
        }
        if (maxGuests !== null) {
          const excess = await tx`select 1 from public.reservations where type_id = ${id}::uuid and status = 'CONFIRMED' and check_out > current_date and guest_count > ${maxGuests} limit 1`;
          if (excess.length) throw new ActionError("CAPACITY_CONFLICT");
        }
        const after = await tx`update public.accommodation_types set slug=${slug}, names=${tx.json(names)}, descriptions=${tx.json(descriptions)}, amenities=${tx.json(amenities)}, max_guests=${maxGuests}, base_price=${price}, currency=${currency}, published=${published} where id=${id}::uuid returning *`;
        await audit(tx, actor, "update_type", "accommodation_types", id, before[0], after[0]);
      } else {
        if (published) throw new ActionError("CREATE_AS_DRAFT_FIRST");
        const after = await tx`insert into public.accommodation_types (slug,names,descriptions,amenities,max_guests,base_price,currency,published) values (${slug},${tx.json(names)},${tx.json(descriptions)},${tx.json(amenities)},${maxGuests},${price},${currency},${published}) returning *`;
        await audit(tx, actor, "add_type", "accommodation_types", after[0].id, null, after[0]);
      }
    });
    return "type_updated";
  }
  if (action === "settings") {
    const whatsapp = field(data, "whatsapp", 20);
    const email = field(data, "contact_email", 254);
    const instagram = field(data, "instagram_url", 300);
    const facebook = field(data, "facebook_url", 300);
    const depositPercent=numberOrNull(field(data,"deposit_percent",6));
    if(depositPercent!==null&&(!Number.isFinite(depositPercent)||depositPercent<1||depositPercent>99))throw new ActionError("INVALID_INPUT");
    if (whatsapp && !/^\+[1-9][0-9]{6,14}$/.test(whatsapp) || email && !z.email().safeParse(email).success || !allowedSocialUrl(instagram,"instagram.com") || !allowedSocialUrl(facebook,"facebook.com")) throw new ActionError("INVALID_INPUT");
    const bookingPolicy = { fr: field(data, "booking_policy_fr", 1500), en: field(data, "booking_policy_en", 1500), ar: field(data, "booking_policy_ar", 1500) };
    const arrivalPolicy = { fr: field(data, "arrival_policy_fr", 1500), en: field(data, "arrival_policy_en", 1500), ar: field(data, "arrival_policy_ar", 1500) };
    const locationText = { fr: field(data, "location_fr", 500), en: field(data, "location_en", 500), ar: field(data, "location_ar", 500) };
    await sql.begin(async (tx) => {
      const before = await tx`select * from public.business_settings where id=1 for update`;
      const after = await tx`update public.business_settings set whatsapp_e164=${whatsapp || null}, contact_email=${email || null}, instagram_url=${instagram || null}, facebook_url=${facebook || null}, deposit_percent=${depositPercent}, booking_policy=${tx.json(bookingPolicy)}, arrival_policy=${tx.json(arrivalPolicy)}, location_text=${tx.json(locationText)} where id=1 returning *`;
      await audit(tx, actor, "settings", "business_settings", null, before[0], after[0]);
    });
    return "settings_updated";
  }
  if (action === "manual_reservation") {
    const typeId = uuid(data.get("type_id"));
    const start = date(data, "check_in"), end = date(data, "check_out");
    const guests = Number(field(data, "guest_count", 3));
    const name = field(data, "customer_name", 120), email = field(data, "customer_email", 254), phone = field(data, "customer_phone", 30);
    if (!validStayDates(start,end) || !Number.isInteger(guests) || guests < 1 || !name || !z.email().safeParse(email).success || !phone) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      const types = await tx`select id,slug,max_guests from public.accommodation_types where id=${typeId}::uuid for update`;
      if (!types.length || !types[0].max_guests) throw new ActionError("NOT_CONFIGURED");
      if (guests > types[0].max_guests) throw new ActionError("CAPACITY");
      const unit = await freeUnit(tx,typeId,start,end);
      if (!unit) throw new ActionError("UNAVAILABLE");
      const quote=await calculatePriceWith(tx,String(types[0].slug),start,end,guests,[]);
      const breakdown=quote?{lodgingTotal:quote.lodgingTotal,optionsTotal:quote.optionsTotal,total:quote.total,currency:quote.currency,nights:quote.nights,lines:quote.lines}:null;
      const after = await tx`insert into public.reservations (type_id,unit_id,check_in,check_out,guest_count,customer_name,customer_email,customer_phone,status,source,lodging_total,options_total,total_amount,price_currency,price_breakdown)
        values (${typeId}::uuid,${unit}::uuid,${start}::date,${end}::date,${guests},${name},${email},${phone},'CONFIRMED','admin',${quote?.lodgingTotal??null},${quote?.optionsTotal??null},${quote?.total??null},${quote?.currency??null},${breakdown?tx.json(breakdown):null}) returning id, reference, status, unit_id`;
      await audit(tx, actor, "manual_reservation", "reservations", after[0].id, null, after[0]);
    });
    return "manual_added";
  }
  if (action === "add_pricing") {
    const typeId = uuid(data.get("type_id"));
    const start = date(data, "start_date"), end = date(data, "end_date");
    const price = Number(field(data, "nightly_price", 12));
    const currency = field(data, "currency", 3).toUpperCase();
    if (end <= start || !Number.isFinite(price) || price < 0 || price >= 10_000_000_000 || !/^[A-Z]{3}$/.test(currency)) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      await tx`select id from public.accommodation_types where id=${typeId}::uuid for update`;
      const after = await tx`insert into public.pricing_rules (type_id,start_date,end_date,nightly_price,currency) values (${typeId}::uuid,${start}::date,${end}::date,${price},${currency}) returning *`;
      await audit(tx, actor, "add_pricing", "pricing_rules", after[0].id, null, after[0]);
    });
    return "pricing_added";
  }
  if(action==="update_base_rate"){
    const typeId=uuid(data.get("type_id"));
    const price=numberOrNull(field(data,"base_price",16));
    const currency=price===null?null:field(data,"currency",3).toUpperCase();
    if(price!==null&&(!Number.isFinite(price)||price<0||price>=10_000_000_000||! /^[A-Z]{3}$/.test(currency??"")))throw new ActionError("INVALID_INPUT");
    await sql.begin(async tx=>{const before=await tx`select base_price,currency from public.accommodation_types where id=${typeId}::uuid for update`;if(!before.length)throw new ActionError("NOT_FOUND");const after=await tx`update public.accommodation_types set base_price=${price},currency=${currency} where id=${typeId}::uuid returning base_price,currency`;await audit(tx,actor,"update_base_rate","accommodation_types",typeId,before[0],after[0])});
    return "base_rate_updated";
  }
  if(action==="add_booking_option"||action==="update_booking_option"||action==="disable_booking_option"){
    const id=action==="add_booking_option"?null:uuid(data.get("id"));
    const kind=field(data,"kind",10),basis=field(data,"pricing_basis",30);
    if(action==="disable_booking_option"){
      await sql.begin(async tx=>{const hint=await tx`select type_id from public.booking_options where id=${id}::uuid`;if(!hint.length)throw new ActionError("NOT_FOUND");if(hint[0].type_id)await tx`select id from public.accommodation_types where id=${hint[0].type_id}::uuid for update`;else await tx`select id from public.accommodation_types where published order by id for update`;const before=await tx`select * from public.booking_options where id=${id}::uuid for update`;const after=await tx`update public.booking_options set active=false,published=false where id=${id}::uuid returning *`;await audit(tx,actor,action,"booking_options",id,before[0],after[0])});
      return "booking_option_updated";
    }
    const typeRaw=field(data,"type_id",40),typeId=typeRaw?z.uuid().safeParse(typeRaw):null;
    const names={fr:field(data,"name_fr",120),en:field(data,"name_en",120),ar:field(data,"name_ar",120)};
    const descriptions={fr:field(data,"description_fr",500),en:field(data,"description_en",500),ar:field(data,"description_ar",500)};
    const basisOptions=["PER_BOOKING","PER_NIGHT","PER_PERSON","PER_PERSON_PER_NIGHT","PER_ITEM"];
    const unitPrice=Number(field(data,"unit_price",16)),currency=field(data,"currency",3).toUpperCase(),published=data.get("published")==="on";
    if(typeRaw&&(!typeId||!typeId.success)||!["MEAL","SERVICE"].includes(kind)||!basisOptions.includes(basis)||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>=10_000_000_000||! /^[A-Z]{3}$/.test(currency)||!names.fr||!names.en||!names.ar||!descriptions.fr||!descriptions.en||!descriptions.ar)throw new ActionError("INVALID_INPUT");
    const parsedTypeId=typeRaw?(typeId as {success:true;data:string}).data:null;
    const sortOrder=Number(field(data,"sort_order",8)||0);
    if(!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>10000)throw new ActionError("INVALID_INPUT");
    await sql.begin(async tx=>{
      let existingTypeId:string|null=null;
      if(id){const hint=await tx`select type_id from public.booking_options where id=${id}::uuid`;if(!hint.length)throw new ActionError("NOT_FOUND");existingTypeId=hint[0].type_id?String(hint[0].type_id):null;}
      const lockIds=[parsedTypeId,existingTypeId].filter((value):value is string=>Boolean(value)).sort();
      if(parsedTypeId===null||id&&existingTypeId===null)await tx`select id from public.accommodation_types where published order by id for update`;
      else if(lockIds.length)await tx`select id from public.accommodation_types where id=any(${lockIds}::uuid[]) order by id for update`;
      if(id){
        const before=await tx`select * from public.booking_options where id=${id}::uuid for update`;if(!before.length)throw new ActionError("NOT_FOUND");
        const after=await tx`update public.booking_options set type_id=${parsedTypeId}::uuid,kind=${kind}::public.booking_option_kind,names=${tx.json(names)},descriptions=${tx.json(descriptions)},pricing_basis=${basis}::public.booking_pricing_basis,unit_price=${unitPrice},currency=${currency},active=true,published=${published},sort_order=${sortOrder} where id=${id}::uuid returning *`;
        await audit(tx,actor,action,"booking_options",id,before[0],after[0]);
      }else{
        if(parsedTypeId){const types=await tx`select id from public.accommodation_types where id=${parsedTypeId}::uuid`;if(!types.length)throw new ActionError("NOT_FOUND")}
        const after=await tx`insert into public.booking_options(type_id,kind,names,descriptions,pricing_basis,unit_price,currency,active,published,sort_order) values(${parsedTypeId}::uuid,${kind}::public.booking_option_kind,${tx.json(names)},${tx.json(descriptions)},${basis}::public.booking_pricing_basis,${unitPrice},${currency},true,${published},${sortOrder}) returning *`;
        await audit(tx,actor,action,"booking_options",after[0].id,null,after[0]);
      }
    });
    return "booking_option_updated";
  }
  if (action === "update_pricing" || action === "disable_pricing") {
    const id = uuid(data.get("id"));
    const start = action === "update_pricing" ? date(data,"start_date") : null;
    const end = action === "update_pricing" ? date(data,"end_date") : null;
    const price = action === "update_pricing" ? Number(field(data,"nightly_price",12)) : null;
    const currency = action === "update_pricing" ? field(data,"currency",3).toUpperCase() : null;
    if (action === "update_pricing" && (!start || !end || end <= start || !Number.isFinite(price) || (price ?? -1) < 0 || (price ?? 0) >= 10_000_000_000 || !/^[A-Z]{3}$/.test(currency ?? ""))) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      const hint=await tx`select type_id from public.pricing_rules where id=${id}::uuid`;
      if(!hint.length)throw new ActionError("NOT_FOUND");
      await tx`select id from public.accommodation_types where id=${hint[0].type_id}::uuid for update`;
      const before = await tx`select * from public.pricing_rules where id=${id}::uuid for update`;
      if (!before.length) throw new ActionError("NOT_FOUND");
      const after = action === "disable_pricing"
        ? await tx`update public.pricing_rules set active=false where id=${id}::uuid returning *`
        : await tx`update public.pricing_rules set start_date=${start}::date,end_date=${end}::date,nightly_price=${price},currency=${currency},active=true where id=${id}::uuid returning *`;
      await audit(tx,actor,action,"pricing_rules",id,before[0],after[0]);
    });
    return "pricing_updated";
  }
  if (action === "image_meta") {
    const id = uuid(data.get("id")); const role = field(data,"role",10);
    const order = Number(field(data,"sort_order",6));
    if (!["hero","featured","gallery"].includes(role) || !Number.isInteger(order)) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      const before = await tx`select * from public.accommodation_images where id=${id}::uuid for update`;
      if (!before.length) throw new ActionError("NOT_FOUND");
      if (role === "hero") await tx`update public.accommodation_images set role='gallery' where type_id=${before[0].type_id}::uuid and role='hero' and id <> ${id}::uuid`;
      const after = await tx`update public.accommodation_images set role=${role},sort_order=${order} where id=${id}::uuid returning *`;
      await audit(tx, actor, "image_meta", "accommodation_images", id, before[0], after[0]);
    });
    return "image_updated";
  }
  if (action === "seed_default_photos") {
    const slug = field(data, "slug", 20);
    if (!isStaySlug(slug)) throw new ActionError("INVALID_INPUT");
    await sql.begin(async (tx) => {
      const types = await tx`select id from public.accommodation_types where slug = ${slug} for update`;
      if (!types.length) throw new ActionError("NOT_FOUND");
      const typeId = types[0].id;
      const stay = stays[slug];
      const allPhotos = [stay.hero, ...stay.photos];
      for (let i = 0; i < allPhotos.length; i++) {
        const p = allPhotos[i];
        const localPath = `local:${p.src.replace(/^\//, "")}`;
        const role = i === 0 ? "hero" : "gallery";
        const alt = { fr: p.alt.fr, en: p.alt.en, ar: p.alt.ar || p.alt.fr };
        await tx`insert into public.accommodation_images (type_id, storage_path, alt_text, role, sort_order, width, height)
          values (${typeId}::uuid, ${localPath}, ${tx.json(alt)}, ${role}, ${i}, ${p.width}, ${p.height})
          on conflict (storage_path) do update set sort_order = ${i}`;
      }
      await audit(tx, actor, "seed_default_photos", "accommodation_images", typeId, null, { slug, count: allPhotos.length });
    });
    return "photos_seeded";
  }
  throw new ActionError("INVALID_ACTION");
}
