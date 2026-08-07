export const nativeBuild = process.env.NEXT_PUBLIC_NATIVE === "1";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").replace(/\/$/, "");

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

export function isNativeRuntime(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

export function isIos(): boolean {
  return cap()?.getPlatform?.() === "ios";
}

export function apiUrl(path: string): string {
  if (!nativeBuild || !API_ORIGIN) return path;
  return `${API_ORIGIN}${path}`;
}

/**
 * Where Google sends an iOS player back to. A custom scheme, not a URL: the
 * bundle has no origin of its own to return to, so iOS hands the redirect to
 * the app itself. It must match the CFBundleURLTypes entry in
 * ios/App/App/Info.plist and the allow-list under Supabase → Authentication →
 * URL Configuration, or the round trip dies at the last step.
 */
export const NATIVE_AUTH_REDIRECT = "com.nicvandewetering.tiptapgames://auth-callback";

export const serverRoutesReachable = !nativeBuild || API_ORIGIN.length > 0;
