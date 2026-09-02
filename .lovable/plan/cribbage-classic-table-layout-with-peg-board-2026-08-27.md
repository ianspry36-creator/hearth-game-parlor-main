# Cribbage: classic table layout with peg board

Rework the Cribbage screen so it reads like a real cribbage table, using the uploaded screenshot as the layout reference while keeping the Velvet Parlor styling (dark green felt, cream type, brass accents) instead of the flat green/grey of the reference.

## Layout

```text
+---------------------------------------------------+-------------+
|                 Charlotte (avatar, name)          |             |
|              [face-down cards] [score 0]          |   PEG       |
|                                                   |   BOARD     |
|                deck / starter card                |  (two       |
|                     pile + count                  |   lanes,    |
|                                                   |   121       |
|  [ CRIB ]        message strip                    |   holes)    |
|            [ your hand, face up ]                 |             |
|             You (avatar, DEALER chip)             |   Score     |
+---------------------------------------------------+-------------+
```

- Charlotte sits at the top: name, small avatar, her cards face-down during the deal/play (revealed only in the show).
- Centre column: deck with the cut starter card on top, then the pegging pile with the running count.
- A yellow-tinted instruction strip in the middle telling the player what to do ("Select 2 cards to send to the crib, then press Send to Crib", "Your turn to lay a card", "Charlotte says go", etc.).
- The crib sits bottom-left, labelled YOUR CRIB or CHARLOTTE'S CRIB depending on the dealer, shown face-down until the show.
- Player's hand face-up along the bottom with selection lift, plus the action button (Send to Crib / Say go) next to it.
- A DEALER chip on whichever seat is dealing.

## Peg board

- New component drawing a classic two-lane 121-hole board down the right side: 30 rows of 5 holes per lane per street, gold/brass frame, with a lane per player.
- Two pegs per player (front peg = current score, back peg = previous score) so movement is visible after each award.
- Numeric score panel under the board (Charlotte / You), matching the reference's score table.
- The board becomes a horizontal strip under the table on narrow screens.

## Behaviour

No game-logic changes: scoring, discards, pegging, go, show and the 121 win all stay exactly as they are. The show results panel remains, appearing above the hands, and Charlotte's cards flip face-up during the show.

## Technical notes

- New `src/components/parlor/CribBoard.tsx` (peg board + score readout, driven by current and previous scores).
- `src/routes/cribbage.tsx`: restructure the render into top-seat / centre / bottom-seat rows; track previous scores for back pegs; add a face-down card variant to `PlayingCard`; move score display out of the rail into the board.
- `TableShell` keeps the New game / Human / Rules rail; the rail's score card is replaced by the peg board panel.
- All colours via existing semantic tokens; no hardcoded colour utilities.
