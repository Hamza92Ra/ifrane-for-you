import "server-only";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { rateLimitBuckets } from "./rate-limit-buckets";

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === request.nextUrl.origin);
}

export async function checkRateLimit(request: NextRequest, identifier?: string): Promise<boolean> {
  const isAdminLogin = Boolean(identifier && identifier.startsWith("admin:"));
  const cleanEmail = isAdminLogin ? identifier!.replace(/^admin:/, "") : identifier;
  const scope = isAdminLogin ? "auth" : "booking";

  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || (process.env.RATE_LIMIT_TRUST_PROXY === "true"
      ? (request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim())
      : null) || null;

  // Independent identities retain the same abuse limits without sharing a ceiling.
  const buckets = rateLimitBuckets(scope, ip, cleanEmail, process.env.RATE_LIMIT_SECRET || "");

  const sql = db();

  // Prune expired rate limit entries (5% chance per request) to prevent table bloat
  if (Math.random() < 0.05) {
    sql`delete from private.request_rate_limits where window_started_at < now() - interval '1 hour'`.catch(() => {});
  }

  for (const bucket of buckets) {
    const rows = await sql`insert into private.request_rate_limits (bucket, window_started_at, attempts)
      values (${bucket.key}, now(), 1)
      on conflict (bucket) do update set
        attempts = case when private.request_rate_limits.window_started_at < now() - interval '10 minutes' then 1 else private.request_rate_limits.attempts + 1 end,
        window_started_at = case when private.request_rate_limits.window_started_at < now() - interval '10 minutes' then now() else private.request_rate_limits.window_started_at end
      returning attempts`;
    if (Number(rows[0].attempts) > bucket.limit) return false;
  }
  return true;
}
