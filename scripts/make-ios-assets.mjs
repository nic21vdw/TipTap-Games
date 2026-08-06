#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "ios/App/App/Assets.xcassets");
const iconSet = join(assets, "AppIcon.appiconset");
const splashSet = join(assets, "Splash.imageset");
const brandDir = join(root, "public/brand");

const INK = "#0b0f16";
const DEEP = "#131c2b";
const ACCENT = "#0095f6";
const MINT = "#31e0b0";
const GOLD = "#ffc95c";

function mark(size, withRing) {
  const c = size / 2;
  const r = size * 0.19;
  const ripple = withRing
    ? `
    <circle cx="${c}" cy="${c}" r="${r * 1.72}" fill="none" stroke="${MINT}" stroke-opacity="0.34" stroke-width="${size * 0.021}"/>
    <circle cx="${c}" cy="${c}" r="${r * 2.42}" fill="none" stroke="${MINT}" stroke-opacity="0.16" stroke-width="${size * 0.017}"/>`
    : "";
  const t = size * 0.052;
  const barW = r * 1.26;
  const stemH = r * 1.34;
  const gap = r * 0.1;
  const topY = c - stemH / 2 - t / 2;

  const tee = (cx) => `
    <rect x="${cx - barW / 2}" y="${topY}" width="${barW}" height="${t}" rx="${t / 2}" fill="${INK}"/>
    <rect x="${cx - t / 2}" y="${topY}" width="${t}" height="${stemH + t}" rx="${t / 2}" fill="${INK}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${DEEP}"/>
      <stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <linearGradient id="chip" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${MINT}"/>
      <stop offset="0.55" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <circle cx="${size * 0.5}" cy="${size * 0.06}" r="${size * 0.44}" fill="${ACCENT}" fill-opacity="0.13"/>
  ${ripple}
  <rect x="${c - r * 1.44}" y="${c - r}" width="${r * 2.88}" height="${r * 2}" rx="${r * 0.62}" fill="url(#chip)"/>
  ${tee(c - r * 0.68 - gap)}
  ${tee(c + r * 0.68 + gap)}
</svg>`;
}

function splash(size) {
  const c = size / 2;
  const logo = size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <circle cx="${c}" cy="${c}" r="${size * 0.34}" fill="${ACCENT}" fill-opacity="0.08"/>
  <g transform="translate(${c - logo / 2} ${c - logo / 2})">
    ${mark(logo, true).replace(/^<svg[^>]*>|<\/svg>$/g, "")}
  </g>
</svg>`;
}

async function png(svg, size, out) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ${out.replace(root, ".")}`);
}

const iconContents = {
  images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
  info: { author: "xcode", version: 1 },
};

const splashContents = {
  images: [
    { filename: "splash-2732.png", idiom: "universal", scale: "1x" },
    { filename: "splash-2732-1.png", idiom: "universal", scale: "2x" },
    { filename: "splash-2732-2.png", idiom: "universal", scale: "3x" },
  ],
  info: { author: "xcode", version: 1 },
};

const run = async () => {
  console.log("app icon");
  await png(mark(1024, false), 1024, join(iconSet, "AppIcon-1024.png"));
  writeFileSync(join(iconSet, "Contents.json"), JSON.stringify(iconContents, null, 2) + "\n");

  console.log("launch screen");
  const s = splash(2732);
  for (const name of ["splash-2732.png", "splash-2732-1.png", "splash-2732-2.png"]) {
    await png(s, 2732, join(splashSet, name));
  }
  writeFileSync(join(splashSet, "Contents.json"), JSON.stringify(splashContents, null, 2) + "\n");

  console.log("web + store art");
  await png(mark(1024, true), 512, join(brandDir, "icon-512.png"));
  await png(mark(1024, true), 192, join(brandDir, "icon-192.png"));
  await png(mark(1024, false), 180, join(brandDir, "apple-touch-icon.png"));
  await png(mark(1024, true), 32, join(brandDir, "favicon-32.png"));
  writeFileSync(join(brandDir, "mark.svg"), mark(1024, true));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
