
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const nativeBuild = process.env.NEXT_PUBLIC_NATIVE === "1";

export const cloudConfigured =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !nativeBuild;
