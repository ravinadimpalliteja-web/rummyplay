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
  assert.equal(getRoundDealer(null, 1), 0);
  assert.equal(getRoundDealer(0, 2), 1);
  assert.equal(getRoundDealer(3, 3), 0);
});

test("bids are bounded by the round and accept standard or blind", () => {
  assert.equal(validateBid(3, 3, "standard"), true);
  assert.equal(validateBid(3, 3, "blind"), true);
  assert.equal(validateBid(4, 3, "standard"), false);
  assert.equal(validateBid(-1, 3), false);
});

test("standard and blind scoring examples match the agreed rules", () => {
  assert.equal(scoreBid({bid:1,tricksWon:0}).points, -10);
  assert.equal(scoreBid({bid:2,tricksWon:1}).points, -20);
  assert.equal(scoreBid({bid:2,tricksWon:0}).points, -20);
  assert.deepEqual(scoreBid({bid:2,tricksWon:3}), {
    points:21,bagsAdded:1,success:true,nil:false
  });
  assert.equal(scoreBid({bid:3,tricksWon:5}).points, 32);
  assert.equal(scoreBid({bid:2,tricksWon:1,mode:"blind"}).points, -40);
  assert.equal(scoreBid({bid:2,tricksWon:4,mode:"blind"}).points, 42);
});

test("standard and blind nil scoring adds one bag per trick taken on failure", () => {
  assert.equal(scoreBid({bid:0,tricksWon:0}).points, 100);
  assert.equal(scoreBid({bid:0,tricksWon:2}).points, -100);
  assert.equal(scoreBid({bid:0,tricksWon:2}).bagsAdded, 2);
  assert.equal(scoreBid({bid:0,tricksWon:0,mode:"blind"}).points, 200);
  assert.equal(scoreBid({bid:0,tricksWon:1,mode:"blind"}).points, -200);
  assert.equal(scoreBid({bid:0,tricksWon:1,mode:"blind"}).bagsAdded, 1);
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
  assert.equal(next[0].roundNet, -88);
  assert.equal(next[0].score, -88);
});

test("winner uses score, then fewer remaining bags; exact tie is shared", () => {
  const players = [
    {id:"a",score:100,bags:4},{id:"b",score:100,bags:2},
    {id:"c",score:90,bags:0},{id:"d",score:80,bags:0}
  ];
  assert.deepEqual(chooseWinner(players).winners, ["a"]);
  players[0].bags = 2;
  assert.deepEqual(chooseWinner(players).winners, ["a","b"]);
  assert.equal(chooseWinner(players).sharedWin, true);
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
