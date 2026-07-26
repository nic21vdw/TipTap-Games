import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "patience-deck",
  title: "Patience Deck",
  rule: "Drag cards to build foundations by suit",
  year: 1990,
  description:
    "Seven columns, one deck, infinite patience. Build the foundations before the clock catches up.",
  history:
    "Homage to the 1990 desktop card-shuffling pastime bundled with early PCs that turned idle office minutes into a quiet, endless deal.",
  tags: ["calm", "luck", "precision"],
  palette: {
    hero: "#2f9e44",
    foe: "#e03131",
    prize: "#f8f0dc",
    deep: "#0b3d2e",
    glow: "#ffd43b",
  },
  intensity: 0.2,
  luck: 0.35,
  nostalgia: 1.0,
  sessionLength: 0.7,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

type Card = { rank: number; suit: number; faceUp: boolean };
type Drag = {
  cards: Card[];
  source: { type: "tableau"; col: number } | { type: "waste" };
  grabDX: number;
  grabDY: number;
  curX: number;
  curY: number;
};

const SUIT_LETTER = ["H", "D", "C", "S"];
const isRed = (suit: number) => suit < 2;
const rankLabel = (r: number) =>
  r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const colGap = W / 7;
  const cardW = colGap * 0.9;
  const cardH = cardW * 1.42;
  const colX = (i: number) => i * colGap + (colGap - cardW) / 2;
  const topY = H * 0.035;
  const tableauTopY = topY + cardH + H * 0.05;
  const FACE_DOWN_OFFSET = cardH * 0.45;
  const FACE_UP_OFFSET = cardH * 0.62;

  let stock: Card[] = [];
  let waste: Card[] = [];
  let tableau: Card[][] = [];
  let foundations: Card[][] = [[], [], [], []];
  let drag: Drag | null = null;
  let over = false;
  let won = false;
  let elapsed = 0;
  let score = 0;
  let auto = false;
  let autoCd = 0;

  const buildDeck = (): Card[] => {
    const deck: Card[] = [];
    for (let s = 0; s < 4; s++)
      for (let r = 1; r <= 13; r++) deck.push({ rank: r, suit: s, faceUp: false });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  };

  const reset = () => {
    const deck = buildDeck();
    tableau = [];
    for (let c = 0; c < 7; c++) {
      const col: Card[] = [];
      for (let k = 0; k < c; k++) {
        const card = deck.pop()!;
        card.faceUp = false;
        col.push(card);
      }
      const top = deck.pop()!;
      top.faceUp = true;
      col.push(top);
      tableau.push(col);
    }
    stock = deck.map((c) => ({ ...c, faceUp: false }));
    waste = [];
    foundations = [[], [], [], []];
    drag = null;
    over = false;
    won = false;
    elapsed = 0;
    score = 0;
    ctx.onScore(0);
  };

  const colTops = (col: Card[]) => {
    const tops: number[] = [];
    let y = tableauTopY;
    for (let i = 0; i < col.length; i++) {
      tops.push(y);
      y += col[i].faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET;
    }
    return tops;
  };

  const validFoundationIndex = (card: Card): number => {
    for (let i = 0; i < 4; i++) {
      const f = foundations[i];
      if (f.length === 0 && card.rank === 1) return i;
      if (f.length > 0) {
        const t = f[f.length - 1];
        if (t.suit === card.suit && t.rank === card.rank - 1) return i;
      }
    }
    return -1;
  };

  const bumpScore = () => {
    const foundationCount = foundations.reduce((s, f) => s + f.length, 0);
    const next = foundationCount * 10;
    if (next !== score) {
      score = next;
      ctx.onScore(score);
    }
    if (foundationCount === 52) {
      won = true;
      over = true;
      const timeBonus = Math.max(0, 120 - Math.floor(elapsed));
      ctx.haptic("hit");
      ctx.onRunEnd(score + timeBonus);
    }
  };

  const pointerPos = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startDrag = (
    cards: Card[],
    source: Drag["source"],
    px: number,
    py: number,
    cardX: number,
    cardY: number
  ) => {
    drag = {
      cards,
      source,
      grabDX: px - cardX,
      grabDY: py - cardY,
      curX: px,
      curY: py,
    };
  };

  const returnDrag = () => {
    if (!drag) return;
    if (drag.source.type === "waste") waste.push(...drag.cards);
    else tableau[drag.source.col].push(...drag.cards);
    drag = null;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const { x: px, y: py } = pointerPos(e);

    // stock pile
    if (px >= colX(0) && px <= colX(0) + cardW && py >= topY && py <= topY + cardH) {
      if (stock.length > 0) {
        const c = stock.pop()!;
        c.faceUp = true;
        waste.push(c);
      } else if (waste.length > 0) {
        while (waste.length) {
          const c = waste.pop()!;
          c.faceUp = false;
          stock.push(c);
        }
      }
      ctx.haptic("light");
      return;
    }

    // waste pile top card
    if (
      waste.length > 0 &&
      px >= colX(1) &&
      px <= colX(1) + cardW &&
      py >= topY &&
      py <= topY + cardH
    ) {
      const c = waste.pop()!;
      startDrag([c], { type: "waste" }, px, py, colX(1), topY);
      return;
    }

    // tableau columns
    for (let c = 0; c < 7; c++) {
      const col = tableau[c];
      const tops = colTops(col);
      for (let i = col.length - 1; i >= 0; i--) {
        if (!col[i].faceUp) continue;
        const yTop = tops[i];
        const yBottom = i === col.length - 1 ? yTop + cardH : tops[i + 1];
        if (px >= colX(c) && px <= colX(c) + cardW && py >= yTop && py < yBottom) {
          const captured = col.splice(i);
          startDrag(captured, { type: "tableau", col: c }, px, py, colX(c), yTop);
          return;
        }
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = pointerPos(e);
    drag.curX = x;
    drag.curY = y;
  };

  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = pointerPos(e);
    const dropX = x - drag.grabDX;
    const dropY = y - drag.grabDY;
    const first = drag.cards[0];

    // foundation drop (single card only, near top row on foundation slots)
    if (
      drag.cards.length === 1 &&
      dropY < topY + cardH + 20 &&
      dropX >= colX(3) - colGap / 2
    ) {
      const idx = validFoundationIndex(first);
      if (idx !== -1) {
        foundations[idx].push(first);
        if (drag.source.type === "tableau") {
          const col = tableau[drag.source.col];
          if (col.length > 0 && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
        }
        drag = null;
        bumpScore();
        ctx.haptic("hit");
        return;
      }
    }

    // tableau column drop: pick nearest column by x
    const centerX = dropX + cardW / 2;
    let bestCol = -1;
    let bestDist = Infinity;
    for (let c = 0; c < 7; c++) {
      const cx = colX(c) + cardW / 2;
      const d = Math.abs(cx - centerX);
      if (d < colGap * 0.6 && d < bestDist) {
        bestDist = d;
        bestCol = c;
      }
    }

    if (bestCol !== -1) {
      const col = tableau[bestCol];
      const targetTop = col.length > 0 ? col[col.length - 1] : null;
      const valid =
        targetTop === null
          ? first.rank === 13
          : targetTop.faceUp &&
            targetTop.rank === first.rank + 1 &&
            isRed(targetTop.suit) !== isRed(first.suit);
      if (valid) {
        col.push(...drag.cards);
        if (drag.source.type === "tableau") {
          const srcCol = tableau[drag.source.col];
          if (srcCol.length > 0 && !srcCol[srcCol.length - 1].faceUp)
            srcCol[srcCol.length - 1].faceUp = true;
        }
        drag = null;
        ctx.haptic("light");
        return;
      }
    }

    returnDrag();
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  const drawCard = (
    t: ReturnType<GameContext["getTheme"]>,
    card: Card,
    x: number,
    y: number
  ) => {
    roundRect(g, x, y, cardW, cardH, 6);
    if (!card.faceUp) {
      g.fillStyle = shade(pal.hero, -0.45);
      g.fill();
      g.strokeStyle = shade(pal.hero, -0.15);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = "rgba(255,255,255,.08)";
      for (let i = 0; i < 3; i++)
        g.fillRect(x + 4, y + 6 + i * (cardH - 12) / 3, cardW - 8, 2);
      return;
    }
    g.fillStyle = t.surface;
    g.fill();
    g.strokeStyle = "rgba(0,0,0,.18)";
    g.lineWidth = 1;
    g.stroke();
    const color = isRed(card.suit) ? pal.foe : pal.hero;
    g.fillStyle = color;
    g.font = `800 ${Math.round(cardW * 0.34)}px ${t.fontDisplay}`;
    g.textAlign = "left";
    g.fillText(rankLabel(card.rank), x + 4, y + cardW * 0.36);
    g.font = `700 ${Math.round(cardW * 0.22)}px ${t.fontBody}`;
    g.fillText(SUIT_LETTER[card.suit], x + 4, y + cardH - 6);
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) elapsed += dt;

    if (auto && !over && !drag) {
      // attract-mode: greedily send any playable card to a foundation,
      // otherwise draw from stock to keep the felt animating
      autoCd -= dt;
      if (autoCd <= 0) {
        autoCd = 0.35;
        let moved = false;
        if (waste.length > 0) {
          const c = waste[waste.length - 1];
          const idx = validFoundationIndex(c);
          if (idx !== -1) {
            waste.pop();
            foundations[idx].push(c);
            moved = true;
            bumpScore();
          }
        }
        if (!moved) {
          for (let c = 0; c < 7 && !moved; c++) {
            const col = tableau[c];
            if (col.length === 0) continue;
            const card = col[col.length - 1];
            if (!card.faceUp) continue;
            const idx = validFoundationIndex(card);
            if (idx !== -1) {
              col.pop();
              foundations[idx].push(card);
              if (col.length > 0 && !col[col.length - 1].faceUp)
                col[col.length - 1].faceUp = true;
              moved = true;
              bumpScore();
            }
          }
        }
        if (!moved) {
          if (stock.length > 0) {
            const c = stock.pop()!;
            c.faceUp = true;
            waste.push(c);
          } else if (waste.length > 0) {
            while (waste.length) {
              const c = waste.pop()!;
              c.faceUp = false;
              stock.push(c);
            }
          }
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);

    // stock
    roundRect(g, colX(0), topY, cardW, cardH, 6);
    if (stock.length > 0) {
      g.fillStyle = shade(pal.hero, -0.45);
      g.fill();
    } else {
      g.strokeStyle = "rgba(255,255,255,.25)";
      g.lineWidth = 1.5;
      g.stroke();
    }

    // waste
    if (waste.length > 0 && (!drag || drag.source.type !== "waste"))
      drawCard(t, waste[waste.length - 1], colX(1), topY);
    else if (waste.length === 0) {
      roundRect(g, colX(1), topY, cardW, cardH, 6);
      g.strokeStyle = "rgba(255,255,255,.12)";
      g.lineWidth = 1;
      g.stroke();
    }

    // foundations
    for (let i = 0; i < 4; i++) {
      const x = colX(3 + i);
      roundRect(g, x, topY, cardW, cardH, 6);
      const f = foundations[i];
      if (f.length > 0) {
        drawCard(t, f[f.length - 1], x, topY);
      } else {
        g.strokeStyle = "rgba(255,255,255,.18)";
        g.lineWidth = 1;
        g.stroke();
      }
    }

    // tableau
    for (let c = 0; c < 7; c++) {
      const col = tableau[c];
      const tops = colTops(col);
      for (let i = 0; i < col.length; i++) {
        drawCard(t, col[i], colX(c), tops[i]);
      }
      if (col.length === 0) {
        roundRect(g, colX(c), tableauTopY, cardW, cardH, 6);
        g.strokeStyle = "rgba(255,255,255,.12)";
        g.lineWidth = 1;
        g.stroke();
      }
    }

    // dragging stack on top
    if (drag) {
      const bx = drag.curX - drag.grabDX;
      const by = drag.curY - drag.grabDY;
      for (let i = 0; i < drag.cards.length; i++)
        drawCard(t, drag.cards[i], bx, by + i * FACE_UP_OFFSET);
    }

    g.textAlign = "left";
    if (over) endCard(g, t, W, H, won ? "CLEARED" : "GAME OVER");
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
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
