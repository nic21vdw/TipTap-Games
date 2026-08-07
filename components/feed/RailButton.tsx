"use client";

export function RailButton({
  label,
  onClick,
  tint,
  children,
}: {
  label: string;
  onClick: () => void;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="pressable flex min-h-11 min-w-11 flex-col items-center justify-center gap-1"
      aria-label={label}
      style={{ color: tint ?? "inherit" }}
    >
      {children}
      <span
        className="text-[10px] font-semibold"
        style={{ color: "#fff" }}
      >
        {label}
      </span>
    </button>
  );
}
