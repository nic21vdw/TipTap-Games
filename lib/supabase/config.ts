
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const nativeBuild = process.env.NEXT_PUBLIC_NATIVE === "1";

const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").replace(/\/$/, "");

/**
 * The iOS bundle carries no server, so it has a backend only when it was built
 * knowing where to reach one. scripts/build-native.mjs always sets an origin,
 * which leaves the Supabase keys as the real switch — build the bundle without
 * them and the app is guest-only, exactly as it was before.
 */
export const cloudConfigured =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && (!nativeBuild || apiOrigin.length > 0);
