import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — Love Card Games" },
      {
        name: "description",
        content:
          "Learn about Love Card Games, a friendly online parlour where you can play classic card and board games against Charlotte or a real human opponent.",
      },
      { property: "og:title", content: "About Us — Love Card Games" },
      {
        property: "og:description",
        content:
          "A warm little parlour of classic games, built to be played with a little heart.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-8">
        <header className="mb-12 flex items-center justify-between">
          <Link
            to="/"
            className="text-sm font-medium text-gold transition-colors hover:text-gold-bright"
          >
            ← Back to Love Card Games
          </Link>
        </header>

        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          About us
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ivory/70">
          Love Card Games is a small, friendly parlour of classic card and board games, built to be enjoyed anywhere.
        </p>

        <section className="mt-10 space-y-8 text-[15px] leading-relaxed text-ivory/85">
          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">What we do</h2>
            <p className="mt-2">
              We bring together timeless games — Cribbage, Backgammon, Battleship, Farkle, Yahtzee, Crazy Eights and Triangles — into one simple, no-fuss place. You can play against Charlotte, our patient computer opponent, or challenge a real person from the waiting room.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">No sign-ups needed</h2>
            <p className="mt-2">
              We believe getting into a game should be quick. Just pick a table and play. If you choose a human opponent, we only ask for a nickname so the other player knows who they are sitting across from.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Built with heart</h2>
            <p className="mt-2">
              Every detail, from the card animations to the score bubbles, is designed to make the experience feel warm and welcoming. We are always adding new tables and polishing the ones we have.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-gold">Get in touch</h2>
            <p className="mt-2">
              Have feedback, a bug report, or an idea for a new game? We would love to hear from you. Visit our{" "}
              <Link to="/contact" className="text-gold underline decoration-gold/30 underline-offset-4 transition-colors hover:text-gold-bright">
                Contact page
              </Link>{" "}
              and send us a message.
            </p>
          </div>
        </section>

        <footer className="mt-16 border-t border-gold/12 pt-6 text-center text-[11px] uppercase tracking-[0.28em] text-ivory/30">
          Love Card Games · Cards dealt nightly
        </footer>
      </div>
    </div>
  );
}
