import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck, dealRound, getRoundDealer, validateBid, scoreBid,
  applyRoundScoring, chooseWinner, isLegalPlay, resolveTrick
} from "./engine.js";

test("deck contains 52 unique cards", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(c => c.id)).size, 52);
});

test("progressive deal gives N cards to each of four players", () => {
  for (let round = 1; round <= 13; round++) {
    const dealt = dealRound(round, 0, () => 0.5);
    assert.deepEqual(dealt.hands.map(hand => hand.length), [round, round, round, round]);
    assert.equal(dealt.undealt.length, 52 - round * 4);
    assert.equal(dealt.leader, 1);
  }
});

test("dealer rotates clockwise", () => {
  assert.equal(getRoundDealer(null, 1, () => 0), 0);
  assert.equal(getRoundDealer(null, 1, () => 0.99), 3);
  assert.equal(getRoundDealer(0, 2), 1);
  assert.equal(getRoundDealer(3, 3), 0);
  let dealer = 2;
  const sequence = [];
  for (let round = 2; round <= 13; round += 1) {
    dealer = getRoundDealer(dealer, round);
    sequence.push(dealer);
  }
  assert.deepEqual(sequence, [3,0,1,2,3,0,1,2,3,0,1,2]);
});

test("bids are bounded by the round; Blind is available only in round 13", () => {
  assert.equal(validateBid(3, 3, "standard"), true);
  assert.equal(validateBid(3, 3, "blind"), false);
  assert.equal(validateBid(0, 13, "standard"), true);
  assert.equal(validateBid(0, 13, "blind"), true);
  assert.equal(validateBid(4, 3, "standard"), false);
  assert.equal(validateBid(-1, 3), false);
});

test("standard and blind scoring examples match the agreed rules", () => {
  assert.equal(scoreBid({bid:1,tricksWon:0}).points, -10);
  assert.equal(scoreBid({bid:2,tricksWon:1}).points, -20);
  assert.equal(scoreBid({bid:2,tricksWon:0}).points, -20);
  assert.deepEqual(scoreBid({bid:2,tricksWon:3}), {
    points:20,bagsAdded:1,success:true,nil:false
  });
  assert.equal(scoreBid({bid:3,tricksWon:5}).points, 30);
  assert.equal(scoreBid({bid:3,tricksWon:5}).bagsAdded, 2);
  assert.equal(scoreBid({bid:2,tricksWon:1,mode:"blind",roundNumber:13}).points, -40);
  assert.equal(scoreBid({bid:2,tricksWon:4,mode:"blind",roundNumber:13}).points, 40);
});

test("Zero bids score zero through round 12 and tricks taken become bags", () => {
  assert.deepEqual(scoreBid({bid:0,tricksWon:0,roundNumber:1}), {
    points:0,bagsAdded:0,success:true,nil:true
  });
  assert.deepEqual(scoreBid({bid:0,tricksWon:2,roundNumber:3}), {
    points:0,bagsAdded:2,success:false,nil:true
  });
  assert.equal(scoreBid({bid:0,tricksWon:0,mode:"standard",roundNumber:12}).points, 0);
  assert.equal(scoreBid({bid:0,tricksWon:1,mode:"standard",roundNumber:12}).points, 0);
  assert.equal(scoreBid({bid:0,tricksWon:1,mode:"standard",roundNumber:12}).bagsAdded, 1);
});

test("Round 13 standard zero stays zero; blind zero follows the current special scoring rule", () => {
  assert.equal(scoreBid({bid:0,tricksWon:0,roundNumber:13}).points, 0);
  assert.equal(scoreBid({bid:0,tricksWon:2,roundNumber:13}).points, 0);
  assert.equal(scoreBid({bid:0,tricksWon:2,roundNumber:13}).bagsAdded, 2);
  assert.equal(scoreBid({bid:0,tricksWon:0,mode:"blind",roundNumber:13}).points, 100);
  assert.equal(scoreBid({bid:0,tricksWon:1,mode:"blind",roundNumber:13}).points, -100);
  assert.equal(scoreBid({bid:0,tricksWon:1,mode:"blind",roundNumber:13}).bagsAdded, 1);
  assert.throws(() => scoreBid({bid:1,tricksWon:1,mode:"blind",roundNumber:12}), /only in round 13/);
});

test("round-aware cumulative scoring applies Nil rules and carries bags", () => {
  const players = [
    {id:"a",score:0,bags:0},{id:"b",score:0,bags:0},
    {id:"c",score:0,bags:0},{id:"d",score:0,bags:0}
  ];
  const round3 = applyRoundScoring(players, [
    {bid:0,tricksWon:2},{bid:0,tricksWon:0},
    {bid:1,tricksWon:1},{bid:1,tricksWon:0}
  ], 3);
  assert.equal(round3[0].roundPoints, 0);
  assert.equal(round3[0].score, 0);
  assert.equal(round3[0].bags, 2);

  const round13 = applyRoundScoring(players, [
    {bid:0,tricksWon:0,mode:"blind"},{bid:0,tricksWon:1,mode:"blind"},
    {bid:0,tricksWon:0,mode:"standard"},{bid:0,tricksWon:2,mode:"standard"}
  ], 13);
  assert.equal(round13[0].roundNet, 100);
  assert.equal(round13[1].roundPoints, -100);
  assert.equal(round13[1].bags, 1);
  assert.equal(round13[2].roundNet, 0);
  assert.equal(round13[3].roundNet, 0);
  assert.equal(round13[3].bags, 2);
});

