# Mobile readiness review

Adversarial pre-submission review of Tip Tap Games against an iOS App Store
release. Two questions: is anything glitching or broken, and is this actually
mobile-ready rather than desktop-with-a-phone-frame.

## How it was tested

- `npx next dev --hostname 127.0.0.1 --port 3012`, driven in Chrome.
- 16 consecutive synthetic swipes using a real `pointerdown`/`pointermove`/
  `pointerup` stream with `pointerType: "touch"` plus matching
  `touchstart`/`touchmove`/`touchend`, at a 500 x 859 viewport (the full-bleed
  phone layout, not the framed preview), while recording `window.onerror`,
  `unhandledrejection`, `console.error`, `window.__rafActive`,
  `performance.memory`, DOM node count and a global
  `addEventListener`/`removeEventListener` ledger.
- A headless harness that mounted all **105 catalog games** in turn against a
  390 x 780 canvas, drove each one through 60–90 frames by replacing
  `requestAnimationFrame` with a manually-pumped queue, sampled the pixel
  buffer for paint and motion, timed every frame callback, then called
  `destroy()` and checked the `__rafActive` counter returned to its
  pre-mount value.
- Static sweeps of `games/**` for listener/timer/rAF balance, of every
  `pointermove` handler in `games/**` for gesture conflicts, and of
  `lib/music.ts` for iOS audio-session behaviour.

Live measurement was done in a desktop Chrome window; iOS-specific claims
below are reasoned from WebKit behaviour and marked as such rather than
measured on a device. Nothing here was verified on real hardware — that is
the one gap this review cannot close.

## What is healthy

These were the most likely places to find a blocker, and they are clean.

- **Zero console errors and zero unhandled rejections** across 16 swipes and
  105 game mounts. Nothing threw.
- **Zero zombie rAF loops.** `window.__rafActive` read exactly `1` after
  every one of the 16 swipes, and every one of the 105 games returned the
  counter to its pre-mount value on `destroy()`. `games/engine.ts:41-48`
  is doing its job.
- **Zero listener leaks inside `games/`.** 246 `addEventListener` calls,
  246 `removeEventListener` calls, matched per file, per target and per
  handler identity. No anonymous handlers anywhere, so every registration is
  removable by construction. No `setInterval` in `games/` at all.
- **All 105 games mount, paint and tear down.** No module throws on mount, no
  module throws on destroy, none renders a blank or single-colour canvas.
  The games that show no motion without input are the tap/puzzle set, which
  the feed drives through `autoplay()`.
- `--app-h: 100dvh` (`app/globals.css:20`) — no `100vh` bug anywhere in the
  app, so the iOS URL-bar collapse does not clip the feed.
- `viewport-fit=cover` plus the `--safe-top` / `--safe-bottom` seam is
  correctly plumbed and actually used by the HUD and the caption block.
- `overscroll-behavior: none` on `html`, `body` and the feed root: no
  rubber-band, no scroll chaining.

---

# Blockers

## B1. The feed's swipe-to-advance steals the gesture out of 26 games — FIXED

**Where:** `components/feed/GameCard.tsx:112-134` (the capture-phase pointer
handlers) and `components/feed/GameCard.tsx:650-662` (`detectSwipe`), with
thresholds at `components/feed/GameCard.tsx:645-648`.

**What happens:** while a card is playing, the `<section>` watches the pointer
stream in the capture phase. Any gesture that travels 40px vertically inside
550ms — or 90px at any speed — with the vertical component beating the
horizontal by 1.2x is claimed as a feed swipe. `leaveTo()` runs, `exitPlay()`
sets the canvas to `pointer-events: none`, and the card scrolls away.

The comment at `components/feed/GameCard.tsx:107-109` asserts "No game control
is an upward drag, so the two never compete." That is not true. Of the 43 game
modules that register a `pointermove` listener, **26 have a control that
requires more than 40px of vertical travel**, so the shell aborts the gesture
mid-drag and the game never receives `pointerup`.

Ranked by severity, with the line where the vertical component is consumed:

