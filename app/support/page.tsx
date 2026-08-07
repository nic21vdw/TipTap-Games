import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — Tip Tap Games",
  description: "Help, bug reports and contact for the Tip Tap Games app.",
};

export default function Support() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "56px 22px 96px",
        lineHeight: 1.62,
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>Support</h1>
      <p style={{ color: "var(--ink-dim)", marginBottom: 30 }}>
        Tip Tap Games for iPhone
      </p>

      <Block title="Contact">
        <p style={{ marginBottom: 12 }}>
          Email{" "}
          <a href="mailto:nic21vdw@gmail.com" style={{ textDecoration: "underline" }}>
            nic21vdw@gmail.com
          </a>{" "}
          — bugs, ideas for games, or anything that looks wrong. Replies usually
          come within a couple of days.
        </p>
      </Block>

      <Block title="How to play">
        <ul style={{ listStyle: "disc", paddingLeft: 22, marginBottom: 12 }}>
          <li>Swipe up for the next game. It is already running when it lands.</li>
          <li>Swipe down to go back to the one you just left.</li>
          <li>
            Tap the tuner pill at the top left to steer what comes next — calm
            against frantic, skill against chance, modern against 2008.
          </li>
          <li>Tap the grid button to browse and jump to any game.</li>
          <li>Tap the search button to describe a game and have one made for you.</li>
        </ul>
      </Block>

      <Block title="Common questions">
        <p style={{ marginBottom: 12 }}>
          <strong>Do I need an account?</strong> No. There is no sign-in in the
          app at all. Your scores live on your phone.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>Does it work offline?</strong> Yes. Every game ships inside
          the app. Only the game generator prefers a connection, and it falls
          back to designing on your device when there is none.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>Where did my scores go?</strong> They are stored on the
          device. Deleting and reinstalling the app clears them, and they do not
          transfer between phones.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>There is a casino-style game. Is that gambling?</strong> No.
          The chips are imaginary, there is nothing to buy, and you can reset
          them to the starting balance for free at any time.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>Sound is not playing.</strong> Check the mute switch on the
          side of your iPhone, then the speaker button in the app. Every track
          is generated live on the device, so nothing is downloaded.
        </p>
      </Block>

      <Block title="Play in a browser">
        <p style={{ marginBottom: 12 }}>
          The same feed runs at{" "}
          <a href="/" style={{ textDecoration: "underline" }}>
            tip-tap-games-roan.vercel.app
          </a>
          , free, with nothing to install.
        </p>
      </Block>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}
