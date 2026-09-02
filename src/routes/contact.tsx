import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Love Card Games" },
      {
        name: "description",
        content:
          "Get in touch with Love Card Games. Send feedback, report a bug, or ask a question about our classic card and board games.",
      },
      { property: "og:title", content: "Contact — Love Card Games" },
      {
        property: "og:description",
        content:
          "Feedback, bug reports or just a friendly hello — we'd love to hear from you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="min-h-screen bg-brand text-cream">
      <div className="relative mx-auto max-w-2xl px-6 pb-20 pt-8">
        <header className="mb-12 flex items-center justify-between">
          <Link
            to="/"
            className="text-sm font-medium text-gold transition-colors hover:text-gold-bright"
          >
            ← Back to Love Card Games
          </Link>
        </header>

        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Contact us
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ivory/70">
          Have a question, spotted a bug, or just want to say hello? Drop us a line and we'll get back to you as soon as we can.
        </p>

        <div className="mt-10 rounded-2xl border border-gold/20 bg-surface/45 p-8">
          <h2 className="font-display text-2xl font-semibold text-gold">Email</h2>
          <p className="mt-2 text-ivory/80">
            The quickest way to reach us is by email:
          </p>
          <a
            href="mailto:contact@simplycards.online"
            className="mt-4 inline-block text-lg font-medium text-gold underline decoration-gold/30 underline-offset-4 transition-colors hover:text-gold-bright hover:decoration-gold-bright/50"
          >
            contact@simplycards.online
          </a>

          <div className="mt-8 space-y-4 text-sm text-ivory/70">
            <p>
              <strong className="text-ivory/90">Bug reports:</strong> Please include the game you were playing and what happened just before the issue.
            </p>
            <p>
              <strong className="text-ivory/90">Feature ideas:</strong> We read every suggestion and use them to decide which tables to add next.
            </p>
            <p>
              <strong className="text-ivory/90">Press & partnerships:</strong> Use the same address and we'll forward it to the right person.
            </p>
          </div>
        </div>

        <footer className="mt-16 border-t border-gold/12 pt-6 text-center text-[11px] uppercase tracking-[0.28em] text-ivory/30">
          Love Card Games · Cards dealt nightly
        </footer>
      </div>
    </div>
  );
}
