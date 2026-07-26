"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, cloudConfigured } from "./config";

let cached: SupabaseClient | null = null;

/**
 * The browser client, or null when this build has no Supabase project.
 * Callers treat null as "stay local" rather than as an error.
 */
export function browserClient(): SupabaseClient | null {
  if (!cloudConfigured || typeof window === "undefined") return null;
  cached ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
