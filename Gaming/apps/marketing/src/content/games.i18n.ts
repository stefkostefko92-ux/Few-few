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
        "Belote is the beloved Bulgarian trick-taking game for four players in two teams. The goal is for your team to score more points through tricks and declarations.",
      howTo: [
        { name: "The deal", text: "The 32-card deck is dealt 8 cards to each player." },
        { name: "Bidding", text: "In turn, each player names a trump suit or passes; the first bid sets the contract." },
        { name: "Playing tricks", text: "Follow the suit of the first card; if you can't, trump it when possible." },
        { name: "Scoring", text: "Cards have point values; the last trick is worth +10. The bidding team must reach 82+." },
      ],
      faq: [
        {
          question: "How do you play Belote?",
          answer:
            "Belote is played by four people in two teams with a 32-card deck; you follow suit, trump when you can't, and collect points from tricks and declarations.",
        },
        {
          question: "How many cards are dealt in Belote?",
          answer: "Eight cards are dealt to each of the four players.",
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
        "Santase (also known as Sixty-Six) is an intimate two-player game with a 24-card deck, a trump suit and marriages (king-and-queen declarations).",
      howTo: [
        { name: "The deal", text: "Each player gets 6 cards; one card sets the trump, the rest form the stock." },
        { name: "Play", text: "While the stock is still open, you aren't required to follow suit." },
        { name: "Declarations", text: "A king and queen of the same suit scores 20 points (40 in trump) after you've won a trick." },
        { name: "Goal", text: "The first player to reach 66 points wins the game." },
      ],
      faq: [
        {
          question: "Why is Santase called Sixty-Six?",
          answer: "Because the goal is to score 66 points before your opponent — that's where the game's second name comes from.",
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
        { name: "Moves", text: "Every piece moves by its own rules; White moves first." },
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
        "Backgammon is a two-player dice race. You bear off all your checkers before your opponent to win.",
      howTo: [
        { name: "Rolling", text: "You roll two dice and move your checkers according to the numbers shown." },
        { name: "Hitting", text: "A lone opponent checker can be hit and sent back to the bar." },
        { name: "Bearing off", text: "Once all your checkers are in your home board, you start removing them." },
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
        { name: "The deal", text: "Each player gets 3 cards after an opening bet (the ante)." },
        { name: "Betting", text: "You take turns calling, raising or folding until the bets are even." },
        { name: "Showdown", text: "The strongest three-card hand wins the whole pot of virtual chips." },
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
        "Eight-ball is the most popular pool game. One player pockets the solids (1–7), the other the stripes (9–15); whoever clears their group and legally pockets the black 8-ball wins.",
      howTo: [
        { name: "The break", text: "The first player breaks the rack with the cue ball." },
        { name: "Groups", text: "After the first ball is pocketed, solids vs stripes are assigned." },
        { name: "Aiming", text: "Aim with the guide line, set your power and shoot." },
        { name: "Winning", text: "Clear your group and legally pocket the 8-ball to win." },
      ],
      faq: [
        {
          question: "How do you play 8-ball pool?",
          answer:
            "You pocket the balls in your group (solids or stripes), then the black 8-ball at the end; a foul gives your opponent ball in hand.",
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
        { name: "Order", text: "Always make first contact with the lowest-numbered ball on the table." },
        { name: "Continuing", text: "Pocket a ball legally and you keep shooting." },
        { name: "Winning", text: "Pocket the 9-ball on a legal shot to win." },
      ],
      faq: [
        {
          question: "What's the difference between 8-ball and 9-ball?",
          answer:
            "In 9-ball there are no groups — you hit the lowest ball first and win by pocketing the 9-ball.",
        },
      ],
    },
    SNOOKER: {
      title: "Snooker",
      players: "2",
      summary: "Play snooker online for free — the classic of red and colored balls with scoring.",
      intro:
        "Snooker is played with 15 reds and 6 colors on a large table. You alternate a red and a color; the colors return to their spots while reds remain. The player with more points wins.",
      howTo: [
        { name: "Alternating", text: "Pot a red (1 point), then a color (2–7 points)." },
        { name: "Re-spotting", text: "The colors return to their spots as long as reds remain on the table." },
        { name: "Endgame", text: "With no reds left, the colors are potted in order — from yellow to black." },
        { name: "Points", text: "A foul gives points to your opponent; the player with more points wins." },
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
        { name: "Roll the dice", text: "On your turn you roll two dice and move your token forward; on doubles you roll again." },
        { name: "Buy property", text: "Land on a free city, station or utility and you can buy it or decline." },
        { name: "Collect rent", text: "When an opponent lands on your property, they pay rent — higher with a full color group and built houses." },
        { name: "Build and develop", text: "With a full group you build houses evenly, then a hotel; mortgage when you need cash." },
        { name: "Win", text: "The last solvent player wins, or the one with the greatest wealth when the turn limit is reached." },
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
        "War is the simplest two-player card game — entirely down to luck. The deck is split evenly and each player flips one card; the higher one takes both.",
      howTo: [
        { name: "The deal", text: "The deck is split into two equal piles — one for each player." },
        { name: "The duel", text: "Both players flip their top card; the higher one wins both cards." },
        { name: "War", text: "On a tie, each player puts down several cards and a new duel decides who takes everything." },
        { name: "Winning", text: "The player who collects all the cards wins." },
      ],
      faq: [
        {
          question: "How do you play the card game War?",
          answer:
            "War is played by two people: you split the deck evenly and flip a card each — the higher one takes both; on a tie a \"war\" is declared with extra cards.",
        },
        {
          question: "Is there any strategy in War?",
          answer: "No — War is purely a game of luck, which makes it fast and well suited to beginners and children.",
        },
      ],
    },
    GOFISH: {
      title: "Go Fish",
      players: "2–4",
      summary: "Play \"Go Fish\" online — the fun card game where you collect sets of four.",
      intro:
        "\"Go Fish\" is a light family card game. You ask opponents for cards to collect sets of the same rank, and if they don't have any — you fish from the pile.",
      howTo: [
        { name: "The deal", text: "Each player gets several cards; the rest form the \"ocean\" in the middle." },
        { name: "Asking", text: "On your turn you ask an opponent for a specific rank of card that you already hold." },
        { name: "Go fish", text: "If they don't have the card you asked for, you draw one from the pile." },
        { name: "Sets", text: "Collect four of a rank and you set them aside; the player with the most sets wins." },
      ],
      faq: [
        {
          question: "How do you play \"Go Fish\"?",
          answer:
            "You ask opponents for cards of a rank you already hold in order to collect sets of four; if they don't have any, you draw a card from the pile — the player with the most collected sets wins.",
        },
      ],
    },
    KENT: {
      title: "Kent (Coup)",
      players: "4",
      summary: "Play Kent (Coup) online — the team card game with signals between partners.",
      intro:
        "Kent (Coup) is a lively team card game for four players in two teams. The goal is to collect four matching cards and secretly signal your partner before your opponents catch on.",
      howTo: [
        { name: "Goal", text: "Each team races to be the first to collect a \"kent\" — four cards of one rank." },
        { name: "Passing", text: "Cards circulate until someone collects a set of four." },
        { name: "Signal", text: "The one who collects secretly signals their partner by a prearranged sign." },
        { name: "Coup", text: "The partner calls \"Coup!\" at exactly the right moment to win the point for the team." },
      ],
      faq: [
        {
          question: "How do you play Kent?",
          answer:
            "Kent is played by four people in two teams: you collect four matching cards and secretly signal your partner, who must call \"Coup\" before the opponents do.",
        },
      ],
    },
    DRAUGHTS: {
      title: "Draughts (Checkers)",
      players: "2",
      summary: "Play Draughts (Checkers) online against players and bots — the classic on an 8×8 board in real time.",
      intro:
        "Draughts (Checkers) is a two-player strategy game on an 8×8 board. You move your pieces diagonally, jump over and capture your opponent's, and once you reach the last row you become a king.",
      howTo: [
        { name: "Move", text: "You move one piece diagonally forward by one square." },
        { name: "Capturing", text: "Jump over an adjacent enemy piece to an empty square and you capture it — captures are mandatory." },
        { name: "King", text: "When a piece reaches the last row it becomes a king and can also move backward." },
        { name: "Winning", text: "You win when your opponent is left with no moves or no pieces." },
      ],
      faq: [
        {
          question: "How do you play Draughts?",
          answer:
            "Draughts is played on an 8×8 board: you move pieces diagonally, jump over your opponent's to capture them, and on the last row a piece becomes a king — whoever takes all of the other's pieces wins.",
        },
        {
          question: "Is capturing mandatory in Draughts?",
          answer: "Yes — if you have the chance to capture an enemy piece, you're obliged to do it.",
        },
      ],
    },
    LUDO: {
      title: "Ludo",
      players: "2–4",
      summary: "Play \"Ludo\" online — the classic with a die and tokens in real 3D.",
      intro:
        "\"Ludo\" is the beloved family dice game for up to four players. You get your tokens out of the house, go around the board and are the first to bring all four home. The board is fully 3D.",
      howTo: [
        { name: "Start", text: "You roll the die; a six gets a token out of the house onto the track." },
        { name: "Movement", text: "You move a token forward by as many squares as the die shows." },
        { name: "Capturing", text: "Land on a square with an opponent's token and you send it back to its house." },
        { name: "Coming home", text: "Take a token all the way around the loop and you bring it home; the first to bring in all four wins." },
      ],
      faq: [
        {
          question: "How do you play \"Ludo\"?",
          answer:
            "You roll a die, get a token out with a six, move it around the board according to the die and try to capture the others' tokens — the player who's first to bring all four of their tokens home wins.",
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
      summary: "Play Rummy online — the classic card game of building runs and sets.",
      intro:
        "Rummy is a two-player card game where you arrange cards into combinations — runs of one suit and sets of the same rank. You draw and discard a card each turn until you've arranged your hand.",
      howTo: [
        { name: "Drawing", text: "On your turn you draw a card from the deck or from the discard pile." },
        { name: "Melding", text: "You arrange cards into runs (3+ of one suit) or sets (3–4 of one rank)." },
        { name: "Discarding", text: "You finish your turn by discarding one card." },
        { name: "Going out", text: "Arrange your whole hand into combinations and you go out and win the round." },
      ],
      faq: [
        {
          question: "How do you play Rummy?",
          answer:
            "In Rummy you draw and discard one card per turn until you arrange your hand into runs of one suit and sets of the same rank — the first to arrange everything wins.",
        },
      ],
    },
    DOMINO: {
      title: "Dominoes",
      players: "2–4",
      summary: "Play Dominoes online for free — the classic with tiles where you match equal numbers.",
      intro:
        "Dominoes is a tile game for two to four players. You take turns placing tiles so their touching ends match by number, and you aim to be the first to play all your tiles.",
      howTo: [
        { name: "The deal", text: "Each player draws several tiles; the rest stay in the \"boneyard\"." },
        { name: "Placing", text: "You attach a tile to the chain only if the numbers on the touching ends match." },
        { name: "Drawing", text: "If you have no suitable tile, you draw from the boneyard or pass." },
        { name: "Winning", text: "The player who's first to run out of tiles wins, or has the fewest points in a block." },
      ],
      faq: [
        {
          question: "How do you play Dominoes?",
          answer:
            "You take turns placing tiles so the touching ends show equal numbers; if you have no move, you draw from the boneyard — the player who's first to play all their tiles wins.",
        },
      ],
    },
    BRIDGE: {
      title: "Bridge",
      players: "4",
      summary: "Play Bridge online — the intellectual team card game with bidding and tricks.",
      intro:
        "Bridge is the classic trick-taking game for four players in two teams. First you bid for a contract, then you play it out — one partner becomes the \"dummy\" and their cards are played face up.",
      howTo: [
        { name: "Bidding", text: "You declare a contract — how many tricks and in which trump your team takes on." },
        { name: "Dummy", text: "The declarer's partner reveals their cards and they're played face up." },
        { name: "Play", text: "You follow the suit of the first card; the strongest card or trump takes the trick." },
        { name: "Scoring", text: "Make your contract and you score points; failure gives points to your opponent." },
      ],
      faq: [
        {
          question: "How do you play Bridge?",
          answer:
            "Bridge is played by four people in two teams: you bid for a contract, then play out the tricks with an exposed \"dummy\" — the goal is to make the tricks you bid.",
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
        "Battleship is a guessing game for two. You secretly place your ships on a grid, then take turns firing at coordinates until one player sinks the other's entire fleet.",
      howTo: [
        { name: "Placement", text: "You place your ships secretly on your own grid." },
        { name: "Firing", text: "On your turn you pick a square on your opponent's grid — \"hit\" or \"miss\"." },
        { name: "Sinking", text: "Hit all the squares of a given ship and it's sunk." },
        { name: "Winning", text: "The player who's first to sink the opponent's entire fleet wins." },
      ],
      faq: [
        {
          question: "How do you play Battleship?",
          answer:
            "You secretly place your fleet on a grid and take turns with your opponent firing at coordinates — whoever's first to sink all the enemy ships wins.",
        },
      ],
    },
    DICE: {
      title: "Dice Poker",
      players: "1–4",
      summary: "Play Dice Poker (Yahtzee-style) online — roll five dice and build combinations for points.",
      intro:
        "Dice poker is a game with five dice in which, after up to three rolls, you build combinations — straights, full house, four of a kind — and record points on the scorecard. The highest total wins.",
      howTo: [
        { name: "Rolling", text: "You roll the five dice and can keep some of them for up to two more rolls." },
        { name: "Combinations", text: "You aim for combinations like three of a kind, four of a kind, full house, small and large straight." },
        { name: "Scoring", text: "Each turn you record your result in one box on the scorecard." },
        { name: "Winning", text: "Once the scorecard is filled, the player with the most points wins." },
      ],
      faq: [
        {
          question: "How do you play Dice Poker?",
          answer:
            "You roll five dice up to three times per turn, try to collect combinations like four of a kind or a full house and record points — the player with the highest total wins.",
        },
      ],
    },
    BINGO: {
      title: "Bingo",
      players: "many",
      summary: "Play Bingo online for free — numbers are drawn while you mark your card on the way to a win.",
      intro:
        "Bingo is a game of luck for many players. You have a card of numbers; as numbers are drawn, you mark them and call \"Bingo!\" once you complete a winning pattern.",
      howTo: [
        { name: "Card", text: "You get a card with a grid of random numbers." },
        { name: "Drawing", text: "Numbers are drawn one by one and marked automatically." },
        { name: "Pattern", text: "You aim for a winning pattern — a row, column, diagonal or the whole card." },
        { name: "Bingo", text: "The first to complete the pattern wins the round." },
      ],
      faq: [
        {
          question: "How do you play Bingo?",
          answer:
            "You have a card of numbers; numbers are drawn and you mark them, and you win once you're the first to complete the agreed pattern — a row, column, diagonal or the whole card.",
        },
      ],
    },
    WORDS: {
      title: "Words",
      players: "2",
      summary: "Play \"Words\" online — the word game where you arrange letters into words and points on the board.",
      intro:
        "\"Words\" is a word game for two on a board of letters. You arrange letter tiles into crossing words and rack up points from the letter values and the bonus squares.",
      howTo: [
        { name: "Letters", text: "You draw letter tiles, each with its own point value." },
        { name: "Building", text: "You arrange words on the board — horizontally or vertically, connecting to ones already placed." },
        { name: "Bonuses", text: "Double/triple letter or word squares multiply your points." },
        { name: "Winning", text: "The player with the most points when the tiles run out wins." },
      ],
      faq: [
        {
          question: "How do you play \"Words\"?",
          answer:
            "You arrange letter tiles into crossing words on the board and score points based on the letters and the bonus squares — the player with the highest score at the end wins.",
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
        "Belote è l'amato gioco di prese bulgaro per quattro giocatori in due squadre. L'obiettivo è far sì che la tua squadra raccolga più punti tramite prese e dichiarazioni.",
      howTo: [
        { name: "La distribuzione", text: "Il mazzo di 32 carte viene distribuito 8 carte a ciascun giocatore." },
        { name: "La dichiarazione", text: "A turno, ogni giocatore dichiara un seme di briscola o passa; la prima dichiarazione determina il contratto." },
        { name: "Gioco delle prese", text: "Segui il seme della prima carta; se non puoi, tagli con la briscola quando è possibile." },
        { name: "Punteggio", text: "Le carte hanno valori in punti; l'ultima presa vale +10. La squadra che ha dichiarato deve raggiungere almeno 82." },
      ],
      faq: [
        {
          question: "Come si gioca a Belote?",
          answer:
            "Belote si gioca in quattro in due squadre con un mazzo di 32 carte; segui il seme, tagli con la briscola quando non puoi e raccogli punti da prese e dichiarazioni.",
        },
        {
          question: "Quante carte si distribuiscono a Belote?",
          answer: "Si distribuiscono 8 carte a ciascuno dei quattro giocatori.",
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
        "Santase (noto anche come Sessantasei) è un intimo gioco per due con un mazzo di 24 carte, una briscola e dichiarazioni (coppie di re e regina).",
      howTo: [
        { name: "La distribuzione", text: "Ogni giocatore riceve 6 carte; una carta determina la briscola, le altre formano il tallone." },
        { name: "Gioco", text: "Finché il tallone è aperto, non sei obbligato a seguire il seme." },
        { name: "Dichiarazioni", text: "Re e regina dello stesso seme valgono 20 punti (40 in briscola) dopo aver vinto una presa." },
        { name: "Obiettivo", text: "Il primo a raggiungere 66 punti vince la partita." },
      ],
      faq: [
        {
          question: "Perché Santase si chiama Sessantasei?",
          answer: "Perché l'obiettivo è raccogliere 66 punti prima dell'avversario — da qui viene il secondo nome del gioco.",
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
        { name: "Mosse", text: "Ogni pezzo si muove secondo le proprie regole; il Bianco muove per primo." },
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
        "Il backgammon è una corsa con i dadi per due. Porti fuori tutte le tue pedine prima dell'avversario per vincere.",
      howTo: [
        { name: "Lancio", text: "Lanci due dadi e muovi le pedine in base ai numeri usciti." },
        { name: "Colpire", text: "Una pedina avversaria isolata può essere colpita e rimandata alla barra." },
        { name: "Uscita", text: "Quando tutte le tue pedine sono nella tua casa, inizi a toglierle dalla tavola." },
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
        { name: "La distribuzione", text: "Ogni giocatore riceve 3 carte dopo una puntata iniziale (l'ante)." },
        { name: "Puntate", text: "Ci si alterna tra vedere, rilanciare o passare finché le puntate non si pareggiano." },
        { name: "Showdown", text: "Il tris di carte più forte vince l'intero piatto di fiches virtuali." },
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
        "Il biliardo a 8 palle (eight-ball) è il gioco di pool più popolare. Un giocatore imbuca le palle piene (1–7), l'altro quelle a strisce (9–15); chi libera il proprio gruppo e imbuca regolarmente la palla nera numero 8 vince.",
      howTo: [
        { name: "L'apertura", text: "Il primo giocatore spacca il rack con la palla battente." },
        { name: "Gruppi", text: "Dopo la prima palla imbucata si assegnano piene e strisce." },
        { name: "Mira", text: "Mira con la linea guida, regola la potenza e tira." },
        { name: "Vittoria", text: "Libera il tuo gruppo e imbuca regolarmente la palla 8 per vincere." },
      ],
      faq: [
        {
          question: "Come si gioca a biliardo palla 8?",
          answer:
            "Imbuchi le palle del tuo gruppo (piene o a strisce) e alla fine la palla nera numero 8; un fallo dà all'avversario palla in mano.",
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
        "Il nine-ball è un rapido gioco di pool con le palle da 1 a 9. Colpisci sempre per prima la palla più bassa disponibile; chi imbuca la palla 9 con un tiro regolare vince la partita.",
      howTo: [
        { name: "Ordine", text: "Stabilisci sempre il primo contatto con la palla dal numero più basso sul tavolo." },
        { name: "Continuazione", text: "Se imbuchi una palla regolarmente, continui a giocare." },
        { name: "Vittoria", text: "Imbuca la palla 9 con un tiro regolare per vincere." },
      ],
      faq: [
        {
          question: "Qual è la differenza tra palla 8 e palla 9?",
          answer:
            "Nella palla 9 non ci sono gruppi — colpisci per prima la palla più bassa e vinci imbucando la palla 9.",
        },
      ],
    },
    SNOOKER: {
      title: "Snooker",
      players: "2",
      summary: "Gioca a snooker online gratis — il classico con palle rosse e colorate e punteggio.",
      intro:
        "Lo snooker si gioca con 15 palle rosse e 6 colorate su un tavolo grande. Alterni una rossa e una colorata; le colorate tornano sui loro punti finché ci sono rosse. Vince il giocatore con più punti.",
      howTo: [
        { name: "Alternanza", text: "Imbuca una rossa (1 punto), poi una colorata (2–7 punti)." },
        { name: "Riposizionamento", text: "Le colorate tornano sui loro punti finché restano rosse sul tavolo." },
        { name: "Finale", text: "Senza più rosse, le colorate si imbucano in ordine — dal giallo al nero." },
        { name: "Punti", text: "Un fallo dà punti all'avversario; vince il giocatore con più punti." },
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
        "Magnat è un gioco da tavolo economico premium nella tradizione del \"tira e muovi\" — un tema originale di città bulgare, senza proprietà intellettuale di terzi. Giri intorno al tabellone, compri città e stazioni, costruisci case e alberghi e riscuoti l'affitto finché gli avversari falliscono. Tutta la \"valuta\" è virtuale e vale solo per quella partita — un gioco sociale, non gioco d'azzardo con denaro reale. Il tabellone è completamente 3D con vista isometrica.",
      howTo: [
        { name: "Lancia i dadi", text: "Al tuo turno lanci due dadi e muovi la pedina in avanti; con un doppio rilanci." },
        { name: "Compra immobili", text: "Se ti fermi su una città, stazione o servizio libero, puoi comprarlo o rifiutare." },
        { name: "Riscuoti l'affitto", text: "Se un avversario si ferma su un tuo immobile, paga l'affitto — più alto con un gruppo di colore completo e case costruite." },
        { name: "Costruisci e sviluppa", text: "Con un gruppo completo costruisci case in modo uniforme, poi un albergo; ipoteca quando hai bisogno di contanti." },
        { name: "Vinci", text: "Vince l'ultimo giocatore solvente, o quello con la maggiore ricchezza al raggiungimento del limite di turni." },
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
        "Guerra è il più semplice gioco di carte per due — interamente basato sulla fortuna. Il mazzo si divide a metà e ognuno gira una carta; la più alta vince entrambe.",
      howTo: [
        { name: "La distribuzione", text: "Il mazzo si divide in due mazzetti uguali — uno per ciascun giocatore." },
        { name: "Il duello", text: "Entrambi girano la carta in cima; la più alta vince le due carte." },
        { name: "Guerra", text: "In caso di parità, ognuno mette giù alcune carte e un nuovo duello decide chi prende tutto." },
        { name: "Vittoria", text: "Vince il giocatore che raccoglie tutte le carte." },
      ],
      faq: [
        {
          question: "Come si gioca a Guerra con le carte?",
          answer:
            "Guerra si gioca in due: dividete il mazzo a metà e girate una carta ciascuno — la più alta prende entrambe; in caso di parità si dichiara \"guerra\" con carte aggiuntive.",
        },
        {
          question: "C'è strategia in Guerra?",
          answer: "No — Guerra è interamente un gioco di fortuna, il che lo rende rapido e adatto a principianti e bambini.",
        },
      ],
    },
    GOFISH: {
      title: "Pesca (Go Fish)",
      players: "2–4",
      summary: "Gioca a \"Pesca\" (Go Fish) online — il divertente gioco di carte in cui raccogli gruppi di quattro.",
      intro:
        "\"Pesca\" (Go Fish) è un leggero gioco di carte per famiglie. Chiedi carte agli avversari per raccogliere gruppi dello stesso valore, e se non ne hanno — peschi dal mazzo.",
      howTo: [
        { name: "La distribuzione", text: "Ogni giocatore riceve alcune carte; le altre formano il \"mare\" al centro." },
        { name: "La richiesta", text: "Al tuo turno chiedi a un avversario una carta di un valore che già possiedi." },
        { name: "Pesca", text: "Se non ha la carta richiesta, peschi una carta dal mazzo." },
        { name: "Gruppi", text: "Se raccogli quattro carte dello stesso valore, le metti da parte; vince chi ha più gruppi." },
      ],
      faq: [
        {
          question: "Come si gioca a \"Pesca\"?",
          answer:
            "Chiedi agli avversari carte di un valore che hai già per raccogliere gruppi di quattro; se non ne hanno, peschi una carta dal mazzo — vince il giocatore con più gruppi raccolti.",
        },
      ],
    },
    KENT: {
      title: "Kent (Coup)",
      players: "4",
      summary: "Gioca a Kent (Coup) online — il gioco di carte a squadre con segnali tra i compagni.",
      intro:
        "Kent (Coup) è un vivace gioco di carte a squadre per quattro giocatori in due squadre. L'obiettivo è raccogliere quattro carte uguali e segnalarlo di nascosto al compagno prima che gli avversari se ne accorgano.",
      howTo: [
        { name: "Obiettivo", text: "Ogni squadra cerca di essere la prima a raccogliere un \"kent\" — quattro carte dello stesso valore." },
        { name: "Scambio", text: "Le carte circolano finché qualcuno non raccoglie un quartetto." },
        { name: "Segnale", text: "Chi raccoglie le carte segnala di nascosto al compagno con un segno concordato in anticipo." },
        { name: "Coup", text: "Il compagno grida \"Coup!\" nel momento giusto per vincere il punto per la squadra." },
      ],
      faq: [
        {
          question: "Come si gioca a Kent?",
          answer:
            "Kent si gioca in quattro in due squadre: raccogli quattro carte uguali e segnali di nascosto al compagno, che deve gridare \"Coup\" prima degli avversari.",
        },
      ],
    },
    DRAUGHTS: {
      title: "Dama",
      players: "2",
      summary: "Gioca a Dama online contro giocatori e bot — il classico su tavoliere 8×8 in tempo reale.",
      intro:
        "La dama è un gioco di strategia per due su un tavoliere 8×8. Muovi le tue pedine in diagonale, scavalchi e catturi quelle dell'avversario, e una volta raggiunta l'ultima fila diventi dama.",
      howTo: [
        { name: "Mossa", text: "Muovi una pedina in diagonale in avanti di una casella." },
        { name: "Cattura", text: "Se scavalchi una pedina avversaria adiacente verso una casella vuota, la catturi — le catture sono obbligatorie." },
        { name: "Dama", text: "Quando una pedina raggiunge l'ultima fila, diventa dama e si muove anche all'indietro." },
        { name: "Vittoria", text: "Vinci quando l'avversario resta senza mosse o senza pedine." },
      ],
      faq: [
        {
          question: "Come si gioca a Dama?",
          answer:
            "La dama si gioca su un tavoliere 8×8: muovi le pedine in diagonale, scavalchi quelle dell'avversario per catturarle, e all'ultima fila la pedina diventa dama — vince chi cattura tutte le pedine dell'altro.",
        },
        {
          question: "La cattura è obbligatoria a Dama?",
          answer: "Sì — se hai la possibilità di catturare una pedina avversaria, sei obbligato a farlo.",
        },
      ],
    },
    LUDO: {
      title: "Ludo",
      players: "2–4",
      summary: "Gioca a \"Ludo\" online — il classico con dado e pedine in vero 3D.",
      intro:
        "\"Ludo\" è l'amato gioco di dadi per famiglie fino a quattro giocatori. Fai uscire le pedine dalla casa, giri intorno al tabellone e sei il primo a riportarne a casa tutte e quattro. Il tabellone è completamente 3D.",
      howTo: [
        { name: "Partenza", text: "Lanci il dado; un sei fa uscire una pedina dalla casa sul percorso." },
        { name: "Movimento", text: "Muovi una pedina in avanti di tante caselle quante ne mostra il dado." },
        { name: "Mangiare", text: "Se ti fermi su una casella con una pedina avversaria, la rimandi nella sua casa." },
        { name: "Rientro", text: "Se porti una pedina lungo tutto il giro, la fai entrare a casa; vince chi per primo ne riporta tutte e quattro." },
      ],
      faq: [
        {
          question: "Come si gioca a \"Ludo\"?",
          answer:
            "Lanci il dado, con un sei fai uscire una pedina, la muovi sul tabellone in base al dado e cerchi di mangiare le pedine altrui — vince il giocatore che per primo riporta a casa tutte e quattro le sue pedine.",
        },
        {
          question: "Il tabellone è davvero 3D?",
          answer: "Sì — \"Ludo\" su АСО si gioca su un vero tabellone 3D con pedine tridimensionali, un dado che rotola e illuminazione realistica.",
        },
      ],
    },
    RUMMY: {
      title: "Ramino",
      players: "2",
      summary: "Gioca a Ramino online — il classico gioco di carte in cui componi sequenze e tris.",
      intro:
        "Il ramino è un gioco di carte per due in cui disponi le carte in combinazioni — sequenze dello stesso seme e gruppi dello stesso valore. Peschi e scarti una carta a ogni turno finché non sistemi la tua mano.",
      howTo: [
        { name: "Pesca", text: "Al tuo turno peschi una carta dal mazzo o dalla pila degli scarti." },
        { name: "Combinazioni", text: "Disponi le carte in sequenze (3+ dello stesso seme) o gruppi (3–4 dello stesso valore)." },
        { name: "Scarto", text: "Concludi il turno scartando una carta." },
        { name: "Chiusura", text: "Se sistemi tutta la mano in combinazioni, chiudi e vinci il round." },
      ],
      faq: [
        {
          question: "Come si gioca a Ramino?",
          answer:
            "Nel ramino peschi e scarti una carta per turno finché non sistemi la mano in sequenze dello stesso seme e gruppi dello stesso valore — vince il primo a sistemare tutto.",
        },
      ],
    },
    DOMINO: {
      title: "Domino",
      players: "2–4",
      summary: "Gioca a Domino online gratis — il classico con le tessere in cui colleghi numeri uguali.",
      intro:
        "Il domino è un gioco con le tessere per due a quattro giocatori. Ci si alterna posando tessere in modo che le estremità accostate corrispondano per numero, e si cerca di essere i primi a giocare tutte le proprie tessere.",
      howTo: [
        { name: "La distribuzione", text: "Ogni giocatore pesca alcune tessere; le altre restano nel \"tallone\"." },
        { name: "Posa", text: "Accosti una tessera alla catena solo se i numeri alle estremità corrispondono." },
        { name: "Pesca", text: "Se non hai una tessera adatta, peschi dal tallone o passi." },
        { name: "Vittoria", text: "Vince il giocatore che per primo resta senza tessere, o che ha meno punti in caso di blocco." },
      ],
      faq: [
        {
          question: "Come si gioca a Domino?",
          answer:
            "Ci si alterna posando tessere in modo che le estremità accostate mostrino numeri uguali; se non hai una mossa, peschi dal tallone — vince il giocatore che per primo gioca tutte le sue tessere.",
        },
      ],
    },
    BRIDGE: {
      title: "Bridge",
      players: "4",
      summary: "Gioca a Bridge online — l'intellettuale gioco di carte a squadre con licitazione e prese.",
      intro:
        "Il bridge è il classico gioco di prese per quattro giocatori in due squadre. Prima licitate un contratto, poi lo giocate — un compagno diventa il \"morto\" e le sue carte si giocano scoperte.",
      howTo: [
        { name: "Licitazione", text: "Dichiarate un contratto — quante prese e in quale briscola si impegna la vostra squadra." },
        { name: "Il morto", text: "Il compagno del dichiarante scopre le sue carte e vengono giocate a carte scoperte." },
        { name: "Gioco", text: "Segui il seme della prima carta; la carta più forte o la briscola prende la presa." },
        { name: "Punteggio", text: "Se realizzi il contratto, guadagni punti; il fallimento dà punti all'avversario." },
      ],
      faq: [
        {
          question: "Come si gioca a Bridge?",
          answer:
            "Il bridge si gioca in quattro in due squadre: licitate un contratto, poi giocate le prese con un \"morto\" scoperto — l'obiettivo è realizzare le prese dichiarate.",
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
        "La battaglia navale è un gioco di intuizione per due. Disponi di nascosto le tue navi su una griglia, poi ci si alterna sparando a delle coordinate finché uno affonda l'intera flotta dell'altro.",
      howTo: [
        { name: "Disposizione", text: "Disponi le tue navi di nascosto sulla tua griglia." },
        { name: "Tiro", text: "Al tuo turno scegli una casella sulla griglia dell'avversario — \"colpito\" o \"mancato\"." },
        { name: "Affondamento", text: "Se colpisci tutte le caselle di una nave, è affondata." },
        { name: "Vittoria", text: "Vince il giocatore che per primo affonda l'intera flotta dell'avversario." },
      ],
      faq: [
        {
          question: "Come si gioca a Battaglia navale?",
          answer:
            "Disponi di nascosto la tua flotta su una griglia e ti alterni con l'avversario sparando a delle coordinate — vince chi per primo affonda tutte le navi nemiche.",
        },
      ],
    },
    DICE: {
      title: "Poker dei dadi",
      players: "1–4",
      summary: "Gioca a Poker dei dadi (stile Yahtzee) online — lanci cinque dadi e componi combinazioni per fare punti.",
      intro:
        "Il poker dei dadi è un gioco con cinque dadi in cui, dopo un massimo di tre lanci, componi combinazioni — scale, full, poker — e segni i punti sulla tabella. Vince il punteggio totale più alto.",
      howTo: [
        { name: "Lancio", text: "Lanci i cinque dadi e puoi tenerne alcuni per altri due lanci al massimo." },
        { name: "Combinazioni", text: "Punti a combinazioni come tris, poker, full, scala piccola e scala grande." },
        { name: "Registrazione", text: "A ogni turno segni il risultato in una casella della tabella." },
        { name: "Vittoria", text: "Una volta riempita la tabella, vince il giocatore con più punti." },
      ],
      faq: [
        {
          question: "Come si gioca a Poker dei dadi?",
          answer:
            "Lanci cinque dadi fino a tre volte per turno, cerchi di raccogliere combinazioni come poker o full e segni i punti — vince il giocatore con il punteggio totale più alto.",
        },
      ],
    },
    BINGO: {
      title: "Bingo",
      players: "molti",
      summary: "Gioca a Bingo online gratis — vengono estratti numeri e tu segni la tua cartella fino alla vittoria.",
      intro:
        "Il bingo è un gioco di fortuna per molti giocatori. Hai una cartella con dei numeri; man mano che i numeri vengono estratti, li segni e gridi \"Bingo!\" quando completi uno schema vincente.",
      howTo: [
        { name: "Cartella", text: "Ricevi una cartella con una griglia di numeri casuali." },
        { name: "Estrazione", text: "I numeri vengono estratti uno a uno e segnati automaticamente." },
        { name: "Schema", text: "Punti a uno schema vincente — una riga, una colonna, una diagonale o l'intera cartella." },
        { name: "Bingo", text: "Il primo che completa lo schema vince il round." },
      ],
      faq: [
        {
          question: "Come si gioca a Bingo?",
          answer:
            "Hai una cartella con dei numeri; vengono estratti numeri che segni, e vinci quando per primo completi lo schema concordato — una riga, una colonna, una diagonale o l'intera cartella.",
        },
      ],
    },
    WORDS: {
      title: "Words",
      players: "2",
      summary: "Gioca a \"Words\" online — il gioco di parole in cui componi lettere in parole e punti sul tabellone.",
      intro:
        "\"Words\" è un gioco di parole per due su un tabellone di lettere. Disponi le tessere con le lettere in parole che si incrociano e accumuli punti dal valore delle lettere e dalle caselle bonus.",
      howTo: [
        { name: "Lettere", text: "Peschi tessere con lettere, ognuna con il proprio valore in punti." },
        { name: "Composizione", text: "Disponi parole sul tabellone — in orizzontale o in verticale, collegandole a quelle già posate." },
        { name: "Bonus", text: "Le caselle a lettera doppia/tripla o parola moltiplicano i tuoi punti." },
        { name: "Vittoria", text: "Vince il giocatore con più punti quando le tessere finiscono." },
      ],
      faq: [
        {
          question: "Come si gioca a \"Words\"?",
          answer:
            "Disponi le tessere con le lettere in parole incrociate sul tabellone e fai punti in base alle lettere e alle caselle bonus — vince il giocatore con il punteggio più alto alla fine.",
        },
      ],
    },
  },
};
