# Committed card fronts

Drop a `.png` file here to make it a **permanent** card front (face) for every player.

- The file is auto-discovered at build time (`import.meta.glob` in `src/lib/cards.ts`) and shown in the **Cards** tab as a built-in option — no code change needed.
- Use a descriptive filename (e.g. `ember-deck.png`); it becomes the option's label ("Ember Deck").
- The card front should be roughly `5:7` (portrait) aspect ratio.

It ships to the live site on the next commit, push and build.
