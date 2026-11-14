import "server-only";
import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

// Vercel's Supabase integration exposes POSTGRES_URL, while local setups can use DATABASE_URL.
// Prefer an explicit DATABASE_URL if both are configured.
function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function databaseConfigured(): boolean {
  return Boolean(databaseUrl());
}

export function db(): ReturnType<typeof postgres> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  client ??= postgres(url, { max: 5, idle_timeout: 20, prepare: false, connect_timeout: 10 });
  return client;
}
