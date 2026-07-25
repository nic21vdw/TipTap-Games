"use client";

import { create } from "zustand";
import {
  currentAccount,
  ensureSession,
  listAccounts,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  subscribeAccounts,
  toggleFollow as authToggleFollow,
  updateProfile as authUpdateProfile,
  type Account,
  type AuthResult,
} from "@/lib/accounts";
import { resetMemoryCache } from "@/lib/memories";
import { seedInbox } from "@/lib/social";

interface AccountState {
  me: Account | null;
  accounts: Account[];
  hydrate: () => void;
  refresh: () => void;
  signUp: (opts: {
    handle: string;
    name?: string;
    password: string;
    bio?: string;
    keepProgress?: boolean;
  }) => Promise<AuthResult>;
  signIn: (handle: string, password: string) => Promise<AuthResult>;
  signOut: () => void;
  updateProfile: (patch: Partial<Pick<Account, "name" | "bio" | "hue">>) => void;
  toggleFollow: (id: string) => void;
}

/**
 * Switching identity swaps every per-account surface at once: the algorithm's
 * memories, the queue built from them, and the inbox. Nothing is left over
 * from the account you just left.
 */
function applyIdentityChange() {
  resetMemoryCache();
  import("@/store/useAlgorithmStore").then(({ useAlgorithmStore }) =>
    useAlgorithmStore.getState().hydrate()
  );
  import("@/store/useFeedStore").then(({ useFeedStore }) =>
    useFeedStore.getState().reset()
  );
  import("@/store/useMessagesStore").then(({ useMessagesStore }) =>
    useMessagesStore.getState().refresh()
  );
}

export const useAccountStore = create<AccountState>((set, get) => ({
  me: null,
  accounts: [],

  hydrate: () => {
    ensureSession();
    get().refresh();
    subscribeAccounts(() => get().refresh());
  },

  refresh: () => set({ me: currentAccount(), accounts: listAccounts() }),

  signUp: async (opts) => {
    const res = await authSignUp(opts);
    if (res.ok && res.account) {
      seedInbox(res.account.id, res.account.handle);
      get().refresh();
      applyIdentityChange();
    }
    return res;
  },

  signIn: async (handle, password) => {
    const res = await authSignIn(handle, password);
    if (res.ok) {
      get().refresh();
      applyIdentityChange();
    }
    return res;
  },

  signOut: () => {
    authSignOut();
    get().refresh();
    applyIdentityChange();
  },

  updateProfile: (patch) => {
    authUpdateProfile(patch);
    get().refresh();
  },

  toggleFollow: (id) => {
    authToggleFollow(id);
    get().refresh();
  },
}));
