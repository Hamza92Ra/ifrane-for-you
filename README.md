# Ifrane For You

Photo-led hospitality website and reservation platform built on the existing editorial design. The business name is **Ifrane For You**. The real dome and cabin photographs are in `public/images/`, with extracted originals retained under `assets/source/`. The website is deployed to Vercel at https://ifrane-for-you.vercel.app. The Supabase production schema was applied on 2026-11-14. Admin access and verified physical inventory still need setup.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The default is French; `/en` and `/ar` are also available. Without Supabase configuration, the public site, galleries, translations, and verified WhatsApp contact still work. The online booking form explicitly reports that live availability is not configured. It never invents inventory or confirms a booking.

For a production build:

```bash
npm run typecheck
npm run lint
npm run build
npm run start
```

## Connect a new Supabase project

1. The reviewed migration [`supabase/migrations/20261114162651_hospitality_core.sql`](supabase/migrations/20261114162651_hospitality_core.sql) is already applied to Supabase project `rxuvkuhxgllvfcflanpw`; its filename matches the remote migration-history version. **Do not apply it again to that project.** For a new isolated environment, confirm the project before running `npx supabase link --project-ref <ref>` and `npx supabase db push`; a disposable local instance can run it with `npx supabase start` and `npx supabase db reset`.
2. Copy the project URL, **publishable key**, and **secret key** into `.env.local`. The secret key is used only by a server-side photo endpoint. Set `DATABASE_URL` or Vercel's `POSTGRES_URL` to the project's Postgres connection string, preferably the transaction pooler for serverless hosting. The database password stays server-side. `prepare:false` is already configured for pooler compatibility.
3. Set `RATE_LIMIT_SECRET` to a random value of at least 32 bytes (`openssl rand -hex 32`). Set `SITE_URL` to the verified HTTPS site origin before launch. Keep `.env.local` out of version control. The existing `.gitignore` excludes it.
4. In Supabase Auth, create an administrator user using the dashboard. Grant the role by inserting that user's UUID into `public.admin_profiles` using the SQL editor:

   ```sql
   insert into public.admin_profiles (user_id, role)
   values ('<auth.users UUID>', 'admin');
   ```

   Email/password alone never grants admin access. Admin privileges are checked against this table on every protected operation.
5. Sign in at `/admin`. For each accommodation, enter the **verified** maximum guests per physical unit, then add each real bookable unit separately. The migration seeds the dome and cabin *types* but **zero units and no capacities, prices, or availability**. Until those facts are entered, online booking remains unavailable. New accommodation types start as drafts; add verified FR/EN/AR copy and photography before publishing them.
6. Review the FR/EN/AR editorial and booking copy with the business, especially Arabic, before publishing. Add verified amenities, rates, check-in/out policies, contact email, and location details if the business supplies them. The supplied WhatsApp number and social URLs are seeded in the migration and editable in admin.

Do not apply migrations, create administrators, or add inventory to a production project without explicit approval and verified business data.

## Booking and inventory rules

- Customers use a three-step date, guest, and contact flow. A successful submission receives a reference with **PENDING** status. Pending requests do not reserve or hold a unit. The UI states this policy.
- Public availability counts active physical units without overlapping confirmed/completed reservations or active maintenance blocks. Check-out is exclusive, so same-day turnover is allowed.
- Admin approval assigns an active free unit, optionally chosen by the admin; confirmed bookings can be reassigned to another free unit. The database serializes inventory writes with unit locks and rejects overlapping assignments with a GiST exclusion constraint. Maintenance blocks use a separate exclusion constraint and a cross-table lock/check trigger. Deactivation rejects units with future confirmed bookings. Historical reservations are never deleted by the dashboard.
- Manual admin reservations confirm only after the same inventory checks. Customer data is server-side; the public Supabase Data API has no read or write access to reservations. All exposed tables have RLS enabled. Admin writes use the server database connection after fresh Supabase Auth validation and `admin_profiles` membership.
- The public submission endpoint validates input, checks same-origin, limits requests in Postgres by keyed IP/email/global buckets, and rechecks availability in a transaction. Use a trusted ingress for reliable IP rate limiting; `RATE_LIMIT_TRUST_PROXY=true` only when your proxy overwrites `X-Real-IP`.
- WhatsApp messages contain a general inquiry only. Booking contact details and dates are never included in a WhatsApp URL.

## Images and content

- `src/content/stays.ts` maps local optimized WebP photos and localized alt text. The public hero is high priority; offscreen gallery photos are lazy loaded. Sources are in `assets/source/` and do not ship in the web app.
- Admin images are validated (JPEG/PNG/WebP, max 5 MB, max 8000 px), converted to metadata-free WebP using Sharp, and uploaded to the Supabase `accommodation-images` bucket. FR/EN/AR alt text is required. The admin can select a hero, choose role/order, and delete managed images. Original local images remain as the editorial fallback. New published categories receive their own detail page and booking option once a photo is uploaded.
- Dictionaries are in `src/i18n/index.ts` and `src/i18n/booking.ts`. Locale URLs, `lang`, `dir`, metadata, and sitemap cover FR/EN/AR. The language switch stores a one-year preference cookie.
- The supplied HTML concept is an external design reference. The site uses Ifrane For You branding throughout. Automated Instagram access was throttled, so brand claims rely on the user-supplied name, contacts, and property photos.

## Database checks

Run against a **disposable migrated test database** only:

```bash
TEST_DATABASE_URL='postgresql://...' node scripts/test-reservations.mjs
```

For a remote isolated test project, also set `ALLOW_REMOTE_TEST_DATABASE=yes`. The script creates temporary inventory, exercises simultaneous last-unit confirmations, overlap rejection, same-day turnover, cancellation, maintenance conflict, room deactivation, pending approval, and public-role write denial, then removes its rows. These tests could not be executed in this workspace because no Supabase credentials or local Docker/Postgres runtime were provided.

## Security and launch notes

The app uses server-only database and Storage credentials, RLS on exposed tables, explicit public grants, origin checks on mutations, input validation, audit records, and security headers. The current CSP permits inline scripts/styles needed by this Next.js build; a deployment-specific nonce policy would strengthen it. No payment flow, automatic confirmation, customer account, or email delivery is configured. Any customer notification beyond the on-screen submission reference requires a verified email provider or another approved integration.
# ifrane-for-you
