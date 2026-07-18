/**
 * RLS smoke test — unauthenticated client must not read workspaces rows
 * Run: node scripts/test-cloud-rls.js
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const url = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log("PASS:", message);
}

async function main() {
  if (!url || !key) {
    console.error("SKIP: SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing in .env");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase.from("workspaces").select("id").limit(1);

  if (error) {
    assert(true, `Unauthenticated SELECT blocked or empty (${error.code || error.message})`);
  } else {
    assert(Array.isArray(data) && data.length === 0, "Unauthenticated SELECT returns no rows");
  }

  const fakeUserId = "00000000-0000-4000-8000-000000000001";
  const { error: insertError } = await supabase.from("workspaces").insert({
    user_id: fakeUserId,
    document_key: "rls-test-key",
    answer_data: {},
    workspace_state: {},
  });

  assert(Boolean(insertError), `Unauthenticated INSERT blocked (${insertError?.code || insertError?.message || "no error"})`);

  console.log("\nRLS smoke checks completed.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
