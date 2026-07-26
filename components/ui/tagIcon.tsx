import type { GameTag } from "@/games/types";
import {
  BoltIcon,
  BurstIcon,
  ChipIcon,
  DiceIcon,
  DragIcon,
  HoldIcon,
  HourglassIcon,
  LayersIcon,
  TapIcon,
  TargetIcon,
  TvIcon,
  WaveIcon,
} from "@/components/ui/icons";

const TAG_ICON: Record<GameTag, (p: { size?: number }) => React.ReactElement> = {
  memory: LayersIcon,
  casino: ChipIcon,
  luck: DiceIcon,
  chaos: BurstIcon,
  retro: TvIcon,
  hold: HoldIcon,
  drag: DragIcon,
  reflex: BoltIcon,
  precision: TargetIcon,
  endurance: HourglassIcon,
  calm: WaveIcon,
  oneTap: TapIcon,
};

// Tags are picked in this order so the most distinctive mechanic wins —
// e.g. a reflex+oneTap game reads as "reflex", not a generic tap icon.
const PRIORITY: GameTag[] = [
  "memory",
  "casino",
  "luck",
  "chaos",
  "retro",
  "hold",
  "drag",
  "reflex",
  "precision",
  "endurance",
  "calm",
  "oneTap",
];

/** Picks the single most representative icon for a game's tag list. */
export function TagIcon({ tags, size }: { tags: GameTag[]; size?: number }) {
  const tag = PRIORITY.find((t) => tags.includes(t)) ?? tags[0];
  const Icon = TAG_ICON[tag] ?? TapIcon;
  return <Icon size={size} />;
}
