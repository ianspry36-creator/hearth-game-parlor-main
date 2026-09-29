import { GAMES } from "@/lib/games";

/**
 * Schema.org structured data (JSON-LD) for Cards and Games.
 *
 * Rendered into the document <head> as an inline
 * <script type="application/ld+json"> block so search engines and other
 * consumers can understand the site as an Organization, a WebSite, and a
 * catalogue of playable games.
 */

export const SITE_URL = "https://cardsandgames.uk";
const SITE_NAME = "Cards and Games";
const SITE_DESCRIPTION =
  "Cards and Games: play cribbage, backgammon, crazy eights, yahtzee and more against Ada or a human opponent.";

const gamesList = GAMES.map((game, index) => ({
  "@type": "ListItem",
  position: index + 1,
  name: game.name,
  url: `${SITE_URL}${game.path}`,
  description: game.tagline,
}));

export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/favicon.png`,
      },
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "ItemList",
      name: `${SITE_NAME} games`,
      url: `${SITE_URL}/`,
      numberOfItems: gamesList.length,
      itemListElement: gamesList,
    },
  ],
};
