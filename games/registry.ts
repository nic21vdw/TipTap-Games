import type { GameMeta, GameModule } from "@/games/types";
import reflexGate from "@/games/reflex-gate";
import tapRush from "@/games/tap-rush";
import wordTrap from "@/games/word-trap";
import holdLine from "@/games/hold-line";
import flashRecall from "@/games/flash-recall";
import dropDodge from "@/games/drop-dodge";
import oneLane from "@/games/one-lane";
import popChain from "@/games/pop-chain";
import cashOut from "@/games/cash-out";

export const MODULES: Record<string, GameModule> = {
  [reflexGate.meta.slug]: reflexGate,
  [tapRush.meta.slug]: tapRush,
  [wordTrap.meta.slug]: wordTrap,
  [holdLine.meta.slug]: holdLine,
  [flashRecall.meta.slug]: flashRecall,
  [dropDodge.meta.slug]: dropDodge,
  [oneLane.meta.slug]: oneLane,
  [popChain.meta.slug]: popChain,
  [cashOut.meta.slug]: cashOut,
};

export const CATALOG: GameMeta[] = Object.values(MODULES).map((m) => m.meta);

export function getModule(slug: string): GameModule {
  const m = MODULES[slug];
  if (!m) throw new Error(`Unknown game: ${slug}`);
  return m;
}
