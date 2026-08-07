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

/**
 * The signed-in player's id, or null.
 *
 * The web app proves who it is with a cookie. The iOS bundle cannot — it runs
 * on capacitor://localhost, so its cookies for this origin are cross-site and
 * never sent — and presents the same Supabase access token as a bearer header
 * instead. The token is verified against Supabase either way; a forged one
 * fails `getUser` and the caller is simply not signed in.
 */
export async function currentUserId(request?: Request): Promise<string | null> {
  const header = request?.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();

  if (bearer) {
    if (!cloudConfigured) return null;
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await anon.auth.getUser(bearer);
    return data.user?.id ?? null;
  }

  const supabase = await routeClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
