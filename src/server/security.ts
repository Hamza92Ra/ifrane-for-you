import "server-only";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db";

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === request.nextUrl.origin);
}
function hash(value: string): string {
  const key = process.env.RATE_LIMIT_SECRET;
  if (!key || key.length < 32) throw new Error("RATE_LIMIT_NOT_CONFIGURED");
  return createHmac("sha256", key).update(value).digest("hex");
}
export async function checkRateLimit(request: NextRequest, email?: string): Promise<boolean> {
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || (process.env.RATE_LIMIT_TRUST_PROXY === "true" ? request.headers.get("x-real-ip")?.trim() : null);
  const buckets: Array<{key:string;limit:number}> = [{key:"global:requests",limit:120}];
  if (ip) buckets.push({key:"ip:"+hash(ip),limit:8});
  if (email) buckets.push({key:"email:"+hash(email.toLowerCase()),limit:4});
  const sql = db();
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