| Game | File | Control |
|---|---|---|
| wing-slingshot | `games/wing-slingshot/index.ts:145` | pull back and release to fling; launch only happens in `onUp` |
| duel-fling | `games/duel-fling/index.ts:85` | artillery slingshot, `dy` becomes the launch `vy` |
| paper-toss-wind | `games/paper-toss-wind/index.ts:143` | upward flick to throw; needs `vy < -180`, i.e. exactly the stolen gesture |
| side-blaster | `games/side-blaster/index.ts:124` | pointermove is **Y-only**; drag up and down to change firing lane |
| break-pool | `games/break-pool/index.ts:157` | pull back from the cue ball up to ~120px and release |
| mote-absorb | `games/mote-absorb/index.ts:88` | drag and release to eject mass; the entire control lives in `onUp` |
| limb-flail | `games/limb-flail/index.ts:92` | wind each leg up over 90px of vertical drag |
| track-draw | `games/track-draw/index.ts:88` | draw a whole sled track freehand |
| path-control | `games/path-control/index.ts:137` | trace a full flight route |
| territory-claim | `games/territory-claim/index.ts:151` | Qix-style: lead the cursor across the field and back |
| patience-deck | `games/patience-deck/index.ts:232` | drag a card from a column to a foundation |
| block-clear | `games/block-clear/index.ts:224` | drag a shape out of the bottom tray onto the grid |
| pipe-flow | `games/pipe-flow/index.ts:206` | lay pipe cell by cell across rows |
| channel-dig | `games/channel-dig/index.ts:138` | trace a channel down through the dirt |
| dot-chain | `games/dot-chain/index.ts:116` | drag through adjacent dots |
| hardwater | `games/hardwater/index.ts:295` | virtual stick, full deflection ~65-90px |
| hole-maze | `games/hole-maze/index.ts:122` | tilt the maze, 70px for full tilt |
| collect-hunt | `games/collect-hunt/index.ts:150` | floating joystick, 50px full deflection |
| blob-absorb | `games/blob-absorb/index.ts:118` | lead the blob with your finger |
| coil-arena | `games/coil-arena/index.ts:192` | steer the snake in 2D |
| tank-arena | `games/tank-arena/index.ts:147` | drive to the finger position |
| drift-field | `games/drift-field/index.ts:136` | aim/thrust toward the finger, 360° |
| asteroid-drift | `games/asteroid-drift/index.ts:90` | same 2D thrust steering |
| rage-climb | `games/rage-climb/index.ts:92` | swing the pick by circling the finger |
| gauntlet-micro | `games/gauntlet-micro/index.ts:155` | a micro-challenge whose win condition is "swipe up 36px" — 4px under the shell's steal threshold |
| sphere-chain | `games/sphere-chain/index.ts:237` | 360° aim; least severe, since it fires on `pointerdown` |

**Why it matters on iOS specifically:** on a desktop this is invisible — the
handlers bail out for `pointerType === "mouse"` (`GameCard.tsx:113`) and the
wheel drives the feed instead. The bug exists *only* for touch. It is a
quarter of the catalog that plays correctly on the reviewer's laptop and is
unplayable on the reviewer's phone, which is also the exact failure mode
most likely to draw an App Store rejection under 2.1 (app completeness).

**Fix (shipped):** the feed now decides who owns a vertical drag from a
runtime signal taken off the game itself, not from a hand-kept list.

1. `GameHost` swaps the canvas's own `addEventListener` for a recording
   wrapper for exactly the duration of the module's `mount()` call, notes
   whether the game registered `pointermove`, `touchmove` or `mousemove`, and
   puts the original method back in a `finally` (`GameHost.tsx:31-52`,
   `GameHost.tsx:154`). The flag goes out to the card through `onDragControl`
   and onto the canvas as `data-drag-control` for testability. Every
   `pointermove` in `games/**` is registered synchronously at the top level of
   `mount`, and a player-generated game runs a shipped engine's `mount`
   through `games/custom.ts`, so both are classified with no annotation and no
   upkeep. A sweep of all 105 catalog modules through this exact wrapper
   returns 43 drag-controlled and 62 tap-only, which matches the static count
   of `pointermove` registrations file for file, and covers all 26 games
   listed above.
2. A game that registered a move handler no longer arms the full-surface
   swipe at all (`GameCard.tsx:112-131`). For those the feed answers only to a
   gesture that starts on the handle.
3. The grabber pill is that handle. It was `pointer-events: none` decoration;
   for a drag-controlled game it is now a live 120x44 target — over Apple's
   44x44pt floor — with `touch-action: none`, a scrim behind it and a fatter
   bar, so it reads as a handle rather than an ornament
   (`GameCard.tsx:284-320`). For a tap-only game it stays inert decoration and
   the whole card keeps catching the swipe, so the 62 tap games lose no
   surface.
