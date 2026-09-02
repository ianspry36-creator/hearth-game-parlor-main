# Triangles: 20 random spots, coloured claims

## What changes

- The board becomes **20 spots scattered randomly** across the play area instead of a fixed pyramid lattice. Every new game generates a fresh layout, so no two games look alike.
- Spots are connected by a generated web of non-crossing lines (a triangulation of the scattered points), so the board is always made of clean triangles with no lines cutting through each other. Roughly 30 triangles and 50 drawable lines per board.
- Each player has their own colour: **you = coral**, **Charlotte / your opponent = teal**. Drawn lines take the drawer's colour, and closing a triangle fills it with that player's colour (a soft translucent fill plus a matching outline) rather than the current initial-letter label.
- Scoreboard, table talk, turn banner and the game-over line keep working as they do now, with the score swatches shown in each player's colour.
- Rules text updated: "draw a line between two joined spots" instead of "neighbouring dots on the lattice".

## How it plays

Same rules as today: draw an undrawn line; if it completes a triangle you claim it in your colour and draw again; when every line is drawn, whoever holds the most triangles wins. Charlotte's logic is unchanged (close when she can, otherwise avoid gifting a triangle).

## Technical notes

- `src/lib/triangles.ts` is reworked from a fixed lattice to a **generated board**: seeded random point placement (Poisson-style rejection sampling so spots never overlap or crowd) inside the viewBox, then a Delaunay triangulation implemented locally (Bowyer–Watson, ~60 lines, no new dependency) to derive the triangle and edge lists.
- New `Board` type: `{ points: {x,y}[]; edges: {id, a, b}[]; triangles: {id, edges: string[], points: number[]} }`. `closedBy` and `chooseEdge` take the board as a parameter instead of reading module-level `EDGES`/`TRIANGLES`.
- The board layout is generated from a numeric seed stored in game state, so multiplayer host and guest render the identical board via the existing `useMatch` state sync; `mirror()` also flips line/triangle owners as it does now.
- `src/routes/triangles.tsx` renders points/edges/triangles from the board instead of `dotPoint`/`ROWS` maths; claimed triangles render as coloured polygons (no letter text).
- Two new colour tokens added in `src/styles.css` (`--player-coral`, `--player-teal`) registered in `@theme inline`, used via `fill-*`/`stroke-*` classes — no hardcoded hex in components.
