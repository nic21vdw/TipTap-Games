"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, cloudConfigured, nativeBuild } from "./config";

let cached: SupabaseClient | null = null;

/**
 * The browser client, or null when this build has no Supabase project.
 * Callers treat null as "stay local" rather than as an error.
 *
 * The two builds store a session in different places, because they have to.
 * On the web the session lives in cookies so middleware and /api/runs/* see
 * the same player the browser does. The iOS bundle runs on capacitor://
 * localhost and talks to a Vercel origin, where those cookies would be
 * cross-site and dropped — so it keeps the session in localStorage and proves
 * who it is with a bearer token instead.
 */
export function browserClient(): SupabaseClient | null {
  if (!cloudConfigured || typeof window === "undefined") return null;
  cached ??= nativeBuild
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          // The redirect arrives as a deep link, not as a page load.
          detectSessionInUrl: false,
        },
      })
    : createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}

/** The caller's access token, for the routes that cannot read a cookie. */
export async function accessToken(): Promise<string | null> {
  const supabase = browserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
