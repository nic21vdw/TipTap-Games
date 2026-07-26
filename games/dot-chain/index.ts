import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "dot-chain",
  title: "Nic's Dot Chain",
  rule: "Drag through same-color dots, release to clear",
  year: 2013,
  description:
    "Chain the colors before the clock runs dry — long chains pay out big.",
  history:
    "Homage to the 2013 color-matching puzzle boom that turned dragging a finger across a grid of dots into a bite-sized daily habit for millions of phones.",
  tags: ["reflex", "luck", "chaos"],
  palette: {
    hero: "#06d6a0",
    foe: "#ef476f",
    prize: "#f9c74f",
    deep: "#073b4c",
    glow: "#118ab2",
  },
  intensity: 0.55,
  luck: 0.4,
  nostalgia: 0.6,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
} satisfies GameModule["meta"];

const COLS = 6;
const ROWS = 7;
const START_TIME = 12;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const COLORS = [pal.hero, pal.foe, pal.prize, pal.glow, "#9d4edd"];

  const cell = Math.min((W * 0.92) / COLS, (H * 0.56) / ROWS);
  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const bx = (W - boardW) / 2;
  const by = H * 0.24;

  let board: number[] = new Array(COLS * ROWS).fill(0);
  let chain: { r: number; c: number }[] = [];
  let dragging = false;
  let score = 0;
  let timeLeft = START_TIME;
  let over = false;
  let pulse = 0;

  const idx = (r: number, c: number) => r * COLS + c;
  const inBounds = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

  const fillBoard = () => {
    for (let i = 0; i < board.length; i++)
      board[i] = Math.floor(Math.random() * COLORS.length);
  };

  const reset = () => {
    fillBoard();
    chain = [];
    dragging = false;
    score = 0;
    timeLeft = START_TIME;
    over = false;
    ctx.onScore(0);
  };

  const cellFromPoint = (x: number, y: number) => {
    const c = Math.floor((x - bx) / cell);
    const r = Math.floor((y - by) / cell);
    if (!inBounds(r, c)) return null;
    return { r, c };
  };

  const inChain = (r: number, c: number) => chain.some((p) => p.r === r && p.c === c);

  const clearChain = () => {
    const bonus = Math.round(Math.pow(chain.length, 1.3) * 8);
    score += bonus;
    ctx.onScore(score);
    ctx.haptic(chain.length >= 5 ? "hit" : "light");
    timeLeft = Math.min(START_TIME + 4, timeLeft + Math.min(1.5, 0.4 + chain.length * 0.15));

    const cols = new Set(chain.map((p) => p.c));
    for (const c of cols) {
      const remaining: number[] = [];
      for (let r = 0; r < ROWS; r++) {
        if (!inChain(r, c)) remaining.push(board[idx(r, c)]);
      }
      const missing = ROWS - remaining.length;
      const fresh: number[] = [];
      for (let i = 0; i < missing; i++) fresh.push(Math.floor(Math.random() * COLORS.length));
      const newCol = [...fresh, ...remaining];
      for (let r = 0; r < ROWS; r++) board[idx(r, c)] = newCol[r];
    }
    chain = [];
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const rct = ctx.canvas.getBoundingClientRect();
    const cell0 = cellFromPoint(e.clientX - rct.left, e.clientY - rct.top);
    if (!cell0) return;
    dragging = true;
    chain = [cell0];
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const rct = ctx.canvas.getBoundingClientRect();
    const cur = cellFromPoint(e.clientX - rct.left, e.clientY - rct.top);
    if (!cur) return;
    if (chain.length >= 2) {
      const prev = chain[chain.length - 2];
      if (prev.r === cur.r && prev.c === cur.c) {
        chain.pop();
        return;
      }
    }
    const last = chain[chain.length - 1];
    if (last.r === cur.r && last.c === cur.c) return;
    const adjacent = Math.abs(last.r - cur.r) + Math.abs(last.c - cur.c) === 1;
    const sameColor = board[idx(cur.r, cur.c)] === board[idx(chain[0].r, chain[0].c)];
    if (adjacent && sameColor && !inChain(cur.r, cur.c)) chain.push(cur);
  };

  const onUp = () => {
    if (!dragging || over) return;
    dragging = false;
    if (chain.length >= 2) clearChain();
    else chain = [];
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoState: "idle" | "building" | "releasing" = "idle";
  let autoTimer = 0;
  let autoCd = 0;

  const autoTick = (dt: number) => {
    if (autoState === "idle") {
      autoCd -= dt;
      if (autoCd <= 0) {
        const r = Math.floor(Math.random() * ROWS);
        const c = Math.floor(Math.random() * COLS);
        chain = [{ r, c }];
        autoState = "building";
        autoTimer = 0;
      }
    } else if (autoState === "building") {
      autoTimer += dt;
      if (autoTimer >= 0.1) {
        autoTimer = 0;
        const last = chain[chain.length - 1];
        const color = board[idx(chain[0].r, chain[0].c)];
        const dirs = [
          { r: 1, c: 0 },
          { r: -1, c: 0 },
          { r: 0, c: 1 },
          { r: 0, c: -1 },
        ].sort(() => Math.random() - 0.5);
        let found = false;
        for (const d of dirs) {
          const nr = last.r + d.r;
          const nc = last.c + d.c;
          if (
            inBounds(nr, nc) &&
            board[idx(nr, nc)] === color &&
            !inChain(nr, nc)
          ) {
            chain.push({ r: nr, c: nc });
            found = true;
            break;
          }
        }
        if (!found) autoState = "releasing";
      }
    } else if (autoState === "releasing") {
      if (chain.length >= 2) clearChain();
      else chain = [];
      autoState = "idle";
      autoCd = 0.35;
    }
  };

  let overTimer = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    pulse += dt;

    if (!over) {
      if (auto) autoTick(dt);
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    } else if (auto) {
      overTimer += dt;
      if (overTimer > 1.0) {
        overTimer = 0;
        reset();
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    g.textAlign = "left";
    g.fillStyle = t.inkDim;
    g.font = `700 14px ${t.fontBody}`;
    g.fillText(`SCORE ${score}`, 16, 26);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = bx + c * cell + cell / 2;
        const y = by + r * cell + cell / 2;
        const col = COLORS[board[idx(r, c)]];
        const selected = inChain(r, c);
        g.beginPath();
        g.arc(x, y, cell * (selected ? 0.4 : 0.34), 0, Math.PI * 2);
        g.fillStyle = selected ? shade(col, 0.25) : col;
        g.fill();
        if (selected) {
          g.lineWidth = 3;
          g.strokeStyle = "rgba(255,255,255,.65)";
          g.stroke();
        }
      }
    }

    if (chain.length > 1) {
      g.strokeStyle = "rgba(255,255,255,.5)";
      g.lineWidth = Math.max(4, cell * 0.16);
      g.lineJoin = "round";
      g.beginPath();
      for (let i = 0; i < chain.length; i++) {
        const p = chain[i];
        const x = bx + p.c * cell + cell / 2;
        const y = by + p.r * cell + cell / 2;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }

    // timer bar
    const tw = W * 0.8;
    const frac = Math.max(0, timeLeft / START_TIME);
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - tw / 2, H * 0.9, tw, 10);
    g.fillStyle = frac < 0.25 ? pal.foe : pal.glow;
    g.fillRect(W / 2 - tw / 2, H * 0.9, tw * frac, 10);

    if (over) endCard(g, t, W, H, "TIME'S UP");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      autoState = "idle";
      autoCd = 0;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
