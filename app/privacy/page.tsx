import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Tip Tap Games",
  description:
    "What Tip Tap Games stores, what it sends, and what it never collects.",
};

const UPDATED = "6 August 2026";

export default function PrivacyPolicy() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "56px 22px 96px",
        lineHeight: 1.62,
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>
        Privacy Policy
      </h1>
      <p style={{ color: "var(--ink-dim)", marginBottom: 30 }}>
        Tip Tap Games · last updated {UPDATED}
      </p>

      <Section title="The short version">
        <p style={{ marginBottom: 12 }}>
          The Tip Tap Games iOS app collects nothing about you. There is no
          account, no analytics SDK, no advertising SDK, no tracking of any
          kind, and no third-party service that receives your data. Everything
          the app remembers is stored on your device and disappears when you
          delete the app.
        </p>
      </Section>

      <Section title="What is stored on your device">
        <ul style={{ listStyle: "disc", paddingLeft: 22, marginBottom: 12 }}>
          <li>Your high score for each game.</li>
          <li>Which games you have liked, played or scrolled past.</li>
          <li>The algorithm sliders, tag rules and theme you chose.</li>
          <li>A random display name such as @swift-otter-41, generated on your device.</li>
          <li>Any games you created with the game generator.</li>
        </ul>
        <p style={{ marginBottom: 12 }}>
          None of this leaves your phone. It is not backed up to us, it is not
          linked to your Apple ID, and we never see it. Deleting the app
          deletes all of it.
        </p>
      </Section>

      <Section title="What leaves your device">
        <p style={{ marginBottom: 12 }}>
          One thing, and only when you ask for it. If you use the
          &ldquo;generate a game&rdquo; box, the words you type are sent to our
          server so an AI model can design a game from them. We do not store
          those prompts, and they are not linked to you or your device — there
          is no identifier attached to the request. If your phone is offline,
          or the request fails, the app designs the game on the device instead
          and nothing is sent at all.
        </p>
        <p style={{ marginBottom: 12 }}>
          The app makes no other network requests. Every game is bundled inside
          the app and runs with no connection.
        </p>
      </Section>

      <Section title="Children">
        <p style={{ marginBottom: 12 }}>
          Tip Tap Games does not knowingly collect personal information from
          anyone, including children under 13. There is nothing to collect: no
          sign-up, no profile, no contact details.
        </p>
      </Section>

      <Section title="The website">
        <p style={{ marginBottom: 12 }}>
          This same game is playable for free at tip-tap-games-roan.vercel.app.
          The website is hosted by Vercel, which keeps standard server access
          logs (IP address, browser type, requested page) for security and
          operational purposes. The website additionally offers optional Google
          sign-in for cloud saves; if you use it, your email address and
          profile picture are stored by our database provider, Supabase, solely
          to hold your scores. Signing out or emailing us removes it.{" "}
          <strong>
            The iOS app has no sign-in and does not use Supabase at all.
          </strong>
        </p>
      </Section>

      <Section title="Your rights">
        <p style={{ marginBottom: 12 }}>
          Because the app holds no data about you, there is nothing for us to
          export or erase on request. For the website account described above,
          email us and we will delete the record within 30 days.
        </p>
      </Section>

      <Section title="Changes">
        <p style={{ marginBottom: 12 }}>
          If this policy changes, the date at the top of this page changes with
          it, and the new version is published here before it takes effect.
        </p>
      </Section>

      <Section title="Contact">
        <p style={{ marginBottom: 12 }}>
          Questions about privacy, or a deletion request:{" "}
          <a href="mailto:nic21vdw@gmail.com" style={{ textDecoration: "underline" }}>
            nic21vdw@gmail.com
          </a>
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}
