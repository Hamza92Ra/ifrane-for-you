#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const manualUserId = args[1];

  if (!email) {
    console.log(`
Usage:
  node scripts/bootstrap-admin.mjs <email> [auth_user_uuid]

Options:
  - If NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are set in environment:
    Creates a new user via Supabase Auth Admin API with a cryptographically secure random password,
    and grants the 'admin' role in public.admin_profiles.
  - If only DATABASE_URL is set:
    Finds or accepts the user's UUID from auth.users and grants the 'admin' role in public.admin_profiles.
`);
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (!dbUrl) {
    console.error("Error: DATABASE_URL (or TEST_DATABASE_URL) environment variable is required.");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false });

  try {
    let userId = manualUserId;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;

    if (supabaseUrl && serviceKey && !userId) {
      console.log(`Connecting to Supabase Auth Admin API at ${supabaseUrl}...`);
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Generate a cryptographically secure random 24-character password
      const generatedPassword = randomBytes(18).toString("base64url") + "!Aa1";

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true
      });

      if (error) {
        if (error.message.includes("already registered") || error.code === "email_exists") {
          console.log(`User ${email} already exists in Supabase Auth. Querying auth record...`);
        } else {
          console.error("Supabase Auth API error:", error.message);
          process.exit(1);
        }
      } else if (data?.user) {
        userId = data.user.id;
        console.log("\n========================================================");
        console.log("ADMIN USER CREATED SUCCESSFULLY");
        console.log(`Email:    ${email}`);
        console.log(`Password: ${generatedPassword}`);
        console.log("Store this password securely. It will not be shown again.");
        console.log("========================================================\n");
      }
    }

    if (!userId) {
      const rows = await sql`select id from auth.users where email = ${email.toLowerCase()}`;
      if (rows.length) {
        userId = rows[0].id;
      }
    }

    if (!userId) {
      console.error(`Could not locate auth.users record for '${email}'.`);
      console.error("Create the user in the Supabase Dashboard, or provide their UUID as the second argument:");
      console.error(`  node scripts/bootstrap-admin.mjs ${email} <user_uuid>`);
      process.exit(1);
    }

    // Insert or update role in public.admin_profiles
    await sql`insert into public.admin_profiles (user_id, role)
      values (${userId}::uuid, 'admin')
      on conflict (user_id) do update set role = 'admin'`;

    // Audit log
    await sql`insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, after_data)
      values (${userId}::uuid, 'bootstrap_admin', 'admin_profiles', ${userId}::uuid, ${sql.json({ email, role: "admin" })})`;

    console.log(`Admin profile active: User ID ${userId} has 'admin' privileges.`);
  } catch (err) {
    console.error("Bootstrap failed:", err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
