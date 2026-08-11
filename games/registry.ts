import type { FullGameMeta, GameModule } from "@/games/types";
import { nativeBuild } from "@/lib/native";
import arcGlide from "@/games/arc-glide";
import asteroidDrift from "@/games/asteroid-drift";
import ballStream from "@/games/ball-stream";
import balloonRise from "@/games/balloon-rise";
import beatJump from "@/games/beat-jump";
import blackKeys from "@/games/black-keys";
import bladeDuel from "@/games/blade-duel";
import bladeThrow from "@/games/blade-throw";
import blobAbsorb from "@/games/blob-absorb";
import blockClear from "@/games/block-clear";
import bounceHop from "@/games/bounce-hop";
import breakPool from "@/games/break-pool";
import brickPaddle from "@/games/brick-paddle";
import bubblePopShooter from "@/games/bubble-pop-shooter";
import cascadeMatch from "@/games/cascade-match";
import cashOut from "@/games/cash-out";
import channelDig from "@/games/channel-dig";
import coilArena from "@/games/coil-arena";
import collectHunt from "@/games/collect-hunt";
import comboPunch from "@/games/combo-punch";
import copterThrust from "@/games/copter-thrust";
import crossTraffic from "@/games/cross-traffic";
import cubeDodge from "@/games/cube-dodge";
import dashHorn from "@/games/dash-horn";
import deepCast from "@/games/deep-cast";
import dotChain from "@/games/dot-chain";
import driftField from "@/games/drift-field";
import driftLoop from "@/games/drift-loop";
import dropDodge from "@/games/drop-dodge";
import dropTower from "@/games/drop-tower";
import duelFling from "@/games/duel-fling";
import flashRecall from "@/games/flash-recall";
import gauntletMicro from "@/games/gauntlet-micro";
import gearShift from "@/games/gear-shift";
import ghostRace from "@/games/ghost-race";
import glassBreak from "@/games/glass-break";
import glideUp from "@/games/glide-up";
import gridSweep from "@/games/grid-sweep";
import hazardGlide from "@/games/hazard-glide";
import hexSpin from "@/games/hex-spin";
import hillDrive from "@/games/hill-drive";
import holdLine from "@/games/hold-line";
import holeMaze from "@/games/hole-maze";
import hookSwing from "@/games/hook-swing";
import hordeRun from "@/games/horde-run";
import huePass from "@/games/hue-pass";
import iceSlide from "@/games/ice-slide";
import impossiblePath from "@/games/impossible-path";
import jewelSwap from "@/games/jewel-swap";
import laneGuard from "@/games/lane-guard";
import limbFlail from "@/games/limb-flail";
import loopRun from "@/games/loop-run";
import mergeTile from "@/games/merge-tile";
import moteAbsorb from "@/games/mote-absorb";
import nokiaMode from "@/games/nokia-mode";
import oneGap from "@/games/one-gap";
import oneLane from "@/games/one-lane";
import paperTossWind from "@/games/paper-toss-wind";
import pathControl from "@/games/path-control";
import patienceDeck from "@/games/patience-deck";
import pegDrop from "@/games/peg-drop";
import pinballFlip from "@/games/pinball-flip";
import pipeFlow from "@/games/pipe-flow";
import popChain from "@/games/pop-chain";
import puddleHop from "@/games/puddle-hop";
import rageClimb from "@/games/rage-climb";
import railDodge from "@/games/rail-dodge";
import reflexGate from "@/games/reflex-gate";
import rigBuild from "@/games/rig-build";
import rocketJetpack from "@/games/rocket-jetpack";
import rollPhysics from "@/games/roll-physics";
import rooftopRun from "@/games/rooftop-run";
import shaftDescent from "@/games/shaft-descent";
import sideBlaster from "@/games/side-blaster";
import slopeGlide from "@/games/slope-glide";
import snipSwing from "@/games/snip-swing";
import snowCarve from "@/games/snow-carve";
import sphereChain from "@/games/sphere-chain";
import spiralFall from "@/games/spiral-fall";
import split from "@/games/split";
import iceLine from "@/games/ice-line";
import basementDefense from "@/games/basement-defense";
import hardwater from "@/games/hardwater";
import fiveNights from "@/games/five-nights";
import spreadSim from "@/games/spread-sim";
import sprintRelay from "@/games/sprint-relay";
import stackFall from "@/games/stack-fall";
import tankArena from "@/games/tank-arena";
import tapFarm from "@/games/tap-farm";
import tapFortune from "@/games/tap-fortune";
import tapPet from "@/games/tap-pet";
import tapRush from "@/games/tap-rush";
import tapTower from "@/games/tap-tower";
import templeDash from "@/games/temple-dash";
import tempoHop from "@/games/tempo-hop";
import territoryClaim from "@/games/territory-claim";
import tightMerge from "@/games/tight-merge";
import tiltMatch from "@/games/tilt-match";
import towerLine from "@/games/tower-line";
import trackDraw from "@/games/track-draw";
import twinOrbit from "@/games/twin-orbit";
import wallHop from "@/games/wall-hop";
import wingSlingshot from "@/games/wing-slingshot";
import wordDuel from "@/games/word-duel";
import wordTrap from "@/games/word-trap";

