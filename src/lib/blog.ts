export type BlogBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  publishedAt: string; // ISO 8601 timestamp
  body: BlogBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "history-of-playing-cards",
    title: "The History of Playing Cards",
    publishedAt: "2026-10-06T18:14:22+01:00",
    body: [
      { type: "paragraph", text: `Playing cards are so common today that it's easy to forget they have a thousand-year story involving emperors, trade routes, soldiers, printers, magicians, and gamblers. Their evolution reflects cultural exchange across continents, technological innovation, and shifting artistic traditions. Modern decks — the ones used for poker, bridge, solitaire, and magic — are the result of centuries of adaptation.` },
      { type: "heading", text: "Origins in China (9th Century)" },
      { type: "paragraph", text: `The earliest known playing cards appeared in China around 868 CE, during the Tang Dynasty. These early cards were likely used in games involving paper money or domino-style suits, combining entertainment with familiar cultural symbols. Chinese card suits and formats varied widely, but the key innovation was simple: paper + game = portable entertainment, a concept that would eventually spread across the world.` },
      { type: "heading", text: "Spread Through the Islamic World (11th–14th Century)" },
      { type: "paragraph", text: `Playing cards travelled westward along trade routes into the Islamic world, where the Mamluks of Egypt developed beautifully decorated decks featuring suits such as cups, swords, coins, and polo sticks. These Mamluk cards are the direct ancestors of European suit systems.` },
      { type: "heading", text: "Arrival in Europe (Late 1300s)" },
      { type: "paragraph", text: `Cards reached Europe in the late 14th century, with early references appearing in Italy and Spain. European decks initially borrowed heavily from Mamluk designs, but local artists soon adapted the suits and court figures to match regional tastes.` },
      { type: "heading", text: "The Four Suit Systems (1400s)" },
      { type: "paragraph", text: `By the 15th century, Europe had developed several competing suit systems:` },
      { type: "list", items: ["Latin suits (Italy, Spain): cups, coins, swords, clubs", "German suits: hearts, bells, leaves, acorns", "French suits: hearts, diamonds, clubs, spades"] },
      { type: "paragraph", text: `The French suit system ultimately became the global standard due to its simplicity and ease of printing.` },
      { type: "heading", text: "The Printing Revolution (1440–1500)" },
      { type: "paragraph", text: `The invention of the printing press transformed playing cards from luxury items into mass-produced goods. French printers in Rouen developed the designs that would later evolve into the familiar English pattern — the style still used in most of the world today.` },
      { type: "heading", text: "England and the Global Spread (1500–1800)" },
      { type: "paragraph", text: `England adopted the French suits and exported them across its empire. This helped standardize the 52-card deck with four suits and three court cards (King, Queen, Jack). As cards crossed the Atlantic, they became embedded in American gaming culture, eventually influencing poker, blackjack, and countless other games.` },
      { type: "heading", text: "Modern Innovations (1800–Present)" },
      { type: "paragraph", text: `Several key developments shaped the modern deck:` },
      { type: "list", items: ["**Double-headed court cards (1850s)** — so players didn't need to flip them upright.", "**The Ace of Spades as a tax stamp** — governments required card makers to mark this card, giving it its iconic ornate design.", "**Plastic-coated cards** — improved durability and handling.", "**Standardization of the 52-card French-suited deck** — now the most widely used format worldwide."] },
      { type: "heading", text: "Cultural Significance" },
      { type: "paragraph", text: `Playing cards today serve many roles:` },
      { type: "list", items: ["Games (poker, bridge, rummy, solitaire)", "Magic and cardistry", "Divination (tarot and cartomancy)", "Collecting and art"] },
      { type: "paragraph", text: `Their designs continue to evolve, reflecting cultural trends, artistic movements, and technological changes.` },
      { type: "heading", text: "Conclusion" },
      { type: "paragraph", text: `From Tang Dynasty China to modern poker tables, playing cards have travelled across continents and centuries, adapting to every culture they touched. Their suits, symbols, and designs tell a story of trade, innovation, and human creativity. Today's standard deck — hearts, diamonds, clubs, spades — is the product of a long global journey, making playing cards one of the most enduring and universal tools of entertainment in human history.` },
    ],
  },
  {
    slug: "welcome-pull-up-a-chair",
    title: "Welcome — pull up a chair",
    publishedAt: "2026-09-29T20:41:00+01:00",
    body: [
      { type: "paragraph", text: `I'm Ian, and this website is my little labour of love. I tinker with it in the evenings, fix things on weekends, and slowly shape it into the classic game hub I've always wanted. It's just me behind the scenes — designing, coding, testing, and occasionally muttering at my screen when a card refuses to behave.` },
      { type: "paragraph", text: `I live out in the Peak District with my wife Sharon, our two teenagers, and Clyde, our dog who thinks every walk is an adventure. My love for games goes way back. Some of my favourite memories are sitting at the kitchen table playing chess and draughts with my dad, or gin rummy with my mum, who never let me win unless I earned it. Those games stuck with me, and over the years I've spent plenty of time on card-game websites… but I always felt something was missing.` },
      { type: "paragraph", text: `Classic games have so many quirky variations — little twists passed down through families or learned from a friend — and I've always worried those versions are disappearing. Most sites only offer one "official" way to play, and that never felt right to me. So I started building my own place where those variations could live on.` },
      { type: "paragraph", text: `Today I've released Version 4, with 18 games ready to play. Hearts is nearly finished — just a bit more polishing and testing before it joins the lineup. Over the next few weeks, I'll be focusing on tightening everything up and getting the word out so more people can enjoy the games.` },
      { type: "paragraph", text: `This blog will be a mix of stories, updates, and thoughts about classic games — plus the occasional personal ramble when something interesting happens in life or on the site.` },
      { type: "paragraph", text: `If you've got a favourite variation, a suggestion, or just want to say hello, head over to the Contact page. You'll find my email and Facebook there. I'd genuinely love to hear from you.` },
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
