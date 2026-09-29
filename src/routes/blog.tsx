import { createFileRoute, Link } from "@tanstack/react-router";
import { BLOG_POSTS, formatPublishedAt } from "@/lib/blog";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Cards and Games" },
      {
        name: "description",
        content:
          "Stories, updates and the occasional ramble about classic card and board games, from Ian — the person behind Cards and Games.",
      },
      { property: "og:title", content: "Blog — Cards and Games" },
      {
        property: "og:description",
        content:
          "Stories, updates and the occasional ramble about classic card and board games.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <div className="min-h-screen text-cream">
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
          Blog
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ivory/70">
          Stories, updates and the occasional ramble about classic games.
        </p>

        <div className="mt-10 space-y-14">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug}>
              <p className="text-[11px] uppercase tracking-[0.28em] text-gold/70">
                {formatPublishedAt(post.publishedAt)}
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold">
                {post.title}
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ivory/85">
                {post.body.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <footer className="mt-16 border-t border-gold/12 pt-6 text-center text-[11px] uppercase tracking-[0.28em] text-ivory/30">
          Cards and Games · Cards dealt nightly
        </footer>
      </div>
    </div>
  );
}
