import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Cards and Games" },
      {
        name: "description",
        content:
          "Read the Cards and Games privacy policy to learn how we handle your data while you play classic card and board games online.",
      },
      { property: "og:title", content: "Privacy Policy — Cards and Games" },
      {
        property: "og:description",
        content:
          "How Cards and Games collects, uses and protects your information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-8">
        <header className="mb-12 flex items-center justify-between">
          <Link
            to="/"
            className="text-sm font-medium text-gold transition-colors hover:text-gold-bright"
          >
            ← Back to Cards and Games
          </Link>
        </header>

        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-ivory/60">Last updated: 29 August 2026</p>

        <section className="mt-10 space-y-8 text-[15px] leading-relaxed text-ivory/85">
          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Who we are</h2>
            <p className="mt-2">
              Cards and Games is a free online parlour where you can play classic card and board games against Ada or a human opponent. We want you to enjoy the games without worrying about your personal data.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">What information we collect</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>A nickname you choose when entering a multiplayer waiting room.</li>
              <li>A temporary session identifier so we can match you with another player.</li>
              <li>Basic gameplay events needed to keep a match in sync between two human players.</li>
            </ul>
            <p className="mt-3">
              We do not require an email address, password, or any other personal information to play.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">How we use your information</h2>
            <p className="mt-2">
              We use the nickname and session data solely to provide the multiplayer waiting room and live match experience. Gameplay events are discarded once a match ends or becomes inactive.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Cookies and analytics</h2>
            <p className="mt-2">
              We use first-party cookies only to keep your game session stable. Third-party advertising partners may set cookies or use similar technologies to serve and measure ads, subject to their own privacy policies.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Data retention</h2>
            <p className="mt-2">
              Waiting-room entries and match records are removed automatically after a short period of inactivity. We do not keep long-term records of individual games or player identities.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Children</h2>
            <p className="mt-2">
              Cards and Games is intended for a general audience. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal data, please contact us and we will remove it.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Changes to this policy</h2>
            <p className="mt-2">
              We may update this policy from time to time. Any changes will be posted on this page with a revised date.
            </p>
          </div>
        </section>

        <footer className="mt-16 border-t border-gold/12 pt-6 text-center text-[11px] uppercase tracking-[0.28em] text-ivory/30">
          Cards and Games · Cards dealt nightly
        </footer>
      </div>
    </div>
  );
}
