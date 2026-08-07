# iPhone screen matrix

Every logical viewport Apple currently ships an iPhone at, plus landscape and
the iPad case, driven against the real app in Chrome at exact CSS-point sizes
with the device's safe-area insets injected into `--safe-top` / `--safe-bottom`
and `devicePixelRatio` overridden per device.

Screenshots for every row live outside the repo, in the run's scratchpad:
`iphone-screens/<before|after>-<device>-<game>-<state>.png`.

## Devices tested

| Key | Device | Logical size | DPR | Top inset | Bottom inset |
| --- | --- | --- | --- | --- | --- |
| SE | iPhone SE (3rd gen) | 375 × 667 | 2 | 20 | 0 |
| mini | iPhone 13 mini | 375 × 812 | 3 | 50 | 34 |
| 14 | iPhone 14 / 15 / 16 | 393 × 852 | 3 | 59 | 34 |
| max | iPhone 14–16 Pro Max | 430 × 932 | 3 | 59 | 34 |
| pro | iPhone 16 Pro | 402 × 874 | 3 | 59 | 34 |
| land | iPhone 14/15/16 landscape | 852 × 393 | 3 | 0 | 21 |
| pad | iPad Pro 12.9" portrait | 1024 × 1366 | 2 | 24 | 20 |

Games sampled: five-nights, hardwater, cash-out, basement-defense, temple-dash,
pinball-flip, jewel-swap, rooftop-run, tank-arena, word-duel, cascade-match.

## Results

`✓` = passes now. `✗ → ✓` = failed before this change, fixed here.

| Check | SE | mini | 14 | max | pro | land | pad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Nothing clipped by notch / island / home indicator | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✓ | ✓ |
| 2. Canvas fills the card, correct aspect, no letterbox | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3. All chrome reachable, tap targets ≥ 44 × 44 | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✗ → ✓ | ✓ |
| 4. No text overflow / bad truncation | ✗ → ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5. Card snaps to a full screen, no half-card peek | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6. Game-over sheet fits and is actionable | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ → ✓ | ✓ |
| 7. Sheets (tuner, ranks, settings) fit and scroll | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8. No horizontal overflow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9. Ships the app itself, not the desktop preview shell | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ → ✓ |

## Failures found, and what was done

### F1 — Game HUDs drew underneath the status bar and Dynamic Island

`temple-dash` painted its timer at y = 24, `pinball-flip` its ball count at
y = 24, `jewel-swap` its countdown bar at y = 0.03 × H — all inside the 50–62 pt
the system reserves. On every notched device that text sat behind the clock.
21 games in the catalog drew a HUD inside the top inset.

**Fixed.** `GameContext` (and the `Api` the kit hands blueprints) now carries
`safeTop` / `safeBottom` in the same logical pixels the game draws in.
`GameHost` resolves them from a probe element whose padding is
`var(--safe-top)` / `var(--safe-bottom)`, so the browser has already turned
`env()` into pixels before the value is read. Every offending game offsets its
HUD by `safeTop`. Verified: on 393 × 852 the `temple-dash` timer moved from
y = 19 to y = 78.

### F2 — The swipe hint sat under the home indicator

The grabber and "swipe up or down to move on" were pinned at `pb-3`, i.e. 12 pt
from the bottom edge — inside the 34 pt home-indicator strip on every device
with one.

**Fixed.** `pb-[calc(var(--safe-bottom)+12px)]`. Measured on 393 × 852: hint
bottom 806, safe limit 818.

### F3 — The tuner pill collided with the score at 375 pt

`Tune your feed` (129 pt wide) plus a centred score of any length overlapped on
the two 375-pt-wide devices — clearly visible as "Tune your feed" running
through "70 chips" on the SE.

**Fixed.** The pill's label is now `Tune`, the pill is capped at `max-w-[30%]`
and truncates, and the score column is bounded to `w-[46%]` centred. Those three
percentages cannot overlap at any width, so the collision is gone by
construction rather than by a magic pixel offset.

