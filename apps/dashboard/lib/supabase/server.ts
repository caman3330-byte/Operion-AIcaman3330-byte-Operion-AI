import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseServerEnv } from "@/lib/env";
import type { Database } from "./types";

let adminClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin() {
  if (adminClient) {
    return adminClient;
  }

  const env = readSupabaseServerEnv();
  adminClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store"
        })
    }
  });

  return adminClient;
}
