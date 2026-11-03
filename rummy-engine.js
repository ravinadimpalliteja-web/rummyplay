/* Rummy Play · independent Indian Rummy rules engine
 * Original implementation. No network calls, storage, or real-money features.
 */
(function (root) {
  "use strict";
  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const SUITS = ["♣","♥","♠","♦"];
  const rankOf = c => Number.isInteger(c.ri) ? c.ri : RANKS.indexOf(c.rank);
  const suitOf = c => Number.isInteger(c.si) ? c.si : SUITS.indexOf(c.suit);
  const isPrintedJoker = c => !!c.joker;
  const isWild = (c, wildRank) => isPrintedJoker(c) || (wildRank != null && rankOf(c) === wildRank);
  const unique = a => new Set(a).size === a.length;

  function pureSequence(cards) {
    if (cards.length < 3 || cards.some(isPrintedJoker)) return false;
    const suit = suitOf(cards[0]);
    if (cards.some(c => suitOf(c) !== suit)) return false;
    const vals = cards.map(rankOf);
    if (!unique(vals)) return false;
    vals.sort((a,b)=>a-b);
    if (vals.every((v,i)=>i===0 || v===vals[i-1]+1)) return true;
    // Ace may be high only in  Q-K-A; it cannot wrap through K-A-2.
    return vals.includes(0) && vals.includes(11) && vals.includes(12) &&
      vals.length === 3 && vals[0] === 0 && vals[1] === 11 && vals[2] === 12;
  }

  function sequenceWithWild(cards, wildRank) {
    if (cards.length < 3) return false;
    if (pureSequence(cards)) return true;
    const wilds = cards.filter(c => isWild(c, wildRank));
    const fixed = cards.filter(c => !isWild(c, wildRank));
    if (!wilds.length || fixed.length < 2) return false;
    const suits = new Set(fixed.map(suitOf));
    if (suits.size !== 1) return false;
    const vals = fixed.map(rankOf);
    if (!unique(vals)) return false;
    const suit = suitOf(fixed[0]);
    const starts = [];
    for (let start=0; start<=13-cards.length; start++) starts.push(start);
    if (cards.length === 3) starts.push(11); // Q-K-A
    for (const start of starts) {
      const slots = Array.from({length:cards.length},(_,i)=>(start+i)%13);
      if (start===11 && cards.length===3) slots.splice(0,3,11,12,0);
      if (fixed.every(c => suitOf(c)===suit && slots.includes(rankOf(c))) &&
          unique(fixed.map(rankOf))) return true;
    }
    return false;
  }

  function setGroup(cards, wildRank) {
    if (cards.length < 3 || cards.length > 4) return false;
    // Try each rank as the set rank. A wild-rank card may be used naturally
    // when it matches that rank, or as a substitute when it does not.
    for (let target=0; target<13; target++) {
      const naturals=cards.filter(c => !isPrintedJoker(c) && rankOf(c)===target);
      const substitutes=cards.filter(c => isPrintedJoker(c) || (rankOf(c)!==target && isWild(c,wildRank)));
      if (naturals.length+substitutes.length!==cards.length || naturals.length===0) continue;
      if (unique(naturals.map(suitOf))) return true;
    }
    return false;
  }

  function classifyGroup(cards, wildRank) {
    if (!Array.isArray(cards) || cards.length < 3) return "invalid";
    if (pureSequence(cards)) return "pure";
    if (sequenceWithWild(cards, wildRank)) return "sequence";
    if (setGroup(cards, wildRank)) return "set";
    return "invalid";
  }

  function validateHand(cards, wildRank) {
    if (!Array.isArray(cards) || cards.length !== 13) {
      return {valid:false, reason:"A declaration must contain exactly 13 cards.", groups:[]};
    }
    const n=cards.length, full=(1<<n)-1, candidates=[];
    // Enumerate every possible group, then solve an exact-cover partition.
    for (let mask=1; mask<=full; mask++) {
      const count=popcount(mask);
      if (count<3 || count>13) continue;
      const group=[];
      for(let i=0;i<n;i++) if(mask&(1<<i)) group.push(cards[i]);
      const type=classifyGroup(group,wildRank);
      if(type!=="invalid") candidates.push({mask,type,cards:group});
    }
    const byCard=Array.from({length:n},()=>[]);
    for(const g of candidates) for(let i=0;i<n;i++) if(g.mask&(1<<i)) byCard[i].push(g);
    const memo=new Map();
    function solve(remaining, seqCount, hasPure) {
      if(remaining===0) return seqCount>=2 && hasPure ? [] : null;
      const key=remaining+"|"+Math.min(seqCount,2)+"|"+(hasPure?1:0);
      if(memo.has(key)) return memo.get(key);
      let best=-1, options=null;
      for(let i=0;i<n;i++) if(remaining&(1<<i)) {
        const valid=byCard[i].filter(g=>(g.mask&remaining)===g.mask);
        if(options===null || valid.length<options.length){best=i;options=valid;if(!valid.length)break;}
      }
      if(!options || !options.length){memo.set(key,null);return null;}
      for(const g of options) {
        const nextSeq=seqCount+((g.type==="pure"||g.type==="sequence")?1:0);
        const result=solve(remaining^g.mask,nextSeq,hasPure||g.type==="pure");
        if(result){const answer=[g,...result];memo.set(key,answer);return answer;}
      }
      memo.set(key,null);return null;
    }
    const solution=solve(full,0,false);
    if(!solution) return {valid:false,reason:"Need at least two separate sequences, including one pure sequence; all remaining cards must form valid sequences or sets.",groups:[]};
    return {valid:true,reason:"Valid declaration.",groups:solution.map(g=>({type:g.type,cards:g.cards}))};
  }

  function popcount(x){let n=0;while(x){x&=x-1;n++;}return n;}
  function penalty(cards,wildRank) {
    return cards.reduce((sum,c)=>{
      if(isPrintedJoker(c)||isWild(c,wildRank)) return sum;
      const r=rankOf(c);
      return sum + (r===0?10:r>=10?10:r+1);
    },0);
  }
  function createDeck() {
    const deck=[];
    for(let pack=0;pack<2;pack++) for(let si=0;si<4;si++) for(let ri=0;ri<13;ri++)
      deck.push({id:pack+"-"+si+"-"+ri,si,ri,suit:SUITS[si],rank:RANKS[ri],red:si===1||si===3,joker:false});
    deck.push({id:"joker-a",joker:true,rank:"JOKER",suit:"★",si:4,ri:13},{id:"joker-b",joker:true,rank:"JOKER",suit:"★",si:4,ri:13});
    return deck;
  }
  function shuffle(deck, random=Math.random) {
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    return deck;
  }
  function deal(playerCount=2, random=Math.random) {
    if(!Number.isInteger(playerCount)||playerCount<2||playerCount>6) throw new Error("Player count must be 2–6.");
    const stock=shuffle(createDeck(),random), hands=Array.from({length:playerCount},()=>stock.splice(0,13));
    let up=stock.pop();
    if(up.joker){const i=stock.findIndex(c=>!c.joker);if(i>=0){stock.push(up);up=stock.splice(i,1)[0];}}
    return {stock,hands,discard:[up],wildRank:up.ri};
  }
  root.RummyEngine={RANKS,SUITS,createDeck,shuffle,deal,classifyGroup,validateHand,penalty,isWild};
})(typeof window!=="undefined"?window:globalThis);
