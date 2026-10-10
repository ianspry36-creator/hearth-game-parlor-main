export type GameId = "addiction" | "backgammon" | "canfield" | "checkers" | "clock" | "crazy-eights" | "crescent" | "cribbage" | "farkle" | "freecell" | "hearts" | "kings-in-the-corner" | "pyramid" | "reversi" | "scorpion" | "solitaire" | "spider" | "sultan" | "triangles" | "tripeaks" | "warship" | "yahtzee" | "yukon";

export type GameMeta = {
  id: GameId;
  name: string;
  initial: string;
  tagline: string;
  path: "/addiction" | "/backgammon" | "/canfield" | "/checkers" | "/clock" | "/crazy-eights" | "/crescent" | "/cribbage" | "/farkle" | "/freecell" | "/hearts" | "/kings-in-the-corner" | "/pyramid" | "/reversi" | "/scorpion" | "/solitaire" | "/spider" | "/sultan" | "/triangles" | "/tripeaks" | "/warship" | "/yahtzee" | "/yukon";
  rules: { heading: string; body: string }[];
  history: string;
  historySource?: string;
  beta?: boolean;
  comingSoon?: boolean;
  ownerOnly?: boolean;
};

export const GAMES: GameMeta[] = [
  {
    id: "addiction",
    name: "Addiction",
    initial: "A",
    tagline: "Four rows, four suits, and a single careful line from two to king.",
    path: "/addiction",
    history:
      "A modern patience game, a close cousin of the solitaire family, and a member of the Montana group of patiences, where the goal is to arrange all the cards in suit from Deuce to King. Its name comes from the way a single misstep can leave a player hopelessly hooked, restarting again and again in search of the perfect line.",
    historySource: "https://en.wikipedia.org/wiki/Gaps",
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
    id: "backgammon",
    name: "Backgammon",
    initial: "B",
    tagline: "Twenty-four points across the board, decided by a roll of the dice.",
    path: "/backgammon",
    history:
      "Backgammon is the most widespread Western member of the tables family of games, a lineage whose ancestors reach back to ancient boards such as the Royal Game of Ur in Mesopotamia. The earliest record of backgammon itself dates to seventeenth-century England, descended from the sixteenth-century game of Irish, while the Romans played a close relative they called tabula. It took its familiar modern shape over the centuries that followed.",
    historySource: "https://en.wikipedia.org/wiki/Backgammon",
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
    id: "canfield",
    name: "Canfield",
    initial: "C",
    tagline: "Build four foundations up from the lead rank and drain the reserve home.",
    path: "/canfield",
    history:
      "An English patience first known as Demon Patience and once praised as the best game for one pack yet invented. It became known as Canfield in the United States after a story linked it to the celebrated casino owner Richard A. Canfield, who supposedly turned it into a gambling game - though the game actually played at his casino may have been Klondike. It is closely related to Klondike and remains one of the most popular games of its type.",
    historySource: "https://en.wikipedia.org/wiki/Canfield_(solitaire)",
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
    id: "checkers",
    name: "Checkers",
    initial: "C",
    tagline: "Jump, capture and crown your way across the chequered board.",
    path: "/checkers",
    history:
      "Played for thousands of years; a board discovered in the ancient city of Ur dates back to around 3000 BC, and the game descends from older Middle Eastern board games such as alquerque. The version played today - English draughts, on an 8x8 board with twelve pieces a side - was standardised in England, where the familiar forced-capture rules became the modern standard.",
    historySource: "https://en.wikipedia.org/wiki/English_draughts",
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
    id: "clock",
    name: "Clock Solitaire",
    initial: "C",
    tagline: "Deal the deck around the clock and lay each card at its own hour before the fourth King tolls.",
    path: "/clock",
    history:
      "A cheerful, almost mechanical patience dealt around a circle of twelve piles like the face of a clock, with the kings gathered at the centre. Also known as Sundial and closely related to the game of Travellers, it needs no skill at all - only patience while the cards reveal whether the deck will strike midnight in order.",
    historySource: "https://en.wikipedia.org/wiki/Clock_(card_game)",
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
        body: "Turn over any of the four centre cards — your choice — and lay it face up beneath the pile of its own number: an Ace under one o'clock, a seven under seven. Then turn the top card of that pile, and so on around the clock, returning to the centre whenever a King is laid.",
      },
      {
        heading: "Winning and losing",
        body: "Lay every card before the fourth King appears and you've won — odds of about one in thirteen. Turn the fourth King too soon and the clock has struck; the hand is lost.",
      },
    ],
  },
  {
    id: "crazy-eights",
    name: "Crazy Eights",
    initial: "E",
    tagline: "Follow the suit, follow the rank, and let a wild eight turn the table.",
    path: "/crazy-eights",
    history:
      "Crazy Eights is the best-known American member of the Eights group of shedding games, in which players race to be first to discard every card by matching rank or suit. The same family includes Switch, Mau-Mau and Whot!, and the game is best remembered today as the direct ancestor of Uno, which dressed the same rules in a bright commercial suit.",
    historySource: "https://en.wikipedia.org/wiki/Crazy_Eights",
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
    id: "crescent",
    name: "Crescent Solitaire",
    initial: "C",
    tagline: "Sixteen face-up piles in a crescent, two decks, and eight foundations built from the King down and the Ace up.",
    path: "/crescent",
    history:
      "Crescent Solitaire is a compact patience game played with two whole decks arranged in a distinctive crescent of sixteen face-up piles. Unusually for a solitaire, every card is dealt face up from the start, and the game is won by gathering each suit onto two rows of foundations — one built down from the King, the other up from the Ace. Its generous shuffle allowance, chosen from easy, medium, or hard, makes it far more winnable than its classic three-shuffle ancestor.",
    historySource: "https://en.wikipedia.org/wiki/Crescent_(solitaire)",
    rules: [
      {
        heading: "The object",
        body: "Move every card from the sixteen tableau piles onto the eight foundations.",
      },
      {
        heading: "The setup",
        body: "Two decks are dealt into sixteen face-up piles of six, laid out in a crescent. The four foundations in the top row each hold a King and build down to the Ace; the four in the bottom row each hold an Ace and build up to the King.",
      },
      {
        heading: "Moving on the tableaus",
        body: "Move one card at a time onto a pile whose top card is the same suit and one rank higher or lower — an eight of clubs on a seven or nine of clubs. The sequence wraps around, so a King may take an Ace and an Ace may take a King.",
      },
      {
        heading: "The foundations",
        body: "Send a card home when it is the next rank of its suit on its foundation. You may bring a foundation card back down to the tableaus to free something useful, but the starting Kings and Aces can never be removed.",
      },
      {
        heading: "Shuffling",
        body: "When no top card will play, shuffle: the bottom card of every pile moves to the top. Easy gives nine shuffles, medium six, and hard three.",
      },
      {
        heading: "Winning",
        body: "Once every card sits in order on the foundations, the crescent is cleared.",
      },
    ],
  },
  {
    id: "cribbage",
    name: "Cribbage",
    initial: "C",
    tagline: "Four suits, a peg, and a quiet duel of points and patience.",
    path: "/cribbage",
    history:
      "Invented in the early seventeenth century by Sir John Suckling, the English poet and courtier, who added the crib and the distinctive wooden scoring board. It has been played ever since, beloved in pubs and famously aboard Royal Navy submarines. Its unique scoring language - fifteens, pairs, runs and nobs - has barely changed in four hundred years.",
    historySource: "https://en.wikipedia.org/wiki/Cribbage",
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
    id: "farkle",
    name: "Farkle",
    initial: "F",
    tagline: "Six dice, a rising pile of points, and the nerve to know when to stop.",
    path: "/farkle",
    history:
      "An old push-your-luck dice game believed to have reached North America aboard French sailing ships in the 1600s, passed down through families ever since as a folk game. It is known by many names over the years - Ten Thousand, Zilch, Greed, Zonk and more - and has been marketed commercially as Pocket Farkel since 1996. Whatever it is called, the thrill is the same: bank your score or risk the whole pile on one more roll.",
    historySource: "https://en.wikipedia.org/wiki/Farkle",
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
        body: "Each one is worth a hundred, each five is worth fifty. Three of a kind pays a hundred times the face — three ones pay a thousand — four of a kind pays a thousand, five of a kind pays two thousand, and six of a kind pays three thousand. A run of one to six pays fifteen hundred, three pairs pay fifteen hundred, and two triplets pay twenty-five hundred.",
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
    id: "freecell",
    name: "FreeCell",
    initial: "F",
    tagline: "Eight piles, four free cells, and a careful path home.",
    path: "/freecell",
    history:
      "FreeCell was created as a computer game by Paul Alfille, who devised it in the late 1960s while a student at the University of Illinois, where it quietly circulated among computer users for years. It became a household name when Microsoft bundled it with Windows in 1995, and its near-universal winnability - very few deals are genuinely unsolvable - is still debated by players today.",
    historySource: "https://en.wikipedia.org/wiki/FreeCell",
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
    id: "hearts",
    name: "Hearts",
    initial: "H",
    tagline: "Avoid the hearts and the queen of spades — or take them all and shoot the moon.",
    path: "/hearts",
    comingSoon: true,
    history:
      "Hearts is a trick-avoidance game first recorded in the United States in the 1880s, a member of the Whist family that flips the usual goal on its head: players try not to win tricks at all. Its ancestor Reversis, an eighteenth-century French trick-taking game, shared the same aim of dodging penalties. The modern version, with its heart penalties and the dreaded queen of spades, has since been overtaken by its close variants Black Lady and Black Maria.",
    historySource: "https://en.wikipedia.org/wiki/Hearts_(card_game)",
    rules: [
      {
        heading: "The object",
        body: "Take as few penalty points as you can. Every heart is worth one point and the queen of spades is worth thirteen, for twenty-six points in all.",
      },
      {
        heading: "The deal",
        body: "The full deck is dealt evenly among four players. The player holding the two of clubs leads the first trick.",
      },
      {
        heading: "Passing",
        body: "Before each hand every player passes three cards — to the left, then right, then across, with the fourth hand a hold. Choose the cards you least want to keep.",
      },
      {
        heading: "Following suit",
        body: "The leader plays any card, and each player in turn must follow suit if they can. The highest card of the led suit wins the trick, and its winner leads the next.",
      },
      {
        heading: "Breaking hearts",
        body: "Hearts may not be led until a heart has been played on an earlier trick — unless a player's hand holds nothing but hearts. Points may not be played on the very first trick.",
      },
      {
        heading: "Shooting the moon",
        body: "Take all twenty-six points in a hand and you shoot the moon: every opponent scores twenty-six while you score nothing.",
      },
      {
        heading: "Winning",
        body: "Hands continue until someone reaches one hundred points. When that happens, the player with the lowest total wins.",
      },
    ],
  },
  {
    id: "kings-in-the-corner",
    name: "Kings in the Corner",
    initial: "K",
    tagline: "Settle all twelve face cards into their reserved slots to win the hand.",
    path: "/kings-in-the-corner",
    history:
      "An American card game that emerged in the early twentieth century, built around the simple idea that a king should reign from a corner. Played with a single deck, it blends the table-laying of solitaire with the pace of a family shedding game. It spread as a cosy parlour game, easy enough for any table to pick up.",
    historySource: "https://en.wikipedia.org/wiki/Kings_in_the_Corner",
    rules: [
      {
        heading: "The object",
        body: "Place all twelve face cards — the four kings, four queens and four jacks — in the slots reserved for them. Numbered cards only keep the game moving: pair numbers that add up to ten to clear space and keep drawing until every face card is placed.",
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
        body: "Once the board is full, select two cards whose ranks add up to ten — an ace and a nine, a two and an eight, a three and a seven, a four and a six, or a pair of fives — to clear them both. A ten is cleared on its own. You cannot remove cards until every slot is filled, and once the board fills up you must clear every ten and every pair that adds up to ten before the next card is drawn.",
      },
      {
        heading: "Losing",
        body: "You lose if you draw a face card and every slot of its kind is taken, or if the board fills up with no pair that adds up to ten.",
      },
      {
        heading: "Winning",
        body: "When every jack, queen and king sits in its proper slot, the hand is won.",
      },
    ],
  },
  {
    id: "pyramid",
    name: "Pyramid Solitaire",
    initial: "P",
    tagline: "Seven rows of cards, one simple sum of thirteen, and every pair clears the way.",
    path: "/pyramid",
    history:
      "Pyramid is a pairing solitaire in which cards are cleared by matching two whose ranks add up to thirteen. Its origins are less precisely documented than Klondike's, but it became a household favourite through the computer solitaire collections of the 1990s, where its neat triangular layout and quick, puzzle-like play made it a permanent resident of the deck.",
    historySource: "https://en.wikipedia.org/wiki/Pyramid_(solitaire)",
    rules: [
      {
        heading: "The object",
        body: "Clear every card from the pyramid by pairing cards whose ranks add up to thirteen — an ace counts as one, a jack as eleven, a queen as twelve and a king as thirteen.",
      },
      {
        heading: "The deal",
        body: "Twenty-eight cards are dealt face up into seven rows that form a pyramid, one card on the top row down to seven on the base. The remaining twenty-four cards wait face down in the stock.",
      },
      {
        heading: "Making a pair",
        body: "Match any two available cards whose ranks add to thirteen — a 3 and a 10, a 5 and an 8, and so on. A card is available when nothing covers it, and the top card of the waste is always available.",
      },
      {
        heading: "The king",
        body: "A king already ranks as thirteen all by itself, so it can't be paired. Click a king once — in the pyramid or on the waste — and it flies to the foundation alone.",
      },
      {
        heading: "The stock and waste",
        body: "Flip cards from the stock one at a time onto the waste. When the stock runs dry you may reset it and draw through again, as often as you like.",
      },
      {
        heading: "A card it covers",
        body: "You may also pair a card with the card directly above it that it covers, provided the other card covering it has already been cleared.",
      },
      {
        heading: "Winning",
        body: "Remove all twenty-eight pyramid cards and the game is won. Not every deal is winnable, so undo freely and chase your fewest moves and fastest time.",
      },
    ],
  },
  {
    id: "reversi",
    name: "Reversi",
    initial: "R",
    tagline: "Outflank your opponent and turn the board your colour.",
    path: "/reversi",
    history:
      "Reversi was invented in London in the 1880s, credited both to Lewis Waterman and, independently, to John W. Mollett. It languished for decades until a Japanese salesman, Goro Hasegawa, revived and renamed it Othello in 1971, after Shakespeare's play. Under that name it conquered the world and remains the best-known form of the game today.",
    historySource: "https://en.wikipedia.org/wiki/Reversi",
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
    id: "scorpion",
    name: "Scorpion Solitaire",
    initial: "S",
    tagline: "Lay four same-suit runs, King down to Ace, and let the scorpion's tail carry you home.",
    path: "/scorpion",
    history:
      "Scorpion is a solitaire that blends the tableau-building of Spider with the open, everything-on-the-table honesty of Yukon. Its origin is obscure, but it is counted among the more demanding of the patience games. Its reputation for difficulty has long attracted determined players chasing a rare completed game.",
    historySource: "https://en.wikipedia.org/wiki/Scorpion_(solitaire)",
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
    id: "solitaire",
    name: "Solitaire",
    initial: "S",
    tagline: "Deal the tableau, build four foundations, and send every card home.",
    path: "/solitaire",
    history:
      "The patience we call Solitaire is properly Klondike, the most widely played member of the solitaire family. Its precise origins are uncertain, though it rose to popularity in the early twentieth century. It introduced millions to computers when Microsoft bundled it with Windows 3.0 in 1990, and that little green window made it the world's best-known card game.",
    historySource: "https://en.wikipedia.org/wiki/Klondike_(solitaire)",
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
    id: "spider",
    name: "Spider Solitaire",
    initial: "S",
    tagline: "Two decks, ten columns, and eight same-suit runs to build from King down to Ace.",
    path: "/spider",
    history:
      "Spider is a two-deck patience game whose name comes from the eight legs of a spider, matching the eight sequences of cards the player must assemble. Popularised by its inclusion in the Windows versions of the 1990s, it is now one of the most widely played solitaires in the world. Its four-suit form is notoriously hard to solve, which is why the one-suit and two-suit forms exist as gentler introductions.",
    historySource: "https://en.wikipedia.org/wiki/Spider_(solitaire)",
    rules: [
      {
        heading: "The object",
        body: "Build eight complete runs, each King down to Ace in a single suit. When a full same-suit run is complete it is removed from the table, and the game is won when every card has gone home.",
      },
      {
        heading: "The deal",
        body: "Spider uses two full decks, 104 cards. Fifty-four cards are dealt into ten columns — the first four get six cards, the other six get five — with only the top card of each column face up. The remaining fifty cards form the stock.",
      },
      {
        heading: "Moving a card",
        body: "A card can always be moved onto a card one rank higher, in any suit. You may move several cards together only when they form an unbroken descending run in a single suit, such as the eight, seven and six of clubs onto a nine.",
      },
      {
        heading: "Empty columns",
        body: "Any card or run may be placed on an empty column, so keep a free column handy for reshuffling sequences.",
      },
      {
        heading: "Clearing a run",
        body: "A run only clears when all thirteen cards share a suit, from King down to Ace. Cards beneath the run stay put, and any face-down card underneath is turned over.",
      },
      {
        heading: "The stock",
        body: "Click the stock to deal ten cards, one onto each column. Every column must hold at least one card before you may deal, so fill empty columns first.",
      },
      {
        heading: "Scoring",
        body: "You begin with 100 points, lose one for every move, and gain fifty for each completed run. A careful player finishes with a healthy positive score.",
      },
      {
        heading: "Difficulty",
        body: "Play with one suit (beginner), two suits (intermediate), or all four suits (advanced). The deck always holds 104 cards — only the variety of suits changes.",
      },
    ],
  },
  {
    id: "sultan",
    name: "Sultan Solitaire",
    initial: "S",
    tagline: "Ring the King of Hearts with foundations and send every card home.",
    path: "/sultan",
    history:
      "Sultan is a patience built around a single fixed card — the King of Hearts, seated in the centre of the table as the Sultan. Around him stand the foundations, each climbing in a single suit from its seed rank, while six reserve cells wait to hold a card in readiness. It belongs to a family of French patiences in which a monarch sits at the centre of a ring of suits, cousins of the two-pack games played under the Empress and the Queen.",
    historySource: "https://en.wikipedia.org/wiki/Sultan_(solitaire)",
    rules: [
      {
        heading: "The object",
        body: "Move every card onto the foundations. When each foundation has climbed to its Queen, the table is solved.",
      },
      {
        heading: "The setup",
        body: "The King of Hearts sits alone in the centre as the Sultan. Around him stand the foundations, seeded with their first card: the Ace of Hearts directly above, and a ring of Kings beyond it. Six reserve cells hold a single card each, and the rest of the deck forms the stock.",
      },
      {
        heading: "Building the foundations",
        body: "Each foundation is built upward in a single suit, wrapping from King to Ace. A King is followed by the Ace, then 2, 3 and so on to the Queen. The Ace of Hearts foundation above the Sultan climbs from Ace straight up to the Queen of Hearts.",
      },
      {
        heading: "One deck or two",
        body: "Play with one deck for four foundations, or two decks for eight. With two decks there are two foundations for spades, clubs and diamonds and one for hearts beyond the Ace of Hearts — the second King of Hearts is already seated in the middle.",
      },
      {
        heading: "Moving a card",
        body: "Only the top waste card or a card from a reserve cell may move. Place it onto a foundation of the same suit when it is the next rank, or tuck it into an empty reserve cell to keep it out of the way.",
      },
      {
        heading: "The stock and waste",
        body: "Turn cards from the stock one at a time. When the stock runs dry you may turn the waste over and shuffle it into a fresh stock — twice — before the hand is truly spent.",
      },
    ],
  },
  {
    id: "tripeaks",
    name: "Tri Peaks Solitaire",
    initial: "T",
    tagline: "Three pyramids share one valley — climb a rank up or down and clear every peak.",
    path: "/tripeaks",
    history:
      "Tri Peaks was created by Robert Hogue in 1989, making it one of the youngest members of the solitaire family. Its three overlapping pyramids, and its simple hunt for the next card one rank up or down, made it an instant favourite. It became especially popular when it shipped as a computer game in the decades that followed.",
    historySource: "https://en.wikipedia.org/wiki/Tri_Peaks",
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
    id: "triangles",
    name: "Triangles",
    initial: "T",
    tagline: "Twenty scattered spots, one line at a time, and the third line takes the triangle.",
    path: "/triangles",
    history:
      "This is the peg-and-board puzzle long found on cafe tables and truck-stop counters, in which one jumps pegs to leave as few behind as possible. The game's exact origin is unclear - peg solitaire in its various forms has been played in Europe since at least the seventeenth century. The triangular board, with its fifteen holes and fourteen pegs, has teased players for generations.",
    historySource: "https://en.wikipedia.org/wiki/Peg_solitaire",
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
    id: "warship",
    name: "Warship",
    initial: "W",
    tagline: "Nine hidden ships, ten by ten of open water, and a duel of guesswork.",
    path: "/warship",
    history:
      "Better known as Battleship, this game began as a pencil-and-paper guessing game played by soldiers in the First World War. The grid-and-salvo format circulated for decades before Milton Bradley turned it into a plastic board game in 1967. It has been sinking fleets ever since, on tables and then on computer screens.",
    historySource: "https://en.wikipedia.org/wiki/Battleship_(game)",
    rules: [
      {
        heading: "The object",
        body: "Find and sink your opponent's entire fleet of nine ships before they sink yours.",
      },
      {
        heading: "The fleet",
        body: "Each admiral hides a Battleship of four squares, a Cruiser and a Submarine of three each, a Destroyer and a Frigate of two each, and a Patrol Boat, Gunboat, Scout and Skiff of one square each. Ships sit horizontally or vertically and may not overlap.",
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
        body: "The first admiral to sink all nine of the enemy ships wins the engagement.",
      },
    ],
  },
  {
    id: "yahtzee",
    name: "Yahtzee",
    initial: "Y",
    tagline: "Five dice, thirteen boxes, and the hunt for all five alike.",
    path: "/yahtzee",
    history:
      "Yahtzee was created in 1954 by a Canadian couple who played it with friends aboard their yacht and called it the Yacht Game. Toy and game entrepreneur Edwin S. Lowe bought the rights and, in 1956, renamed it Yahtzee. The familiar five dice and thirteen-box score sheet have been rolling ever since.",
    historySource: "https://en.wikipedia.org/wiki/Yahtzee",
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
    id: "yukon",
    name: "Yukon Solitaire",
    initial: "Y",
    tagline: "Lift whole columns regardless of order and build four suits home from the Ace.",
    path: "/yukon",
    history:
      "Yukon is a close relative of Klondike, distinguished by its signature freedom: whole columns may be lifted and moved regardless of order, with every card dealt face up from the start. Its origins are modest and its recorded history short. Its wide-open table has made it a favourite of patient solitaire players who prefer a clear view of every card.",
    historySource: "https://en.wikipedia.org/wiki/Yukon_(solitaire)",
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
