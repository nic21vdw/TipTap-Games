import { isNativeRuntime, nativeBuild } from "@/lib/native";

export type HapticKind = "light" | "hit" | "fail";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  hit: 18,
  fail: [30, 40, 60],
};

type HapticsModule = typeof import("@capacitor/haptics");

let mod: HapticsModule | null = null;
let loading = false;

function loadPlugin() {
  if (mod || loading) return;
  loading = true;
  void import("@capacitor/haptics")
    .then((m) => {
      mod = m;
    })
    .catch(() => {
      loading = false;
    });
}

function fire(m: HapticsModule, kind: HapticKind): Promise<void> {
  if (kind === "fail") {
    return m.Haptics.notification({ type: m.NotificationType.Error });
  }
  return m.Haptics.impact({
    style: kind === "light" ? m.ImpactStyle.Light : m.ImpactStyle.Medium,
  });
}

export function haptic(kind: HapticKind) {
  if (nativeBuild && isNativeRuntime()) {
    loadPlugin();
    if (mod) {
      void fire(mod, kind).catch(() => {});
      return;
    }
  }
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {}
}