### F4 — Tap targets below 44 × 44

Measured on the SE: rail buttons 29 × 45, the account button 88 × 15, the
now-playing music chip 25 pt tall, the settings / search / games chrome 40 × 40,
the in-play controls button 40 × 40, the sheet close button 36 × 36.

**Fixed.** `RailButton` gets `min-h-11 min-w-11`, the account buttons and the
music chip get `min-h-11`, and every 40 pt or 36 pt chrome button is now 44 pt.
Re-audited on all five portrait sizes: zero elements under 44 × 44.

### F5 — Landscape broke

At 852 × 393 the game-over sheet was taller than the screen and "Play again"
was unreachable, and the right-hand rail ran off both the top and the bottom of
the screen (its last button measured 379 against a 372 pt limit).

**Fixed.** The death screen is now `overflow-y-auto` with safe-area padding and
`my-auto` on the card, so it centres when it fits and scrolls when it does not
(measured 659 pt of content in a 393 pt viewport, fully scrollable). The rail is
anchored to `calc(var(--safe-bottom) + 112px)`, capped at the height left inside
the safe area, and scrolls rather than overflowing.

The App Store target is already locked to portrait —
`ios/App/App/Info.plist` declares `UISupportedInterfaceOrientations` as
`UIInterfaceOrientationPortrait` alone — so on device this never happens. The
fixes above are defence in depth, and they matter for the web build, which any
visitor can rotate.

### F6 — iPad rendered the desktop preview shell

`DevicePreview` framed the app whenever the viewport was ≥ 1000 pt wide, so at
1024 × 1366 an iPad got a fake phone on a dark stage with a device picker
underneath it, rather than the app.

**Fixed.** The frame now requires `(min-width: 1000px) and (pointer: fine)`, so
a touch tablet gets the app full bleed. Verified at 1024 × 1366: card and canvas
both 1024 × 1366, no clipping, no small tap targets.

The App Store submission itself is iPhone-only — `TARGETED_DEVICE_FAMILY = 1`
in `ios/App/App.xcodeproj/project.pbxproj` — so an iPad only ever sees this
through the web build or iPhone compatibility mode. Either way it now gets the
app rather than a picture of a phone.

## Checks that already passed

- **100vh vs 100dvh.** The card height comes from `--app-h`, which is `100dvh`
  on device, so iOS Safari's collapsing toolbar never leaves a half card.
  Measured card height equal to the viewport on every size, and the feed uses
  `snap-y snap-mandatory` with `snap-start snap-always` per card.
- **Canvas scaling.** The canvas is always the full card and its backing store
  is `min(2, dpr)` — 750 × 1334 on the SE, 860 × 1864 on a Pro Max. No
  letterboxing and no aspect distortion at any size; games lay out against the
  measured box and remount when it changes.
- **Sheets.** Capped at `calc(var(--app-h) * 0.8)` with `pb-[var(--safe-bottom)]`
  and internal scrolling — on the SE the tuner is 375 × 533 over 591 pt of
  content and scrolls cleanly.

## Known cosmetic behaviour, not fixed

Browsing chrome (the tuner pill, the settings / search / games buttons) floats
over the card and can sit on top of whatever the game happens to be drawing in
that corner. That is the app's existing design — the chrome fades out entirely
the moment play starts, which is the state that matters.

## How this was measured

The app was loaded in an iframe sized to the exact logical viewport, so media
queries, `dvh` and layout all resolve against the device size rather than the
browser window. Insets were injected as `--safe-top` / `--safe-bottom`, matching
what iOS reports through `env(safe-area-inset-*)`. For every viewport a script
walked every visible interactive element and reported anything above the top
inset, below the bottom inset, off-screen horizontally, or smaller than
44 × 44 pt, alongside the canvas size, its backing store and the card rect.