4. The touch hint now tells you where the handle is: "swipe from the handle
   above to move on" for a drag game, the old "swipe up or down to move on"
   for a tap game. The fine-pointer copy is unchanged.
5. Keyboard (↑ ↓) and wheel navigation are untouched — they live in
   `Feed.tsx` and never went through the card's pointer handlers.

`leaveTo()` (`components/feed/GameCard.tsx:91-105`) still dispatches a
`pointercancel` to the canvas before handing control back, so a game caught
mid-drag on the handle path can unwind. Games that do not yet listen for
`pointercancel` should still be taught to.

**How it was verified:** dev server on 127.0.0.1:3002, driven in Chrome with
synthetic `pointerdown`/`pointermove`/`pointerup` streams at
`pointerType: "touch"` plus matching touch events, against the 402x874 phone
layout.

| Check | Result |
|---|---|
| `wing-slingshot` pull-back (140px up, mid-canvas) | full stream reaches the canvas, no `pointercancel`, card stays on index 0, canvas stays `pointer-events: auto` throughout |
| same gesture on the pre-fix build | canvas receives `pointercancel` mid-drag and the feed advances — the bug, reproduced |
| `duel-fling` slingshot | delivered, no advance |
| `patience-deck` card drag to the foundation row | delivered, no advance |
| `side-blaster` lane drag | delivered, no advance |
| handle swipe on all four | advances one card |
| `one-gap` (tap-only) swipe from mid-canvas | advances one card, as before |
| ↑ ↓ over six consecutive drag-controlled cards | advances every time |
| wheel down then up while playing `wing-slingshot` | 0 → 1 → 0 |
| all 105 modules through the classifier | 43 drag, 62 tap; all 26 games listed above classified drag |

## B2. WebAudio is muted by the iPhone ring/silent switch — FIXED

**Where:** `lib/music.ts:263-275`.

**What happened:** the app creates one `AudioContext` and never declares an
audio session type. iOS routes an undeclared WebAudio graph through the
*ambient* session, which the hardware ring/silent switch mutes outright. Every
iPhone user with the switch flipped — a large fraction of them — would have
got total silence while the now-playing chip cheerfully displayed the track
name, BPM and a bouncing equaliser. Indistinguishable from a bug, and
unreproducible on any desktop.

**Fix (shipped):** `navigator.audioSession.type = "playback"` immediately
after the context is constructed, guarded for the browsers that do not expose
it (Safari 16.4+ only). This is the same declaration a native music app makes,
and it is what makes the soundtrack audible with the switch on silent.

## B3. Audio never comes back after a phone call or Siri — FIXED

**Where:** `lib/music.ts:376-383` and `lib/music.ts:305-317`.

**What happened:** `resumeMusic()` was gated on `ac.state === "suspended"`. An
iOS interruption — an incoming call, Siri, Control Center — leaves a WebKit
`AudioContext` in state `"interrupted"`, not `"suspended"`, so the guard was
false and the resume never fired. The soundtrack died permanently for the rest
of the session. Worse, iOS frequently does not fire `visibilitychange` for
these interruptions at all, so `Feed.tsx:191-195` never even ran.

**Fix (shipped):** the guard is now `ac.state !== "running"`, and the context
carries a `statechange` listener that arms a one-shot `pointerdown`/
`touchstart` re-resume whenever it drops out of `running` while unlocked and
visible — because on iOS only a gesture is allowed to bring it back.

## B4. The feed keeps every card it has ever shown — PARTIALLY FIXED

**Where:** `store/useFeedStore.ts:147-156` (`ensureAhead` appends and nothing
ever trims) and `components/feed/GameCard.tsx:230-243`.

**What happens:** `cards` is append-only. After 16 measured swipes the DOM held
**31 `<section>` elements and 3,412 nodes**; the JS heap moved from 81 MB to a
sawtooth peaking at 116 MB. Extrapolated over a real TikTok-style session —
which is the entire product premise — this grows without bound. Every card
also rendered its full chrome whether or not it was on screen: the seven-button
action rail, the caption, the score HUD, a `SoundRail`/`VolumeSlider` with its
own `wheel` listener, and a `useFinePointer` `MediaQueryList` listener. The
listener ledger showed exactly this: **+20 `MediaQueryList:change` and
+20 `div:wheel` net registrations across 16 swipes**, one of each per new card,
never released.

