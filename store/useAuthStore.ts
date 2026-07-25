"use client";

import { create } from "zustand";
import * as cloud from "@/lib/cloud";
import { browserClient } from "@/lib/supabase/client";
import { cloudConfigured } from "@/lib/supabase/config";
import { getHandle, setHandle } from "@/lib/storage";

export interface Player {
  id: string;
  handle: string;
  avatarUrl: string | null;
  email: string | null;
}

interface AuthState {
  /** "off" means this build has no Supabase project — guest play only. */
  status: "off" | "loading" | "guest" | "signedIn";
  player: Player | null;
  sync: cloud.SyncState;
  /** Set at a win moment when a guest has something worth saving. */
  prompt: boolean;
  init: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  askToSave: () => void;
  dismissPrompt: () => void;
}

const PROMPT_DISMISSED = "ttg:signinDismissed";

let started = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: cloudConfigured ? "loading" : "off",
  player: null,
  sync: cloud.syncState(),
  prompt: false,

  init: () => {
    if (started) return;
    started = true;

    const supabase = browserClient();
    if (!supabase) {
      set({ status: "off" });
      return;
    }

    cloud.onSyncState((sync) => set({ sync }));

    // Fires once on load with the restored session, and again on every
    // sign-in, sign-out and token refresh.
    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        cloud.detach();
        set({ status: "guest", player: null });
        return;
      }

      const meta = user.user_metadata ?? {};
      const player: Player = {
        id: user.id,
        handle: getHandle(),
        avatarUrl: (meta.avatar_url as string) ?? null,
        email: user.email ?? null,
      };
      set({ status: "signedIn", player, prompt: false });

      // The profile row is created by a trigger on the Supabase side, so it
      // may land a beat after the session does.
      void supabase
        .from("profiles")
        .select("handle, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setHandle(data.handle);
          set({
            player: {
              ...player,
              handle: data.handle,
              avatarUrl: data.avatar_url ?? player.avatarUrl,
            },
          });
        });

      void cloud.attach(user.id);
    });
  },

  signInWithGoogle: async () => {
    const supabase = browserClient();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          window.location.pathname
        )}`,
      },
    });
  },

  signOut: async () => {
    const supabase = browserClient();
    if (!supabase) return;
    cloud.flushSync();
    await supabase.auth.signOut();
    cloud.detach();
    set({ status: "guest", player: null });
  },

  askToSave: () => {
    if (get().status !== "guest") return;
    try {
      if (localStorage.getItem(PROMPT_DISMISSED)) return;
    } catch {
      // private mode — asking once per session is fine
    }
    set({ prompt: true });
  },

  dismissPrompt: () => {
    try {
      localStorage.setItem(PROMPT_DISMISSED, "1");
    } catch {
      // nothing to remember it with; the prompt just returns next run
    }
    set({ prompt: false });
  },
}));
