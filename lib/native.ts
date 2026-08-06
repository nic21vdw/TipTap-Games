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

export const serverRoutesReachable = !nativeBuild || API_ORIGIN.length > 0;
