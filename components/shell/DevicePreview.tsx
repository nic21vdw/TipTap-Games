"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DesktopIcon, PhoneIcon } from "@/components/ui/icons";

/**
 * The app ships as an iPhone app; the web build is the shop window for it.
 * On a phone-sized browser this component is a no-op — you get the app,
 * full bleed, exactly as before. On a desktop browser it offers two views:
 *
 *   desktop — the app filling the window (what a laptop visitor sees today)
 *   iphone  — the app running inside a to-scale iPhone, so the Vercel URL
 *             doubles as an App Store preview
 *
 * The trick that makes the framed mode honest: the screen element carries a
 * `transform`, which makes it the containing block for every `position:
 * fixed` descendant. Sheets, the tuner pill and the grain overlay therefore
 * pin to the simulated screen rather than the browser window, with no
 * per-component branching. Height and safe-area insets come from the
 * `--app-h` / `--safe-top` / `--safe-bottom` seam in globals.css.
 */

type Mode = "desktop" | "iphone";

interface Device {
  id: string;
  name: string;
  width: number;
  height: number;
  /** screen corner radius, CSS px */
  radius: number;
  safeTop: number;
  safeBottom: number;
  /** true for Dynamic Island, false for the older notch-free chin */
  island: boolean;
}

const DEVICES: Device[] = [
  {
    id: "pro",
    name: 'iPhone 17 Pro — 6.3"',
    width: 402,
    height: 874,
    radius: 55,
    safeTop: 59,
    safeBottom: 34,
    island: true,
  },
  {
    id: "max",
    name: 'iPhone 17 Pro Max — 6.9"',
    width: 440,
    height: 956,
    radius: 55,
    safeTop: 62,
    safeBottom: 34,
    island: true,
  },
  {
    id: "se",
    name: 'iPhone SE — 4.7"',
    width: 375,
    height: 667,
    radius: 0,
    safeTop: 20,
    safeBottom: 0,
    island: false,
  },
];

const MODE_KEY = "ttg:preview:mode";
const DEVICE_KEY = "ttg:preview:device";
/** below this the browser already *is* a phone — never frame it */
const DESKTOP_MIN = 1000;
const BEZEL = 12;

export function DevicePreview({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [wide, setWide] = useState(false);
  const [mode, setMode] = useState<Mode>("iphone");
  const [device, setDevice] = useState<Device>(DEVICES[0]);
  const [scale, setScale] = useState(1);

  // restore the last choice, and let ?view=desktop|iphone win over it so a
  // link can point straight at either preview
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("view");
    const stored = localStorage.getItem(MODE_KEY);
    const wanted = param ?? stored;
    if (wanted === "desktop" || wanted === "iphone") setMode(wanted);
    const d = DEVICES.find((x) => x.id === localStorage.getItem(DEVICE_KEY));
    if (d) setDevice(d);
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // shrink the phone to fit short windows, never blow it up past 1:1
  useEffect(() => {
    const fit = () => {
      const room = window.innerHeight - 112; // toolbar + breathing space
      setScale(Math.min(1, room / (device.height + BEZEL * 2)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [device]);

  const pick = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };
  const pickDevice = (id: string) => {
    const d = DEVICES.find((x) => x.id === id);
    if (!d) return;
    setDevice(d);
    localStorage.setItem(DEVICE_KEY, d.id);
  };

  // Server render and first client render are identical (plain app), so the
  // frame appears only after hydration — no mismatch, and no double mount of
  // the feed, which owns live rAF loops.
  const framed = mounted && wide && mode === "iphone";

  const app = (
    <>
      {children}
      <div className="fx-grain" />
      <div className="fx-scanlines" />
    </>
  );

  if (!framed) {
    return (
      <>
        {app}
        {mounted && wide && (
          <div className="ttg-toolbar ttg-toolbar-float">
            <ModeSwitch mode={mode} onPick={pick} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="ttg-stage">
      {/* a scale() transform doesn't shrink the layout box, so the sizer
          reserves the *scaled* footprint and keeps the toolbar on screen */}
      <div
        className="ttg-sizer"
        style={{
          width: (device.width + BEZEL * 2) * scale,
          height: (device.height + BEZEL * 2) * scale,
        }}
      >
        <div
          className="ttg-phone"
          style={{
            padding: BEZEL,
            borderRadius: device.radius + BEZEL,
            transform: `scale(${scale})`,
          }}
        >
          <div
            className="ttg-screen"
            style={
              {
                width: device.width,
                height: device.height,
                borderRadius: device.radius,
                "--app-h": `${device.height}px`,
                "--safe-top": `${device.safeTop}px`,
                "--safe-bottom": `${device.safeBottom}px`,
              } as React.CSSProperties
            }
          >
            {app}
            {device.island ? (
              <div className="ttg-island" />
            ) : (
              <div className="ttg-statusbar" />
            )}
            {device.safeBottom > 0 && <div className="ttg-home" />}
          </div>
        </div>
      </div>

      <div className="ttg-toolbar">
        <ModeSwitch mode={mode} onPick={pick} />
        <select
          value={device.id}
          onChange={(e) => pickDevice(e.target.value)}
          aria-label="Device"
          className="ttg-select"
        >
          {DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="ttg-dims">
          {device.width} × {device.height}
          {scale < 1 && ` · ${Math.round(scale * 100)}%`}
        </span>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  return (
    <div className="ttg-seg" role="group" aria-label="Preview mode">
      <button
        onClick={() => onPick("desktop")}
        aria-pressed={mode === "desktop"}
        className={`ttg-seg-btn ${mode === "desktop" ? "is-on" : ""}`}
      >
        <DesktopIcon size={15} /> Desktop
      </button>
      <button
        onClick={() => onPick("iphone")}
        aria-pressed={mode === "iphone"}
        className={`ttg-seg-btn ${mode === "iphone" ? "is-on" : ""}`}
      >
        <PhoneIcon size={15} /> iPhone
      </button>
    </div>
  );
}
