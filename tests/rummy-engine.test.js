const test = require("node:test");
const assert = require("node:assert/strict");
require("../rummy-engine.js");
const E = globalThis.RummyEngine;
const suits = ["♣","♥","♠","♦"];
const card = (id,si,ri) => ({id,si,ri,suit:suits[si],rank:E.RANKS[ri],red:si===1||si===3,joker:false});
const joker = {id:"joker-test",joker:true,si:4,ri:13,suit:"★",rank:"JOKER"};

test("two-deck pack contains 106 cards", () => assert.equal(E.createDeck().length,106));
test("2, 4 and 6 player deals give each player 13 cards", () => {
  for (const n of [2,4,6]) {
    const d=E.deal(n,()=>0.31);
    assert.equal(d.hands.length,n);
    assert.ok(d.hands.every(h=>h.length===13));
    assert.equal(d.stock.length+d.hands.reduce((s,h)=>s+h.length,0)+d.discard.length,106);
  }
});
test("pure sequence is accepted", () => {
  assert.equal(E.classifyGroup([card("a",0,0),card("b",0,1),card("c",0,2)],8),"pure");
});
test("Ace can be high in a 10-J-Q-K-A pure sequence", () => {
  assert.equal(E.classifyGroup([card("10",0,9),card("J",0,10),card("Q",0,11),card("K",0,12),card("A",0,0)],8),"pure");
});
test("printed joker cannot make a pure sequence", () => {
  assert.equal(E.classifyGroup([card("a",0,0),joker,card("c",0,2)],8),"sequence");
});
test("wild joker can complete an impure sequence", () => {
  assert.equal(E.classifyGroup([card("a",1,3),card("b",1,4),joker],8),"sequence");
});
test("same-rank cards in different suits form a set", () => {
  assert.equal(E.classifyGroup([card("a",0,6),card("b",1,6),card("c",2,6)],8),"set");
});
test("declaration solver finds a valid 13-card hand", () => {
  const hand=[card("a",0,0),card("b",0,1),card("c",0,2),
    card("d",1,3),card("e",1,4),joker,
    card("g",0,6),card("h",1,6),card("i",2,6),
    card("j",2,8),card("k",2,9),card("l",2,10),card("m",2,11)];
  assert.equal(E.validateHand(hand,8).valid,true);
});
test("two impure sequences without a pure sequence cannot be declared", () => {
  const hand=[card("a",0,2),card("b",0,3),card("w1",3,4),
    card("d",1,7),card("e",1,8),card("w2",1,4),
    card("g",0,5),card("h",1,5),card("i",2,5),
    card("j",0,11),card("k",1,11),card("l",2,11),card("m",3,11)];
  assert.equal(E.validateHand(hand,4).valid,false);
});
test("declaration requires exactly 13 cards", () => {
  assert.equal(E.validateHand([card("a",0,0)],8).valid,false);
});
