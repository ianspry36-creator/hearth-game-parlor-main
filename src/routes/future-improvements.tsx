import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/future-improvements")({
  head: () => ({
    meta: [
      { title: "Future Improvements — Cards and Games" },
      {
        name: "description",
        content:
          "Planned future improvements for Cards and Games — new games, a four-player room, player logins, game variations and statistics.",
      },
      { property: "og:title", content: "Future Improvements — Cards and Games" },
      {
        property: "og:description",
        content:
          "What's coming next to the parlour: new games, a four-player room, logins, game variations and statistics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FutureImprovementsPage,
});

function FutureImprovementsPage() {
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
          Future improvements
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ivory/70">
          Hi all,
        </p>

        <section className="mt-10 space-y-8 text-[15px] leading-relaxed text-ivory/85">
          <div>
            <p>
              Below is a list of planned future improvements:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Create a 4 player multi-room</li>
              <li>Hearts</li>
              <li>Sargent Major</li>
              <li>Cheat</li>
              <li>Durak</li>
              <li>Egyptian Ratscrew</li>
              <li>Fight the Landlord</li>
              <li>Bridge</li>
              <li>Chase the Ace</li>
              <li>Whist</li>
              <li>Develop login facility to allow customisation</li>
              <li>Develop game variations</li>
              <li>Game statistics</li>
            </ul>
          </div>

          <div>
            <p>
              Do reach out to us if you have any ideas on how to improve the site.
            </p>
            <p className="mt-4 text-ivory/70">Many thanks, Ian</p>
          </div>
        </section>

        <footer className="mt-16 border-t border-gold/12 pt-6 text-center text-[11px] uppercase tracking-[0.28em] text-ivory/30">
          Cards and Games · Cards dealt nightly
        </footer>
      </div>
    </div>
  );
}