const ALL: GameModule[] = [
  arcGlide,
  asteroidDrift,
  ballStream,
  balloonRise,
  beatJump,
  blackKeys,
  bladeDuel,
  bladeThrow,
  blobAbsorb,
  blockClear,
  bounceHop,
  breakPool,
  brickPaddle,
  bubblePopShooter,
  cascadeMatch,
  cashOut,
  channelDig,
  coilArena,
  collectHunt,
  comboPunch,
  copterThrust,
  crossTraffic,
  cubeDodge,
  dashHorn,
  deepCast,
  dotChain,
  driftField,
  driftLoop,
  dropDodge,
  dropTower,
  duelFling,
  flashRecall,
  gauntletMicro,
  gearShift,
  ghostRace,
  glassBreak,
  glideUp,
  gridSweep,
  hazardGlide,
  hexSpin,
  hillDrive,
  holdLine,
  holeMaze,
  hookSwing,
  hordeRun,
  huePass,
  iceSlide,
  impossiblePath,
  jewelSwap,
  laneGuard,
  limbFlail,
  loopRun,
  mergeTile,
  moteAbsorb,
  nokiaMode,
  oneGap,
  oneLane,
  paperTossWind,
  pathControl,
  patienceDeck,
  pegDrop,
  pinballFlip,
  pipeFlow,
  popChain,
  puddleHop,
  rageClimb,
  railDodge,
  reflexGate,
  rigBuild,
  rocketJetpack,
  rollPhysics,
  rooftopRun,
  shaftDescent,
  sideBlaster,
  slopeGlide,
  snipSwing,
  snowCarve,
  sphereChain,
  spiralFall,
  split,
  iceLine,
  spreadSim,
  sprintRelay,
  stackFall,
  tankArena,
  tapFarm,
  tapFortune,
  tapPet,
  tapRush,
  tapTower,
  templeDash,
  tempoHop,
  territoryClaim,
  tightMerge,
  tiltMatch,
  towerLine,
  trackDraw,
  twinOrbit,
  wallHop,
  wingSlingshot,
  wordDuel,
  wordTrap,
  basementDefense,
  hardwater,
  fiveNights,
];

/**
 * Fills the optional algorithm axes. Speed tracks intensity, difficulty
 * tracks intensity and inverse-luck, realism defaults to playful, and
 * anything tagged casino is the only thing that isn't kid-safe.
 */
const DEFAULT_PALETTE = {
  hero: "#0095f6",
  foe: "#ff4d6d",
  prize: "#ffb703",
  deep: "#9db8d2",
  glow: "#8ecae6",
};

export function enrich(mod: GameModule): FullGameMeta {
  const m = mod.meta;
  return {
    ...m,
    palette: m.palette ?? DEFAULT_PALETTE,
    speed: m.speed ?? m.intensity,
    difficulty: m.difficulty ?? Math.min(1, m.intensity * 0.6 + (1 - m.luck) * 0.4),
    realism: m.realism ?? 0.3,
    kidSafe: m.kidSafe ?? !m.tags.includes("casino"),
  };
}

/**
 * The App Store build ships without the casino card. A bank-it-before-it-busts
 * multiplier is a gambling-shaped mechanic even with free virtual chips, and
 * declaring it honestly on the age-rating form pushes the whole app to 17+.
 * Dropping it here is the one place that decision lives: the web keeps it, the
 * binary never contains it, and `shipped` is what every other module reads.
 */
const shipped = nativeBuild ? ALL.filter((m) => !m.meta.tags.includes("casino")) : ALL;

export const MODULES: Record<string, GameModule> = Object.fromEntries(
  shipped.map((m) => [m.meta.slug, m])
);

export const CATALOG: FullGameMeta[] = shipped.map(enrich);

/** A base engine slug this build actually contains, or null. */
export function shippedBase(slug: string): string | null {
  return MODULES[slug] ? slug : null;
}

export function getModule(slug: string): GameModule {
  const m = MODULES[slug];
  if (!m) throw new Error(`Unknown game: ${slug}`);
  return m;
}

/** Full meta (all axes resolved) for a slug. */
export function getMeta(slug: string): FullGameMeta {
  return CATALOG.find((m) => m.slug === slug) ?? enrich(getModule(slug));
}

/** Adds a runtime-generated module to the live catalog. */
export function registerModule(mod: GameModule) {
  if (MODULES[mod.meta.slug]) return;
  MODULES[mod.meta.slug] = mod;
  CATALOG.push(enrich(mod));
}

/**
 * Registers a module a card can render but the algorithm must never draw —
 * used for transient "building…" placeholder cards. It lands in MODULES only,
 * never CATALOG, so the sampler can't see it; getMeta still resolves it via
 * its getModule fallback.
 */
export function registerHiddenModule(mod: GameModule) {
  if (MODULES[mod.meta.slug]) return;
  MODULES[mod.meta.slug] = mod;
}

/** Removes a runtime module (e.g. a resolved placeholder) from the registry. */
export function unregisterModule(slug: string) {
  if (!MODULES[slug]) return;
  delete MODULES[slug];
  const i = CATALOG.findIndex((m) => m.slug === slug);
  if (i >= 0) CATALOG.splice(i, 1);
}
