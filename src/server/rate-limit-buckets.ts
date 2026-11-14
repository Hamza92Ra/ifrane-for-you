import { createHmac } from "node:crypto";

export type RateLimitBucket = { key: string; limit: number };

export function rateLimitBuckets(scope: "auth" | "booking", ip: string | null, email: string | undefined, secret: string): RateLimitBucket[] {
  if (secret.length < 32) throw new Error("RATE_LIMIT_NOT_CONFIGURED");
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  const buckets: RateLimitBucket[] = [];
  if (ip) buckets.push({ key: `${scope}:ip:${hash(ip)}`, limit: scope === "auth" ? 5 : 10 });
  if (email) buckets.push({ key: `${scope}:email:${hash(email.trim().toLowerCase())}`, limit: 5 });
  return buckets;
}
