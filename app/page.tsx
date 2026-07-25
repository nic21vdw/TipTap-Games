"use client";

import { Feed } from "@/components/feed/Feed";
import { AccountSheet } from "@/components/sheets/AccountSheet";
import { AlgorithmSheet } from "@/components/sheets/AlgorithmSheet";
import { CreateSheet } from "@/components/sheets/CreateSheet";
import { LeaderboardSheet } from "@/components/sheets/LeaderboardSheet";
import { MessagesSheet } from "@/components/sheets/MessagesSheet";
import { ProfileSheet } from "@/components/sheets/ProfileSheet";
import { ThemeSheet } from "@/components/sheets/ThemeSheet";
import { Avatar } from "@/components/ui/Avatar";
import { MessageIcon, PlusIcon, SlidersIcon } from "@/components/ui/icons";
import { useAccountStore } from "@/store/useAccountStore";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useMessagesStore } from "@/store/useMessagesStore";
import { useUiStore } from "@/store/useUiStore";

export default function Home() {
  return (
    <main className="relative">
      <Feed />
      <AlgorithmPill />
      <TopRight />
      <AlgorithmSheet />
      <LeaderboardSheet />
      <ThemeSheet />
      <CreateSheet />
      <AccountSheet />
      <ProfileSheet />
      <MessagesSheet />
    </main>
  );
}

/** Create, inbox, you — the three things that aren't about the current card. */
function TopRight() {
  const openSheet = useUiStore((s) => s.openSheet);
  const me = useAccountStore((s) => s.me);
  const unread = useMessagesStore((s) => s.unread);

  return (
    <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex items-center gap-2">
      <ChromeButton label="Make a game" onClick={() => openSheet("create")}>
        <PlusIcon size={20} />
      </ChromeButton>
      <ChromeButton label="Messages" onClick={() => openSheet("messages")}>
        <MessageIcon size={19} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 min-w-[18px] px-1 text-center text-[10px] font-extrabold leading-[18px]"
            style={{ background: "var(--accent)", color: "#fff", borderRadius: "999px" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </ChromeButton>
      <button
        onClick={() => openSheet("account")}
        aria-label="Your account"
        className="pressable flex h-10 w-10 items-center justify-center"
      >
        <Avatar account={me} size={34} />
      </button>
    </div>
  );
}

function ChromeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="pressable theme-smooth relative flex h-10 w-10 items-center justify-center"
      style={{
        background: "rgba(12,18,28,.55)",
        color: "#fff",
        borderRadius: "var(--radius)",
      }}
    >
      {children}
    </button>
  );
}

function AlgorithmPill() {
  const memories = useAlgorithmStore((s) => s.memories);
  const openSheet = useUiStore((s) => s.openSheet);
  const active = memories.filter((m) => m.enabled).length;
  const name =
    active === 0 ? "Tune your feed" : `${active} rule${active === 1 ? "" : "s"}`;
  return (
    <button
      onClick={() => openSheet("algo")}
      className="pressable theme-smooth fixed left-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 flex h-10 items-center gap-1.5 px-3 text-xs font-bold"
      style={{
        background: "rgba(12,18,28,.55)",
        color: "#fff",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-body)",
      }}
    >
      <SlidersIcon size={16} /> {name}
    </button>
  );
}
