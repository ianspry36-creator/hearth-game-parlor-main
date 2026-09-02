export type GameId = "cribbage" | "backgammon" | "battleship" | "chase-the-ace" | "farkle" | "yahtzee" | "crazy-eights" | "rummy" | "triangles" | "solitaire" | "freecell" | "reversi";

export type GameMeta = {
  id: GameId;
  name: string;
  initial: string;
  tagline: string;
  path: "/cribbage" | "/backgammon" | "/battleship" | "/chase-the-ace" | "/farkle" | "/yahtzee" | "/crazy-eights" | "/rummy" | "/triangles" | "/solitaire" | "/freecell" | "/reversi";
  rules: { heading: string; body: string }[];
  beta?: boolean;
};

export const GAMES: GameMeta[] = [
  {
    id: "cribbage",
    name: "Cribbage",
    initial: "C",
    tagline: "Four suits, a peg, and a quiet duel of points and patience.",
    path: "/cribbage",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Be first to peg 121 points. Points are won during the play of the cards and again when hands are shown.",
      },
      {
        heading: "The deal",
        body: "Each player receives six cards and discards two face down to the crib, which belongs to the dealer. A starter card is then cut and turned. If the starter is a Jack, the dealer pegs two for his heels.",
      },
      {
        heading: "The play",
        body: "Non-dealer leads. Players alternate laying cards, calling the running total, which may not exceed thirty-one. Score two for reaching fifteen or thirty-one, two for a pair, six for three of a kind, twelve for four, and one per card for a run of three or more.",
      },
      {
        heading: "Go",
        body: "If you cannot lay a card without passing thirty-one, say go and your opponent continues alone. The last player to lay a card pegs one, or two if the total was exactly thirty-one, then the count resets.",
      },
      {
        heading: "The show",
        body: "Non-dealer scores first, then dealer, then the crib. Count fifteens (two each), pairs (two each), runs (one per card), a four-card flush (four, five with the starter; the crib needs all five), and one for his nobs — the Jack matching the starter's suit.",
      },
    ],
  },
  {
    id: "backgammon",
    name: "Backgammon",
    initial: "B",
    tagline: "Twenty-four points across the board, decided by a roll of the dice.",
    path: "/backgammon",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Move all fifteen of your checkers around the board into your home board, then bear them all off. The first player to bear off all fifteen wins.",
      },
      {
        heading: "Movement",
        body: "Roll two dice and move a checker for each number, or one checker twice. Doubles are played four times. A checker may only land on an open point — one that is empty, holds your own checkers, or holds a single opposing checker.",
      },
      {
        heading: "Hitting and the bar",
        body: "Landing on a lone opposing checker — a blot — sends it to the bar. A player with a checker on the bar must re-enter it in the opponent's home board before making any other move.",
      },
      {
        heading: "Bearing off",
        body: "Once all fifteen of your checkers are in your home board you may begin bearing off. A roll must match the point exactly, or exceed it when no checker sits further from home.",
      },
      {
        heading: "Forced play",
        body: "You must use both dice if a legal move exists. If only one number can be played, play it and forfeit the other.",
      },
    ],
  },
  {
    id: "battleship",
    name: "Battleship",
    initial: "S",
    tagline: "Five hidden ships, ten by ten of open water, and a duel of guesswork.",
    path: "/battleship",
    rules: [
      {
        heading: "The object",
        body: "Find and sink your opponent's entire fleet of five ships before they sink yours.",
      },
      {
        heading: "The fleet",
        body: "Each admiral hides a Carrier of five squares, a Battleship of four, a Cruiser and a Submarine of three each, and a Destroyer of two. Ships sit horizontally or vertically and may not overlap.",
      },
      {
        heading: "Taking aim",
        body: "Players fire one shot per turn by naming a square on the opponent's grid. A shot is reported as a hit or a miss, and once every square of a ship is struck that ship is sunk.",
      },
      {
        heading: "Reading the board",
        body: "Your own waters are shown below; the opponent's are above. Red marks a hit, a pale dot marks a miss, and sunk ships are called out in the table talk.",
      },
      {
        heading: "Victory",
        body: "The first admiral to sink all five of the enemy ships wins the engagement.",
      },
    ],
  },
  {
    id: "farkle",
    name: "Farkle",
    initial: "F",
    tagline: "Six dice, a rising pile of points, and the nerve to know when to stop.",
    path: "/farkle",
    rules: [
      {
        heading: "The object",
        body: "Be the first to bank ten thousand points. Points are gathered a turn at a time, and a turn lasts only as long as your luck holds.",
      },
      {
        heading: "The throw",
        body: "Roll all six dice, then set aside at least one scoring die. You may bank what you have and end your turn, or throw the dice that remain to add to the pile.",
      },
      {
        heading: "Scoring",
        body: "Each one is worth a hundred, each five is worth fifty. Three of a kind pays a hundred times the face — three ones pay a thousand — and each further die of that kind doubles it. A run of one to six pays fifteen hundred, three pairs pay fifteen hundred, and two triplets pay twenty-five hundred.",
      },
      {
        heading: "Farkle",
        body: "If a throw shows nothing that can be set aside you have farkled: the whole pile for that turn is lost and the dice pass to your opponent.",
      },
      {
        heading: "Hot dice",
        body: "Score with all six dice in a single turn and the dice run hot — pick up all six and throw again, carrying your pile with you.",
      },
    ],
  },
  {
    id: "yahtzee",
    name: "Yahtzee",
    initial: "Y",
    tagline: "Five dice, thirteen boxes, and the hunt for all five alike.",
    path: "/yahtzee",
    rules: [
      {
        heading: "The object",
        body: "Fill all thirteen boxes on your scorecard. When both cards are full the higher grand total wins the table.",
      },
      {
        heading: "The turn",
        body: "Throw all five dice, then hold any you wish and throw the rest. You have three throws in all, after which you must enter a score in one open box.",
      },
      {
        heading: "The upper section",
        body: "Ones through sixes score the sum of the dice showing that number. Reach sixty-three or more across the upper section and you earn a bonus of thirty-five.",
      },
      {
        heading: "The lower section",
        body: "Three of a kind and four of a kind score the total of all five dice. A full house pays twenty-five, a small straight of four in a row pays thirty, a large straight of five in a row pays forty, and five alike — Yahtzee — pays fifty. Chance simply scores the total of the dice.",
      },
      {
        heading: "No empty hands",
        body: "Every turn must fill a box. If nothing fits, you must enter a zero somewhere — choosing where to take that loss is half the game.",
      },
    ],
  },
  {
    id: "crazy-eights",
    name: "Crazy Eights",
    initial: "E",
    tagline: "Follow the suit, follow the rank, and let a wild eight turn the table.",
    path: "/crazy-eights",
    rules: [
      {
        heading: "The object",
        body: "Be first to shed every card in your hand.",
      },
      {
        heading: "The deal",
        body: "Seven cards each from a single pack. One card is turned up to start the discard pile and the rest becomes the stock.",
      },
      {
        heading: "The play",
        body: "Lay a card matching the up card in suit or in rank. Play alternates, and each card laid becomes the new up card.",
      },
      {
        heading: "Wild eights",
        body: "An eight may be laid on anything. Whoever lays it names the suit that must be followed next.",
      },
      {
        heading: "Drawing",
        body: "If nothing in your hand follows, draw one card from the stock. Lay it if it fits, otherwise pass the turn.",
      },
    ],
  },
  {
    id: "chase-the-ace",
    name: "Chase the Ace",
    initial: "A",
    tagline: "One card each, three lives apiece, and the nerve not to be caught low.",
    path: "/chase-the-ace",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Hold onto your three lives. Each round the player left holding the lower card loses one, and the last player standing wins the table.",
      },
      {
        heading: "The deal",
        body: "A single card each from one pack. Aces are low and kings are high, so the ace is the card you never want to be caught holding.",
      },
      {
        heading: "Your turn",
        body: "Look at your card, then keep it or chase a better one by swapping it for the top of the deck. You will see what you draw.",
      },
      {
        heading: "Charlotte's turn",
        body: "Charlotte peeks at her card and either keeps it or chases a stronger one from the deck.",
      },
      {
        heading: "The reveal",
        body: "Both cards turn face up. The lower card loses a life; a tie loses nothing. When one of you runs out of lives, the other wins.",
      },
    ],
  },
  {
    id: "rummy",
    name: "Gin Rummy",
    initial: "G",
    tagline: "Meld your runs and sets, shed the deadwood, and knock for gin.",
    path: "/rummy",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Be first to reach one hundred points. Points are won each hand by melding your cards and knocking before your opponent.",
      },
      {
        heading: "The deal",
        body: "Ten cards each from one pack. One card is turned up to start the discard, and the rest becomes the stock.",
      },
      {
        heading: "The play",
        body: "On your turn draw the top of the stock or take the top discard, then lay one card on the discard. Aces run low.",
      },
      {
        heading: "Melds",
        body: "A meld is a set of three or four of a rank, or a run of three or more consecutive cards in one suit. Everything else is deadwood, scored by its pip — faces count ten, aces one.",
      },
      {
        heading: "The knock",
        body: "When your deadwood is ten points or fewer you may knock, laying a card face down to end the hand. If you have no deadwood at all it is gin, worth a twenty-five point bonus.",
      },
      {
        heading: "The count",
        body: "Both hands are shown. The player who didn't knock lays their deadwood onto the knocker's melds. The knocker scores the difference — or is undercut, worth a twenty-five point bonus to the opponent. First to one hundred wins the table.",
      },
    ],
  },
  {
    id: "triangles",
    name: "Triangles",
    initial: "T",
    tagline: "Twenty scattered spots, one line at a time, and the third line takes the triangle.",
    path: "/triangles",
    rules: [
      {
        heading: "The object",
        body: "Claim more triangles than your opponent. When no more lines can be drawn without crossing, the higher tally wins the table.",
      },
      {
        heading: "The board",
        body: "Twenty spots are scattered at random and left unjoined — a fresh layout every game. Each player has a colour, and a triangle you close is filled in yours.",
      },
      {
        heading: "Drawing",
        body: "Players take it in turn to draw one line between any two spots, so long as it does not touch or cross a line already on the board. A line once drawn cannot be moved or taken away.",
      },
      {
        heading: "Claiming",
        body: "Draw the third and final line of a triangle and it is marked as yours — but only if no other spot sits inside it. A single line may close two triangles at once, and both are yours.",
      },
      {
        heading: "The tactic",
        body: "Avoid giving a triangle its second line: doing so leaves the third for your opponent, and one careless line can hand over a whole chain.",
      },
    ],
  },
  {
    id: "solitaire",
    name: "Solitaire",
    initial: "S",
    tagline: "Deal the tableau, build four foundations, and send every card home.",
    path: "/solitaire",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Move every card onto the four foundations. Each foundation holds one suit, built up from Ace to King.",
      },
      {
        heading: "The setup",
        body: "Seven tableau piles are dealt from one to seven cards, left to right. The top card of each pile is face up, the rest face down, and what remains becomes the stock.",
      },
      {
        heading: "The stock and waste",
        body: "Click the stock to flip one or three cards onto the waste — set your preference with the Draw toggle. When the stock runs out, the waste is turned back over and you go again.",
      },
      {
        heading: "Moving on the tableau",
        body: "Build down in alternating colours: a red six goes on a black seven. Whole face-up runs move together, and only a king may fill an empty tableau pile.",
      },
      {
        heading: "Foundations",
        body: "Send Aces up as soon as they appear, then build each suit in order. Double-click any card to fly it home, or click it and then a foundation. A foundation card can be brought back down to the tableau.",
      },
      {
        heading: "Finishing",
        body: "Click a face-down tableau card to turn it over. When every tableau card is face up and the stock is spent, the table clears itself. Undo as often as you like — each undo counts as a move.",
      },
    ],
  },
  {
    id: "freecell",
    name: "FreeCell",
    initial: "F",
    tagline: "Eight piles, four free cells, and a careful path home.",
    path: "/freecell",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Move every card onto the four foundations. Each foundation holds one suit, built up in order from Ace to King.",
      },
      {
        heading: "The setup",
        body: "Eight tableau piles are dealt face up — four with seven cards and four with six. The four free cells in the upper left and the four foundations in the upper right start empty.",
      },
      {
        heading: "The free cells",
        body: "Each free cell holds a single card. You can move the top card of any tableau pile, free cell, or foundation onto an empty free cell, and move a free cell card onto a tableau pile or foundation.",
      },
      {
        heading: "Moving on the tableau",
        body: "Build down in alternating colours: a red six goes on a black seven. Whole descending runs move together, but only as many cards as there are empty free cells and empty tableau piles, plus one. Any single card may fill an empty tableau pile.",
      },
      {
        heading: "Foundations",
        body: "Send Aces up as soon as they appear, then build each suit in order. Double-click a card to fly it home, or drag it onto a foundation. A foundation card can be brought back down to a free cell or the tableau.",
      },
      {
        heading: "Finishing",
        body: "With the free cells empty and every tableau pile ordered as a descending, alternating run, the table clears itself. Undo as often as you like — each undo counts as a move.",
      },
    ],
  },
  {
    id: "reversi",
    name: "Reversi",
    initial: "R",
    tagline: "Outflank your opponent and turn the board your colour.",
    path: "/reversi",
    beta: true,
    rules: [
      {
        heading: "The object",
        body: "Own more discs than your opponent when the board is full. You play the dark discs and Charlotte plays the light ones.",
      },
      {
        heading: "The setup",
        body: "The four centre squares begin with two discs of each colour, placed diagonally.",
      },
      {
        heading: "Placing a disc",
        body: "On your turn, place a disc on an empty square that sandwiches one or more of your opponent's discs in a straight line — horizontal, vertical or diagonal — between your new disc and one of your own.",
      },
      {
        heading: "Flipping",
        body: "Every sandwiched disc flips to your colour. A single move can flip discs in several directions at once.",
      },
      {
        heading: "Passing",
        body: "If you have no legal move you pass, and play returns to your opponent. The game ends when neither player can move.",
      },
      {
        heading: "Winning",
        body: "When the board is full — or neither of you can move — the player with the most discs of their colour wins.",
      },
    ],
  },
];

export const getGame = (id: GameId): GameMeta => {
  const game = GAMES.find((entry) => entry.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
};
