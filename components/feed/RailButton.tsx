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
      className="pressable flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1"
      aria-label={label}
      style={{ color: tint ?? "inherit", touchAction: "manipulation" }}
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
