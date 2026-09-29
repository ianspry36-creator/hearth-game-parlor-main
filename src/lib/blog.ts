export interface BlogPost {
  slug: string;
  title: string;
  publishedAt: string; // ISO 8601 timestamp
  body: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "welcome-pull-up-a-chair",
    title: "Welcome — pull up a chair",
    publishedAt: "2026-09-29T20:41:00+01:00",
    body: [
      `I'm Ian, and this website is my little labour of love. I tinker with it in the evenings, fix things on weekends, and slowly shape it into the classic game hub I've always wanted. It's just me behind the scenes — designing, coding, testing, and occasionally muttering at my screen when a card refuses to behave.`,
      `I live out in the Peak District with my wife Sharon, our two teenagers, and Clyde, our dog who thinks every walk is an adventure. My love for games goes way back. Some of my favourite memories are sitting at the kitchen table playing chess and draughts with my dad, or gin rummy with my mum, who never let me win unless I earned it. Those games stuck with me, and over the years I've spent plenty of time on card-game websites… but I always felt something was missing.`,
      `Classic games have so many quirky variations — little twists passed down through families or learned from a friend — and I've always worried those versions are disappearing. Most sites only offer one "official" way to play, and that never felt right to me. So I started building my own place where those variations could live on.`,
      `Today I've released Version 4, with 18 games ready to play. Hearts is nearly finished — just a bit more polishing and testing before it joins the lineup. Over the next few weeks, I'll be focusing on tightening everything up and getting the word out so more people can enjoy the games.`,
      `This blog will be a mix of stories, updates, and thoughts about classic games — plus the occasional personal ramble when something interesting happens in life or on the site.`,
      `If you've got a favourite variation, a suggestion, or just want to say hello, head over to the Contact page. You'll find my email and Facebook there. I'd genuinely love to hear from you.`,
    ],
  },
];

export function formatPublishedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `${date} at ${time}`;
}
