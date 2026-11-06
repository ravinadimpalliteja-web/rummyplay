const test=require("node:test");
const assert=require("node:assert/strict");
require("../rummy-engine.js");
const E=globalThis.RummyEngine;
const suits=["♣","♥","♠","♦"];
const card=(id,si,ri)=>({id,si,ri,suit:suits[si],rank:E.RANKS[ri],red:si===1||si===3,joker:false});
const joker={id:"joker-test",joker:true,si:4,ri:13,suit:"★",rank:"JOKER"};

test("deck count scales with room capacity",()=>{
  assert.equal(E.deckCountForCapacity(2),1);
  assert.equal(E.deckCountForCapacity(3),2);
  assert.equal(E.deckCountForCapacity(4),2);
  assert.equal(E.deckCountForCapacity(5),3);
  assert.equal(E.deckCountForCapacity(6),3);
  assert.equal(E.createDeck(1).length,54);
  assert.equal(E.createDeck(2).length,108);
  assert.equal(E.createDeck(3).length,162);
});
test("each physical deck contributes two printed jokers",()=>{
  for(const count of [1,2,3])assert.equal(E.createDeck(count).filter(c=>c.joker).length,count*2);
});
test("deals scale by room capacity and remove one open-joker indicator",()=>{
  for(const capacity of [2,3,4,5,6]){
    const d=E.deal(capacity,()=>0.31);
    assert.equal(d.hands.length,capacity);
    assert.ok(d.hands.every(h=>h.length===13));
    assert.equal(d.deckCount,Math.ceil(capacity/2));
    assert.equal(d.wildCard.joker,false);
    assert.equal(d.wildRank,d.wildCard.ri);
    assert.equal(d.stock.length+d.hands.reduce((n,h)=>n+h.length,0)+d.discard.length+1,54*d.deckCount);
    assert.ok(!d.stock.some(c=>c.id===d.wildCard.id));
    assert.ok(!d.hands.flat().some(c=>c.id===d.wildCard.id));
    assert.ok(!d.discard.some(c=>c.id===d.wildCard.id));
  }
});
test("pure sequence is accepted",()=>{
  assert.equal(E.classifyGroup([card("a",0,0),card("b",0,1),card("c",0,2)],8),"pure");
});
test("wild-rank card can count naturally in a pure sequence",()=>{
  assert.equal(E.classifyGroup([card("a",0,5),card("b",0,6),card("c",0,7)],6),"pure");
});
test("Ace can be high in a Q-K-A pure sequence",()=>{
  assert.equal(E.classifyGroup([card("Q",0,11),card("K",0,12),card("A",0,0)],8),"pure");
});
test("Ace can be high in a 10-J-Q-K-A pure sequence",()=>{
  assert.equal(E.classifyGroup([card("10",0,9),card("J",0,10),card("Q",0,11),card("K",0,12),card("A",0,0)],8),"pure");
});
test("printed joker cannot make a pure sequence",()=>{
  assert.equal(E.classifyGroup([card("a",0,0),joker,card("c",0,2)],8),"sequence");
});
test("open wild rank completes 6-clubs, 7-hearts, 8-clubs as impure sequence",()=>{
  assert.equal(E.classifyGroup([card("6c",0,5),card("7h",1,6),card("8c",0,7)],6),"sequence");
});
test("open wild rank does not make a mismatched natural run pure",()=>{
  assert.equal(E.classifyGroup([card("6c",0,5),card("7h",1,6),card("8c",0,7)],6),"sequence");
});
test("same-rank cards in different suits form a set",()=>{
  assert.equal(E.classifyGroup([card("a",0,6),card("b",1,6),card("c",2,6)],8),"set");
});
test("declaration solver finds a valid 13-card hand",()=>{
  const hand=[card("a",0,0),card("b",0,1),card("c",0,2),
    card("d",1,3),card("e",1,4),joker,
    card("g",0,6),card("h",1,6),card("i",2,6),
    card("j",2,8),card("k",2,9),card("l",2,10),card("m",2,11)];
  assert.equal(E.validateHand(hand,8).valid,true);
});
test("two impure sequences without a pure sequence cannot be declared",()=>{
  const hand=[card("a",0,2),card("b",0,3),card("w1",3,4),
    card("d",1,7),card("e",1,8),card("w2",1,4),
    card("g",0,5),card("h",1,5),card("i",2,5),
    card("j",0,11),card("k",1,11),card("l",2,11),card("m",3,11)];
  assert.equal(E.validateHand(hand,4).valid,false);
});
test("declaration rejects duplicate physical card IDs",()=>{
  const hand=Array.from({length:13},(_,i)=>card("physical-"+i,i%4,i%13));
  hand[12]={...hand[0]};
  assert.equal(E.validateHand(hand,8).valid,false);
  assert.match(E.validateHand(hand,8).reason,/duplicate physical card/i);
});
test("declaration requires exactly 13 cards",()=>{
  assert.equal(E.validateHand([card("a",0,0)],8).valid,false);
});
