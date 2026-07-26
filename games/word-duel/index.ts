import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade, clamp, pick } from "@/games/engine";

const meta = {
  slug: "word-duel",
  title: "Nic's Word Duel",
  rule: "Tap letters to spell words before time runs out.",
  year: 2009,
  description: "Spell fast, clear tiles, beat the clock.",
  history:
    "Homage to the 2009 letter-tile word sprints that turned a scramble of tiles into a race against a ticking countdown.",
  tags: ["reflex", "memory", "precision"],
  palette: {
    hero: "#f8961e",
    foe: "#f3722c",
    prize: "#ffcb69",
    deep: "#212529",
    glow: "#90be6d",
  },
  intensity: 0.65,
  luck: 0.25,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

const SESSION = 50;
const TILE_COUNT = 9;

// small curated dictionary so every playable word is guaranteed constructible
const WORDS = [
  "cat", "dog", "run", "sun", "sea", "art", "ear", "ten", "red", "row",
  "star", "rain", "moon", "gate", "note", "rose", "sand", "tide", "wave",
  "storm", "orbit", "coral", "flame", "grain", "spark", "toast", "cabin",
  "planet", "canyon", "harbor", "meadow",
];

interface Tile {
  ch: string;
  used: boolean;
}

function buildBagFor(word: string, size: number): string[] {
  const letters = word.toUpperCase().split("");
  const alphabet = "ETAOINSHRDLUCMFWYPBGVKQJXZ";
  while (letters.length < size) {
    letters.push(pick(alphabet.split("")));
  }
  // shuffle
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let tiles: Tile[] = [];
  let seedWord = "";
  let picked: number[] = [];
  let score = 0;
  let timeLeft = SESSION;
  let over = false;
  let toast = { text: "", t: 1 };
  let auto = false;
  let autoCd = 0;

  const cols = 3;
  const rows = Math.ceil(TILE_COUNT / cols);
  const cell = Math.min(W / (cols + 1), (H * 0.4) / rows);
  const gridW = cell * cols;
  const gridX = (W - gridW) / 2;
  const gridY = H * 0.42;

  const refillBag = () => {
    seedWord = pick(WORDS);
    tiles = buildBagFor(seedWord, TILE_COUNT).map((ch) => ({ ch, used: false }));
    picked = [];
  };

  const reset = () => {
    score = 0;
    timeLeft = SESSION;
    over = false;
    toast = { text: "", t: 1 };
    refillBag();
    ctx.onScore(0);
  };
  reset();

  const currentWord = () => picked.map((i) => tiles[i].ch).join("").toLowerCase();

  const submit = () => {
    const w = currentWord();
    if (w.length >= 3 && WORDS.includes(w)) {
      score += w.length * 10;
      ctx.onScore(score);
      ctx.haptic("hit");
      toast = { text: `+${w.length * 10} "${w}"`, t: 0 };
      // clear used tiles, replace with fresh ones
      for (const i of picked) {
        const alphabet = "ETAOINSHRDLUCMFWYPBGVKQJXZ";
        tiles[i] = { ch: pick(alphabet.split("")), used: false };
      }
      picked = [];
      // occasionally reseed a fully-spellable word into the bag
      if (Math.random() < 0.5) {
        seedWord = pick(WORDS);
        const letters = seedWord.toUpperCase().split("");
        for (let k = 0; k < letters.length && k < tiles.length; k++) {
          const slot = Math.floor(Math.random() * tiles.length);
          tiles[slot] = { ch: letters[k], used: false };
        }
      }
    } else if (w.length > 0) {
      ctx.haptic("fail");
      toast = { text: "not a word", t: 0 };
      picked = [];
    }
  };

  const tileAt = (px: number, py: number) => {
    for (let i = 0; i < tiles.length; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = gridX + c * cell + cell / 2;
      const y = gridY + r * cell + cell / 2;
      if (Math.hypot(px - x, py - y) < cell * 0.42) return i;
    }
    return -1;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // submit button zone
    if (py > gridY + rows * cell + 12 && py < gridY + rows * cell + 52) {
      submit();
      return;
    }
    const i = tileAt(px, py);
    if (i < 0) return;
    if (picked.includes(i)) {
      picked = picked.filter((x) => x !== i);
      ctx.haptic("light");
    } else {
      picked.push(i);
      ctx.haptic("light");
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.4;
          const wanted = seedWord.toUpperCase().split("");
          const avail = tiles.map((tl, i) => ({ ch: tl.ch, i })).filter((x) => !picked.includes(x.i));
          const next = wanted[picked.length];
          const match = avail.find((a) => a.ch === next);
          if (match) picked.push(match.i);
          if (picked.length >= wanted.length) submit();
        }
      }
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }
    toast.t += dt;

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // current word strip
    g.textAlign = "center";
    g.fillStyle = t.ink;
    g.font = `800 26px ${t.fontDisplay}`;
    g.fillText(currentWord().toUpperCase() || "—", W / 2, gridY - 30);

    for (let i = 0; i < tiles.length; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = gridX + c * cell + cell * 0.08;
      const y = gridY + r * cell + cell * 0.08;
      const size = cell * 0.84;
      const isPicked = picked.includes(i);
      g.fillStyle = isPicked ? pal.prize : shade(pal.hero, -0.15);
      roundRect(g, x, y, size, size, 10);
      g.fill();
      g.fillStyle = isPicked ? shade(pal.deep, -0.2) : "#fff";
      g.font = `800 ${Math.floor(size * 0.42)}px ${t.fontDisplay}`;
      g.fillText(tiles[i].ch, x + size / 2, y + size * 0.65);
    }

    // submit button
    const by = gridY + rows * cell + 12;
    g.fillStyle = picked.length >= 3 ? pal.glow : "rgba(255,255,255,.15)";
    roundRect(g, W / 2 - 70, by, 140, 40, 10);
    g.fill();
    g.fillStyle = "#fff";
    g.font = `700 14px ${t.fontBody}`;
    g.fillText("SUBMIT", W / 2, by + 25);

    if (toast.t < 1) {
      g.globalAlpha = clamp(1 - toast.t, 0, 1);
      g.fillStyle = pal.glow;
      g.font = `700 15px ${t.fontBody}`;
      g.fillText(toast.text, W / 2, by + 70);
      g.globalAlpha = 1;
    }

    g.textAlign = "left";
    g.fillStyle = t.ink;
    g.font = `800 16px ${t.fontDisplay}`;
    g.fillText(`${score} pts`, 14, 26);
    const barW = W - 28;
    g.fillStyle = "rgba(255,255,255,.15)";
    g.fillRect(14, 40, barW, 5);
    g.fillStyle = pal.foe;
    g.fillRect(14, 40, barW * (timeLeft / SESSION), 5);

    g.textAlign = "center";
    if (over) endCard(g, t, W, H, "TIME'S UP");
    g.textAlign = "left";
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
