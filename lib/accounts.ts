// Accounts. The feed stays guest-first — you are always signed in as
// *someone* from the first frame — but that someone can be claimed with a
// handle and a password, and a device can hold several accounts side by side.
//
// Everything lives in localStorage, exactly like scores and prefs do, so the
// app is a complete social product with zero backend. `supabase/schema.sql`
// models the same tables; lib/storage.ts and this file are the swap point.
//
// Passwords are hashed (SHA-256 + per-account salt) but they never leave the
// device and nothing here is a security boundary — anyone with the phone can
// read localStorage. The sign-up copy says so, and the app never asks for an
// email or anything else worth stealing.

export type AccountKind = "guest" | "player" | "bot";

export interface Account {
  id: string;
  handle: string; // unique, lowercase, no @
  name: string; // display name
  bio: string;
  hue: number; // 0..359, seeds the generated avatar
  kind: AccountKind;
  createdAt: number;
  xp: number;
  following: string[];
  salt?: string;
  passwordHash?: string;
}

const KEY_ACCOUNTS = "ttg:accounts";
const KEY_SESSION = "ttg:session";

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
      // private mode / quota — the session lives in memory only
    }
  },
  remove(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

// ---- change notification (stores subscribe, no polling) ----

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeAccounts(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let emitting = false;

// Listeners re-read live state, so a write that happens *during* a
// notification is already visible to it — re-entering would only recurse.
function emit() {
  if (emitting) return;
  emitting = true;
  try {
    listeners.forEach((fn) => fn());
  } finally {
    emitting = false;
  }
}

// ---- the local account table ----

let cache: Account[] | null = null;

function read(): Account[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  let list: Account[] = [];
  try {
    list = JSON.parse(safe.get(KEY_ACCOUNTS) ?? "[]");
  } catch {
    list = [];
  }
  if (!list.some((a) => a.kind === "bot")) list = [...list, ...BOTS];
  cache = list;
  return list;
}

function write(list: Account[]) {
  cache = list;
  safe.set(KEY_ACCOUNTS, JSON.stringify(list));
  emit();
}

export function listAccounts(): Account[] {
  return read();
}

/** Everyone you could plausibly interact with: humans first, then bots. */
export function people(exceptId?: string): Account[] {
  return read()
    .filter((a) => a.id !== exceptId && a.kind !== "guest")
    .sort((a, b) => (a.kind === b.kind ? b.xp - a.xp : a.kind === "player" ? -1 : 1));
}

export function getAccount(id: string | null | undefined): Account | null {
  if (!id) return null;
  return read().find((a) => a.id === id) ?? null;
}

export function byHandle(handle: string): Account | null {
  const h = handle.trim().toLowerCase().replace(/^@/, "");
  return read().find((a) => a.handle === h) ?? null;
}

function put(account: Account) {
  const list = read().filter((a) => a.id !== account.id);
  write([...list, account]);
}

// ---- session ----

let currentId: string | null = null;

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function makeGuest(): Account {
  const n = 1000 + Math.floor(Math.random() * 9000);
  return {
    id: newId("acct"),
    handle: `guest-${n}`,
    name: `Guest ${n}`,
    bio: "",
    hue: Math.floor(Math.random() * 360),
    kind: "guest",
    createdAt: Date.now(),
    xp: 0,
    following: [],
  };
}

/**
 * Guarantees a signed-in identity. Called once on boot and by every read that
 * happens before the store hydrates, so nothing ever has to handle "no user".
 */
export function ensureSession(): Account {
  if (typeof window === "undefined") return SSR_GUEST;
  if (currentId) {
    const found = getAccount(currentId);
    if (found) return found;
  }
  const saved = safe.get(KEY_SESSION);
  const savedAccount = getAccount(saved);
  if (savedAccount) {
    currentId = savedAccount.id;
    return savedAccount;
  }
  // Migration: pre-accounts builds stored a bare handle. Keep it.
  const legacy = safe.get("ttg:handle");
  const guest = makeGuest();
  if (legacy) {
    guest.handle = legacy;
    guest.name = legacy;
  }
  // session first: `put` notifies listeners, and a listener that asks who is
  // signed in must not land back in here and mint a second guest
  currentId = guest.id;
  safe.set(KEY_SESSION, guest.id);
  put(guest);
  return guest;
}

// A stable stand-in during SSR so components can render without branching.
const SSR_GUEST: Account = {
  id: "ssr",
  handle: "guest",
  name: "Guest",
  bio: "",
  hue: 210,
  kind: "guest",
  createdAt: 0,
  xp: 0,
  following: [],
};

export function currentAccount(): Account {
  return ensureSession();
}

export function currentAccountId(): string {
  return ensureSession().id;
}

function setSession(id: string) {
  currentId = id;
  safe.set(KEY_SESSION, id);
  emit();
}

// ---- scoped storage keys (every account gets its own scores + prefs) ----

export function scopedKey(name: string): string {
  return `ttg:u:${currentAccountId()}:${name}`;
}

export function scopedKeyFor(accountId: string, name: string): string {
  return `ttg:u:${accountId}:${name}`;
}

// ---- passwords ----

function randomSalt(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 where available; a weaker fallback keeps insecure contexts working. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `ttg:${salt}:${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input)
      );
      return Array.from(new Uint8Array(buf), (b) =>
        b.toString(16).padStart(2, "0")
      ).join("");
    } catch {
      // http:// on a LAN IP has no subtle crypto — fall through
    }
  }
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv${(h >>> 0).toString(16)}`;
}

// ---- levels ----

/** 40 XP for level 2, then a widening curve — a level is ~a session. */
export function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
}

export function xpForLevel(level: number): number {
  return 40 * (level - 1) ** 2;
}

export function levelProgress(xp: number): { level: number; pct: number; next: number } {
  const level = levelFor(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    next,
    pct: Math.max(0, Math.min(1, (xp - floor) / Math.max(1, next - floor))),
  };
}

export function addXp(amount: number) {
  if (amount <= 0) return;
  const me = ensureSession();
  put({ ...me, xp: me.xp + Math.round(amount) });
}

// ---- validation ----

export function handleError(handle: string): string | null {
  const h = handle.trim().toLowerCase();
  if (h.length < 3) return "at least 3 characters";
  if (h.length > 16) return "16 characters max";
  if (!/^[a-z0-9_.]+$/.test(h)) return "letters, numbers, _ and . only";
  if (h.startsWith("guest-")) return "guest- is reserved";
  if (byHandle(h)) return "that handle is taken";
  return null;
}

// ---- sign up / in / out / switch ----

export interface AuthResult {
  ok: boolean;
  error?: string;
  account?: Account;
}

/**
 * Claims the current guest session by default: the scores, likes, memories and
 * games you racked up before signing up move over with you, which is the whole
 * reason the app lets you play first and log in at a win moment.
 */
export async function signUp(opts: {
  handle: string;
  name?: string;
  password: string;
  bio?: string;
  keepProgress?: boolean;
}): Promise<AuthResult> {
  const handle = opts.handle.trim().toLowerCase().replace(/^@/, "");
  const bad = handleError(handle);
  if (bad) return { ok: false, error: bad };
  if (opts.password.length < 4) return { ok: false, error: "password needs 4+ characters" };

  const salt = randomSalt();
  const account: Account = {
    id: newId("acct"),
    handle,
    name: (opts.name?.trim() || handle).slice(0, 24),
    bio: (opts.bio ?? "").slice(0, 140),
    hue: Math.floor(Math.random() * 360),
    kind: "player",
    createdAt: Date.now(),
    xp: 0,
    following: [],
    salt,
    passwordHash: await hashPassword(opts.password, salt),
  };

  const previous = ensureSession();
  put(account);
  setSession(account.id);
  if (opts.keepProgress !== false && previous.kind === "guest") {
    copyScopedData(previous.id, account.id);
    account.xp = previous.xp;
    put(account);
    reassignGuestContent(previous.id, account);
    // the guest shell has nothing left in it — drop it from the switcher
    write(read().filter((a) => a.id !== previous.id));
  }
  return { ok: true, account };
}

export async function signIn(handle: string, password: string): Promise<AuthResult> {
  const account = byHandle(handle);
  if (!account || account.kind === "bot")
    return { ok: false, error: "no account with that handle on this device" };
  if (!account.passwordHash || !account.salt)
    return { ok: false, error: "that account has no password" };
  const hash = await hashPassword(password, account.salt);
  if (hash !== account.passwordHash) return { ok: false, error: "wrong password" };
  setSession(account.id);
  return { ok: true, account };
}

/** Drops back to a fresh guest session — the signed-in data stays put. */
export function signOut(): Account {
  const guest = makeGuest();
  put(guest);
  setSession(guest.id);
  return guest;
}

export function updateProfile(patch: Partial<Pick<Account, "name" | "bio" | "hue">>) {
  const me = ensureSession();
  put({
    ...me,
    name: patch.name !== undefined ? patch.name.slice(0, 24) : me.name,
    bio: patch.bio !== undefined ? patch.bio.slice(0, 140) : me.bio,
    hue: patch.hue !== undefined ? ((patch.hue % 360) + 360) % 360 : me.hue,
  });
}

export function isFollowing(targetId: string): boolean {
  return ensureSession().following.includes(targetId);
}

export function toggleFollow(targetId: string): boolean {
  const me = ensureSession();
  if (me.id === targetId) return false;
  const following = me.following.includes(targetId)
    ? me.following.filter((f) => f !== targetId)
    : [...me.following, targetId];
  put({ ...me, following });
  return following.includes(targetId);
}

export function followerCount(id: string): number {
  return read().filter((a) => a.following.includes(id)).length;
}

// ---- guest → account migration ----

/** Moves every `ttg:u:<from>:*` key onto the new account id. */
function copyScopedData(from: string, to: string) {
  if (typeof window === "undefined") return;
  const prefix = `ttg:u:${from}:`;
  try {
    const moves: [string, string][] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) moves.push([k, `ttg:u:${to}:${k.slice(prefix.length)}`]);
    }
    for (const [oldKey, newKey] of moves) {
      const v = localStorage.getItem(oldKey);
      if (v !== null) localStorage.setItem(newKey, v);
      localStorage.removeItem(oldKey);
    }
  } catch {
    // nothing to migrate in private mode
  }
}