test("sandbag penalty is applied at each full ten bags and carries remainder", () => {
  const players = [
    {id:"a",score:0,bags:9},{id:"b",score:0,bags:0},
    {id:"c",score:0,bags:0},{id:"d",score:0,bags:0}
  ];
  const results = [
    {bid:1,tricksWon:3},{bid:0,tricksWon:0},
    {bid:0,tricksWon:0},{bid:0,tricksWon:0}
  ];
  const next = applyRoundScoring(players, results);
  assert.equal(next[0].bags, 1);
  assert.equal(next[0].bagPenalty, 100);
  assert.equal(next[0].roundPoints, 10);
  assert.equal(next[0].roundNet, -90);
  assert.equal(next[0].score, -90);
});

test("winner is the highest score; bags are not a tie-breaker; equal scores share the win", () => {
  const players = [
    {id:"a",score:100,bags:4},{id:"b",score:100,bags:2},
    {id:"c",score:90,bags:0},{id:"d",score:80,bags:0}
  ];
  // Tie-break rule is deferred: a has more bags than b but must NOT win because of it.
  assert.deepEqual(chooseWinner(players).winners, ["a","b"]);
  assert.equal(chooseWinner(players).sharedWin, true);
  players[1].score = 99;
  assert.deepEqual(chooseWinner(players).winners, ["a"]);
  assert.equal(chooseWinner(players).sharedWin, false);
});

test("bag accumulation table from the latest agreed rules", () => {
  // [bags before, bags earned, penalty, bags after]
  const table = [[0,1,0,1],[2,1,0,3],[8,1,0,9],[9,1,100,0],[9,3,100,2],[8,12,200,0],[0,10,100,0],[0,12,100,2],[0,20,200,0]];
  for (const [before, earned, penalty, after] of table) {
    const players = [{id:"a",score:0,bags:before},{id:"b",score:0,bags:0},{id:"c",score:0,bags:0},{id:"d",score:0,bags:0}];
    const next = applyRoundScoring(players, [
      {bid:0,tricksWon:earned},{bid:0,tricksWon:0},{bid:0,tricksWon:0},{bid:0,tricksWon:0}
    ], 5);
    assert.equal(next[0].bagPenalty, penalty, `penalty for ${before}+${earned}`);
    assert.equal(next[0].bags, after, `bags after ${before}+${earned}`);
    assert.equal(next[0].score, 0 - penalty, `a nil bidder's bags never add points (${before}+${earned})`);
  }
});

test("bags never change points: bid 2 win 3 is +20 with 1 bag, not +21", () => {
  const players = [{id:"a",score:0,bags:0},{id:"b",score:0,bags:0},{id:"c",score:0,bags:0},{id:"d",score:0,bags:0}];
  const next = applyRoundScoring(players, [
    {bid:2,tricksWon:2},{bid:2,tricksWon:3},{bid:2,tricksWon:1},{bid:1,tricksWon:0}
  ], 4);
  assert.deepEqual(next.map((p) => p.roundPoints), [20, 20, -20, -10]);
  assert.deepEqual(next.map((p) => p.score), [20, 20, -20, -10]);
  assert.deepEqual(next.map((p) => p.bags), [0, 1, 0, 0]);
});

test("must follow suit when possible", () => {
  const hand = [
    {id:"h2",suit:"hearts",rank:"2"},
    {id:"sA",suit:"spades",rank:"A"}
  ];
  const trick = [{playerIndex:0,card:{id:"h3",suit:"hearts",rank:"3"}}];
  assert.equal(isLegalPlay({hand,card:hand[1],trick,spadesBroken:false,roundNumber:2}), false);
  assert.equal(isLegalPlay({hand,card:hand[0],trick,spadesBroken:false,roundNumber:2}), true);
});

test("spades cannot be led before broken unless hand has only spades", () => {
  const spade = {id:"s2",suit:"spades",rank:"2"};
  const heart = {id:"h2",suit:"hearts",rank:"2"};
  assert.equal(isLegalPlay({hand:[spade,heart],card:spade,trick:[],spadesBroken:false,roundNumber:2}), false);
  assert.equal(isLegalPlay({hand:[spade],card:spade,trick:[],spadesBroken:false,roundNumber:2}), true);
  assert.equal(isLegalPlay({hand:[spade],card:spade,trick:[],spadesBroken:false,roundNumber:1}), true);
});

test("highest trump wins a trick", () => {
  const trick = [
    {playerIndex:0,card:{suit:"hearts",rank:"A"}},
    {playerIndex:1,card:{suit:"spades",rank:"2"}},
    {playerIndex:2,card:{suit:"spades",rank:"K"}},
    {playerIndex:3,card:{suit:"hearts",rank:"K"}}
  ];
  assert.equal(resolveTrick(trick,0).winner, 2);
});
