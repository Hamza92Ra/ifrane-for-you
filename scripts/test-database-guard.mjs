export function requireIsolatedTestDatabase() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL must point to a local, isolated Supabase database");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) {
    throw new Error("Database tests are restricted to loopback; production and hosted databases are forbidden");
  }
  return value;
}
