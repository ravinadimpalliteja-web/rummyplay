/**
 * Royal Club — Solo Progressive Spades rules engine.
 * Pure functions only: UI, persistence and networking belong in separate layers.
 */

export const SUITS = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const PLAYER_COUNT = 4;
export const TOTAL_ROUNDS = 13;
export const BAGS_PER_PENALTY = 10;
export const BAG_PENALTY = 100;

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank, index) => ({
    suit, rank, value: index + 2, id: `${suit}-${rank}`
  })));
}

export function shuffleDeck(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function getRoundDealer(previousDealer, roundNumber, random = Math.random) {
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > TOTAL_ROUNDS) {
    throw new RangeError("roundNumber must be between 1 and 13");
  }
  if (previousDealer == null) return Math.min(PLAYER_COUNT - 1, Math.floor(random() * PLAYER_COUNT));
  return (previousDealer + 1) % PLAYER_COUNT;
}

export function dealRound(roundNumber, dealer, random = Math.random) {
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > TOTAL_ROUNDS) {
    throw new RangeError("roundNumber must be between 1 and 13");
  }
  if (!Number.isInteger(dealer) || dealer < 0 || dealer >= PLAYER_COUNT) {
    throw new RangeError("dealer must be a player index from 0 to 3");
  }
  const deck = shuffleDeck(createDeck(), random);
  const hands = Array.from({ length: PLAYER_COUNT }, () => []);
  for (let i = 0; i < roundNumber * PLAYER_COUNT; i += 1) {
    hands[i % PLAYER_COUNT].push(deck[i]);
  }
  return {
    roundNumber,
    dealer,
    leader: (dealer + 1) % PLAYER_COUNT,
    hands,
    undealt: deck.slice(roundNumber * PLAYER_COUNT)
  };
}

export function validateBid(bid, roundNumber, mode = "standard") {
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > TOTAL_ROUNDS) return false;
  if (!Number.isInteger(bid) || bid < 0 || bid > roundNumber) return false;
  return mode === "standard" || mode === "blind";
}

export function rankValue(card) {
  return RANKS.indexOf(card.rank) + 2;
}

export function isLegalPlay({ hand, card, trick, spadesBroken, roundNumber }) {
  if (!hand.some((candidate) => candidate.id === card.id)) return false;
  if (trick.length === 0) {
    if (card.suit !== "spades" || spadesBroken) return true;
    const hasNonSpade = hand.some((candidate) => candidate.suit !== "spades");
    if (!hasNonSpade) return true;
    // Round 1's solitary Spade lead is the explicit exception.
    if (roundNumber === 1 && hand.length === 1 && hand[0].suit === "spades") return true;
    return false;
  }
  const ledSuit = trick[0].card.suit;
  const hasLedSuit = hand.some((candidate) => candidate.suit === ledSuit);
  return !hasLedSuit || card.suit === ledSuit;
}

export function playCard({ playerIndex, hand, card, trick, spadesBroken, roundNumber }) {
  if (!isLegalPlay({ hand, card, trick, spadesBroken, roundNumber })) {
    throw new Error("Illegal card play");
  }
  const nextHand = hand.filter((candidate) => candidate.id !== card.id);
  const nextTrick = [...trick, { playerIndex, card }];
  const brokeSpades = card.suit === "spades" && trick.length > 0 &&
    trick[0].card.suit !== "spades" &&
    !hand.some((candidate) => candidate.suit === trick[0].card.suit);
  return { hand: nextHand, trick: nextTrick, spadesBroken: spadesBroken || brokeSpades };
}

export function resolveTrick(trick, leader) {
  if (!Array.isArray(trick) || trick.length !== PLAYER_COUNT) {
    throw new Error("A completed trick must contain exactly four plays");
  }
  const ledSuit = trick[0].card.suit;
  let winningPlay = trick[0];
  for (const play of trick.slice(1)) {
    const candidate = play.card;
    const current = winningPlay.card;
    const candidateTrump = candidate.suit === "spades";
    const currentTrump = current.suit === "spades";
    if ((candidateTrump && !currentTrump) ||
      (candidateTrump === currentTrump &&
        candidate.suit === current.suit &&
        rankValue(candidate) > rankValue(current)) ||
      (!candidateTrump && !currentTrump && candidate.suit === ledSuit &&
        current.suit !== ledSuit)) {
      winningPlay = play;
    }
  }
  const winner = winningPlay.playerIndex;
  return { winner, winningCard: winningPlay.card };
}

export function scoreBid({ bid, tricksWon, mode = "standard", roundNumber = 1 }) {
  if (!Number.isInteger(bid) || bid < 0 || !Number.isInteger(tricksWon) || tricksWon < 0) {
    throw new TypeError("bid and tricksWon must be non-negative integers");
  }
  if (mode !== "standard" && mode !== "blind") throw new TypeError("Unknown bid mode");
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > TOTAL_ROUNDS) {
    throw new RangeError("roundNumber must be between 1 and 13");
  }

  if (bid === 0) {
    const success = tricksWon === 0;
    // Nil bids score zero throughout rounds 1–12. In round 13, only Blind Nil
    // earns +100 for taking no tricks or -100 for taking one or more tricks.
    const specialRound13BlindNil = roundNumber === 13 && mode === "blind";
    const points = specialRound13BlindNil ? (success ? 100 : -100) : 0;
    return { points, bagsAdded: success ? 0 : tricksWon, success, nil: true };
  }

  if (tricksWon < bid) {
    return {
      points: -(bid * (mode === "blind" ? 20 : 10)),
      bagsAdded: 0, success: false, nil: false
    };
  }

  const overtricks = tricksWon - bid;
  return {
    points: bid * (mode === "blind" ? 20 : 10) + overtricks,
    bagsAdded: overtricks, success: true, nil: false
  };
}

export function applyRoundScoring(players, roundResults, roundNumber = 1) {
  if (!Array.isArray(players) || players.length !== PLAYER_COUNT ||
      !Array.isArray(roundResults) || roundResults.length !== PLAYER_COUNT) {
    throw new Error("Exactly four players and four round results are required");
  }
  return players.map((player, index) => {
    const result = scoreBid({ ...roundResults[index], roundNumber });
    let bags = (player.bags || 0) + result.bagsAdded;
    let penalty = 0;
    while (bags >= BAGS_PER_PENALTY) {
      bags -= BAGS_PER_PENALTY;
      penalty += BAG_PENALTY;
    }
    const roundNet = result.points - penalty;
    return {
      ...player,
      roundPoints: result.points,
      bagPenalty: penalty,
      roundNet,
      bags,
      score: (player.score || 0) + roundNet,
      bid: roundResults[index].bid,
      bidMode: roundResults[index].mode || "standard",
      tricksWon: roundResults[index].tricksWon
    };
  });
}

export function chooseWinner(players) {
  if (!Array.isArray(players) || players.length !== PLAYER_COUNT) {
    throw new Error("Exactly four players are required");
  }
  const ranked = [...players].sort((a, b) =>
    (b.score || 0) - (a.score || 0) || (b.bags || 0) - (a.bags || 0)
  );
  const first = ranked[0];
  const tied = ranked.filter((p) =>
    (p.score || 0) === (first.score || 0) && (p.bags || 0) === (first.bags || 0)
  );
  return { winners: tied.map((p) => p.id), sharedWin: tied.length > 1, standings: ranked };
}
