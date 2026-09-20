# Committed card backs

Drop a `.png` file here to make it a **permanent** card back for every player.

- The file is auto-discovered at build time (`import.meta.glob` in `src/lib/cards.ts`) and shown in the **Cards** tab as a built-in option — no code change needed.
- Use a descriptive filename (e.g. `midnight-orchid.png`); it becomes the option's label ("Midnight Orchid").
- The card back should be roughly `5:7` (portrait) aspect ratio; anything works but it is shown object-cover.

It ships to the live site on the next commit, push and build.
