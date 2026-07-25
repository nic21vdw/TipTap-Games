export type HapticKind = "light" | "hit" | "fail";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  hit: 18,
  fail: [30, 40, 60],
};

export function haptic(kind: HapticKind) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // some browsers throw without a user gesture; never let haptics break play
  }
}
