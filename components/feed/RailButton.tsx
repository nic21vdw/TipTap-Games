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
      className="pressable flex flex-col items-center gap-1"
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
