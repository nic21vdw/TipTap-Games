import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, cloudConfigured } from "./config";

/**
 * Request-scoped client that reads the caller's session from cookies and
 * refreshes it when needed. Use this to answer "who is calling?" — it is
 * bound by row-level security exactly like the browser client.
 */
export async function routeClient(): Promise<SupabaseClient | null> {
  if (!cloudConfigured) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list)
            store.set(name, value, options);
        } catch {
          // Called from a Server Component render, where cookies are frozen.
          // Middleware/route handlers still refresh the session, so this is
          // safe to ignore.
        }
      },
    },
  });
}

/**
 * Bypasses row-level security. Only for the score path, which has to write
 * rows no browser is allowed to write. Never import this from a client file
 * — the key is server-only and must never reach the bundle.
 */
export function serviceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cloudConfigured || !key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in player's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await routeClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
