-- Ifrane For You: local migration. Pending requests do not hold units.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.reservation_status as enum ('PENDING','CONFIRMED','CANCELLED','COMPLETED');

create table public.accommodation_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  names jsonb not null default '{}'::jsonb,
  descriptions jsonb not null default '{}'::jsonb,
  amenities jsonb not null default '{"fr":[],"en":[],"ar":[]}'::jsonb,
  max_guests integer check (max_guests between 1 and 20),
  base_price numeric(12,2) check (base_price >= 0),
  currency char(3),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(names) = 'object' and jsonb_typeof(descriptions) = 'object' and jsonb_typeof(amenities) = 'object'),
  check ((base_price is null and currency is null) or (base_price is not null and currency is not null))
);

create table public.accommodation_units (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.accommodation_types(id) on delete restrict,
  unit_code text not null check (char_length(trim(unit_code)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type_id, unit_code),
  unique (id, type_id)
);
create index accommodation_units_type_active_idx on public.accommodation_units (type_id, active);

create table public.accommodation_images (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.accommodation_types(id) on delete restrict,
  storage_path text not null unique check (storage_path !~ '\.\.' and char_length(storage_path) between 1 and 300),
  alt_text jsonb not null default '{}'::jsonb check (jsonb_typeof(alt_text) = 'object'),
  role text not null default 'gallery' check (role in ('hero','featured','gallery')),
  sort_order integer not null default 0,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);
create index accommodation_images_type_order_idx on public.accommodation_images (type_id, sort_order, created_at);
create unique index accommodation_images_one_hero_idx on public.accommodation_images (type_id) where role = 'hero';

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('IFY-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  type_id uuid not null references public.accommodation_types(id) on delete restrict,
  unit_id uuid,
  check_in date not null,
  check_out date not null,
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  guest_count integer not null check (guest_count between 1 and 20),
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 120),
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  customer_phone text not null check (char_length(customer_phone) between 7 and 30),
  status public.reservation_status not null default 'PENDING',
  source text not null default 'web' check (source in ('web','admin')),
  request_key uuid unique,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_valid_dates check (check_out > check_in),
  constraint reservations_assigned_when_confirmed check (status not in ('CONFIRMED','COMPLETED') or unit_id is not null),
  constraint reservations_unit_type_fk foreign key (unit_id, type_id) references public.accommodation_units(id, type_id) on delete restrict,
  constraint reservations_no_double_booking exclude using gist (unit_id with =, stay with &&) where (status in ('CONFIRMED','COMPLETED'))
);
create index reservations_type_status_dates_idx on public.reservations (type_id, status, check_in, check_out);
create index reservations_unit_idx on public.reservations (unit_id) where unit_id is not null;
create index reservations_arrivals_idx on public.reservations (check_in) where status = 'CONFIRMED';
create index reservations_departures_idx on public.reservations (check_out) where status = 'CONFIRMED';

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.accommodation_units(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  period daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  reason text not null check (char_length(trim(reason)) between 2 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date),
  constraint availability_blocks_no_overlap exclude using gist (unit_id with =, period with &&) where (active)
);
create index availability_blocks_unit_dates_idx on public.availability_blocks (unit_id, start_date, end_date) where active;

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.accommodation_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  nightly_price numeric(12,2) not null check (nightly_price >= 0),
  currency char(3) not null,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index pricing_rules_type_dates_idx on public.pricing_rules (type_id, start_date, end_date) where active;

create table public.business_settings (
  id integer primary key default 1 check (id = 1),
  display_name text not null default 'Ifrane For You',
  whatsapp_e164 text check (whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  contact_email text,
  instagram_url text,
  facebook_url text,
  booking_policy jsonb not null default '{}'::jsonb,
  arrival_policy jsonb not null default '{}'::jsonb,
  location_text jsonb not null default '{}'::jsonb,
  pending_hold_policy text not null default 'NONE' check (pending_hold_policy = 'NONE'),
  updated_at timestamptz not null default now()
);

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, created_at desc);

