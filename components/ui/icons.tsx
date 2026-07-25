// Instagram-style line icons: 24x24, stroke-based, currentColor.
// No emoji anywhere — this is a professional surface.

interface IconProps {
  size?: number;
  filled?: boolean;
}

function Svg({
  children,
  size = 24,
  filled = false,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HeartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20.5 4.7 13a5 5 0 0 1 0-7.1 4.9 4.9 0 0 1 7 0l.3.4.3-.4a4.9 4.9 0 0 1 7 0 5 5 0 0 1 0 7.1L12 20.5Z" />
    </Svg>
  );
}

export function TrophyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" />
      <path d="M12 13v3M8.5 20h7M10 16h4v4h-4z" />
    </Svg>
  );
}

export function SlidersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h10M18 17h2" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="17" r="2" />
    </Svg>
  );
}

export function DropletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5s6 6.2 6 10.3a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5Z" />
    </Svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 3.5 3.7 10.2c-.8.3-.7 1.4.1 1.6l6.4 1.9 1.9 6.4c.2.8 1.3.9 1.6.1L20.5 3.5Z" />
      <path d="M20.5 3.5 10.2 13.7" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </Svg>
  );
}

export function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4l1.8 4.6L18.5 10l-4.7 1.4L12 16l-1.8-4.6L5.5 10l4.7-1.4L12 4Z" />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </Svg>
  );
}

export function ChevronUpIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function SoundOnIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4v-5Z" />
      <path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.3 6.5a7.8 7.8 0 0 1 0 11" />
    </Svg>
  );
}

export function SoundOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4v-5Z" />
      <path d="m16 10 4 4M20 10l-4 4" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function MessageIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 20.5 12Z" />
    </Svg>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.2a7.6 7.6 0 0 1 15 0" />
    </Svg>
  );
}

export function UploadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 16V4M8 7.5 12 3.5l4 4" />
      <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </Svg>
  );
}

export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5v12M8 12l4 4 4-4" />
      <path d="M4.5 16v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V16" />
    </Svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m14.5 5-7 7 7 7" />
    </Svg>
  );
}

export function LogOutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
      <path d="M10.5 12h9.5M17 9l3 3-3 3" />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="M6.5 6.5 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.5" />
    </Svg>
  );
}

export function GamepadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 7h9a5 5 0 0 1 4.9 5.9l-.6 3.3A2.6 2.6 0 0 1 16.5 17l-1.6-2h-5.8L7.5 17a2.6 2.6 0 0 1-4.3-.8l-.6-3.3A5 5 0 0 1 7.5 7Z" />
      <path d="M7.5 11v2.2M6.4 12.1h2.2M15.5 11.2h.01M17.6 13.2h.01" />
    </Svg>
  );
}
