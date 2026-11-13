import "server-only";
import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;
export function databaseConfigured(): boolean { return Boolean(process.env.DATABASE_URL); }
export function db(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  client ??= postgres(url, { max: 5, idle_timeout: 20, prepare: false, connect_timeout: 10 });
  return client;
}
