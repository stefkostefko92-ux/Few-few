/** EN/IT translations of per-game marketing content (BG is the source of truth,
 * see games.ts). Keyed by GameKey. */
import type { GameKey } from "@aso/shared";

export interface GameContentTranslation {
  title: string;
  players: string;
  summary: string;
  intro: string;
  howTo: { name: string; text: string }[];
  faq: { question: string; answer: string }[];
}

export const GAME_CONTENT_I18N: Partial<Record<"en" | "it", Partial<Record<GameKey, GameContentTranslation>>>> = {
  en: {
    BELOTE: {
      title: "Belote",
      players: "4 (2 vs 2)",
      summary:
        "Play Belote online for free — the classic Bulgarian 2 vs 2 card game in real time.",
      intro:
        "Belote is the beloved Bulgarian trick-taking game for four players in two teams. The goal is for your team to score more points from tricks and declarations; the match is played to 151 points.",
      howTo: [
        {
          name: "The deal",
          text: "From a 32-card deck each player gets 5 cards (3 + 2); after the bidding, 3 more are dealt to each — everyone plays with 8.",
        },
        {
          name: "Bidding",
          text: "You bid a suit (♣ < ♦ < ♥ < ♠), No Trumps or All Trumps, with double and redouble; three passes close the bidding, and four passes mean a redeal.",
        },
        {
          name: "Playing tricks",
          text: "Follow suit; if you can't, you must trump (unless your partner is winning the trick), and in trumps you must play a higher trump if you can.",
        },
        {
          name: "Scoring",
          text: "Declarations (tierce, fifty, hundred, four of a kind, belote) are added to the trick points, and the last trick is worth +10. The contracting team must score more than the opponents, or it goes \"inside\".",
        },
      ],
      faq: [
        {
          question: "How do you play Belote?",
          answer:
            "Belote is played by four people in two teams with a 32-card deck: you bid for trumps, follow suit, trump when you can't and collect points from tricks and declarations — the match is played to 151.",
        },
        {
          question: "How many cards are dealt in Belote?",
          answer:
            "First each player is dealt 5 cards (3 + 2) and the bidding takes place, then 3 more are dealt to each — every player plays with 8 cards.",
        },
        {
          question: "Is Belote free to play on АСО?",
          answer: "Yes, Belote on АСО is free to play with virtual points — no real-money wagering.",
        },
      ],
    },
    SANTASE: {
      title: "Santase (Sixty-Six)",
      players: "2",
      summary: "Play Santase (Sixty-Six) online — the fast two-player card game with trumps and declarations.",
      intro:
        "Santase (also known as Sixty-Six) is a two-player game with a 24-card deck, a face-up trump and marriages of \"twenty\" and \"forty\" (king and queen of the same suit). The match is played to 11 game points.",
      howTo: [
        {
          name: "The deal",
          text: "Each player gets 6 cards; one card is turned up to set the trump and the rest form the stock. After each trick you both draw — the winner first.",
        },
        {
          name: "Play",
          text: "While the stock is open, you don't have to follow suit; once you close it or it runs out, you must follow suit and trump.",
        },
        {
          name: "Declarations",
          text: "A king and queen of the same suit, declared when you lead, score 20 points (40 in trumps); the points count once you've won a trick.",
        },
        {
          name: "Goal",
          text: "The first to reach 66 points wins the hand — 1, 2 or 3 game points depending on the opponent's score; the match is played to 11.",
        },
      ],
      faq: [
        {
          question: "Why is Santase called Sixty-Six?",
          answer: "Because the goal is to score 66 points in a hand before your opponent — that's where the game's second name comes from.",
        },
        {
          question: "How many cards is Santase played with?",
          answer: "Santase is played with a reduced 24-card deck (9, J, Q, K, 10, A of the four suits).",
        },
      ],
    },
    CHESS: {
      title: "Chess",
      players: "2",
      summary: "Play Chess online against players and bots — the classic strategic board game.",
      intro:
        "Chess is the two-player strategy game. The goal is to put your opponent's king in checkmate.",
      howTo: [
        { name: "Setup", text: "Each side starts with 16 pieces on an 8×8 board." },
        {
          name: "Moves",
          text: "Every piece moves by its own rules; White moves first. There are also special moves — castling, en passant and pawn promotion.",
        },
        { name: "Checkmate", text: "Attack the king so that no legal move can save it." },
      ],
      faq: [
        {
          question: "How do you play Chess?",
          answer:
            "Chess is played by two people on an 8×8 board; you take turns moving pieces until one puts the other's king in checkmate.",
        },
        {
          question: "Can I play Chess against the computer on АСО?",
          answer: "Yes, if no opponent is available, you play against a bot with adjustable difficulty.",
        },
      ],
    },
    BACKGAMMON: {
      title: "Backgammon",
      players: "2",
      summary: "Play Backgammon online — the classic dice-and-checkers game for two.",
      intro:
        "Backgammon is a two-player dice race. You bring all 15 of your checkers into your home board and bear them off before your opponent to win.",
      howTo: [
        {
          name: "Rolling",
          text: "You roll two dice and move your checkers according to the numbers shown; doubles are played four times.",
        },
        {
          name: "Hitting",
          text: "A lone opponent checker can be hit — it goes to the bar and must re-enter before that player moves any other checker.",
        },
        { name: "Bearing off", text: "Once all your checkers are in your home board, you start bearing them off." },
      ],
      faq: [
        {
          question: "How do you play Backgammon?",
          answer:
            "Backgammon is played by two people with dice; you move 15 checkers around the board and win by being the first to bear off all of them.",
        },
      ],
    },
    SVARA: {
      title: "Svara",
      players: "2–6",
      summary:
        "Play Svara online with virtual chips — a social bluffing game, no real-money gambling.",
      intro:
        "Svara is a fast bluffing and betting game played with virtual chips. It's a social game — not real-money gambling.",
      howTo: [
        { name: "The deal", text: "Each player posts an opening bet (the ante) and gets 3 cards from a 7-to-ace deck." },
        { name: "Betting", text: "You take turns calling, raising or folding until the bets are even." },
        {
          name: "Showdown",
          text: "The strongest hand wins — the sum of cards of one suit or one rank, with the 7♣ as a wild card; if the best hands tie, a \"svara\" is played.",
        },
      ],
      faq: [
        {
          question: "Is Svara real-money gambling?",
          answer:
            "No. Svara on АСО is a social game played only with virtual chips, which can't be exchanged or paid out as real money.",
        },
      ],
    },
    EIGHTBALL: {
      title: "Pool (8-ball)",
      players: "2",
      summary:
        "Play 8-ball pool online for free — realistic physics, aiming and shooting right in the browser.",
      intro:
        "Eight-ball is the most popular pool game. One player pockets the solids (1–7), the other the stripes (9–15); whoever clears their group and then pockets the black 8-ball on a legal shot wins.",
      howTo: [
        {
          name: "The break",
          text: "The break must be legal — a ball pocketed or at least 4 balls driven to a rail; an 8-ball pocketed on the break is re-spotted.",
        },
        { name: "Groups", text: "Your group (solids or stripes) is set by the first legally pocketed ball." },
        {
          name: "Aiming",
          text: "Aim with the guide line, set your power and shoot; first hit one of your own balls, then a ball must be pocketed or reach a rail.",
        },
        {
          name: "Winning",
          text: "Clear your group and pocket the 8-ball last; pocketing it early or on a foul (including a scratch) loses the game.",
        },
      ],
      faq: [
        {
          question: "How do you play 8-ball pool?",
          answer:
            "You pocket the balls in your group (solids or stripes), then the black 8-ball at the end — no need to call the pocket; a foul gives your opponent ball in hand anywhere, and pocketing the 8-ball early loses.",
        },
        {
          question: "Is the pool physics realistic?",
          answer:
            "Yes — shots are simulated with deterministic collision and friction physics, identical on the server and in the browser.",
        },
      ],
    },
    NINEBALL: {
      title: "Pool (9-ball)",
      players: "2",
      summary:
        "Play 9-ball pool online for free — fast-paced pool where you always hit the lowest ball first.",
      intro:
        "Nine-ball is a fast pool game with balls 1 through 9. You always hit the lowest ball on the table first; whoever pockets the 9-ball on a legal shot wins the game.",
      howTo: [
        {
          name: "Order",
          text: "First contact is always with the lowest-numbered ball on the table; then a ball must be pocketed or reach a rail.",
        },
        { name: "Continuing", text: "Pocket a ball on a legal shot and you keep shooting — in any pocket." },
        {
          name: "Winning",
          text: "The 9-ball pocketed on a legal shot (even on a combination or the break) wins at once; three fouls in a row lose the game.",
        },
      ],
      faq: [
        {
          question: "What's the difference between 8-ball and 9-ball?",
          answer:
            "In 9-ball there are no groups — you always hit the lowest ball first and win as soon as you pocket the 9-ball on a legal shot, even on a combination.",
        },
      ],
    },
    SNOOKER: {
      title: "Snooker",
      players: "2",
      summary: "Play snooker online for free — the classic of red and colored balls with scoring.",
      intro:
        "Snooker is played with 15 reds and 6 colors on a large table. You alternate a red and a color; the colors return to their spots while reds remain. The player with more points in the frame wins.",
      howTo: [
        { name: "Alternating", text: "Pot a red (1 point), then a color of your choice (2–7 points)." },
        { name: "Re-spotting", text: "The colors return to their spots as long as reds remain on the table." },
        { name: "Endgame", text: "With no reds left, the colors are potted in order — from yellow to black." },
        {
          name: "Points",
          text: "A foul gives your opponent at least 4 points (or the value of the ball involved, if higher); the player with more points wins.",
        },
      ],
      faq: [
        {
          question: "How much are the balls worth in snooker?",
          answer:
            "Red = 1, yellow = 2, green = 3, brown = 4, blue = 5, pink = 6, black = 7 points.",
        },
      ],
    },
    MAGNAT: {
      title: "Magnat",
      players: "2–6",
      summary:
        "Magnat is an economic board game set in Bulgarian cities — buy property, build and bankrupt your rivals in 3D in the browser.",
      intro:
        "Magnat is a premium economic board game in the \"roll and move\" tradition — an original theme of Bulgarian cities, with no third-party intellectual property. You go around the board, buy cities and stations, build houses and hotels and collect rent until your opponents go bankrupt. All \"currency\" is virtual and applies only to that match — a social game, not real-money gambling. The board is fully 3D with an isometric view.",
      howTo: [
        {
          name: "Roll the dice",
          text: "On your turn you roll two dice and move your token forward; on doubles you roll again, and three doubles in a row send you to jail. Passing Start pays 200.",
        },
        {
          name: "Buy property",
          text: "Land on a free city, station or utility and you can buy it; if you decline, the property goes to auction.",
        },
        {
          name: "Collect rent",
          text: "When an opponent lands on your property, they pay rent — doubled for a complete set and higher still with houses and a hotel; a mortgaged property earns no rent.",
        },
        {
          name: "Build and develop",
          text: "With a complete set you build houses evenly, then a hotel; you can mortgage and sell on your turn, and lifting a mortgage costs +10%.",
        },
        {
          name: "Win",
          text: "A player who can't pay goes bankrupt; the last player standing wins, or the richest one when the turn limit is reached.",
        },
      ],
      faq: [
        {
          question: "Is Magnat the same as Monopoly?",
          answer:
            "No. Magnat is an original game with its own theme (Bulgarian cities) and names — the mechanics of this genre are public domain (from The Landlord's Game, 1904), without Monopoly's trademark or design.",
        },
        {
          question: "Is it played with real money?",
          answer:
            "No — the money in Magnat is virtual and applies only within the match. It can't be bought, exchanged or paid out as real money. This is a social game.",
        },
        {
          question: "How many players is it for?",
          answer: "Magnat is played by 2 to 6 people — against friends or against bots if no opponents are available.",
        },
        {
          question: "How long does one game take?",
          answer:
            "About 30–60 minutes. There's a cap on turns, so games always finish without dragging on forever.",
        },
        {
          question: "Is it really 3D?",
          answer: "Yes — the board is a true 3D scene with an isometric view, moving tokens, houses and hotels, and realistic lighting.",
        },
      ],
    },
    WAR: {
      title: "War",
      players: "2",
      summary: "Play War online for free — the fast two-player card game where the higher card wins.",
      intro:
        "War is the simplest two-player card game — almost entirely down to luck. The deck is split evenly and each player flips one card; the higher one takes both.",
      howTo: [
        { name: "The deal", text: "The deck is split into two equal piles — one for each player." },
        { name: "The duel", text: "Both players flip their top card; the higher one wins both cards." },
        {
          name: "War",
          text: "On a tie, the player on turn chooses a battle (3 cards face down + 1 face up) or a skirmish (1 face down + 1 face up); another tie extends the war.",
        },
        {
          name: "Winning",
          text: "Three wins in a row earn a \"raid\" — one extra card from your opponent; the player who collects all the cards wins.",
        },
      ],
      faq: [
        {
          question: "How do you play the card game War?",
          answer:
            "War is played by two people: you split the deck evenly and flip a card each — the higher one takes both; on a tie a \"war\" breaks out — a battle or a skirmish with face-down cards.",
        },
        {
          question: "Is there any strategy in War?",
          answer:
            "Hardly — War is mostly a game of luck; the only choice is between a battle and a skirmish when a war breaks out, which makes it fast and well suited to beginners and children.",
        },
      ],
    },
    GOFISH: {
      title: "Go Fish",
      players: "2–4",
      summary: "Play \"Go Fish\" online — the fun card game where you collect sets of four.",
      intro:
        "\"Go Fish\" is a light family card game. You ask opponents for cards to collect sets of four of the same rank, and if they don't have any — you go fish in the ocean.",
      howTo: [
        {
          name: "The deal",
          text: "With two players each gets 7 cards, with three or four — 5; the rest form the \"ocean\".",
        },
        {
          name: "Asking",
          text: "On your turn you ask a specific player for a rank you already hold; if they have it, they hand over all those cards and you go again.",
        },
        {
          name: "Go fish",
          text: "If they don't have it, you draw from the ocean; if you draw exactly the rank you asked for, you go again, otherwise the turn passes on.",
        },
        {
          name: "Sets",
          text: "Four cards of one rank are laid down automatically as a set; once all 13 sets are down, the player with the most wins.",
        },
      ],
      faq: [
        {
          question: "How do you play \"Go Fish\"?",
          answer:
            "You ask a specific player for cards of a rank you already hold in order to collect sets of four; if they have none, you draw a card from the ocean — the player with the most collected sets wins.",
        },
      ],
    },
    KENT: {
      title: "Kent (Coup)",
      players: "4",
      summary: "Play Kent (Coup) online — the team card game with signals between partners.",
      intro:
        "Kent (Coup) is a lively team card game for four players in two teams. The goal is to collect four of a kind and use a secret sign to cue your partner to call \"Coup!\" before your opponents catch on. The match is played to 3 points.",
      howTo: [
        { name: "Goal", text: "Everyone holds 4 cards, and each team races to be the first to collect four of a kind." },
        {
          name: "Swapping",
          text: "There are 4 face-up cards in the center; on your turn you swap one of your cards for a center card or pass, and when all four players pass in a row, the center cards are replaced.",
        },
        { name: "Signal", text: "Once you have four of a kind, you give your partner a secret sign — only they can see it." },
        {
          name: "Coup",
          text: "Your partner calls \"Coup!\" and if you hold four of a kind, your team wins a point; a wrong \"Coup!\" gives the point to the opponents.",
        },
        {
          name: "Stop",
          text: "If you suspect the opponents have four of a kind, call \"Stop!\" — if you're right, the point is yours; if you're wrong, it's theirs.",
        },
      ],
      faq: [
        {
          question: "How do you play Kent?",
          answer:
            "Kent is played by four people in two teams: you swap cards with the center until you collect four of a kind, give your partner a secret sign and they call \"Coup!\", while against the opponents you can call \"Stop!\" — the match is played to 3 points.",
        },
      ],
    },
    DRAUGHTS: {
      title: "Draughts (Checkers)",
      players: "2",
      summary: "Play Draughts (Checkers) online against players and bots — the classic on an 8×8 board in real time.",
      intro:
        "Draughts (Checkers) is a two-player strategy game played under international rules on an 8×8 board. You move your pieces diagonally, jump over and capture your opponent's, and a piece that reaches the last row becomes a flying king.",
      howTo: [
        { name: "Move", text: "You move one piece diagonally forward by one square; White starts." },
        {
          name: "Capturing",
          text: "Capturing is mandatory — always with the longest possible sequence; ordinary pieces also capture backward, and captured pieces are removed at the end of the move.",
        },
        {
          name: "King",
          text: "A piece whose move ends on the last row becomes a king; it's a \"flying\" king — it moves and captures along a whole diagonal.",
        },
        { name: "Winning", text: "You win when your opponent is left with no pieces or no legal move." },
      ],
      faq: [
        {
          question: "How do you play Draughts?",
          answer:
            "Draughts is played on an 8×8 board under international rules: you move pieces diagonally, capturing is mandatory with the longest sequence, and on the last row a piece becomes a flying king — whoever captures or blocks all of the other's pieces wins.",
        },
        {
          question: "Is capturing mandatory in Draughts?",
          answer: "Yes — if you can capture an enemy piece, you must, and you must take the sequence that captures the most pieces.",
        },
      ],
    },
    LUDO: {
      title: "Ludo",
      players: "2–4",
      summary: "Play \"Ludo\" online — the classic with a die and tokens in real 3D.",
      intro:
        "\"Ludo\" is the beloved family dice game for up to four players. You get your tokens out of the base, go around the board and are the first to bring all four into the finish. The board is fully 3D.",
      howTo: [
        {
          name: "Start",
          text: "You need a \"6\" to get a token out of the base; a \"6\" also gives an extra roll, and while all your tokens are in the base you get up to three tries.",
        },
        {
          name: "Movement",
          text: "You move a token forward by as many squares as the die shows; two of your tokens on one square form a blockade that no one can pass.",
        },
        {
          name: "Capturing",
          text: "Land on a square with a lone opponent token and you send it back to its base — except on the safe squares (the start squares and the marked ones).",
        },
        {
          name: "Coming home",
          text: "You can only enter your colored finish with an exact roll; the first to bring all four tokens home wins.",
        },
      ],
      faq: [
        {
          question: "How do you play \"Ludo\"?",
          answer:
            "You roll a die, get a token out with a \"6\", move it around the board according to the die and capture lone opponent tokens outside the safe squares — the player who's first to bring all four tokens into the finish with an exact roll wins.",
        },
        {
          question: "Is the board really 3D?",
          answer: "Yes — \"Ludo\" on АСО is played on a true 3D board with three-dimensional tokens, a rolling die and realistic lighting.",
        },
      ],
    },
    RUMMY: {
      title: "Rummy",
      players: "2",
      summary: "Play Rummy (Gin Rummy) online — the classic card game of building runs and sets.",
      intro:
        "Rummy on АСО is played by Gin Rummy rules — a card game for two. You arrange your 10 cards into runs of one suit and sets of the same rank and aim to be left with as little deadwood as possible. The match is played to 100.",
      howTo: [
        { name: "Drawing", text: "Each player has 10 cards; on your turn you draw from the stock or take the top discard." },
        {
          name: "Melding",
          text: "A run = 3+ consecutive cards of one suit (ace is low); a set = 3–4 cards of one rank. Cards outside them are deadwood: ace 1, face cards 10, others face value.",
        },
        { name: "Discarding", text: "You finish your turn by discarding one card." },
        {
          name: "Knocking",
          text: "Once your deadwood is 10 or less, you can knock; \"gin\" is knocking with no deadwood at all. Your opponent lays off their deadwood on your melds (except after gin).",
        },
      ],
      faq: [
        {
          question: "How do you play Rummy?",
          answer:
            "Rummy on АСО is Gin Rummy for two: you draw and discard a card each turn, build runs and sets, and knock when your deadwood is 10 or less. The knocker scores the difference (+25 for gin); if the opponent has less or equal deadwood, it's an undercut and they score the difference +25.",
        },
      ],
    },
    DOMINO: {
      title: "Dominoes",
      players: "2–4",
      summary: "Play Dominoes online for free — the classic with tiles where you match equal numbers.",
      intro:
        "Dominoes is a tile game (double-six, draw variant) for two to four players. You place tiles so their touching ends match by number and aim to be the first to play all your tiles; the match is played to 100 points.",
      howTo: [
        {
          name: "The deal",
          text: "With two players each draws 7 tiles, with three or four — 5; the rest stay in the \"boneyard\". The first hand is opened by whoever holds the highest double.",
        },
        { name: "Placing", text: "You attach a tile to one of the open ends only if the numbers match." },
        {
          name: "Drawing",
          text: "If you have no suitable tile, you draw from the boneyard until you can play; passing is allowed only when the boneyard is empty.",
        },
        {
          name: "Winning",
          text: "Play your last tile and you score the points left in the other hands; in a blocked game the lowest total wins.",
        },
      ],
      faq: [
        {
          question: "How do you play Dominoes?",
          answer:
            "You take turns placing tiles so the touching ends show equal numbers; if you have no move, you draw from the boneyard until you can play — the first to play all their tiles scores the points left in the other hands, and the match is played to 100.",
        },
      ],
    },
    BRIDGE: {
      title: "Bridge",
      players: "4",
      summary: "Play Bridge online — the intellectual team card game with bidding and tricks.",
      intro:
        "Bridge (rubber bridge) is the classic trick-taking game for four players in two teams. First you bid for a contract, then you play it out — the declarer's partner's hand (the \"dummy\") is laid face up and played by the declarer. The team that wins 2 games takes the rubber.",
      howTo: [
        {
          name: "Bidding",
          text: "You bid for a contract — the number of tricks above 6 plus a trump suit or no trumps; double and redouble apply only to the opponents' bid, and three passes close the auction.",
        },
        {
          name: "Dummy",
          text: "The declarer is the first player of the side to name the contract's strain; after the opening lead, their partner's hand is laid face up and the declarer plays it.",
        },
        {
          name: "Play",
          text: "Follow suit; the trick is won by the highest trump or the highest card of the suit led.",
        },
        {
          name: "Scoring",
          text: "A made contract scores below the line (game is 100), overtricks and bonuses above the line; a failed contract gives points to the defenders.",
        },
      ],
      faq: [
        {
          question: "How do you play Bridge?",
          answer:
            "Bridge is played by four people in two teams: you bid for a contract, then play out the tricks with the exposed \"dummy\" — the goal is to make your contract and win the rubber (2 games).",
        },
        {
          question: "Is Bridge hard for beginners?",
          answer: "Bridge has more depth than most card games, but on АСО you can play against bots and learn the bidding at your own pace.",
        },
      ],
    },
    BATTLESHIP: {
      title: "Battleship",
      players: "2",
      summary: "Play Battleship online — the classic where you guess and sink your opponent's hidden fleet.",
      intro:
        "Battleship is a guessing game for two. Your fleet is placed on a grid automatically and in secret, then you take turns firing at coordinates until one player sinks the other's entire fleet.",
      howTo: [
        {
          name: "Placement",
          text: "The fleet (1 ship of 4, 2 of 3, 3 of 2 and 4 of 1 square) is placed automatically and in secret; ships never touch, not even diagonally.",
        },
        {
          name: "Firing",
          text: "On your turn you pick a square on your opponent's grid — \"hit\" or \"miss\"; a hit gives you another shot.",
        },
        { name: "Sinking", text: "Hit all the squares of a given ship and it's sunk." },
        { name: "Winning", text: "The player who's first to sink the opponent's entire fleet wins." },
      ],
      faq: [
        {
          question: "How do you play Battleship?",
          answer:
            "Your fleet is placed on a grid automatically and in secret, and you take turns with your opponent firing at coordinates — a hit earns another shot, and whoever's first to sink all the enemy ships wins.",
        },
      ],
    },
    DICE: {
      title: "Dice Poker",
      players: "2–4",
      summary: "Play Dice Poker (Yahtzee-style) online — roll five dice and fill 13 categories for points.",
      intro:
        "Dice poker is a Yahtzee-style game with five dice: each turn you roll up to three times and score the result in one of 13 categories — from ones to sixes, full house, straights, five of a kind and chance. The highest total wins.",
      howTo: [
        { name: "Rolling", text: "You roll the five dice up to three times, keeping any dice you choose between rolls." },
        {
          name: "Categories",
          text: "Upper (ones–sixes) — the sum of the matching dice, with a +35 bonus at 63+; lower — three of a kind, four of a kind, full house 25, small straight 30, large straight 40, five of a kind 50 and chance.",
        },
        {
          name: "Scoring",
          text: "After rolling you must score the result in one empty category — even for zero.",
        },
        { name: "Winning", text: "After 13 rounds the player with the highest total wins; a tie is a draw." },
      ],
      faq: [
        {
          question: "How do you play Dice Poker?",
          answer:
            "You roll five dice up to three times per turn and score the result in one of 13 categories (full house, straights, five of a kind and more) — after 13 rounds the player with the highest total wins.",
        },
      ],
    },
    BINGO: {
      title: "Bingo",
      players: "2–6",
      summary: "Play Bingo online for free — numbers are drawn, your card marks itself, and a full line wins.",
      intro:
        "Bingo is a game of luck for 2 to 6 players. You have a 5×5 card with numbers from 1 to 75 and a free space in the center; drawn numbers are marked automatically, and the first to complete a full line wins.",
      howTo: [
        {
          name: "Card",
          text: "You get a 5×5 card with numbers 1–75 (column B 1–15, I 16–30, N 31–45, G 46–60, O 61–75) and a free space in the center.",
        },
        {
          name: "Drawing",
          text: "Numbers are drawn at random one by one and marked on your card automatically.",
        },
        { name: "Line", text: "The goal is a full line — a row, a column or a diagonal." },
        { name: "Bingo", text: "The first with a full line wins; if several players get bingo at once, they all win." },
      ],
      faq: [
        {
          question: "How do you play Bingo?",
          answer:
            "You have a 5×5 card of numbers; numbers are drawn and marked automatically, and you win once you're the first to complete a full line — a row, a column or a diagonal.",
        },
      ],
    },
    WORDS: {
      title: "Words",
      players: "2–4",
      summary: "Play \"Words\" online — the word chain game where each word starts with the last letter of the previous one.",
      intro:
        "\"Words\" is a word chain game for 2 to 4 players. Each new word must start with the last letter of the previous one; everyone has 3 lives, and the last player left in the game wins.",
      howTo: [
        {
          name: "Chain",
          text: "The game starts with a word; each next word must start with the last letter of the previous one.",
        },
        { name: "Valid word", text: "The word must be in the dictionary and not already used in the game." },
        {
          name: "Lives",
          text: "A wrong word or a pass costs you one of your three lives; a pass brings a new word to continue from.",
        },
        { name: "Winning", text: "A player with no lives left is out; the last one standing wins." },
      ],
      faq: [
        {
          question: "How do you play \"Words\"?",
          answer:
            "In turn, each player says a dictionary word that starts with the last letter of the previous one and hasn't been used yet; a mistake or a pass costs one of your 3 lives — the last player standing wins.",
        },
      ],
    },
  },
  it: {
    BELOTE: {
      title: "Belote",
      players: "4 (2 contro 2)",
      summary:
        "Gioca a Belote online gratis — il classico gioco di carte bulgaro 2 contro 2 in tempo reale.",
      intro:
        "Belote è l'amato gioco di prese bulgaro per quattro giocatori in due squadre. L'obiettivo è far sì che la tua squadra raccolga più punti con prese e dichiarazioni; la partita si gioca a 151 punti.",
      howTo: [
        {
          name: "La distribuzione",
          text: "Da un mazzo di 32 carte ciascuno riceve 5 carte (3 + 2); dopo la licitazione se ne distribuiscono altre 3 a testa — ognuno gioca con 8.",
        },
        {
          name: "La licitazione",
          text: "Si licita un seme (♣ < ♦ < ♥ < ♠), Senza atout o Tutto atout, con contro e surcontro; tre passi chiudono la licitazione, quattro passi portano a una nuova distribuzione.",
        },
        {
          name: "Gioco delle prese",
          text: "Rispondi al seme; se non puoi, sei obbligato a tagliare con la briscola (salvo che la presa sia del tuo compagno) e, se si gioca briscola, a superare con una briscola più alta, se puoi.",
        },
        {
          name: "Punteggio",
          text: "Ai punti delle prese si aggiungono le dichiarazioni (terza, cinquanta, cento, quattro carte uguali, belote) e l'ultima presa vale +10. La squadra del contratto deve fare più punti degli avversari, altrimenti va «dentro».",
        },
      ],
      faq: [
        {
          question: "Come si gioca a Belote?",
          answer:
            "Belote si gioca in quattro in due squadre con un mazzo di 32 carte: si licita la briscola, si risponde al seme, si taglia quando non si può rispondere e si raccolgono punti da prese e dichiarazioni — la partita è a 151.",
        },
        {
          question: "Quante carte si distribuiscono a Belote?",
          answer:
            "Prima si distribuiscono 5 carte a testa (3 + 2) e si licita, poi se ne aggiungono altre 3 — ogni giocatore gioca con 8 carte.",
        },
        {
          question: "Belote è gratis su АСО?",
          answer: "Sì, Belote su АСО si gioca gratis con punti virtuali — senza scommesse di denaro reale.",
        },
      ],
    },
    SANTASE: {
      title: "Santase (Sessantasei)",
      players: "2",
      summary: "Gioca a Santase (Sessantasei) online — il rapido gioco di carte per due con briscola e dichiarazioni.",
      intro:
        "Santase (noto anche come Sessantasei) è un gioco per due con un mazzo di 24 carte, una briscola scoperta e le dichiarazioni «venti» e «quaranta» (re e donna dello stesso seme). La partita si gioca a 11 punti partita.",
      howTo: [
        {
          name: "La distribuzione",
          text: "Ogni giocatore riceve 6 carte; una carta si scopre e determina la briscola, le altre formano il tallone. Dopo ogni presa si pesca — prima chi l'ha vinta.",
        },
        {
          name: "Gioco",
          text: "Finché il tallone è aperto non sei obbligato a rispondere al seme; quando lo chiudi o finisce, devi rispondere al seme e tagliare.",
        },
        {
          name: "Dichiarazioni",
          text: "Re e donna dello stesso seme, dichiarati quando sei di mano, valgono 20 punti (40 in briscola); i punti contano non appena vinci una presa.",
        },
        {
          name: "Obiettivo",
          text: "Il primo a raggiungere 66 punti vince la mano — 1, 2 o 3 punti partita in base al punteggio dell'avversario; la partita è a 11.",
        },
      ],
      faq: [
        {
          question: "Perché Santase si chiama Sessantasei?",
          answer: "Perché l'obiettivo è raccogliere 66 punti nella mano prima dell'avversario — da qui viene il secondo nome del gioco.",
        },
        {
          question: "Con quante carte si gioca a Santase?",
          answer: "Santase si gioca con un mazzo ridotto di 24 carte (9, J, Q, K, 10, A dei quattro semi).",
        },
      ],
    },
    CHESS: {
      title: "Scacchi",
      players: "2",
      summary: "Gioca a Scacchi online contro giocatori e bot — il classico gioco da tavolo di strategia.",
      intro:
        "Gli scacchi sono il gioco di strategia per due. L'obiettivo è dare scacco matto al re dell'avversario.",
      howTo: [
        { name: "Disposizione", text: "Ogni schieramento inizia con 16 pezzi su una scacchiera 8×8." },
        {
          name: "Mosse",
          text: "Ogni pezzo si muove secondo le proprie regole; il Bianco muove per primo. Ci sono anche mosse speciali — arrocco, presa en passant e promozione del pedone.",
        },
        { name: "Scacco matto", text: "Attacca il re in modo che nessuna mossa legale possa salvarlo." },
      ],
      faq: [
        {
          question: "Come si gioca a Scacchi?",
          answer:
            "Gli scacchi si giocano in due su una scacchiera 8×8; ci si alterna muovendo i pezzi finché uno dà scacco matto al re dell'altro.",
        },
        {
          question: "Posso giocare a Scacchi contro il computer su АСО?",
          answer: "Sì, se non c'è un avversario disponibile, giochi contro un bot con difficoltà regolabile.",
        },
      ],
    },
    BACKGAMMON: {
      title: "Backgammon",
      players: "2",
      summary: "Gioca a Backgammon online — il classico gioco di dadi e pedine per due.",
      intro:
        "Il backgammon è una corsa con i dadi per due. Porti tutte le tue 15 pedine nella tua casa e le fai uscire dalla tavola prima dell'avversario per vincere.",
      howTo: [
        {
          name: "Lancio",
          text: "Lanci due dadi e muovi le pedine in base ai numeri usciti; un doppio si gioca quattro volte.",
        },
        {
          name: "Colpire",
          text: "Una pedina avversaria isolata può essere colpita — va sulla barra e deve rientrare prima che il suo giocatore muova altre pedine.",
        },
        { name: "Uscita", text: "Quando tutte le tue pedine sono nella tua casa, inizi a farle uscire dalla tavola." },
      ],
      faq: [
        {
          question: "Come si gioca a Backgammon?",
          answer:
            "Il backgammon si gioca in due con i dadi; muovi 15 pedine sulla tavola e vinci se sei il primo a portarle tutte fuori.",
        },
      ],
    },
    SVARA: {
      title: "Svara",
      players: "2–6",
      summary:
        "Gioca a Svara online con fiches virtuali — un gioco sociale di bluff, senza gioco d'azzardo con denaro reale.",
      intro:
        "Svara è un rapido gioco di bluff e puntate con fiches virtuali. È un gioco sociale — non è gioco d'azzardo con denaro reale.",
      howTo: [
        {
          name: "La distribuzione",
          text: "Ogni giocatore versa una puntata iniziale (l'ante) e riceve 3 carte da un mazzo dal 7 all'asso.",
        },
        { name: "Puntate", text: "Ci si alterna tra vedere, rilanciare o passare finché le puntate non si pareggiano." },
        {
          name: "Showdown",
          text: "Vince la mano più forte — la somma delle carte di uno stesso seme o di uno stesso valore, con il 7♣ come jolly; se le mani migliori sono pari, si gioca la «svara».",
        },
      ],
      faq: [
        {
          question: "Svara è gioco d'azzardo con denaro reale?",
          answer:
            "No. Svara su АСО è un gioco sociale solo con fiches virtuali, che non si scambiano né si convertono in denaro reale.",
        },
      ],
    },
    EIGHTBALL: {
      title: "Biliardo (palla 8)",
      players: "2",
      summary:
        "Gioca a biliardo palla 8 online gratis — fisica realistica, mira e tiro direttamente nel browser.",
      intro:
        "Il biliardo a 8 palle (eight-ball) è il gioco di pool più popolare. Un giocatore imbuca le palle piene (1–7), l'altro quelle a strisce (9–15); chi libera il proprio gruppo e poi imbuca la palla nera numero 8 con un tiro regolare vince.",
      howTo: [
        {
          name: "L'apertura",
          text: "La spaccata deve essere regolare — una palla in buca o almeno 4 palle che toccano la sponda; la palla 8 imbucata in apertura torna sul suo punto.",
        },
        { name: "Gruppi", text: "Il tuo gruppo (piene o strisce) è deciso dalla prima palla imbucata regolarmente." },
        {
          name: "Mira",
          text: "Mira con la linea guida, regola la potenza e tira; prima colpisci una palla del tuo gruppo, poi una palla deve andare in buca o toccare una sponda.",
        },
        {
          name: "Vittoria",
          text: "Libera il tuo gruppo e imbuca la palla 8 per ultima; se la imbuchi prima del tempo o con un fallo (anche con la bianca in buca), perdi.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a biliardo palla 8?",
          answer:
            "Imbuchi le palle del tuo gruppo (piene o a strisce) e alla fine la palla nera numero 8 — senza dover chiamare la buca; un fallo dà all'avversario palla in mano ovunque, e la palla 8 imbucata prima del tempo fa perdere.",
        },
        {
          question: "La fisica del biliardo è realistica?",
          answer:
            "Sì — i tiri sono simulati con una fisica deterministica di collisioni e attrito, identica sul server e nel browser.",
        },
      ],
    },
    NINEBALL: {
      title: "Biliardo (palla 9)",
      players: "2",
      summary:
        "Gioca a biliardo palla 9 online gratis — pool dinamico in cui colpisci per prima la palla più bassa.",
      intro:
        "Il nine-ball è un rapido gioco di pool con le palle da 1 a 9. Colpisci sempre per prima la palla più bassa sul tavolo; chi imbuca la palla 9 con un tiro regolare vince la partita.",
      howTo: [
        {
          name: "Ordine",
          text: "Il primo contatto è sempre con la palla dal numero più basso sul tavolo; poi una palla deve andare in buca o toccare una sponda.",
        },
        { name: "Continuazione", text: "Se imbuchi una palla con un tiro regolare, continui a giocare — in qualsiasi buca." },
        {
          name: "Vittoria",
          text: "La palla 9 imbucata con un tiro regolare (anche di combinazione o in apertura) vince subito; tre falli consecutivi fanno perdere.",
        },
      ],
      faq: [
        {
          question: "Qual è la differenza tra palla 8 e palla 9?",
          answer:
            "Nella palla 9 non ci sono gruppi — colpisci sempre per prima la palla più bassa e vinci non appena imbuchi la palla 9 con un tiro regolare, anche di combinazione.",
        },
      ],
    },
    SNOOKER: {
      title: "Snooker",
      players: "2",
      summary: "Gioca a snooker online gratis — il classico con palle rosse e colorate e punteggio.",
      intro:
        "Lo snooker si gioca con 15 palle rosse e 6 colorate su un tavolo grande. Alterni una rossa e una colorata; le colorate tornano sul loro spot finché ci sono rosse. Vince il giocatore con più punti nel frame.",
      howTo: [
        { name: "Alternanza", text: "Imbuca una rossa (1 punto), poi una colorata a scelta (2–7 punti)." },
        { name: "Riposizionamento", text: "Le colorate tornano sul loro spot finché restano rosse sul tavolo." },
        { name: "Finale", text: "Senza più rosse, le colorate si imbucano in ordine — dalla gialla alla nera." },
        {
          name: "Punti",
          text: "Un fallo dà all'avversario almeno 4 punti (o il valore della palla coinvolta, se maggiore); vince il giocatore con più punti.",
        },
      ],
      faq: [
        {
          question: "Quanto valgono le palle nello snooker?",
          answer:
            "Rossa = 1, gialla = 2, verde = 3, marrone = 4, blu = 5, rosa = 6, nera = 7 punti.",
        },
      ],
    },
    MAGNAT: {
      title: "Magnat",
      players: "2–6",
      summary:
        "Magnat è un gioco da tavolo economico ambientato nelle città bulgare — compra immobili, costruisci e fai fallire i rivali in 3D nel browser.",
      intro:
        "Magnat è un gioco da tavolo economico premium nella tradizione del «tira e muovi» — un tema originale di città bulgare, senza proprietà intellettuale di terzi. Giri intorno al tabellone, compri città e stazioni, costruisci case e alberghi e riscuoti l'affitto finché gli avversari falliscono. Tutta la «valuta» è virtuale e vale solo per quella partita — un gioco sociale, non gioco d'azzardo con denaro reale. Il tabellone è completamente 3D con vista isometrica.",
      howTo: [
        {
          name: "Lancia i dadi",
          text: "Al tuo turno lanci due dadi e muovi la pedina in avanti; con un doppio rilanci, e tre doppi di fila ti mandano in prigione. Passare dalla Partenza vale 200.",
        },
        {
          name: "Compra immobili",
          text: "Se ti fermi su una città, stazione o società di servizi libera, puoi comprarla; se rinunci, l'immobile va all'asta.",
        },
        {
          name: "Riscuoti l'affitto",
          text: "Se un avversario si ferma su un tuo immobile, paga l'affitto — doppio con un gruppo completo e ancora più alto con case e albergo; un immobile ipotecato non rende affitto.",
        },
        {
          name: "Costruisci e sviluppa",
          text: "Con un gruppo completo costruisci case in modo uniforme, poi un albergo; al tuo turno puoi ipotecare e vendere, e riscattare un'ipoteca costa il 10% in più.",
        },
        {
          name: "Vinci",
          text: "Chi non può pagare fallisce; vince l'ultimo giocatore rimasto in gioco, o il più ricco al raggiungimento del limite di turni.",
        },
      ],
      faq: [
        {
          question: "Magnat è uguale a Monopoly?",
          answer:
            "No. Magnat è un gioco originale con un tema proprio (città bulgare) e nomi propri — le meccaniche di questo genere sono di dominio pubblico (da The Landlord's Game, 1904), senza il marchio o il design di Monopoly.",
        },
        {
          question: "Si gioca con denaro reale?",
          answer:
            "No — il denaro in Magnat è virtuale e vale solo all'interno della partita. Non si compra, scambia o converte in denaro reale. È un gioco sociale.",
        },
        {
          question: "Per quanti giocatori è?",
          answer: "Magnat si gioca da 2 a 6 persone — contro amici o contro bot se non ci sono avversari disponibili.",
        },
        {
          question: "Quanto dura una partita?",
          answer:
            "Circa 30–60 minuti. C'è un tetto ai turni, così le partite finiscono sempre senza trascinarsi all'infinito.",
        },
        {
          question: "È davvero 3D?",
          answer: "Sì — il tabellone è una vera scena 3D con vista isometrica, pedine in movimento, case e alberghi e illuminazione realistica.",
        },
      ],
    },
    WAR: {
      title: "Guerra",
      players: "2",
      summary: "Gioca a Guerra online gratis — il rapido gioco di carte per due in cui la carta più alta vince.",
      intro:
        "Guerra è il più semplice gioco di carte per due — quasi interamente basato sulla fortuna. Il mazzo si divide a metà e ognuno gira una carta; la più alta vince entrambe.",
      howTo: [
        { name: "La distribuzione", text: "Il mazzo si divide in due mazzetti uguali — uno per ciascun giocatore." },
        { name: "Il duello", text: "Entrambi girano la carta in cima; la più alta vince le due carte." },
        {
          name: "Guerra",
          text: "In caso di parità, chi è di turno sceglie una battaglia (3 carte coperte + 1 scoperta) o una scaramuccia (1 coperta + 1 scoperta); un'altra parità prolunga la guerra.",
        },
        {
          name: "Vittoria",
          text: "Tre vittorie di fila danno diritto a una «razzia» — una carta in più dall'avversario; vince il giocatore che raccoglie tutte le carte.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a Guerra con le carte?",
          answer:
            "Guerra si gioca in due: dividete il mazzo a metà e girate una carta ciascuno — la più alta prende entrambe; in caso di parità scoppia la «guerra» — una battaglia o una scaramuccia con carte coperte.",
        },
        {
          question: "C'è strategia in Guerra?",
          answer:
            "Quasi nessuna — Guerra è soprattutto un gioco di fortuna; l'unica scelta è tra battaglia e scaramuccia quando scoppia una guerra, il che lo rende rapido e adatto a principianti e bambini.",
        },
      ],
    },
    GOFISH: {
      title: "Pesca (Go Fish)",
      players: "2–4",
      summary: "Gioca a «Pesca» (Go Fish) online — il divertente gioco di carte in cui raccogli gruppi di quattro.",
      intro:
        "«Pesca» (Go Fish) è un leggero gioco di carte per famiglie. Chiedi carte agli avversari per raccogliere gruppi di quattro carte dello stesso valore, e se non ne hanno — peschi dal mare.",
      howTo: [
        {
          name: "La distribuzione",
          text: "In due ognuno riceve 7 carte, in tre o quattro 5; le altre formano il «mare».",
        },
        {
          name: "La richiesta",
          text: "Al tuo turno chiedi a un giocatore preciso un valore che già possiedi; se ce l'ha, ti dà tutte quelle carte e giochi ancora.",
        },
        {
          name: "Pesca",
          text: "Se non ce l'ha, peschi dal mare; se peschi proprio il valore richiesto giochi ancora, altrimenti il turno passa.",
        },
        {
          name: "Gruppi",
          text: "Quattro carte dello stesso valore si calano automaticamente come gruppo; quando tutti i 13 gruppi sono calati, vince chi ne ha di più.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a «Pesca»?",
          answer:
            "Chiedi a un giocatore preciso carte di un valore che hai già per raccogliere gruppi di quattro; se non ne ha, peschi una carta dal mare — vince il giocatore con più gruppi raccolti.",
        },
      ],
    },
    KENT: {
      title: "Kent (Coup)",
      players: "4",
      summary: "Gioca a Kent (Coup) online — il gioco di carte a squadre con segnali tra i compagni.",
      intro:
        "Kent (Coup) è un vivace gioco di carte per quattro giocatori in due squadre. L'obiettivo è raccogliere quattro carte dello stesso valore e, con un segnale segreto, far gridare «Coup!» al compagno prima che gli avversari se ne accorgano. La partita si gioca a 3 punti.",
      howTo: [
        {
          name: "Obiettivo",
          text: "Ognuno tiene 4 carte e ogni squadra cerca di essere la prima a riunire quattro carte dello stesso valore.",
        },
        {
          name: "Scambio",
          text: "Al centro ci sono 4 carte scoperte; al tuo turno scambi una tua carta con una del centro o passi, e quando tutti e quattro passano di fila le carte del centro vengono sostituite.",
        },
        {
          name: "Segnale",
          text: "Quando hai quattro carte uguali, fai al compagno un segnale segreto — lo vede solo lui.",
        },
        {
          name: "Coup",
          text: "Il compagno grida «Coup!» e, se hai davvero quattro carte uguali, la squadra vince un punto; un «Coup!» sbagliato dà il punto agli avversari.",
        },
        {
          name: "Stop",
          text: "Se sospetti che gli avversari abbiano quattro carte uguali, grida «Stop!» — se hai ragione il punto è vostro, se sbagli è loro.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a Kent?",
          answer:
            "Kent si gioca in quattro in due squadre: scambi carte con il centro finché non riunisci quattro carte uguali, fai un segnale segreto al compagno e lui grida «Coup!», mentre contro gli avversari puoi gridare «Stop!» — la partita è a 3 punti.",
        },
      ],
    },
    DRAUGHTS: {
      title: "Dama",
      players: "2",
      summary: "Gioca a Dama online contro giocatori e bot — il classico su damiera 8×8 in tempo reale.",
      intro:
        "La dama è un gioco di strategia per due con regole internazionali su damiera 8×8. Muovi le tue pedine in diagonale, scavalchi e catturi quelle dell'avversario, e una pedina che raggiunge l'ultima riga diventa una dama volante.",
      howTo: [
        { name: "Mossa", text: "Muovi una pedina in diagonale in avanti di una casella; inizia il Bianco." },
        {
          name: "Cattura",
          text: "La presa è obbligatoria — sempre con la sequenza più lunga possibile; le pedine semplici catturano anche all'indietro e i pezzi presi si tolgono alla fine della mossa.",
        },
        {
          name: "Dama",
          text: "Una pedina che termina la mossa sull'ultima riga diventa dama; è una dama «volante» — si muove e cattura lungo un'intera diagonale.",
        },
        { name: "Vittoria", text: "Vinci quando l'avversario resta senza pedine o senza mosse possibili." },
      ],
      faq: [
        {
          question: "Come si gioca a Dama?",
          answer:
            "La dama si gioca su una damiera 8×8 con regole internazionali: muovi le pedine in diagonale, la presa è obbligatoria con la sequenza più lunga e all'ultima riga la pedina diventa una dama volante — vince chi cattura o blocca tutte le pedine dell'altro.",
        },
        {
          question: "La cattura è obbligatoria a Dama?",
          answer: "Sì — se puoi catturare una pedina avversaria sei obbligato a farlo, e con la sequenza che cattura più pezzi.",
        },
      ],
    },
    LUDO: {
      title: "Ludo",
      players: "2–4",
      summary: "Gioca a «Ludo» online — il classico con dado e pedine in vero 3D.",
      intro:
        "«Ludo» è l'amato gioco di dadi per famiglie fino a quattro giocatori. Fai uscire le pedine dalla base, giri intorno al tabellone e sei il primo a portarle tutte e quattro all'arrivo. Il tabellone è completamente 3D.",
      howTo: [
        {
          name: "Partenza",
          text: "Serve un «6» per far uscire una pedina dalla base; il «6» dà anche un lancio in più, e finché tutte le tue pedine sono nella base hai fino a tre tentativi.",
        },
        {
          name: "Movimento",
          text: "Muovi una pedina in avanti di tante caselle quante ne mostra il dado; due tue pedine sulla stessa casella formano un blocco che nessuno può superare.",
        },
        {
          name: "Mangiare",
          text: "Se ti fermi su una casella con una pedina avversaria isolata, la rimandi alla sua base — tranne sulle caselle protette (quelle di partenza e quelle segnate).",
        },
        {
          name: "Rientro",
          text: "Nell'arrivo del tuo colore si entra solo con il numero esatto; vince chi per primo porta a casa tutte e quattro le pedine.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a «Ludo»?",
          answer:
            "Lanci il dado, con un «6» fai uscire una pedina, la muovi sul tabellone in base al dado e mangi le pedine avversarie isolate fuori dalle caselle protette — vince il giocatore che per primo porta all'arrivo tutte e quattro le sue pedine con il numero esatto.",
        },
        {
          question: "Il tabellone è davvero 3D?",
          answer: "Sì — «Ludo» su АСО si gioca su un vero tabellone 3D con pedine tridimensionali, un dado che rotola e illuminazione realistica.",
        },
      ],
    },
    RUMMY: {
      title: "Ramino",
      players: "2",
      summary: "Gioca a Ramino (Gin Rummy) online — il classico gioco di carte in cui componi scale e combinazioni.",
      intro:
        "Il ramino su АСО si gioca con le regole del Gin Rummy — un gioco di carte per due. Disponi le tue 10 carte in scale dello stesso seme e combinazioni dello stesso valore e cerchi di restare con meno punti morti possibile. La partita si gioca a 100.",
      howTo: [
        {
          name: "Pesca",
          text: "Ognuno ha 10 carte; al tuo turno peschi dal mazzo o prendi la carta in cima agli scarti.",
        },
        {
          name: "Combinazioni",
          text: "Scala = 3+ carte consecutive dello stesso seme (l'asso è basso); combinazione = 3–4 carte dello stesso valore. Le carte fuori sono punti morti: asso 1, figure 10, le altre il loro valore.",
        },
        { name: "Scarto", text: "Concludi il turno scartando una carta." },
        {
          name: "Bussare",
          text: "Quando i tuoi punti morti sono 10 o meno puoi «bussare»; «gin» è bussare senza carte morte. L'avversario attacca le sue carte morte alle tue combinazioni (tranne dopo il gin).",
        },
      ],
      faq: [
        {
          question: "Come si gioca a Ramino?",
          answer:
            "Il ramino su АСО è Gin Rummy per due: peschi e scarti una carta per turno, componi scale e combinazioni e bussi quando i tuoi punti morti sono 10 o meno. Chi bussa guadagna la differenza (+25 per il gin); se l'avversario ha punti morti minori o uguali, è un «undercut» e guadagna lui la differenza +25.",
        },
      ],
    },
    DOMINO: {
      title: "Domino",
      players: "2–4",
      summary: "Gioca a Domino online gratis — il classico con le tessere in cui colleghi numeri uguali.",
      intro:
        "Il domino è un gioco con le tessere (doppio sei, con pesca) per due a quattro giocatori. Posi tessere in modo che le estremità accostate corrispondano per numero e cerchi di essere il primo a giocarle tutte; la partita si gioca a 100 punti.",
      howTo: [
        {
          name: "La distribuzione",
          text: "In due ognuno pesca 7 tessere, in tre o quattro 5; le altre restano nel «tallone». La prima mano la apre chi ha il doppio più alto.",
        },
        { name: "Posa", text: "Accosti una tessera a una delle estremità aperte solo se i numeri corrispondono." },
        {
          name: "Pesca",
          text: "Se non hai una tessera adatta, peschi dal tallone finché non puoi giocare; si può passare solo a tallone vuoto.",
        },
        {
          name: "Vittoria",
          text: "Se giochi l'ultima tessera, guadagni i punti rimasti in mano agli altri; se il gioco si blocca, vince la somma più bassa.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a Domino?",
          answer:
            "Ci si alterna posando tessere in modo che le estremità accostate mostrino numeri uguali; se non hai una mossa, peschi dal tallone finché non puoi giocare — chi per primo gioca tutte le sue tessere guadagna i punti rimasti agli altri, e la partita è a 100.",
        },
      ],
    },
    BRIDGE: {
      title: "Bridge",
      players: "4",
      summary: "Gioca a Bridge online — l'intellettuale gioco di carte a squadre con licitazione e prese.",
      intro:
        "Il bridge (rubber bridge) è il classico gioco di prese per quattro giocatori in due squadre. Prima licitate un contratto, poi lo giocate — la mano del compagno del dichiarante (il «morto») viene scoperta e la gioca il dichiarante. Vince il rubber la squadra che si aggiudica 2 manche.",
      howTo: [
        {
          name: "Licitazione",
          text: "Licitate un contratto — il numero di prese oltre le 6 e un seme di atout o senza atout; contro e surcontro valgono solo sulla licita avversaria, e tre passi chiudono la licitazione.",
        },
        {
          name: "Il morto",
          text: "Il dichiarante è il primo della coppia ad aver nominato la denominazione del contratto; dopo l'attacco, la mano del suo compagno viene scoperta e la gioca il dichiarante.",
        },
        {
          name: "Gioco",
          text: "Rispondi al seme; la presa la vince l'atout più alto o la carta più alta del seme di uscita.",
        },
        {
          name: "Punteggio",
          text: "Un contratto mantenuto segna sotto la linea (la manche è 100), prese in più e premi sopra la linea; un contratto non mantenuto dà punti alla difesa.",
        },
      ],
      faq: [
        {
          question: "Come si gioca a Bridge?",
          answer:
            "Il bridge si gioca in quattro in due squadre: licitate un contratto, poi giocate le prese con il «morto» scoperto — l'obiettivo è mantenere il contratto e vincere il rubber (2 manche).",
        },
        {
          question: "Il Bridge è difficile per i principianti?",
          answer: "Il bridge ha più profondità della maggior parte dei giochi di carte, ma su АСО puoi giocare contro i bot e imparare la licitazione con calma.",
        },
      ],
    },
    BATTLESHIP: {
      title: "Battaglia navale",
      players: "2",
      summary: "Gioca a Battaglia navale online — il classico in cui indovini e affondi la flotta nascosta dell'avversario.",
      intro:
        "La battaglia navale è un gioco di intuizione per due. La tua flotta viene disposta sulla griglia in automatico e in segreto, poi ci si alterna sparando a delle coordinate finché uno affonda l'intera flotta dell'altro.",
      howTo: [
        {
          name: "Disposizione",
          text: "La flotta (1 nave da 4, 2 da 3, 3 da 2 e 4 da 1 casella) viene disposta in automatico e in segreto; le navi non si toccano, nemmeno in diagonale.",
        },
        {
          name: "Tiro",
          text: "Al tuo turno scegli una casella sulla griglia dell'avversario — «colpito» o «acqua»; se colpisci, tiri ancora.",
        },
        { name: "Affondamento", text: "Se colpisci tutte le caselle di una nave, è affondata." },
        { name: "Vittoria", text: "Vince il giocatore che per primo affonda l'intera flotta dell'avversario." },
      ],
      faq: [
        {
          question: "Come si gioca a Battaglia navale?",
          answer:
            "La tua flotta viene disposta sulla griglia in automatico e in segreto e ti alterni con l'avversario sparando a delle coordinate — ogni colpo a segno ti dà un altro tiro, e vince chi per primo affonda tutte le navi nemiche.",
        },
      ],
    },
    DICE: {
      title: "Poker dei dadi",
      players: "2–4",
      summary: "Gioca a Poker dei dadi (stile Yahtzee) online — lanci cinque dadi e riempi 13 categorie per fare punti.",
      intro:
        "Il poker dei dadi è un gioco con cinque dadi in stile Yahtzee: a ogni turno lanci fino a tre volte e segni il risultato in una delle 13 categorie — dagli uno ai sei, full, scale, cinque uguali e chance. Vince il punteggio totale più alto.",
      howTo: [
        { name: "Lancio", text: "Lanci i cinque dadi fino a tre volte, tenendo quelli che scegli tra un lancio e l'altro." },
        {
          name: "Categorie",
          text: "Superiori (uno–sei) — la somma dei dadi corrispondenti, con bonus +35 a quota 63+; inferiori — tris, quattro uguali, full 25, scala piccola 30, scala grande 40, cinque uguali 50 e chance.",
        },
        {
          name: "Registrazione",
          text: "Dopo i lanci devi segnare il risultato in una categoria libera — anche con zero.",
        },
        { name: "Vittoria", text: "Dopo 13 turni vince il giocatore con il totale più alto; la parità è un pareggio." },
      ],
      faq: [
        {
          question: "Come si gioca a Poker dei dadi?",
          answer:
            "Lanci cinque dadi fino a tre volte per turno e segni il risultato in una delle 13 categorie (full, scale, cinque uguali e altre) — dopo 13 turni vince il giocatore con il totale più alto.",
        },
      ],
    },
    BINGO: {
      title: "Bingo",
      players: "2–6",
      summary: "Gioca a Bingo online gratis — vengono estratti numeri, la cartella si segna da sola e una linea completa vince.",
      intro:
        "Il bingo è un gioco di fortuna per 2 a 6 giocatori. Hai una cartella 5×5 con numeri da 1 a 75 e una casella libera al centro; i numeri estratti si segnano in automatico, e vince il primo che completa una linea.",
      howTo: [
        {
          name: "Cartella",
          text: "Ricevi una cartella 5×5 con numeri 1–75 (colonna B 1–15, I 16–30, N 31–45, G 46–60, O 61–75) e una casella libera al centro.",
        },
        {
          name: "Estrazione",
          text: "I numeri vengono estratti a caso uno alla volta e segnati sulla tua cartella in automatico.",
        },
        { name: "Linea", text: "L'obiettivo è una linea completa — una riga, una colonna o una diagonale." },
        { name: "Bingo", text: "Vince il primo con una linea completa; se più giocatori fanno bingo insieme, vincono tutti." },
      ],
      faq: [
        {
          question: "Come si gioca a Bingo?",
          answer:
            "Hai una cartella 5×5 con dei numeri; i numeri estratti si segnano in automatico e vinci quando per primo completi una linea — una riga, una colonna o una diagonale.",
        },
      ],
    },
    WORDS: {
      title: "Words",
      players: "2–4",
      summary: "Gioca a «Words» online — la catena di parole in cui ogni parola inizia con l'ultima lettera della precedente.",
      intro:
        "«Words» è un gioco a catena di parole per 2 a 4 giocatori. Ogni nuova parola deve iniziare con l'ultima lettera della precedente; ognuno ha 3 vite, e vince l'ultimo giocatore rimasto in gioco.",
      howTo: [
        {
          name: "Catena",
          text: "Il gioco parte da una parola; ogni parola successiva deve iniziare con l'ultima lettera della precedente.",
        },
        { name: "Parola valida", text: "La parola deve essere nel dizionario e non già usata nella partita." },
        {
          name: "Vite",
          text: "Una parola sbagliata o un passo ti costa una delle tue tre vite; il passo porta una nuova parola da cui ripartire.",
        },
        { name: "Vittoria", text: "Chi resta senza vite è eliminato; vince l'ultimo rimasto." },
      ],
      faq: [
        {
          question: "Come si gioca a «Words»?",
          answer:
            "A turno ognuno dice una parola del dizionario che inizia con l'ultima lettera della precedente e non è già stata usata; un errore o un passo costa una delle 3 vite — vince l'ultimo giocatore rimasto.",
        },
      ],
    },
  },
};
