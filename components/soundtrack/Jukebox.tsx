"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SOUNDTRACK } from "@/lib/soundtrack";

const VOLUMES = [1, 2, 3] as const;

const COLOR: Record<number, string> = {
  1: "#ff3d7f",
  2: "#35e0d0",
  3: "#ffc23d",
};

const CACHE_LIMIT = 6;

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function shuffled(length: number) {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function Jukebox() {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [progress, setProgress] = useState(0);

  const ac = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const order = useRef<number[] | null>(null);
  const startedAt = useRef(0);
  const offset = useRef(0);
  const token = useRef(0);
  const cursor = useRef(-1);
  const advance = useRef<(delta: number) => void>(() => {});
  const canvas = useRef<HTMLCanvasElement>(null);

  const total = useMemo(
    () => SOUNDTRACK.reduce((sum, t) => sum + t.seconds, 0),
    []
  );

  const graph = useCallback(() => {
    if (ac.current) return ac.current;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    const c = new Ctor();
    const gain = c.createGain();
    gain.gain.value = 0.85;
    const an = c.createAnalyser();
    an.fftSize = 256;
    an.smoothingTimeConstant = 0.78;
    gain.connect(an);
    gain.connect(c.destination);
    ac.current = c;
    master.current = gain;
    analyser.current = an;
    return c;
  }, []);

  const stop = useCallback(() => {
    const n = node.current;
    if (!n) return;
    n.onended = null;
    try {
      n.stop();
    } catch {
      // already stopped
    }
    n.disconnect();
    node.current = null;
  }, []);

  const play = useCallback(
    async (next: number, from = 0) => {
      const c = graph();
      if (!c) return;
      const mine = ++token.current;
      if (c.state !== "running") await c.resume().catch(() => {});
      stop();
      cursor.current = next;
      setIndex(next);
      setPlaying(true);

      const track = SOUNDTRACK[next];
      let buffer = buffers.current.get(track.id);
      if (!buffer) {
        const bytes = await fetch(track.src).then((r) => r.arrayBuffer());
        buffer = await c.decodeAudioData(bytes);
        if (buffers.current.size >= CACHE_LIMIT) {
          const oldest = buffers.current.keys().next().value;
          if (oldest) buffers.current.delete(oldest);
        }
        buffers.current.set(track.id, buffer);
      }
      if (mine !== token.current) return;

      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(master.current!);
      source.onended = () => {
        if (mine === token.current) advance.current(1);
      };
      offset.current = from;
      startedAt.current = c.currentTime - from;
      source.start(0, from);
      node.current = source;
    },
    [graph, stop]
  );

  const step = useCallback(
    (delta: number) => {
      const queue = order.current;
      if (queue) {
        const at = Math.max(0, queue.indexOf(cursor.current));
        void play(queue[(at + delta + queue.length) % queue.length]);
      } else {
        const from = Math.max(0, cursor.current);
        void play((from + delta + SOUNDTRACK.length) % SOUNDTRACK.length);
      }
    },
    [play]
  );

  useEffect(() => {
    advance.current = step;
  }, [step]);

  const toggle = useCallback(() => {
    if (index < 0) {
      void play(order.current ? order.current[0] : 0);
      return;
    }
    if (playing) {
      offset.current = (ac.current?.currentTime ?? 0) - startedAt.current;
      token.current++;
      stop();
      setPlaying(false);
    } else {
      void play(index, offset.current % SOUNDTRACK[index].seconds);
    }
  }, [index, play, playing, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") step(1);
      else if (e.code === "ArrowLeft") step(-1);
      else if (e.key.toLowerCase() === "s") {
        setShuffle((on) => {
          order.current = on ? null : shuffled(SOUNDTRACK.length);
          return !on;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, toggle]);

  useEffect(() => {
    let raf = 0;
    const bins = new Uint8Array(128);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = canvas.current;
      const an = analyser.current;
      if (!c || !an) return;
      const g = c.getContext("2d");
      if (!g) return;
      an.getByteFrequencyData(bins);
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = index >= 0 ? COLOR[SOUNDTRACK[index].volume] : "#5c6b80";
      const bars = 40;
      const w = c.width / bars;
      for (let i = 0; i < bars; i++) {
        const v = bins[i * 2] / 255;
        const h = Math.max(3, v * c.height);
        g.globalAlpha = 0.35 + v * 0.65;
        g.fillRect(i * w + 1, (c.height - h) / 2, w - 3, h);
      }
      if (node.current && ac.current && index >= 0) {
        const elapsed = ac.current.currentTime - startedAt.current;
        setProgress(Math.min(1, elapsed / SOUNDTRACK[index].seconds));
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [index]);

  useEffect(
    () => () => {
      token.current++;
      stop();
      void ac.current?.close().catch(() => {});
      ac.current = null;
    },
    [stop]
  );

  const track = index >= 0 ? SOUNDTRACK[index] : null;
  const tint = track ? COLOR[track.volume] : "#5c6b80";

  return (
    <main className="ttr">
      <style>{CSS}</style>

      <header className="ttr-head">
        <div>
          <h1>
            Nic Bops <span>— Tip Tap Games soundtrack</span>
          </h1>
          <p>
            Every excerpt here is exactly what the feed plays: 64 seconds, cut a
            quarter of the way into the track, normalised to &minus;15 LUFS.
          </p>
        </div>
        <div className="ttr-stats">
          <div>
            <b>{SOUNDTRACK.length}</b>
            <span>tracks</span>
          </div>
          <div>
            <b>{VOLUMES.length}</b>
            <span>volumes</span>
          </div>
          <div>
            <b>{clock(total)}</b>
            <span>total</span>
          </div>
        </div>
      </header>

      <div className="ttr-cols">
        {VOLUMES.map((volume) => {
          const list = SOUNDTRACK.filter((t) => t.volume === volume);
          return (
            <section key={volume} style={{ color: COLOR[volume] }}>
              <h2>
                <i style={{ background: COLOR[volume] }} />
                Volume {volume}
                <em>· {list.length} tracks</em>
              </h2>
              <div className="ttr-list">
                {list.map((t, i) => (
                  <button
                    key={t.id}
                    className="ttr-track"
                    aria-current={track?.id === t.id}
                    onClick={() => void play(SOUNDTRACK.indexOf(t))}
                  >
                    <span className="n">
                      {track?.id === t.id ? "▶" : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="t">{t.title}</span>
                    <span className="d">{clock(t.seconds)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="ttr-foot">
        <kbd>Space</kbd> play / pause · <kbd>←</kbd> <kbd>→</kbd> previous /
        next · <kbd>S</kbd> shuffle the whole catalogue.
      </p>

      <div className="ttr-bar" style={{ color: tint }}>
        <div className="ttr-controls">
          <button onClick={() => step(-1)} aria-label="Previous track">
            ◀◀
          </button>
          <button className="play" onClick={toggle} aria-label="Play or pause">
            {playing ? "❚❚" : "▶"}
          </button>
          <button onClick={() => step(1)} aria-label="Next track">
            ▶▶
          </button>
          <button
            className={shuffle ? "on" : ""}
            aria-pressed={shuffle}
            aria-label="Shuffle"
            onClick={() => {
              order.current = shuffle ? null : shuffled(SOUNDTRACK.length);
              setShuffle(!shuffle);
            }}
          >
            ⤨
          </button>
        </div>

        <div className="ttr-np">
          <div className="title">{track ? track.title : "Pick a track"}</div>
          <div className="meta">
            {track ? (
              <>
                <span className="tag" style={{ background: tint }}>
                  Nic Bops Vol {track.volume}
                </span>
                <span>
                  {clock(track.seconds)} excerpt · 96 kbps · loops in the feed
                </span>
              </>
            ) : (
              <span>{SOUNDTRACK.length} tracks ready</span>
            )}
          </div>
          <div className="seek">
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <canvas ref={canvas} width={520} height={124} />
      </div>
    </main>
  );
}

const CSS = `
.ttr {
  --ttr-dim: rgba(242,244,251,.5);
  position: relative;
  min-height: 100vh;
  background: #08090f;
  color: #f2f4fb;
  padding: 0 0 190px;
  font-family: var(--font-body);
}
.ttr::before {
  content: "";
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(60vw 50vh at 12% -8%, rgba(255,61,127,.20), transparent 65%),
    radial-gradient(55vw 45vh at 88% 4%, rgba(53,224,208,.16), transparent 65%);
}
.ttr > * { position: relative; z-index: 1; }
.ttr-head {
  padding: 40px 44px 26px;
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 30px; flex-wrap: wrap;
}
.ttr-head h1 { margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -.022em; }
.ttr-head h1 span { color: var(--ttr-dim); font-weight: 500; }
.ttr-head p { margin: 8px 0 0; color: var(--ttr-dim); font-size: 16px; max-width: 640px; }
.ttr-stats { display: flex; gap: 28px; }
.ttr-stats b { display: block; font-size: 30px; font-weight: 800; letter-spacing: -.02em; }
.ttr-stats span { color: var(--ttr-dim); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }
.ttr-cols { padding: 0 44px; display: grid; gap: 34px; grid-template-columns: repeat(3, 1fr); }
.ttr-cols h2 {
  margin: 0 0 14px; font-size: 13px; letter-spacing: .16em; text-transform: uppercase;
  display: flex; align-items: center; gap: 10px;
}
.ttr-cols h2 i { width: 11px; height: 11px; border-radius: 50%; }
.ttr-cols h2 em { color: var(--ttr-dim); font-style: normal; letter-spacing: .06em; }
.ttr-list { display: grid; gap: 5px; }
.ttr-track {
  all: unset; cursor: pointer;
  display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 12px;
  padding: 11px 15px; border-radius: 11px;
  background: rgba(255,255,255,.045); border: 1px solid transparent;
  font-size: 16px; transition: background .12s, border-color .12s;
}
.ttr-track:hover { background: rgba(255,255,255,.09); }
.ttr-track:focus-visible { outline: 2px solid #f2f4fb; outline-offset: 2px; }
.ttr-track[aria-current="true"] { background: rgba(255,255,255,.13); border-color: currentColor; }
.ttr-track .n { color: var(--ttr-dim); font-size: 13px; font-variant-numeric: tabular-nums; }
.ttr-track[aria-current="true"] .n { color: currentColor; }
.ttr-track .t { color: #f2f4fb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ttr-track .d { color: var(--ttr-dim); font-size: 13px; font-variant-numeric: tabular-nums; }
.ttr-foot { padding: 34px 44px 0; color: var(--ttr-dim); font-size: 14px; }
.ttr-foot kbd { background: rgba(255,255,255,.11); border-radius: 5px; padding: 2px 7px; font: inherit; font-size: 13px; }
.ttr-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 5;
  background: rgba(8,9,15,.93);
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
  border-top: 1px solid rgba(255,255,255,.1);
  padding: 18px 44px calc(22px + env(safe-area-inset-bottom));
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 26px;
}
.ttr-controls { display: flex; align-items: center; gap: 10px; }
.ttr-controls button {
  all: unset; cursor: pointer; width: 48px; height: 48px;
  display: grid; place-items: center; border-radius: 50%;
  background: rgba(255,255,255,.1); font-size: 17px; color: #f2f4fb;
}
.ttr-controls button:hover { background: rgba(255,255,255,.2); }
.ttr-controls button:focus-visible { outline: 2px solid #f2f4fb; outline-offset: 2px; }
.ttr-controls button.on { background: rgba(255,255,255,.28); }
.ttr-controls .play { width: 62px; height: 62px; background: #f2f4fb; color: #08090f; font-size: 22px; }
.ttr-controls .play:hover { background: #fff; }
.ttr-np { min-width: 0; }
.ttr-np .title { font-size: 27px; font-weight: 800; letter-spacing: -.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ttr-np .meta { color: var(--ttr-dim); font-size: 14px; margin-top: 3px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.ttr-np .meta .tag {
  padding: 2px 9px; border-radius: 999px; color: #08090f;
  font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
}
.ttr-np .seek { margin-top: 11px; height: 6px; border-radius: 999px; background: rgba(255,255,255,.13); overflow: hidden; }
.ttr-np .seek i { display: block; height: 100%; background: currentColor; }
.ttr canvas { display: block; width: 260px; height: 62px; }
@media (max-width: 1100px) { .ttr-cols { grid-template-columns: 1fr; } }
@media (max-width: 900px) {
  .ttr canvas { display: none; }
  .ttr-bar { grid-template-columns: auto 1fr; padding-left: 20px; padding-right: 20px; }
  .ttr-head, .ttr-cols, .ttr-foot { padding-left: 20px; padding-right: 20px; }
  .ttr-head h1 { font-size: 32px; }
}
`;