create table private.request_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0)
);
create index request_rate_limits_window_idx on private.request_rate_limits (window_started_at);

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger accommodation_types_updated before update on public.accommodation_types for each row execute function private.touch_updated_at();
create trigger accommodation_units_updated before update on public.accommodation_units for each row execute function private.touch_updated_at();
create trigger reservations_updated before update on public.reservations for each row execute function private.touch_updated_at();
create trigger availability_blocks_updated before update on public.availability_blocks for each row execute function private.touch_updated_at();
create trigger pricing_rules_updated before update on public.pricing_rules for each row execute function private.touch_updated_at();
create trigger business_settings_updated before update on public.business_settings for each row execute function private.touch_updated_at();

-- Both writes take the physical unit lock before checking the other table. This
-- closes the cross-table race that two independent exclusion constraints cannot.
create function private.check_reservation_inventory() returns trigger language plpgsql set search_path = '' as $$
declare capacity integer;
begin
  select max_guests into capacity from public.accommodation_types where id = new.type_id;
  if capacity is not null and new.guest_count > capacity then raise exception 'guest_capacity_exceeded' using errcode = '23514'; end if;
  if new.status in ('CONFIRMED','COMPLETED') then
    perform 1 from public.accommodation_units where id = new.unit_id and active for update;
    if not found then raise exception 'unit_inactive' using errcode = '23514'; end if;
    if exists (select 1 from public.availability_blocks b where b.unit_id = new.unit_id and b.active and b.period && daterange(new.check_in,new.check_out,'[)')) then
      raise exception 'unit_blocked' using errcode = '23P01';
    end if;
  end if;
  return new;
end $$;
create trigger reservations_inventory_guard before insert or update of unit_id, status, check_in, check_out, guest_count on public.reservations for each row execute function private.check_reservation_inventory();

create function private.check_block_inventory() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.active then
    perform 1 from public.accommodation_units where id = new.unit_id for update;
    if exists (select 1 from public.reservations r where r.unit_id = new.unit_id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(new.start_date,new.end_date,'[)')) then
      raise exception 'unit_reserved' using errcode = '23P01';
    end if;
  end if;
  return new;
end $$;
create trigger availability_blocks_inventory_guard before insert or update of unit_id, start_date, end_date, active on public.availability_blocks for each row execute function private.check_block_inventory();

create function private.check_unit_deactivation() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.active and not new.active and exists (select 1 from public.reservations r where r.unit_id = new.id and r.status = 'CONFIRMED' and r.check_out > current_date) then
    raise exception 'unit_has_future_reservations' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger accommodation_units_deactivation_guard before update of active on public.accommodation_units for each row execute function private.check_unit_deactivation();

alter table public.accommodation_types enable row level security;
alter table public.accommodation_units enable row level security;
alter table public.accommodation_images enable row level security;
alter table public.reservations enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.business_settings enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_logs enable row level security;

-- Explicit Data API grants: public catalog only. Every other table is server-only.
revoke all on public.accommodation_units, public.reservations, public.availability_blocks, public.pricing_rules, public.admin_profiles, public.audit_logs from anon, authenticated;
revoke all on public.accommodation_types, public.accommodation_images, public.business_settings from anon, authenticated;
grant select on public.accommodation_types, public.accommodation_images, public.business_settings to anon, authenticated;
create policy public_published_types on public.accommodation_types for select to anon, authenticated using (published);
create policy public_published_images on public.accommodation_images for select to anon, authenticated using (exists (select 1 from public.accommodation_types t where t.id = type_id and t.published));
create policy public_business_settings on public.business_settings for select to anon, authenticated using (true);

insert into public.accommodation_types (slug, names, published) values
('dome', '{"fr":"Le dôme panoramique","en":"The panoramic dome","ar":"القبة البانورامية"}'::jsonb, true),
('cabin', '{"fr":"Le chalet en bois","en":"The wooden cabin","ar":"الشاليه الخشبي"}'::jsonb, true)
on conflict (slug) do nothing;
insert into public.business_settings (id, display_name, whatsapp_e164, instagram_url, facebook_url) values
(1, 'Ifrane For You', '+212679941798', 'https://www.instagram.com/ifrane.foryou/', 'https://www.facebook.com/profile.php?id=61596139515509')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accommodation-images','accommodation-images',true,5242880,array['image/webp'])
on conflict (id) do nothing;
-- Public bucket reads are allowed; uploads/deletes use a server-only secret key
-- after a fresh Auth check and admin_profiles membership check.