**Why it matters on iOS specifically:** Safari and WKWebView on iOS run under
jetsam. A tab that climbs past a few hundred MB is killed outright with no
crash log the user can act on — it simply "closes itself" mid-run. Unbounded
growth tied to session length is the classic way to hit it.

**Fix (shipped, partial):**
- Off-screen cards now render the poster and nothing else — no rail, no
  caption, no HUD, no listeners (`components/feed/GameCard.tsx:230-243`).
  Measured after the change: 11 cards, **2 action rails** instead of 11, and
  1,339 DOM nodes.
- `useFinePointer` now shares a single `MediaQueryList` and a subscriber set
  across the whole feed instead of opening one per card
  (`components/feed/nav.ts:36-64`).

**Not fixed:** the `cards` array itself is still append-only. `PROJECT.md`
makes "a card is never dropped from the list once it's been shown" a hard
rule, so capping it is a charter decision, not a bug fix. The recommendation
is to cap history at a generous fixed window (40-50 cards behind the active
one) and let the sampler re-mint anything older; the "scroll back to the game
you just left" guarantee is satisfied by a window far smaller than infinity.

---

# Should-fix

## S1. Double-tap-to-zoom fires on iOS — FIXED

`app/layout.tsx:20-25` set `maximumScale: 1, userScalable: false`. **iOS Safari
has deliberately ignored both since iOS 10**, for accessibility. So the app had
no protection at all against double-tap zoom: a fast double tap on any tap-to-
play game — which is most of them — could zoom the viewport mid-run.

**Fix (shipped):** `touch-action: manipulation` on `html, body`
(`app/globals.css:39`), which iOS *does* honour and which removes both the
double-tap zoom gesture and the legacy click delay, while leaving pinch-zoom
available. `maximumScale` and `userScalable` were dropped from the viewport
because they bought nothing on iOS and were a WCAG 1.4.4 violation everywhere
else.

## S2. Long-press selects text and raises the callout menu — FIXED

Nothing disabled selection: `-webkit-user-select` computed to `auto` on
`body`, and `-webkit-touch-callout` was unset. On iOS a hold on the caption,
the title or the score — all of which sit over a live game — pops the
selection handles and the copy/share callout, and the game loses the gesture.

**Fix (shipped):** `user-select: none` and `-webkit-touch-callout: none` on
`html, body`, re-enabled for `input`, `textarea` and `[contenteditable]`
(`app/globals.css:40-53`).

## S3. Action rail tap targets are 26-32px wide — FIXED

Measured on the live page: Like 29x48, Ranks 28x45, Tune 26x45, Theme 32x45,
Sound 29x45, Share 26x45, and the account button 60x**15**. Apple's HIG floor
is 44x44pt. Every one of these sits in the bottom-right thumb arc where
accuracy is worst.

**Fix (shipped):** `min-h-[44px] min-w-[44px]` and
`touch-action: manipulation` on `RailButton`
(`components/feed/RailButton.tsx:16-19`).

## S4. `theme-color` never followed the theme — FIXED

`app/layout.tsx:26` pinned `themeColor` to the Coast light default and
`applyThemeToDom` never touched it (`lib/themes.ts:177-193`). Switching to
Arcade Dark or 8-Bit left iOS painting a `#f4f8fd` band behind the status bar
and the home indicator, over a black feed.

**Fix (shipped):** `applyThemeToDom` now writes the live theme's `bg` into the
`theme-color` meta (`lib/themes.ts:191-196`).

## S5. Unhandled promise rejection on the first card — FIXED

`playFor()` called `c.resume().then(onOk)` with no rejection handler. That call
runs on the mount path, outside any gesture, which is precisely when iOS
rejects `resume()` — so an unhandled rejection fired on every first card load.

**Fix (shipped):** both outcomes are handled, and `resume` is called through
`Promise.resolve(c.resume?.())` so the legacy `webkitAudioContext` path
(where `resume` may be absent or non-promise) cannot throw a `TypeError`
(`lib/music.ts:339`, `lib/music.ts:978-986`).

## S6. Two games are over the 60fps frame budget, and five hitch mid-run

Frame-callback cost at 390 x 780, dpr 1, on a desktop CPU:

