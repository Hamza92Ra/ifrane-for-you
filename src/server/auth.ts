import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db, databaseConfigured } from "./db";

export function authConfigured(): boolean { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && databaseConfigured()); }
export async function supabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("AUTH_NOT_CONFIGURED");
  const cookieStore = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll() { return cookieStore.getAll(); },
    setAll(items) { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot set cookies; proxy refreshes them. */ } }
  } });
}
export async function currentAdmin(): Promise<{ id: string } | null> {
  if (!authConfigured()) return null;
  try {
    const client = await supabaseAuth();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    const rows = await db()`select user_id from public.admin_profiles where user_id = ${data.user.id}::uuid and role = 'admin'`;
    return rows.length ? { id: data.user.id } : null;
  } catch { return null; }
}
