-- Additive booking upgrade. No prices, meal choices, services or deposit values are seeded.
create type public.booking_option_kind as enum ('MEAL','SERVICE');
create type public.booking_pricing_basis as enum (
  'PER_BOOKING',
  'PER_NIGHT',
  'PER_PERSON',
  'PER_PERSON_PER_NIGHT',
  'PER_ITEM'
);
create type public.reservation_payment_status as enum (
  'NOT_STARTED',
  'PENDING',
  'PARTIAL',
  'PAID',
  'FAILED',
  'REFUNDED'
);

create table public.booking_options (
  id uuid primary key default gen_random_uuid(),
  type_id uuid references public.accommodation_types(id) on delete restrict,
  kind public.booking_option_kind not null,
  names jsonb not null check (jsonb_typeof(names) = 'object'),
  descriptions jsonb not null default '{}'::jsonb check (jsonb_typeof(descriptions) = 'object'),
  pricing_basis public.booking_pricing_basis not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_options_have_names check (
    coalesce(nullif(trim(names->>'fr'),''),'') <> '' and
    coalesce(nullif(trim(names->>'en'),''),'') <> '' and
    coalesce(nullif(trim(names->>'ar'),''),'') <> ''
  )
);
create index booking_options_public_order_idx on public.booking_options(type_id,kind,sort_order) where active and published;
create trigger booking_options_updated before update on public.booking_options for each row execute function private.touch_updated_at();

create table public.reservation_option_selections (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  option_id uuid not null references public.booking_options(id) on delete restrict,
  option_name_snapshot jsonb not null check (jsonb_typeof(option_name_snapshot) = 'object'),
  kind public.booking_option_kind not null,
  pricing_basis public.booking_pricing_basis not null,
  quantity integer not null default 1 check (quantity between 1 and 20),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (reservation_id, option_id)
);
create index reservation_option_selections_reservation_idx on public.reservation_option_selections(reservation_id);

alter table public.reservations
  add column lodging_total numeric(12,2),
  add column options_total numeric(12,2),
  add column total_amount numeric(12,2),
  add column price_currency char(3),
  add column price_breakdown jsonb,
  add column payment_status public.reservation_payment_status not null default 'NOT_STARTED',
  add column deposit_percent_snapshot numeric(5,2),
  add constraint reservations_price_snapshot_check check (
    (total_amount is null and lodging_total is null and options_total is null and price_currency is null)
    or
    (total_amount is not null and lodging_total is not null and options_total is not null and price_currency is not null
     and total_amount >= 0 and lodging_total >= 0 and options_total >= 0 and price_currency ~ '^[A-Z]{3}$'
     and total_amount = lodging_total + options_total)
  ),
  add constraint reservations_deposit_snapshot_check check (
    deposit_percent_snapshot is null or deposit_percent_snapshot between 1 and 99
  );

alter table public.business_settings
  add column deposit_percent numeric(5,2),
  add constraint business_settings_deposit_percent_check check (
    deposit_percent is null or deposit_percent between 1 and 99
  );

-- Future payment provider records only. There are no payment endpoints, SDK calls, or UI in this release.
create table public.reservation_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  provider text not null check (char_length(trim(provider)) between 1 and 40),
  provider_reference text,
  idempotency_key uuid not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status public.reservation_payment_status not null default 'PENDING',
  provider_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,provider_reference)
);
create index reservation_payment_attempts_reservation_idx on public.reservation_payment_attempts(reservation_id,created_at desc);
create trigger reservation_payment_attempts_updated before update on public.reservation_payment_attempts for each row execute function private.touch_updated_at();

alter table public.booking_options enable row level security;
alter table public.reservation_option_selections enable row level security;
alter table public.reservation_payment_attempts enable row level security;
revoke all on public.booking_options, public.reservation_option_selections, public.reservation_payment_attempts from anon, authenticated;
grant select on public.booking_options to anon, authenticated;
create policy public_published_booking_options on public.booking_options for select to anon, authenticated using (
  active and published and (type_id is null or exists (
    select 1 from public.accommodation_types t where t.id=type_id and t.published
  ))
);