| Game | p50 | worst frame |
|---|---|---|
| cascade-match | 14.3 ms | 36.7 ms (frame 0) |
| pop-chain | 12.9 ms | — |
| dot-chain | 7.7 ms | 22.6 ms (frame 0) |
| patience-deck | 5.5 ms | — |
| tilt-match | 5.3 ms | — |
| jewel-swap | 4.6 ms | 153 ms (frame 0) |

Everything else sits at or under 3 ms p50; the median game is 0.4 ms, so the
engine is not the problem — these six specific match-3/chain boards are.

Discrete hitches, by frame index within the run:

| Game | Hitch |
|---|---|
| black-keys | 375 ms at frame 40, 127 ms at 46, **583 ms at 49** — repeating, mid-run |
| rage-climb | 263 ms on frame 0 |
| nokia-mode | 153 ms at frame 18, 180 ms at 21 |
| jewel-swap | 153 ms on frame 0 |
| cash-out | 50 ms on frame 0 |
| peg-drop | 70 ms inside `mount()` on a cold JIT |

**Why it matters on iOS specifically:** the budget is 16.7 ms per frame. A
14.3 ms median leaves 2 ms of headroom on a *desktop*; an iPhone is running
the same JS with a backing store scaled by `min(2, devicePixelRatio)`
(`components/feed/GameHost.tsx:100-105`), so a 390-wide card is filling
780 x 1560 — four times the pixels these numbers were measured against.
`cascade-match` and `pop-chain` will not hold 60fps on an iPhone. `black-keys`
producing a repeating half-second stall mid-run reads as a freeze, not a drop.

**Fix:** profile those six boards specifically. The frame-0 spikes
(`jewel-swap`, `rage-climb`, `cash-out`) are board generation and cascade
resolution done inside the first frame; move that into `mount()` or amortise
it. `black-keys`' repeating stall at a regular frame interval looks like a
periodic allocation or a full-board rebuild and should be the first one
opened. `PROJECT.md` also requires `mount` to return instantly — `peg-drop`
at 70 ms does not.

## S7. Haptics are a no-op on every iPhone

**Where:** `lib/haptics.ts:9-16`.

`haptic()` is implemented entirely on `navigator.vibrate`. **iOS Safari has
never supported the Vibration API**, and neither does WKWebView. Every
`ctx.haptic("hit")` a game fires, and every `haptic()` the shell fires on a
like, a swipe, a best score and a death, does nothing on the target platform.
The code is written as though tactile feedback is part of the feel; on iPhone
it is silently absent.

**Fix:** for the App Store build, bridge to `UIImpactFeedbackGenerator` from
the native wrapper and call it through a `window.webkit.messageHandlers`
channel, with the `navigator.vibrate` path kept as the web fallback. On the
web build there is no fix — document it as web-only.

## S8. The AudioContext and ~4 seconds of buffers are built before any gesture

**Where:** `lib/music.ts:250-290`, reached from `Feed.tsx:178-188` →
`useMusicStore.cue()` → `playFor()` (`lib/music.ts:970`).

The context is constructed on feed mount, then synchronously fills a 2-second
noise buffer and a 1.7-second stereo reverb impulse on the main thread —
before the user has touched anything. On an iPhone that is a visible hitch
during the first paint, and the context it creates starts `suspended` and does
nothing until the first gesture anyway.

**Fix:** bail out of `playFor` with `if (!ac && !unlocked) return spec;` so the
graph is only built once `unlockAudio()` has run. The existing
"cued before the gesture" catch-up at `lib/music.ts:333-336` already handles
the deferred start. Left unshipped because it touches the music engine's
start-up ordering and deserves an audible check.

## S9. Nothing handles iOS app suspension or bfcache restore

**Where:** `components/feed/GameHost.tsx:166-187` and `Feed.tsx:191-195`.

The only lifecycle signal the app listens to is `visibilitychange`. iOS also
fires `pagehide`/`pageshow` with `event.persisted` when a page enters and
leaves the back/forward cache, and suspends a backgrounded WKWebView outright.
On restore from bfcache the rAF loop and the audio graph are not guaranteed to
have been resumed by a `visibilitychange` that never fired.

**Fix:** add `pageshow` (resume when `persisted`) and `pagehide` (pause)
alongside the existing `visibilitychange` handlers in both places.

## S10. No Apple web-app metadata

