"use client";

import { create } from "zustand";
import { loadJson, saveJson } from "@/lib/storage";
import {
  getMusicVolume,
  isUnlocked,
  onAudioUnlock,
  playFor,
  setMusicEnabled,
  setMusicVolume,
  stopMusic,
  unlockAudio,
  type TrackSeedMeta,
  type TrackSpec,
} from "@/lib/music";

interface MusicState {
  enabled: boolean;
  volume: number;
  /** true once a gesture has let the audio context start */
  unlocked: boolean;
  track: TrackSpec | null;
  hydrate: () => void;
  toggle: () => void;
  setVolume: (v: number) => void;
  /** Called when a card becomes the active one. */
  cue: (meta: TrackSeedMeta) => void;
}

export const useMusicStore = create<MusicState>((set, get) => ({
  enabled: true,
  volume: 0.55,
  unlocked: false,
  track: null,

  hydrate: () => {
    const saved = loadJson<{ enabled: boolean; volume: number }>("music", {
      enabled: true,
      volume: getMusicVolume(),
    });
    set({ enabled: saved.enabled, volume: saved.volume });
    setMusicEnabled(saved.enabled);
    setMusicVolume(saved.volume);
    onAudioUnlock(() => set({ unlocked: isUnlocked() }));
  },

  toggle: () => {
    const enabled = !get().enabled;
    set({ enabled });
    setMusicEnabled(enabled);
    saveJson("music", { enabled, volume: get().volume });
    if (enabled) {
      unlockAudio();
      set({ unlocked: isUnlocked() });
      const meta = pendingRef.current;
      if (meta) set({ track: playFor(meta) });
    } else {
      stopMusic();
      set({ track: null });
    }
  },

  setVolume: (v) => {
    set({ volume: v });
    setMusicVolume(v);
    saveJson("music", { enabled: get().enabled, volume: v });
  },

  cue: (meta) => {
    pendingRef.current = meta;
    if (!get().enabled) return;
    set({ track: playFor(meta), unlocked: isUnlocked() });
  },
}));

/** The card the feed is sitting on, so unmuting can start it straight away. */
const pendingRef: { current: TrackSeedMeta | null } = { current: null };
