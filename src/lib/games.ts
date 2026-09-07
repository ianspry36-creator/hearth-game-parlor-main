export type GameId = "cribbage" | "backgammon" | "warship" | "farkle" | "yahtzee" | "crazy-eights" | "triangles" | "solitaire" | "freecell" | "addiction" | "reversi" | "checkers" | "kings-in-the-corner" | "canfield" | "clock" | "scorpion" | "tripeaks" | "yukon";

export type GameMeta = {
  id: GameId;
  name: string;
  initial: string;
  tagline: string;
  path: "/cribbage" | "/backgammon" | "/warship" | "/farkle" | "/yahtzee" | "/crazy-eights" | "/triangles" | "/solitaire" | "/freecell" | "/addiction" | "/reversi" | "/checkers" | "/kings-in-the-corner" | "/canfield" | "/clock" | "/scorpion" | "/tripeaks" | "/yukon";
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
    id: "warship",
    name: "Warship",
    initial: "W",
    tagline: "Eight hidden ships, ten by ten of open water, and a duel of guesswork.",
    path: "/warship",
    rules: [
      {
        heading: "The object",
        body: "Find and sink your opponent's entire fleet of eight ships before they sink yours.",
      },
      {
        heading: "The fleet",
        body: "Each admiral hides a Carrier of five squares, a Battleship of four, a Cruiser and a Submarine of three each, a Destroyer of two, and a Patrol Boat, Gunboat and Scout of one square each. Ships sit horizontally or vertically and may not overlap.",
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
        body: "The first admiral to sink all eight of the enemy ships wins the engagement.",
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
    id: "addiction",
    name: "Addiction",
    initial: "A",
    tagline: "Four rows, four suits, and a single careful line from two to king.",
    path: "/addiction",
    rules: [
      {
        heading: "The object",
        body: "Order the table so each of the four rows reads two through king of a single suit in sequence, with an empty slot at the far right of every row.",
      },
      {
        heading: "The deal",
        body: "A full deck is dealt into four rows of thirteen cards. The four aces are then removed, leaving four empty slots to work with.",
      },
      {
        heading: "Moving a card",
        body: "A card may move into an empty slot only when the card immediately to its left is the same suit and exactly one rank lower. A two may occupy only the leftmost slot of a row, and nothing may sit to the right of a king.",
      },
      {
        heading: "Locked in",
        body: "Once a card forms an unbroken run back to a two on the far left, it is locked in place — shown with a gold pip — and can never be shuffled away.",
      },
      {
        heading: "Shuffling",
        body: "Three times a game you may shuffle every card that is not yet locked and redeal it into the empty slots. Locked cards stay put, so progress is never lost.",
      },
      {
        heading: "Winning",
        body: "When all four rows read two through king of a single suit and the rightmost slot of each is empty, the table is solved.",
      },
    ],
  },
  {
    id: "kings-in-the-corner",
    name: "Kings in the Corner",
    initial: "K",
    tagline: "Settle twelve face cards into their slots and pair off every number that sums to ten.",
    path: "/kings-in-the-corner",
    rules: [
      {
        heading: "The object",
        body: "Place all twelve face cards in the slots reserved for them, then clear every other card from the table by pairing numbers that add up to ten.",
      },
      {
        heading: "The deal",
        body: "A full deck is shuffled and the top card is turned face up. The sixteen-slot board begins empty, and every card you draw must be placed.",
      },
      {
        heading: "Placing a card",
        body: "Kings go only in the four corner slots, queens only in the two middle slots of the top and bottom rows, and jacks only in the two middle slots of the left and right columns. Numbered cards may fill any empty slot.",
      },
      {
        heading: "Removing cards",
        body: "Select two cards whose ranks add up to ten — an ace and a nine, a two and an eight, a three and a seven, a four and a six, or a pair of fives — to clear them both. A ten is cleared on its own.",
      },
      {
        heading: "Losing",
        body: "You lose if you draw a face card and every slot of its kind is taken, or if the board fills up with no pair that adds up to ten.",
      },
      {
        heading: "Winning",
        body: "When every face card sits in its proper slot and the stock is empty, the hand is won.",
      },
    ],
  },
  {
    id: "reversi",
    name: "Reversi",
    initial: "R",
    tagline: "Outflank your opponent and turn the board your colour.",
    path: "/reversi",
    rules: [
      {
        heading: "The object",
        body: "Own more discs than your opponent when the board is full. You play the dark discs and Ada plays the light ones.",
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
  {
    id: "checkers",
    name: "Checkers",
    initial: "C",
    tagline: "Jump, capture and crown your way across the chequered board.",
    path: "/checkers",
    rules: [
      {
        heading: "The object",
        body: "Capture all of Ada's pieces — or leave her with no legal move — to win. You play the dark men on the three rows nearest you.",
      },
      {
        heading: "The setup",
        body: "Each side begins with twelve men on the dark squares of the three rows closest to them. The light squares are never used.",
      },
      {
        heading: "Movement",
        body: "A man moves diagonally forward one square onto an empty dark square. Men never move backward until they are crowned.",
      },
      {
        heading: "Capturing",
        body: "Jump over an adjacent opponent's piece onto the empty square beyond to capture it. Capturing is compulsory, and a single turn may chain several jumps together. You must take any jump that is available, though you are never forced to take the most.",
      },
      {
        heading: "Kings",
        body: "Reach the far row to be crowned a king. Kings move and jump diagonally forward and backward. If you are crowned in the middle of a jump, you must stop and wait until your next turn to move backward.",
      },
      {
        heading: "Winning",
        body: "You lose if all your pieces are captured, or if you have no legal move. The game is a draw if the same position comes up three times without a capture, or if a hundred moves pass with no piece taken.",
      },
    ],
  },
  {
    id: "canfield",
    name: "Canfield",
    initial: "C",
    tagline: "Build four foundations up from the lead rank and drain the reserve home.",
    path: "/canfield",
    rules: [
      {
        heading: "The object",
        body: "Move all fifty-two cards onto the four foundations. Each foundation holds one suit, built upward from the lead rank dealt at the start and wrapping from King to Ace.",
      },
      {
        heading: "The setup",
        body: "One card is dealt to the first foundation to fix the lead rank. Thirteen cards go to the reserve, one to each of the four tableau piles, and the rest to the stock.",
      },
      {
        heading: "The foundations",
        body: "Build each suit upward from the lead rank, wrapping King to Ace. An empty foundation is started with a card of the lead rank, and a foundation card may be brought back down to the tableau.",
      },
      {
        heading: "The stock and waste",
        body: "Click the stock to flip one or three cards onto the waste — set your preference with the Draw toggle. When the stock runs out, the waste is turned over and redealt.",
      },
      {
        heading: "The reserve",
        body: "Only the top reserve card may be moved, to a foundation or the tableau. Whenever a tableau pile empties, the top reserve card fills it automatically.",
      },
      {
        heading: "Moving on the tableau",
        body: "Build down in alternating colours, wrapping from Ace to King: a red six goes on a black seven, and a King may sit on an Ace. Whole or partial runs move together. Double-click a card to fly it home.",
      },
      {
        heading: "Finishing",
        body: "When the stock and reserve are spent, the table clears itself. Undo as often as you like — each undo counts as a move.",
      },
    ],
  },
  {
    id: "clock",
    name: "Clock Solitaire",
    initial: "C",
    tagline: "Deal the deck around the clock and lay each card at its own hour before the fourth King tolls.",
    path: "/clock",
    rules: [
      {
        heading: "The object",
        body: "Lay all fifty-two cards face up, each at its own hour of the clock — the Ace at one o'clock, two through ten at their numbers, the Jack at eleven, the Queen at twelve, and the Kings in the centre.",
      },
      {
        heading: "The deal",
        body: "The whole deck is dealt face down into thirteen piles of four, set in a circle like the hours of a clock. The thirteenth pile, in the middle, belongs to the Kings.",
      },
      {
        heading: "The play",
        body: "Turn over the top card of the centre pile and lay it face up beneath the pile of its own number — an Ace under one o'clock, a seven under seven. Then turn the top card of that pile, and so on around the clock.",
      },
      {
        heading: "Winning and losing",
        body: "Lay every card before the fourth King appears and you've won — odds of about one in thirteen. Turn the fourth King too soon and the clock has struck; the hand is lost.",
      },
    ],
  },
  {
    id: "scorpion",
    name: "Scorpion Solitaire",
    initial: "S",
    tagline: "Lay four same-suit runs, King down to Ace, and let the scorpion's tail carry you home.",
    path: "/scorpion",
    rules: [
      {
        heading: "The object",
        body: "Build four piles, each a single suit running in descending order from the King down to the Ace. Finish all four runs and the table is cleared.",
      },
      {
        heading: "The setup",
        body: "Seven piles of seven cards are dealt to the body. The first four piles hold three cards face down with four on top; the last three are entirely face up. Three cards remain face down as the tail.",
      },
      {
        heading: "Moving",
        body: "Lift any face-up card — and everything stacked above it — onto a card of the same suit that is one rank higher, like the four of hearts onto the five of hearts. The cards above move along regardless of suit. Only a King may sit on an empty pile.",
      },
      {
        heading: "The tail",
        body: "Deal the tail to drop one card onto each of the first three piles. Traditionally you may only do this once you are stuck, but with Clear completed runs on you may deal it whenever you like.",
      },
      {
        heading: "Flipping cards",
        body: "Whenever a face-down card is exposed it is turned face up for you automatically.",
      },
      {
        heading: "Clearing runs",
        body: "With Clear completed runs on, a finished King-to-Ace run is whisked off the table to the foundations as soon as it forms. With it off, runs stay put and you must play around them.",
      },
      {
        heading: "Time and moves",
        body: "Your moves are counted and your time is kept, so you can chase your best game. Undo as often as you like — but each undo counts as a move.",
      },
    ],
  },
  {
    id: "tripeaks",
    name: "Tri Peaks Solitaire",
    initial: "T",
    tagline: "Three pyramids share one valley — climb a rank up or down and clear every peak.",
    path: "/tripeaks",
    rules: [
      {
        heading: "The object",
        body: "Play every card from the three peaks onto the waste pile. Win by leaving the peaks empty — the cards still in the stock don't matter.",
      },
      {
        heading: "The setup",
        body: "Three overlapping pyramids share a bottom row of ten face-up cards, with nine, eight and seven cards face down above them. The rest of the deck waits face down in the stock.",
      },
      {
        heading: "Playing a card",
        body: "An open card — one face up with nothing covering it — may be played onto the waste when it ranks one higher or one lower than the waste's top card. You may turn the corner: an Ace sits on a King or a Two. When the waste is empty, any open card will do.",
      },
      {
        heading: "The stock",
        body: "When no open card fits, draw from the stock to turn over a new waste card. You may only pass through the stock once, so save it for when you're truly stuck.",
      },
      {
        heading: "Winning and losing",
        body: "Clear all thirty-four peak cards and you've won. Run out of stock while no open card fits and the hand is lost — but you can always undo to try another path.",
      },
      {
        heading: "Numbered games and records",
        body: "Fifty thousand numbered games are dealt fresh from their number, and your best result for each is remembered. Be first to win a game, break your own record, or simply leave fewer cards behind than ever before.",
      },
    ],
  },
  {
    id: "yukon",
    name: "Yukon Solitaire",
    initial: "Y",
    tagline: "Lift whole columns regardless of order and build four suits home from the Ace.",
    path: "/yukon",
    rules: [
      {
        heading: "The object",
        body: "Move every card onto the four foundations, each built up in a single suit from the Ace to the King.",
      },
      {
        heading: "The setup",
        body: "Seven piles fan across the table. The first pile holds a single face-up card; each of the other six holds one fewer card face down with five more face up on top. There is no stock — every card is already on the table.",
      },
      {
        heading: "Moving",
        body: "Lift any face-up card and everything above it, ordered or not, onto a face-up card of the opposite colour that is one rank higher — the seven of hearts onto the eight of spades. Only the bottom card you are moving must match. A King, with whatever is piled above it, may be placed on an empty pile.",
      },
      {
        heading: "Building the foundations",
        body: "Cards may be sent to the foundations straight from the tableau, and you may also bring a foundation card back down when it would help you uncover the face-down cards.",
      },
      {
        heading: "Flipping cards",
        body: "When a pile's face-up cards are gone, its top face-down card turns over for you.",
      },
      {
        heading: "Winning",
        body: "Once every face-down card is turned over, the remaining cards fly home on their own. Your moves and time are kept so you can chase your best game — undo as often as you like, but each undo counts as a move.",
      },
    ],
  },
];

export const getGame = (id: GameId): GameMeta => {
  const game = GAMES.find((entry) => entry.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
};
