// Direct messages. Threads are device-global (both sides of a conversation
// live on this phone), so two accounts on the same device really do message
// each other: send from one, switch accounts, and it's sitting in the inbox.
//
// Bot accounts reply on their own. They are badged as bots on every surface
// that renders them — the inbox, the thread, the profile — because a fake
// human would be a lie, and a labelled one is just the arcade talking back.

import { getAccount, isBot, type Account } from "@/lib/accounts";

export interface GameAttachment {
  slug: string;
  title: string;
  accent: string;
  rule?: string;
}

export interface DirectMessage {
  id: string;
  from: string; // account id
  at: number;
  text: string;
  game?: GameAttachment;
}

export interface Conversation {
  id: string;
  members: [string, string];
  messages: DirectMessage[];
  /** last-read timestamp per member id */
  read: Record<string, number>;
}

export interface ThreadSummary {
  conversation: Conversation;
  peer: Account | null;
  last: DirectMessage | null;
  unread: number;
}

const KEY = "ttg:dms";

const safe = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // private mode — messages are in-session only
    }
  },
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeMessages(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let emitting = false;

// Re-entrancy guard: a listener that writes back (marking a thread read, say)
// is already covered by the notification in flight.
function emit() {
  if (emitting) return;
  emitting = true;
  try {
    listeners.forEach((fn) => fn());
  } finally {
    emitting = false;
  }
}

let cache: Conversation[] | null = null;

function read(): Conversation[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(safe.get(KEY) ?? "[]");
    cache = Array.isArray(list) ? list : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: Conversation[]) {
  cache = list;
  safe.set(KEY, JSON.stringify(list));
  emit();
}

function convId(a: string, b: string): string {
  return [a, b].sort().join("~");
}

function newMessageId(): string {
  return `m_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** The conversation between two accounts, created empty if it's new. */
export function openWith(meId: string, peerId: string): Conversation {
  const id = convId(meId, peerId);
  const existing = read().find((c) => c.id === id);
  if (existing) return existing;
  const conv: Conversation = {
    id,
    members: [meId, peerId],
    messages: [],
    read: { [meId]: Date.now() },
  };
  write([...read(), conv]);
  return conv;
}

export function conversation(id: string): Conversation | null {
  return read().find((c) => c.id === id) ?? null;
}

export function threadsFor(meId: string): ThreadSummary[] {
  return read()
    .filter((c) => c.members.includes(meId) && c.messages.length > 0)
    .map((c) => {
      const peerId = c.members.find((m) => m !== meId) ?? meId;
      const readAt = c.read[meId] ?? 0;
      return {
        conversation: c,
        peer: getAccount(peerId),
        last: c.messages[c.messages.length - 1] ?? null,
        unread: c.messages.filter((m) => m.from !== meId && m.at > readAt).length,
      };
    })
    .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
}

export function unreadCount(meId: string): number {
  return threadsFor(meId).reduce((n, t) => n + t.unread, 0);
}

export function markRead(convIdValue: string, meId: string) {
  const list = read();
  const conv = list.find((c) => c.id === convIdValue);
  if (!conv) return;
  const latest = conv.messages[conv.messages.length - 1]?.at ?? Date.now();
  if ((conv.read[meId] ?? 0) >= latest) return;
  write(
    list.map((c) =>
      c.id === convIdValue ? { ...c, read: { ...c.read, [meId]: latest } } : c
    )
  );
}

export function send(
  fromId: string,
  toId: string,
  payload: { text?: string; game?: GameAttachment }
): DirectMessage | null {
  const text = (payload.text ?? "").trim().slice(0, 500);
  if (!text && !payload.game) return null;
  openWith(fromId, toId);
  const id = convId(fromId, toId);
  const message: DirectMessage = {
    id: newMessageId(),
    from: fromId,
    at: Date.now(),
    text,
    game: payload.game,
  };
  append(id, message, fromId);
  if (isBot(toId)) scheduleBotReply(id, toId, fromId, message);
  return message;
}

function append(convIdValue: string, message: DirectMessage, readerId?: string) {
  const list = read();
  write(
    list.map((c) =>
      c.id === convIdValue
        ? {
            ...c,
            messages: [...c.messages, message].slice(-200),
            read: readerId ? { ...c.read, [readerId]: message.at } : c.read,
          }
        : c
    )
  );
}

export function reassignMember(fromId: string, toId: string) {
  const list = read();
  if (!list.some((c) => c.members.includes(fromId))) return;
  write(
    list.map((c) =>
      c.members.includes(fromId)
        ? {
            ...c,
            id: convId(
              c.members[0] === fromId ? toId : c.members[0],
              c.members[1] === fromId ? toId : c.members[1]
            ),
            members: c.members.map((m) => (m === fromId ? toId : m)) as [string, string],
            messages: c.messages.map((m) =>
              m.from === fromId ? { ...m, from: toId } : m
            ),
          }
        : c
    )
  );
}

// ---- bots ----

const typing = new Set<string>();

export function isTyping(convIdValue: string): boolean {
  return typing.has(convIdValue);
}

const GAME_REPLIES = [
  (t: string) => `just ran ${t} four times. the accent is filthy, I mean that nicely.`,
  (t: string) => `${t} is going straight in my feed. what's your best on it?`,
  (t: string) => `ok ${t} got me. died at the exact same spot twice.`,
  (t: string) => `tuned my sliders toward this after playing ${t}. good drop.`,
];

const TEXT_REPLIES = [
  "one more run and I'll answer properly, I'm mid-combo",
  "beat my score and I'll take you seriously",
  "the algorithm keeps feeding me casino cards, I did not ask for this",
  "make me a game and send it over, I'll play it right now",
  "swipe up twice from here, the next card is unfair",
  "I've been on this feed since 2am. no regrets, no sleep",
];

const SCORE_REPLIES = [
  "that score is suspicious. respect, but suspicious",
  "nice. I'm two off that, give me ten minutes",
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function botReplyText(incoming: DirectMessage): string {
  const h = hash(incoming.text + (incoming.game?.slug ?? ""));
  if (incoming.game) return GAME_REPLIES[h % GAME_REPLIES.length](incoming.game.title);
  if (/\d{2,}/.test(incoming.text)) return SCORE_REPLIES[h % SCORE_REPLIES.length];
  return TEXT_REPLIES[h % TEXT_REPLIES.length];
}

function scheduleBotReply(
  convIdValue: string,
  botId: string,
  toId: string,
  incoming: DirectMessage
) {
  if (typeof window === "undefined") return;
  typing.add(convIdValue);
  emit();
  window.setTimeout(() => {
    typing.delete(convIdValue);
    // the thread may have been wiped while the bot was "typing"
    if (!conversation(convIdValue)) {
      emit();
      return;
    }
    append(convIdValue, {
      id: newMessageId(),
      from: botId,
      at: Date.now(),
      text: botReplyText(incoming),
    });
  }, 1100 + (hash(incoming.id) % 900));
  void toId;
}

/**
 * A brand-new account opens its inbox to one message instead of a void.
 * The sender is a bot and is labelled as one everywhere it appears.
 */
export function seedInbox(accountId: string, handle: string) {
  const botId = "bot_swipequeen";
  const conv = openWith(accountId, botId);
  if (conv.messages.length > 0) return;
  append(conv.id, {
    id: newMessageId(),
    from: botId,
    at: Date.now(),
    text: `welcome @${handle}. build a game in the studio and send it to me — I'll play anything.`,
  });
}
