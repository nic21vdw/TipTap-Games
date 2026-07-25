"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import {
  GamepadIcon,
  LogOutIcon,
  MessageIcon,
  UserIcon,
} from "@/components/ui/icons";
import { levelProgress, people, type Account } from "@/lib/accounts";
import { gamesByAuthor } from "@/lib/library";
import { statsFor } from "@/lib/storage";
import { useAccountStore } from "@/store/useAccountStore";
import { useMessagesStore } from "@/store/useMessagesStore";
import { useUiStore } from "@/store/useUiStore";

export function AccountSheet() {
  const open = useUiStore((s) => s.sheet === "account");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const me = useAccountStore((s) => s.me);

  return (
    <Sheet open={open} onClose={closeSheet} title={me?.kind === "guest" ? "Your account" : "You"}>
      {!me ? null : me.kind === "guest" ? (
        <AuthPanel />
      ) : (
        <ProfilePanel me={me} />
      )}
    </Sheet>
  );
}

// ---- signed out (guest) ----

function AuthPanel() {
  const me = useAccountStore((s) => s.me);
  const accounts = useAccountStore((s) => s.accounts);
  const signUp = useAccountStore((s) => s.signUp);
  const signIn = useAccountStore((s) => s.signIn);
  const [mode, setMode] = useState<"up" | "in">("up");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = accounts.filter((a) => a.kind === "player");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "up"
          ? await signUp({ handle, name, password, keepProgress: keep })
          : await signIn(handle, password);
      if (!res.ok) setError(res.error ?? "that didn't work");
      else {
        setHandle("");
        setName("");
        setPassword("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "that didn't work");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Avatar account={me} size={44} />
        <div>
          <div className="text-sm font-extrabold">@{me?.handle}</div>
          <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
            Playing as a guest — everything still saves
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-1 p-1" style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}>
        <TabButton active={mode === "up"} onClick={() => setMode("up")}>
          Create account
        </TabButton>
        <TabButton active={mode === "in"} onClick={() => setMode("in")}>
          Sign in
        </TabButton>
      </div>

      <Input value={handle} onChange={setHandle} placeholder="handle" prefix="@" autoCap={false} />
      {mode === "up" && (
        <Input value={name} onChange={setName} placeholder="display name (optional)" />
      )}
      <Input
        value={password}
        onChange={setPassword}
        placeholder="password"
        type="password"
        onEnter={submit}
      />

      {mode === "up" && (
        <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--ink-dim)" }}>
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => setKeep(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Bring my scores, likes and games over from this guest session
        </label>
      )}

      <button
        onClick={submit}
        disabled={busy || !handle.trim() || !password}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
      >
        <UserIcon size={18} />
        {busy ? "..." : mode === "up" ? "Create account" : "Sign in"}
      </button>

      {error && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--ink-dim)" }}>
        Accounts live on this device only — no email, no server, nothing to
        leak. The password is hashed and stored locally, so please don&apos;t
        reuse one that matters. Several accounts can share a phone: each keeps
        its own scores, feed and inbox.
      </p>

      {existing.length > 0 && (
        <div className="mt-5">
          <SectionLabel>Accounts on this device</SectionLabel>
          <div className="flex flex-col gap-2">
            {existing.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setMode("in");
                  setHandle(a.handle);
                }}
                className="pressable flex items-center gap-3 px-3 py-2.5 text-left"
                style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
              >
                <Avatar account={a} size={34} />
                <span className="text-sm font-bold">@{a.handle}</span>
                <span className="ml-auto text-xs font-bold" style={{ color: "var(--accent)" }}>
                  Sign in
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- signed in ----

function ProfilePanel({ me }: { me: Account }) {
  const signOut = useAccountStore((s) => s.signOut);
  const updateProfile = useAccountStore((s) => s.updateProfile);
  const openSheet = useUiStore((s) => s.openSheet);
  const viewProfile = useUiStore((s) => s.viewProfile);
  const openThread = useMessagesStore((s) => s.open);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio);
  const [stats, setStats] = useState(() => statsFor(me.id));
  const [mine, setMine] = useState(() => gamesByAuthor(me.id));

  useEffect(() => {
    setStats(statsFor(me.id));
    setMine(gamesByAuthor(me.id));
    setName(me.name);
    setBio(me.bio);
  }, [me]);

  const { level, pct, next } = levelProgress(me.xp);
  const others = people(me.id);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar account={me} size={56} ring />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-extrabold" style={{ fontFamily: "var(--font-display)" }}>
            {me.name}
          </div>
          <div className="text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
            @{me.handle}
          </div>
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="pressable px-3 py-1.5 text-xs font-bold"
          style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {/* level bar — every run feeds it */}
      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between text-xs font-bold">
          <span>Level {level}</span>
          <span style={{ color: "var(--ink-dim)" }}>
            {me.xp} / {next} XP
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden" style={{ background: "var(--bg)", borderRadius: "999px" }}>
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${Math.round(pct * 100)}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <Input value={name} onChange={setName} placeholder="display name" />
          <Input value={bio} onChange={setBio} placeholder="bio" />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: "var(--ink-dim)" }}>
              Avatar
            </span>
            <input
              type="range"
              min={0}
              max={359}
              value={me.hue}
              onChange={(e) => updateProfile({ hue: Number(e.target.value) })}
              className="flex-1"
              style={{ accentColor: "var(--accent)" }}
            />
          </div>
          <button
            onClick={() => {
              updateProfile({ name, bio });
              setEditing(false);
            }}
            className="pressable mt-2 w-full py-2.5 text-sm font-bold"
            style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
          >
            Save profile
          </button>
        </div>
      ) : (
        me.bio && (
          <p className="mt-2 text-sm leading-snug" style={{ color: "var(--ink-dim)" }}>
            {me.bio}
          </p>
        )
      )}

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat label="runs" value={stats.runs} />
        <Stat label="games" value={stats.gamesPlayed} />
        <Stat label="mins" value={stats.minutes} />
        <Stat label="made" value={mine.length} />
      </div>

      <div className="mt-4 flex gap-2">
        <ActionButton onClick={() => openSheet("create")} icon={<GamepadIcon size={16} />}>
          Make a game
        </ActionButton>
        <ActionButton onClick={() => openSheet("messages")} icon={<MessageIcon size={16} />}>
          Messages
        </ActionButton>
      </div>

      <div className="mt-5">
        <SectionLabel>People</SectionLabel>
        <div className="flex flex-col gap-2">
          {others.slice(0, 8).map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-3 py-2"
              style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
            >
              <button onClick={() => viewProfile(a.id)} className="pressable flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar account={a} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{a.name}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--ink-dim)" }}>
                    @{a.handle}
                    {a.kind === "bot" ? " · bot" : ""}
                  </span>
                </span>
              </button>
              <button
                onClick={() => {
                  openThread(a.id);
                  openSheet("messages");
                }}
                aria-label={`Message @${a.handle}`}
                className="pressable px-2.5 py-1.5 text-xs font-bold"
                style={{ background: "var(--surface)", borderRadius: "var(--radius)", color: "var(--accent)" }}
              >
                Message
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={signOut}
        className="pressable mt-5 flex w-full items-center justify-center gap-2 py-2.5 text-sm font-bold"
        style={{ background: "var(--bg)", color: "var(--ink-dim)", borderRadius: "var(--radius)" }}
      >
        <LogOutIcon size={16} /> Sign out
      </button>
      <p className="mt-2 text-[11px]" style={{ color: "var(--ink-dim)" }}>
        Signing out drops you back to a fresh guest. @{me.handle} stays on this
        device with all its scores — sign back in any time.
      </p>
    </div>
  );
}

// ---- small shared bits ----

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
  autoCap = true,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  prefix?: string;
  autoCap?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div
      className="mt-2 flex items-center gap-1 px-3"
      style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
    >
      {prefix && (
        <span className="text-sm font-bold" style={{ color: "var(--ink-dim)" }}>
          {prefix}
        </span>
      )}
      <input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        placeholder={placeholder}
        autoCapitalize={autoCap ? "sentences" : "none"}
        autoCorrect="off"
        spellCheck={false}
        className="w-full bg-transparent py-2.5 text-sm outline-none"
        style={{ color: "var(--ink)" }}
      />
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2 text-xs font-semibold uppercase tracking-wider"
      style={{ color: "var(--ink-dim)" }}
    >
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 text-xs font-bold transition-colors"
      style={{
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-dim)",
        borderRadius: "calc(var(--radius) * 0.7)",
      }}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="px-2 py-2 text-center"
      style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
    >
      <div className="text-base font-extrabold tabular-nums">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-dim)" }}>
        {label}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="pressable flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
      style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
    >
      {icon}
      {children}
    </button>
  );
}
