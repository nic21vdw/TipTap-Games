# The two photographs

Drop these two files in this folder and the whole feed changes. Nothing else
needs editing — the wiring is already in place.

| File | What it is | Where it shows up |
|---|---|---|
| `basement.jpg` | The room: kitchen, desk, drum kit, ping pong table | The backdrop behind **every** game, all 105 of them |
| `headshot.png` | The headshot, aviators on, indoors | The face on the result card at the end of every run |

## How it works

`games/nic-photo.ts` loads both lazily, once per session, and exposes
`drawBasement()` and `drawHeadshot()`.

- `games/fx.ts` → `drawBackdrop()` calls `drawBasement()`. That covers the
  sixteen hand-rolled games.
- `games/kit.ts` → `sky()` calls it too. That covers the hundred catalog games
  built on `defineGame`.
- `games/fx.ts` → `resultCard()` calls `drawHeadshot()`.

The room photo becomes the ground layer and each game's generated wash drops to
50% opacity on top of it, so every card still reads in its own palette instead
of turning into one flat brown feed.

## If the files are absent

Every helper returns `false` and each caller falls through to the art it always
drew. No broken images, no blank cards, no build failure — the feed just looks
the way it does today. That is why this folder is checked in with only a readme:
the code is safe to ship before the photographs land.

## Format notes

- `basement.jpg` is drawn **cover-fit** and centre-cropped to a 390×844 portrait
  card. A wide landscape strip works, but the middle of the frame is what
  survives the crop — put the desk and the drum kit near the centre.
- `headshot.png` is circle-masked at 60px. Anything roughly square works; the
  face should be centred and reasonably tight.
- Keep both under ~400KB. They are fetched once and cached for the session, but
  they are on the critical path for the first card's backdrop.
