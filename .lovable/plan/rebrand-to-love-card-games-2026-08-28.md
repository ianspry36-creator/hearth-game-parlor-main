# Rebrand to "Love Card Games"

Rename the site from "The Green Cardroom" to **Love Card Games** and restyle the whole
experience — lobby, shared shell and every game table — around a warm coral/pink brand.

## New look

- **Palette (Electric Coral):** deep plum base `#574b90`-derived dark backdrop, coral
  `#ff6b6b` as the primary accent, rose `#ee5a70` and berry `#c44569` for depth, warm
  off-white for text and card faces.
- **Typography:** Cormorant Garamond for headings (elegant, romantic), Karla for body
  and UI text. Loaded via the root route's font link.
- **Layout:** hero + card grid on the start screen — a full-width brand hero (heart/suit
  motif, wordmark, tagline, live-players line, avatar) sitting above a responsive grid of
  game tiles that scales as new games are added.

## Start screen

- Wordmark "Love Card Games" with a heart-suit mark replacing the "G" badge.
- Hero band: headline, short intro line, player-count pill, clickable avatar.
- Game tiles for Cribbage, Backgammon, Battleship, Farkle, Yahtzee, Crazy Eights,
  Triangles — each with its initial badge, tagline and Play vs Charlotte / Human /
  Rules actions, restyled to the new palette.
- Footer line reworded to the new brand.

## Everything else

- Table shell (header, back link, action rail, opponent card, confirm dialogs), rules
  dialog, waiting room, avatar picker and game-over dialogs all pick up the new tokens
  automatically once the palette is swapped, with targeted fixes where the old green/gold
  names read oddly.
- Each game table's felt, borders, boards and score panels re-tinted to the coral brand
  while keeping card faces cream/white for readability.
- Cribbage peg board, Battleship grids, Farkle dice, Yahtzee scorecard, Triangles lattice:
  accent colours moved to coral/berry; no gameplay logic touched.

## Technical notes

- `src/styles.css`: replace the Velvet Parlor `oklch` values for `--brand`, `--surface`,
  `--cream`, `--gold`, `--gold-bright`, `--ivory`, `--sage` (and the shadcn primary/accent
  mappings) with the coral palette; update `--font-display` to Cormorant Garamond and
  `--font-body`/`--font-sans` to Karla. Existing token names stay, so no component-wide
  class renames are needed.
- `src/routes/__root.tsx`: swap the Google Fonts link to Cormorant Garamond + Karla;
  update title/description/og tags to "Love Card Games". AdSense script untouched.
- Per-route `head()` titles and og tags updated to "Play X — Love Card Games", each with
  its own unique description.
- Rename gold/sage-specific one-off utility usages only where the new palette needs a
  different token; keep semantic tokens, no hardcoded hex in components.
- Favicon (two dice) kept as-is.
