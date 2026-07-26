"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { CloudIcon, GoogleMark, UserIcon } from "@/components/ui/icons";
import { getHandle } from "@/lib/storage";
import { useAuthStore } from "@/store/useAuthStore";
import { useUiStore } from "@/store/useUiStore";

export function AccountSheet() {
  const open = useUiStore((s) => s.sheet === "account");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const status = useAuthStore((s) => s.status);
  const player = useAuthStore((s) => s.player);
  const sync = useAuthStore((s) => s.sync);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  // localStorage is off-limits during render — read the guest handle after.
  const [guestHandle, setGuestHandle] = useState("guest");
  useEffect(() => {
    if (open) setGuestHandle(getHandle());
  }, [open]);

  const title = status === "signedIn" ? "Your account" : "Save your progress";

  return (
    <Sheet open={open} onClose={closeSheet} title={title}>
      {status === "signedIn" && player ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar url={player.avatarUrl} />
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold" style={{ fontFamily: "var(--font-display)" }}>
                @{player.handle}
              </div>
              {player.email && (
                <div className="truncate text-xs" style={{ color: "var(--ink-dim)" }}>
                  {player.email}
                </div>
              )}
            </div>
          </div>

          <SyncRow status={sync.status} lastSyncedAt={sync.lastSyncedAt} />

          <button
            onClick={async () => {
              setBusy(true);
              await signOut();
              setBusy(false);
              closeSheet();
            }}
            disabled={busy}
            className="pressable w-full py-3 text-sm font-bold"
            style={{
              background: "var(--bg)",
              color: "var(--ink-dim)",
              borderRadius: "var(--radius)",
            }}
          >
            Sign out
          </button>
          <p className="text-center text-xs" style={{ color: "var(--ink-dim)" }}>
            Signing out leaves this device&apos;s saves alone — they just stop
            syncing.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span style={{ color: "var(--accent)" }}>
              <UserIcon size={26} />
            </span>
            <p className="text-sm leading-snug" style={{ color: "var(--ink)" }}>
              You&apos;re playing as{" "}
              <span className="font-bold">@{guestHandle}</span>. Everything is
              saved on this device only — clear your browser and it&apos;s gone.
              Sign in and your bests, likes and the algorithm you tuned follow
              you to any phone.
            </p>
          </div>

          {status === "off" ? (
            <p
              className="px-3 py-3 text-center text-xs font-semibold"
              style={{
                background: "var(--bg)",
                color: "var(--ink-dim)",
                borderRadius: "var(--radius)",
              }}
            >
              Accounts aren&apos;t switched on in this build. Set
              NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to
              enable Google sign-in.
            </p>
          ) : (
            <button
              onClick={async () => {
                setBusy(true);
                await signInWithGoogle();
                // The page navigates to Google, so `busy` rarely resets here.
                setBusy(false);
              }}
              disabled={busy || status === "loading"}
              className="pressable flex w-full items-center justify-center gap-2.5 py-3.5 text-sm font-extrabold"
              style={{
                background: "#fff",
                color: "#1f1f1f",
                borderRadius: "var(--radius)",
                opacity: status === "loading" ? 0.6 : 1,
              }}
            >
              <GoogleMark size={18} />
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          )}

          <p className="text-center text-xs" style={{ color: "var(--ink-dim)" }}>
            Nothing is lost when you sign in — the bests you already set are
            carried onto the account.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function Avatar({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span
        className="flex h-11 w-11 items-center justify-center"
        style={{
          background: "var(--bg)",
          color: "var(--ink-dim)",
          borderRadius: 999,
        }}
      >
        <UserIcon size={22} />
      </span>
    );
  }
  return (
    // Google's CDN, and only ever one of these on screen — next/image would
    // add a remote-pattern config for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={44}
      height={44}
      className="h-11 w-11 object-cover"
      style={{ borderRadius: 999 }}
    />
  );
}

function SyncRow({
  status,
  lastSyncedAt,
}: {
  status: "off" | "idle" | "syncing" | "error";
  lastSyncedAt: number | null;
}) {
  const label =
    status === "syncing"
      ? "Syncing…"
      : status === "error"
        ? "Sync failed — will retry"
        : lastSyncedAt
          ? `Synced ${relative(lastSyncedAt)}`
          : "Ready to sync";

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold"
      style={{
        background: "var(--bg)",
        color: status === "error" ? "var(--danger)" : "var(--ink-dim)",
        borderRadius: "var(--radius)",
      }}
    >
      <span
        className={status === "syncing" ? "anim-breathe" : undefined}
        style={{ color: status === "error" ? "var(--danger)" : "var(--success)" }}
      >
        <CloudIcon size={18} />
      </span>
      {label}
    </div>
  );
}

function relative(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
