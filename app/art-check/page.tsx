"use client";

import { useEffect, useRef } from "react";
import { drawNicHead } from "@/games/nic";
import { drawDrink, skins } from "@/games/nic-art";

const PAL = {
  hero: "#4cc9f0",
  foe: "#e63946",
  prize: "#ffd166",
  deep: "#14213d",
  glow: "#e5e5e5",
};

export default function ArtCheck() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;

    g.fillStyle = "#0d1117";
    g.fillRect(0, 0, c.width, c.height);

    const face = {
      skin: "#d9a377",
      hair: "#1b1b1f",
      eye: "#f4f4f5",
      pupil: "#111827",
      dark: "#0b0f19",
      tooth: "#f8fafc",
    };

    [70, 44, 26, 14].forEach((r, i) => {
      const x = 90 + i * 150;
      drawNicHead(g, { x, y: 110, r, ...face });
      g.fillStyle = "#8b949e";
      g.font = "600 13px system-ui";
      g.textAlign = "center";
      g.fillText(`r=${r}`, x, 210);
    });

    drawNicHead(g, { x: 90, y: 320, r: 70, ...face, shades: false });
    drawNicHead(g, { x: 240, y: 320, r: 70, ...face, gape: 0.9, scowl: 1 });
    drawNicHead(g, { x: 390, y: 320, r: 70, ...face, glowEyes: "#ff2d2d" });
    drawNicHead(g, { x: 540, y: 320, r: 70, ...face, lean: 0.3, gaze: 1 });

    g.fillStyle = "#8b949e";
    g.font = "600 13px system-ui";
    g.textAlign = "center";
    ["shades off", "gape+scowl", "glow eyes", "lean+gaze"].forEach((t, i) =>
      g.fillText(t, 90 + i * 150, 420)
    );

    const sk = skins(PAL);
    drawDrink(g, 90, 520, 46, sk.cola, "cola");
    drawDrink(g, 240, 520, 46, sk.energy, "energy");
    drawDrink(g, 390, 520, 22, sk.cola, "cola");
    drawDrink(g, 470, 520, 22, sk.energy, "energy");
    ["cola", "energy", "cola sm", "energy sm"].forEach((t, i) =>
      g.fillText(t, [90, 240, 390, 470][i], 590)
    );
  }, []);

  return (
    <div style={{ background: "#0d1117", minHeight: "100vh", padding: 20 }}>
      <canvas ref={ref} width={700} height={620} />
    </div>
  );
}
