// The one place that decides whether this build has a backend at all.
//
// Tip Tap Games is designed to be fully playable with no Supabase project:
// lib/storage.ts keeps bests, likes, signals and prefs in localStorage, and
// every cloud call site checks `cloudConfigured` first. Add the two public
// env vars and the same app gains Google sign-in and cross-device saves with
// no other code change.

// Referenced as literal `process.env.NEXT_PUBLIC_*` so Next inlines them
// into the client bundle — destructuring `process.env` here would not work.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