/** Re-credits games the guest published, and rewrites their DM history. */
function reassignGuestContent(guestId: string, account: Account) {
  // imported lazily: library/social both read accounts, so a static import
  // here would be a cycle
  import("@/lib/library").then((m) => m.reassignAuthor(guestId, account));
  import("@/lib/social").then((m) => m.reassignMember(guestId, account.id));
}

// ---- the bots ----

// Clearly-labelled non-human accounts. They hold the seeded leaderboard
// handles so a leaderboard row and a profile are the same person, and they
// reply to DMs so an empty inbox is never the first thing you see. Every
// surface that shows one badges it "bot" — nothing here pretends to be human.
const BOT_SEEDS: [string, string, string][] = [
  ["pixelpete", "Pixel Pete", "Retro only. If it has more than 4 colours I'm out."],
  ["swipequeen", "Swipe Queen", "Top 10 on nine boards. Ask me about Pop Chain."],
  ["thumbwizard", "Thumb Wizard", "One thumb, no mercy. Frame-perfect or nothing."],
  ["nervebank", "Nerve Bank", "I cash out at 1.4x every time and I sleep fine."],
  ["combo_carl", "Combo Carl", "Chasing a 40 chain. Do not talk to me mid-run."],
  ["latenightlena", "Late Night Lena", "2am feed sessions. Calm games only."],
  ["frame_perfect", "Frame Perfect", "Reflex Gate is a rhythm game, fight me."],
  ["onemorego", "One More Go", "Said that 400 runs ago."],
];

const BOTS: Account[] = BOT_SEEDS.map(([handle, name, bio], i) => ({
  id: `bot_${handle}`,
  handle,
  name,
  bio,
  hue: (i * 41 + 15) % 360,
  kind: "bot" as const,
  createdAt: 0,
  xp: 900 - i * 90,
  following: [],
}));

export function isBot(id: string): boolean {
  return id.startsWith("bot_");
}
