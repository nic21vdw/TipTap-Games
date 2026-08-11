# Shipping Tip Tap Games to the iOS App Store

Everything the engineering side needs is in this repo and verified. What is
left is the part only the account holder can do: minting certificates,
creating the app record, and pressing Submit.

**Team ID:** `PQ9WNUPKUK` · **Apple ID:** nic21vdw@gmail.com
**Bundle ID:** `com.nicvandewetering.tiptapgames`
**Version:** 1.0.0 · **Build:** stamped by CI from the workflow run number

**Total extra cost: $0.** The $99 USD/year Apple Developer Program membership
is already paid. Certificates, provisioning profiles, App Store Connect and
App Store hosting are all included. GitHub Actions macOS minutes are free on a
public repo; on a private repo they bill at 10× the Linux rate, so budget
roughly 15–20 minutes of macOS time per release build.

---

## What was built, in one paragraph

The iOS app is a Capacitor shell around a **static export of the Next.js app
that is bundled inside the binary**. Every one of the 105+ games, the
algorithm tuner, the themes, the soundtrack and all local scoring
ship in the `.ipa` and run with the phone in airplane mode. The app makes
exactly one optional network call — `POST /api/generate`, when you type a wish
into the generator — and falls back to the on-device designer when that call
fails. As CI builds it today the iOS app ships **guest-only**: no sign-in, no
Supabase, no analytics, no third-party SDK of any kind. Since PR #49 that holds
because the workflow omits the Supabase environment variables, not because the
code forbids it — read
[Sign in with Apple](#511--48-sign-in-with-apple) before you change that. See
[Rejection risks](#rejection-risks-and-how-each-one-is-handled) for the rest.

---

## 1. Things only you can do

### Step 1 — Register the App ID (5 min, free)

1. Go to <https://developer.apple.com/account/resources/identifiers/list>.
2. Sign in as nic21vdw@gmail.com.
3. Click the blue **+** next to *Identifiers*.
4. Choose **App IDs** → Continue → **App** → Continue.
5. Description: `Tip Tap Games`.
   Bundle ID: select **Explicit** and enter exactly
   `com.nicvandewetering.tiptapgames`.
6. **Capabilities: tick nothing.** The app needs no entitlements — no push,
   no Sign in with Apple, no Game Center, no iCloud. Every capability you tick
   is a question App Review will ask you to justify.
7. Continue → Register.

### Step 2 — Create the Apple Distribution certificate (10 min, free)

The Developer ID certificate in `C:\Users\nic21\colateral-keys\apple\` is for
**Mac apps distributed outside the App Store**. It cannot sign an iOS App
Store build. You need a new, different certificate: **Apple Distribution**.
Leave the existing key material where it is.

You need a Certificate Signing Request. You can make one on Windows with the
OpenSSL that is already on this machine — no Mac required:

```bash
mkdir -p ~/appstore-keys/ios && cd ~/appstore-keys/ios
openssl genrsa -out ios_distribution.key 2048
openssl req -new -key ios_distribution.key -out ios_distribution.csr \
  -subj "/emailAddress=nic21vdw@gmail.com/CN=Nic Van De Wetering/C=CA"
```

Then:

1. Go to <https://developer.apple.com/account/resources/certificates/list>.
2. Click **+**.
3. Under *Software*, choose **Apple Distribution** → Continue.
4. Upload `ios_distribution.csr` → Continue → **Download** the
   `distribution.cer` file.
5. Convert the pair into the `.p12` that CI needs:

```bash
cd ~/appstore-keys/ios
openssl x509 -inform DER -in distribution.cer -out distribution.pem
openssl pkcs12 -export -legacy -macalg sha1 \
  -inkey ios_distribution.key -in distribution.pem \
  -certfile AppleWWDRCAG3.pem \
  -out ios_distribution.p12 -name "Apple Distribution"
```

Choose a password at the prompt and keep it — that is
`IOS_DIST_CERT_PASSWORD`.

> **`-macalg sha1` is not optional.** OpenSSL 3 writes a SHA-256 integrity MAC
> by default, and macOS `security import` cannot verify it. CI fails with
> `MAC verification failed during PKCS12 import (wrong password?)` even though
> the password is correct — `openssl pkcs12` opens the very same file happily,
> which makes it look like anything except what it is. This cost several CI
> runs to find. If you see that error, the MAC is the cause, not the password.

Generate the password with `openssl rand -hex 24`, not `-base64`. On Git Bash
for Windows `openssl rand` terminates its output with `\r\n`, and stripping only
`\n` leaves a carriage return inside the password; hex output also avoids `+`,
`/` and `=`, which are awkward to pass through shells.

`AppleWWDRCAG3.pem` is Apple's intermediate, converted from
<https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer>. Chaining it into
the `.p12` means the runner does not have to already trust it.

> Keep `~/appstore-keys/ios/` out of any git repo. It is your identity.

### Step 3 — Create the App Store provisioning profile (3 min, free)

1. Go to <https://developer.apple.com/account/resources/profiles/list>.
2. Click **+**.
3. Under *Distribution*, choose **App Store Connect** → Continue.
4. App ID: pick `Tip Tap Games (com.nicvandewetering.tiptapgames)` → Continue.
5. Certificate: pick the **Apple Distribution** certificate you just made →
   Continue.
6. Provisioning Profile Name: `Tip Tap Games App Store` → Generate.
7. **Download** the `.mobileprovision` file.

### Step 4 — Give CI a way to upload (3 min, free)

Either of these works, and the workflow picks whichever one you loaded. Do the
second if the first is not available to you yet.

**4a — App Store Connect API key.** The better option: no password, no 2FA
prompt, and it never expires on you.

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>.
2. **Team Keys** tab → **+**.
3. Name: `GitHub Actions upload`. Access: **App Manager**. → Generate.
4. **Download the `.p8` file immediately — Apple only lets you download it
   once.**
5. Note the **Key ID** (10 characters, shown in the row) and the **Issuer ID**
   (a UUID at the top of the page).

> If the page shows a *Request Access* button instead of **+**, API access has
> not been granted to this account yet. Apple grants organizations before
> individuals and gives no ETA. Request it anyway — then use 4b and do not wait.

**4b — An app-specific password.** Same upload, authenticated as you.

1. Go to <https://account.apple.com/account/manage> → *Sign-In and Security* →
   **App-Specific Passwords** → **+**.
2. Label it `App Store upload` and copy the `xxxx-xxxx-xxxx-xxxx` string Apple
   shows once.
3. That string is `APPLE_APP_SPECIFIC_PASSWORD`, and your Apple ID
   (`nic21vdw@gmail.com`) is `APPLE_ID`.

It authenticates only `altool`; it cannot sign in to a website or read your
mail, and revoking it from that same page kills it instantly.

### Step 5 — Create the app record in App Store Connect (10 min, free)

1. Go to <https://appstoreconnect.apple.com/apps> → **+** → **New App**.
2. Platforms: **iOS** only.
3. Name: `Tip Tap Games` (see [Listing copy](#2-listing-copy-ready-to-paste)
   if that exact name is taken).
4. Primary Language: **English (Canada)** or **English (U.S.)**.
5. Bundle ID: pick `com.nicvandewetering.tiptapgames` from the dropdown. If it
   is not there, Step 1 did not save — go back.
6. SKU: `TIPTAPGAMES001` (internal only, never shown).
7. User Access: **Full Access** → Create.

### Step 6 — Put the secrets into GitHub (5 min, free)

Go to
<https://github.com/nic21vdw/TipTap-Games/settings/secrets/actions> and add
each of these as a **repository secret**. The names must match exactly.

| Secret name | What to paste |
|---|---|
| `IOS_DIST_CERT_P12_BASE64` | base64 of `ios_distribution.p12` from Step 2 |
| `IOS_DIST_CERT_PASSWORD` | the password you chose when exporting the `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | base64 of the `.mobileprovision` from Step 3 |
| `IOS_KEYCHAIN_PASSWORD` | any long random string you invent — CI uses it for a throwaway keychain |
| `APPLE_TEAM_ID` | `PQ9WNUPKUK` |
| `ASC_KEY_ID` | the 10-character Key ID from Step 4 |
| `ASC_ISSUER_ID` | the Issuer ID UUID from Step 4 |
| `ASC_KEY_P8_BASE64` | base64 of the `AuthKey_XXXXXXXXXX.p8` from Step 4 |

Optionally add a repository **variable** (not a secret) named
`NEXT_PUBLIC_API_ORIGIN` if the generator endpoint ever moves off
`https://tip-tap-games-roan.vercel.app`.

The reliable way to load them is from a file on stdin, in Git Bash:

```bash
cd ~/appstore-keys/ios
R=nic21vdw/TipTap-Games

base64 -w0 ios_distribution.p12               | gh secret set IOS_DIST_CERT_P12_BASE64 --repo $R
base64 -w0 Tip_Tap_Games_App_Store.mobileprovision | gh secret set IOS_PROVISIONING_PROFILE_BASE64 --repo $R
base64 -w0 ~/Downloads/AuthKey_XXXXXXXXXX.p8  | gh secret set ASC_KEY_P8_BASE64 --repo $R
printf '%s' "$(cat p12-password.txt)"         | gh secret set IOS_DIST_CERT_PASSWORD --repo $R
openssl rand -hex 24 | tr -d '\r\n'           | gh secret set IOS_KEYCHAIN_PASSWORD --repo $R
printf '%s' 'PQ9WNUPKUK'                      | gh secret set APPLE_TEAM_ID --repo $R
```

> **Never write `gh secret set NAME --body -`.** `gh` has no stdin convention
> for `--body`; it stores the literal one-character string `-`. Every secret set
> that way is silently wrong, `gh secret list` still shows a row for it, and the
> failure surfaces much later as a corrupt artifact on the runner — a `.p12`
> that base64-decodes to zero bytes, and a certificate password of `-`. Omit
> `--body` entirely so `gh` reads stdin.

Checking `gh secret list` proves only that a secret **exists**, never that it
holds the right bytes. The only real verification is a build.

### Step 7 — Run the build (2 min of clicking, ~15 min of waiting)

1. Go to
   <https://github.com/nic21vdw/TipTap-Games/actions/workflows/ios-release.yml>.
2. **Run workflow** → branch `main` → leave *build_number* blank → *upload*
   ticked → **Run workflow**.
3. When it goes green, the build appears in App Store Connect under
   **TestFlight** after 5–15 minutes of Apple-side processing. You will get an
   email if it fails processing.

Tagging a commit `ios-v1.0.0` and pushing the tag does the same thing.

### Step 8 — Fill the privacy nutrition label (5 min)

App Store Connect → your app → **App Privacy** → *Get Started*.

1. "Do you or your third-party partners collect data from this app?" →
   **No, we do not collect data from this app.**
2. Confirm and **Publish**.

That answer is truthful **for a build made without the Supabase environment
variables**, which is what CI produces — see
[Sign in with Apple](#511--48-sign-in-with-apple). It is exactly why the app was
built guest-only: no
sign-in, no analytics, no ad SDK, no crash reporter, no device identifier. The
one network call sends only the text you typed and carries no identifier.

**Privacy Policy URL is mandatory even when you collect nothing.** Paste:
`https://tip-tap-games-roan.vercel.app/privacy` (this repo ships that page).

### Step 9 — Fill the listing and the age rating (20 min)

Paste from [Listing copy](#2-listing-copy-ready-to-paste) below.

**Screenshots are shot, and live outside the repo** —
`C:\Users\nic21\Documents\tiptap-store-screenshots\`, six PNGs at exactly
1290 × 2796 (the 6.9-inch size App Store Connect asks for): a game mid-play,
the algorithm tuner with the *Next up* strip, the leaderboard, the themes
sheet, the full games list, and a spare game. Upload the first five in that
order — the tuner sits second on purpose, because it is the differentiator
(see [4.3 Spam](#43-spam--lots-of-similar-mini-games)).

They were captured off the **native bundle**, not the website, so they show
exactly what a phone shows: `npm run build:native`, serve `out/` on a local
port, and drive it in a headless Chromium at a 430 × 932 viewport with
`deviceScaleFactor: 3` — that lands on 1290 × 2796 with no cropping or
rescaling. Reshoot the same way after any UI change; a resized desktop capture
will be soft and Apple will show it full-bleed.

**Age rating** — App Store Connect → *Age Rating* → Edit. Answer honestly:

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | **Infrequent/Mild** | zombie defense, arena games |
| Horror/Fear Themes | **Infrequent/Mild** | Five Nights at Nic's Basement |
| Simulated Gambling | **None** | the casino card is not in the iOS build |
| Everything else | **None** | no realistic violence, drugs, sex, profanity, contests, unrestricted web access |

> **Why *None* is the honest answer.** *Cash Out* is a
> bank-it-before-it-busts multiplier game played with virtual chips that reset
> for free and cannot be bought — a gambling-shaped mechanic even so, and
> declaring it would push the app to the 16+/17+ tier and cost a casual game
> its discovery. So it is not in the App Store build at all: `games/registry.ts`
> drops every `casino`-tagged game when `NEXT_PUBLIC_NATIVE=1`, and the
> generator, the variant miner and the *High Roller* preset all follow that one
> filter, so nothing in the binary can hand a player a casino game. The web
> build keeps it. If a later version wants it on the phone, the rating moves
> up with it.

Also set:

- **Category:** Primary *Games → Arcade*, Secondary *Games → Casual*.
- **Price:** Free.
- **Availability:** all countries.
- **Content Rights:** "No, it does not contain, show, or access third-party
  content." (Every game, every note of music and all the art is original —
  nothing is streamed or licensed.)

### Step 10 — Submit for review (2 min, then 24–72 h of waiting)

1. In the version page, under *Build*, click **+** and pick the build CI
   uploaded.
2. Export compliance: App Store Connect may ask "Does your app use
   encryption?" — the answer is already baked into `Info.plist`
   (`ITSAppUsesNonExemptEncryption` = `false`) so the question should not
   appear. If it does, answer **No**.
3. **App Review Information** → *Notes*. Paste:

   > No account is needed and there is no sign-in — the app is fully playable
   > the moment it opens, offline. Swipe up for the next game, swipe down to go
   > back. The pill at the top left opens the algorithm tuner. All 105+ games
   > are bundled in the binary and require no network. The one optional network
   > call is the game generator (search icon → describe a game), which falls
   > back to designing on-device when offline.

   Leave the demo account fields empty — there is nothing to sign into.
4. Version Release: **Automatically release this version**.
5. **Add for Review** → **Submit to App Review**.

---

## 2. Listing copy, ready to paste

### App Name (30 char limit)

```
Tip Tap Games
```

If that name is taken, use:

```
Tip Tap Games: Swipe to Play
```

### Subtitle (30 char limit)

```
A feed of instant mini games
```

### Promotional Text (170 char limit — editable without a review)

```
105+ games in one endless feed. No menus, no loading, no tutorials. Swipe for the next one, and drag the sliders to steer what the algorithm hands you.
```

### Description (4000 char limit)

```
Tip Tap Games is a scrolling feed where every card is a game that is already running.

No menus. No loading screens. No "tap to start". The card lands, the game is live, you play. Swipe up and a completely different game is running before your thumb leaves the glass.

YOU CONTROL THE ALGORITHM
Every other feed decides for you. This one hands you the dial. Open the tuner and drag four sliders — calm to frantic, skill to chance, modern to 2008, more-of-this to surprise-me — and watch the Next up strip reorder before your eyes. Demand a tag, block a tag, or pick a preset. Your next swipe delivers exactly what you asked for. It is the only feed that argues back.

105+ GAMES, ALL DIFFERENT
Reflex tests, one-thumb runners, physics puzzles, tile matchers, memory drills, arena shooters, ice fishing, tower stacking, lane switching, word traps, and a haunted basement. Two of them render in full 3D. Each one is a whole idea in ten seconds, not a demo of a bigger game you have to buy.

MAKE YOUR OWN
Describe a game in a sentence — "something frantic with falling stuff" — and one gets built and dropped into your feed while you watch. It has a name, a colour, a difficulty curve, and a soundtrack of its own.

A SOUNDTRACK THAT DOESN'T REPEAT
Every game has its own song, pulled from a 67-track original catalogue that ships inside the app. Nothing is streamed, nothing is licensed from anyone — and every track drops on the first bar, because the intro was cut out before it got here.

SIX LOOKS, SWAPPED MID-GAME
Coast, Arcade Dark, 8-Bit with real scanlines, Skeuomorph '08, Neon Felt, and a purple basement. Switch while a game is running and it recolours without missing a frame.

WORKS WITH NO SIGNAL
Every game lives inside the app. On a plane, on the subway, in a dead spot — the feed keeps going. Your high scores are kept on your phone.

NO ACCOUNT. NO ADS. NO PURCHASES.
There is no sign-in screen, because there is no account. Nothing to buy, nothing to unlock, no ads, no timers, no energy bars, and no data collected about you. Open it and play.
```

### Keywords (100 char limit, comma-separated, no spaces after commas)

```
mini games,arcade,casual,offline,swipe,feed,reflex,puzzle,tap,quick,no wifi,free games,retro,fun
```

### URLs

| Field | Value |
|---|---|
| Support URL (required) | `https://tip-tap-games-roan.vercel.app/support` |
| Marketing URL (optional) | `https://tip-tap-games-roan.vercel.app` |
| Privacy Policy URL (**required**) | `https://tip-tap-games-roan.vercel.app/privacy` |

### "What's New in This Version" (for 1.0)

```
The first release. 105+ games, one feed, and an algorithm you steer yourself.
```

### Copyright

```
2026 Nic Van De Wetering
```

---

## 3. Rejection risks, and how each one is handled

### 4.2 Minimum Functionality — "this is just a website in a wrapper"

The single most likely rejection for any Capacitor app, and the reason the
build is shaped the way it is:

- **The web bundle is inside the binary, not loaded from a URL.**
  `capacitor.config.ts` has no `server.url`. There is no remote-content
  wrapper for Apple to find.
- **The app works in airplane mode.** Every game, the tuner, the themes, the
  soundtrack and all scoring are local. Turn the wifi off and nothing about
  the app changes.
- **It uses the device.** Native Taptic Engine haptics on hits and fails
  (`@capacitor/haptics`), native status bar control that follows the active
  theme, a native launch screen, and portrait lock at the OS level.
- **It is not a shrunk-down web page.** No browser chrome, no address bar, no
  desktop layout, no page scrolling, no zoom, no text selection, no long-press
  callout, no rubber-band overscroll. The device-preview frame that the
  website shows on a laptop is compiled out of the native build entirely.
- **The content is substantial.** 105+ distinct games is not a thin wrapper by
  any reading.

### 4.3 Spam — "lots of similar mini games"

4.3(a) targets repackaged clones of one template across many app records. This
is one app with one feed and one differentiating idea: the player-controlled
recommendation algorithm. Nothing in the listing copy leads with "105 games" as
the pitch — the tuner does. Keep it that way in the screenshots too: make the
second screenshot the tuner with the *Next up* strip reordering.

### 2.1 Crashes and incomplete information

- `npm run typecheck` and both builds pass in CI before the archive step, so a
  type error can never reach an upload.
- The splash screen auto-hides after 2.5 s **even if the web layer never
  boots**, so a broken bundle shows the app, not a frozen logo.
- Every native plugin call is inside a `try`/`catch`: a missing or failing
  Haptics/StatusBar/SplashScreen plugin degrades silently instead of throwing.
- The game generator has two fallbacks — a network failure or an offline phone
  produces a real, playable game designed on the device, so the feature never
  dead-ends.
- Reviewer notes (Step 10) explain that no login exists, which is the usual
  cause of "incomplete information" rejections.

### 5.1.1 / 4.8 Sign in with Apple

> ⚠️ **This section changed with PR #49 and is now conditional. Read it before
> you submit.**

Guideline 4.8 only bites when an app offers a *third-party or social login
service*. It used to be structurally impossible for this build to offer one:
`cloudConfigured` was forced to `false` whenever `NEXT_PUBLIC_NATIVE=1`.

**That is no longer how it works.** PR #49 taught the iOS build to reach the
web leaderboard, and `lib/supabase/config.ts` now reads:

```ts
export const cloudConfigured =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && (!nativeBuild || apiOrigin.length > 0);
```

The switch is no longer the platform — it is **whether `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present at build time**. PR #49 also
added working Google sign-in on iOS, via the system browser and a deep link back
into the app.

`.github/workflows/ios-release.yml` does not inject either Supabase variable, so
the `.ipa` CI produces today is still guest-only and the "no data collected"
privacy label in Step 8 is still truthful. **Both of those facts now depend on a
build-time absence rather than on code that cannot be switched on.**

**Adding those two variables to the repository turns a compliant build into a
rejectable one**, in two ways at once:

- Google sign-in appears, so **Sign in with Apple becomes mandatory** under 4.8.
  The app does not have it.
- Accounts and a server leaderboard exist, so the privacy nutrition label must
  declare identifiers and user content. Answering "no data collected" would then
  be false.

Before adding them, ship Sign in with Apple first:
`@capacitor-community/apple-sign-in` for the native credential, then
`supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })` — no
redirect and no deep link needed. It also needs a Services ID, a Sign in with
Apple key, and the capability added to the App ID. That is a 1.1 feature; do
not bolt it on before the first submission.

For 1.0, the safest thing is to leave the Supabase variables out of CI and
submit guest-only, exactly as this document otherwise describes.

### 3.1.1 In-app purchase / 2.3.1 hidden features

There is nothing to buy anywhere in the app, and no code path that could
unlock anything. The casino-style game uses virtual chips that reset for free
and can never be purchased — this is stated in the support page and should be
repeated in the review notes if a reviewer asks.

### 5.1.2 / ATS

`NSAllowsArbitraryLoads` is **not** set. The only outbound request is HTTPS to
the Vercel domain, so App Transport Security stays fully on. `Info.plist`
contains **no permission strings at all**, because the app asks for no camera,
microphone, location, contacts, photos, tracking or notifications.

---

## 4. What the engineering side actually contains

| File | What it does |
|---|---|
| `capacitor.config.ts` | bundle id, bounce/overscroll off, splash and status bar config |
| `next.config.ts` | `output: 'export'` only when `TTG_NATIVE=1` |
| `scripts/build-native.mjs` | parks the server-only routes, runs the export, restores them |
| `scripts/make-ios-assets.mjs` | generates the 1024 icon, the launch image and web art from vector source |
| `lib/native.ts` | the one place that knows it is running natively |
| `components/shell/NativeShell.tsx` | splash hide, theme-driven status bar, kills long-press callouts |
| `ios/App/App/Info.plist` | portrait only, `ITSAppUsesNonExemptEncryption` false, zero permission strings |
| `.github/workflows/ios-release.yml` | archive + export + upload on `macos-14` |
| `ios/App/App.xcodeproj/project.pbxproj` | manual signing for the app target only — see below |
| `app/privacy/page.tsx`, `app/support/page.tsx` | the two URLs App Store Connect demands |

### Commands

```bash
npm run build          # normal Vercel build, unchanged
npm run build:native   # static bundle for the app, into out/
npm run ios:assets     # regenerate icon + launch screen
npm run ios:sync       # build:native + npx cap sync ios
npm run ios:open       # open Xcode (macOS only)
```

### Why signing is in the project, not on the command line

Signing settings passed to `xcodebuild` on the command line apply to **every
target in the workspace**, including the six Capacitor pods. Those build as
frameworks, cannot take a provisioning profile, and fail the archive with
`CapacitorHaptics does not support provisioning profiles` and five more like it.

So `CODE_SIGN_STYLE`, `CODE_SIGN_IDENTITY` and `PROVISIONING_PROFILE_SPECIFIER`
live in the app target's own Release configuration, where they reach only that
target, and the archive command sets just the build number and the keychain to
sign against. The profile is named — `Tip Tap Games App Store` — rather than
referenced by UUID, so regenerating it does not break the build.

### Why the split is where it is

`output: 'export'` cannot carry route handlers or middleware, and this app has
five API routes, an OAuth callback and a Supabase cookie-refresh middleware.
Rather than fork the app, `scripts/build-native.mjs` moves `app/api`,
`app/auth`, `app/art-check` and `middleware.ts` out of the tree for the length
of the export and puts them straight back — including on Ctrl-C, a crash, or a
failed build. The Vercel build is completely untouched by any of this.

Of those routes, only `/api/generate` matters to the app, and it is stateless,
so the native bundle calls it at its absolute Vercel URL (CORS headers were
added to that route for the `capacitor://localhost` origin). The run-ticket and
leaderboard routes authenticate by cookie, which a `capacitor://localhost`
origin cannot send — another reason the iOS build is guest-only rather than
half-connected.

### What is verified, and what is not

**An `.ipa` compiles and signs.** Run 31449515404 on `macos-14` went green end
to end and produced a 53 MB `App.ipa` whose `Payload/App.app` is code-signed,
whose `embedded.mobileprovision` is `Tip Tap Games App Store` for
`PQ9WNUPKUK.com.nicvandewetering.tiptapgames`, and which carries the exported
web bundle inside the binary — the concrete evidence behind the 4.2 argument
above.

Getting there took six runs. CocoaPods, which this section originally predicted
would be the sticking point, passed on the very first attempt and every attempt
since. The real failures were the SHA-256 MAC, the `--body -` secrets, and
signing settings leaking from the `xcodebuild` command line onto the Pods
targets. All three are fixed and documented.

**Still not verified:**

- **Nothing has been uploaded to App Store Connect.** Every run so far used
  `upload=false`, because the App Store Connect API key does not exist yet. The
  `altool` validate and upload steps have never executed.
- **Nothing has run on a device or in a simulator.** That the binary builds and
  signs says nothing about whether it launches, renders, or plays.
- **App Store Connect API access is pending.** The account is enrolled as an
  Individual, and Apple's own wording on the request form is that organizations
  are granted access before individuals.

---

## 5. Order of operations, condensed

| # | Step | Time | State |
|---|---|---|---|
| 1 | Register the App ID | 5 min | ✅ done |
| 2 | Mint the Apple Distribution cert | 10 min | ✅ done — `~/appstore-keys/ios/` |
| 3 | Make the App Store provisioning profile | 3 min | ✅ done |
| 4 | Make the App Store Connect API key | 3 min | ⬜ **next — needs your Apple login** |
| 5 | Create the app record | 10 min | ⬜ needs your Apple login |
| 6 | Load the GitHub secrets | 5 min | ◐ five of eight loaded; the four `ASC_*` wait on step 4 |
| 7 | Run the workflow, wait for TestFlight | ~20 min | ◐ archive + signing verified, upload blocked on step 4 |
| 8 | Answer the privacy label: *no data collected* | 5 min | ⬜ |
| 9 | Screenshots, listing copy, age rating | 30 min | ◐ screenshots shot, copy written, rating decided |
| 10 | Submit | 2 min, then 24–72 h | ⬜ |

Everything an agent can do from Windows is done. Steps 4 and 5 are the gate:
both live behind an Apple ID sign-in with two-factor, so they are yours.

Roughly 1.5 hours of your time. $0 beyond the membership you already have.