`app/layout.tsx` emits no `apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style`, or `apple-touch-icon`. Added to the
Home Screen — which the "shop window for an App Store app" framing invites —
the app opens in a Safari chrome with a default icon.

**Fix:** add the three metas, plus a 180x180 `apple-touch-icon.png` in
`public/`.

---

# Nice-to-have

## N1. No `--safe-left` / `--safe-right`

`app/globals.css:21-22` defines `--safe-top` and `--safe-bottom` only. In
landscape on a notched iPhone, `env(safe-area-inset-left/right)` is 59px and
nothing accounts for it — the right-hand action rail and the caption block sit
under the sensor housing and the rounded corners. Harmless if the App Store
build is portrait-locked, which it should be; add the two tokens if it is not.

## N2. The desktop/iPhone switch breaks at tablet widths

`components/shell/DevicePreview.tsx:74` sets `DESKTOP_MIN = 1000`. An iPad in
portrait (834pt) gets the full-bleed phone layout with no frame and no switch;
the same iPad rotated to landscape (1194pt) suddenly renders a 402pt phone
frame in the middle of the screen. Neither is wrong, but the transition is
abrupt and the framed mode is not what an iPad user wants. Consider gating the
frame on `(pointer: fine)` as well as width.

## N3. Dead timer in duel-fling — FIXED

`games/duel-fling/index.ts:133` held a `setTimeout(() => {}, 0)` — an empty
body on a zero delay, a vestigial enemy-turn delay that had been gutted.
Removed.

## N4. `GameHost`'s theme-subscriber rAF is not cancelled

`components/feed/GameHost.tsx:178` schedules a one-shot repaint frame that is
never cancelled on unmount. Not a leak: it self-terminates, and if it lands
after teardown it only calls `inst.pause()`, which `games/engine.ts:42`
short-circuits on an already-stopped loop. Noted so it is not re-flagged.

---

# What was fixed in this branch

| # | Fix | Files |
|---|---|---|
| B2 | Declare the iOS `playback` audio session so the silent switch stops muting the soundtrack | `lib/music.ts` |
| B3 | Recover from an `"interrupted"` AudioContext, and re-arm a resume on the next gesture | `lib/music.ts` |
| B4 | Off-screen cards render the poster only; one shared `MediaQueryList` for the whole feed | `components/feed/GameCard.tsx`, `components/feed/nav.ts` |
| B1 | Dispatch `pointercancel` to the canvas before the feed takes the gesture away | `components/feed/GameCard.tsx` |
| B1 | Classify drag-controlled games from a runtime signal and reserve the swipe for a live 44pt handle on those cards | `components/feed/GameHost.tsx`, `components/feed/GameCard.tsx` |
| — | `data-uid` on the card section, so the search sheet's "jump to this game" scroll target actually resolves | `components/feed/GameCard.tsx` |
| S1 | `touch-action: manipulation`; drop the viewport scale locks iOS ignores | `app/globals.css`, `app/layout.tsx` |
| S2 | Disable selection and the long-press callout outside form fields | `app/globals.css` |
| S3 | 44x44 minimum on every action-rail button | `components/feed/RailButton.tsx` |
| S4 | `theme-color` follows the live theme | `lib/themes.ts` |
| S5 | Handle the `resume()` rejection; tolerate a non-promise legacy `resume` | `lib/music.ts` |
| N3 | Remove the dead timer | `games/duel-fling/index.ts` |

`data-uid` was a real latent bug found while editing: `Feed.tsx:202` looks up
the scroll target with `[data-uid="…"]`, and no element in the tree carried the
attribute, so `jumpTo()` from the search sheet set a target that could never
resolve and the feed never scrolled to the chosen game.

# What was left, and why

- **B4's** unbounded `cards` array is governed by an explicit `PROJECT.md`
  hard rule; capping it is the charter owner's call.
- **S6**, the frame budget, needs a profiler on six specific game modules.
- **S7** needs a native bridge that does not exist in the web build.
- **S8**, **S9**, **S10**, **N1**, **N2** are small but each changes start-up
  ordering, lifecycle, or layout in a way that wants a device to verify
  against.

# The one caveat

Every measurement above came from desktop Chrome with synthetic touch events.
Chrome's touch emulation is not WKWebView. Before submission, at minimum:
the silent-switch fix, the interrupted-context recovery, the tap targets and
the double-tap-zoom behaviour need ten minutes on a real iPhone, because all
four are behaviours that only exist there.
