"use client";

import { create } from "zustand";
import { currentAccountId } from "@/lib/accounts";
import {
  conversation,
  isTyping,
  markRead,
  openWith,
  send as sendMessage,
  subscribeMessages,
  threadsFor,
  unreadCount,
  type Conversation,
  type GameAttachment,
  type ThreadSummary,
} from "@/lib/social";

interface MessagesState {
  threads: ThreadSummary[];
  unread: number;
  /** account id of the open thread, or null for the inbox list */
  peerId: string | null;
  thread: Conversation | null;
  typing: boolean;
  hydrate: () => void;
  refresh: () => void;
  open: (peerId: string) => void;
  back: () => void;
  send: (payload: { text?: string; game?: GameAttachment }) => void;
}

let subscribed = false;

export const useMessagesStore = create<MessagesState>((set, get) => ({
  threads: [],
  unread: 0,
  peerId: null,
  thread: null,
  typing: false,

  hydrate: () => {
    if (!subscribed) {
      subscribed = true;
      subscribeMessages(() => get().refresh());
    }
    get().refresh();
  },

  refresh: () => {
    const me = currentAccountId();
    const { peerId } = get();
    const conv = peerId ? conversation([me, peerId].sort().join("~")) : null;
    if (conv) markRead(conv.id, me);
    set({
      threads: threadsFor(me),
      unread: unreadCount(me),
      thread: conv,
      typing: conv ? isTyping(conv.id) : false,
    });
  },

  open: (peerId) => {
    const me = currentAccountId();
    if (peerId === me) return;
    const conv = openWith(me, peerId);
    markRead(conv.id, me);
    set({ peerId });
    get().refresh();
  },

  back: () => {
    set({ peerId: null, thread: null });
    get().refresh();
  },

  send: (payload) => {
    const { peerId } = get();
    if (!peerId) return;
    sendMessage(currentAccountId(), peerId, payload);
    get().refresh();
  },
}));
