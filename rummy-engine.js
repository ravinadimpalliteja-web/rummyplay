/* Rummy Play · independent Indian Rummy rules engine */
(function (root) {
  "use strict";
  const RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const SUITS=["♣","♥","♠","♦"];
  const rankOf=c=>Number.isInteger(c.ri)?c.ri:RANKS.indexOf(c.rank);
  const suitOf=c=>Number.isInteger(c.si)?c.si:SUITS.indexOf(c.suit);
  const isPrintedJoker=c=>!!c.joker;
  const isWild=(c,wildRank)=>isPrintedJoker(c)||(wildRank!=null&&rankOf(c)===wildRank);
  const unique=a=>new Set(a).size===a.length;
  function pureSequence(cards){
    if(cards.length<3||cards.some(isPrintedJoker))return false;
    const suit=suitOf(cards[0]);
    if(cards.some(c=>suitOf(c)!==suit))return false;
    const vals=cards.map(rankOf);
    if(!unique(vals))return false;
    vals.sort((a,b)=>a-b);
    if(vals.every((v,i)=>i===0||v===vals[i-1]+1))return true;
    // Ace may be low (A-2-3) or high (10-J-Q-K-A).
    const aceLow = vals[0]===0 && vals.every((v,i)=>i===0||v===vals[i-1]+1);
    const aceHigh = vals.length>=3 && vals[0]===0 && vals[1]===9 &&
      vals.slice(2).every((v,i)=>v===vals[i+1]+1);
    return aceLow || aceHigh;
  }
  function sequenceWithWild(cards,wildRank){
    if(cards.length<3||cards.length>13)return false;
    if(pureSequence(cards))return true;
    const wilds=cards.filter(c=>isWild(c,wildRank));
    const fixed=cards.filter(c=>!isWild(c,wildRank));
    if(!wilds.length||fixed.length<2)return false;
    if(new Set(fixed.map(suitOf)).size!==1||!unique(fixed.map(rankOf)))return false;
    const n=cards.length, fixedRanks=fixed.map(rankOf);
    // Try every legal consecutive run, including A-2-3 and 10-J-Q-K-A.
    const runs=[];
    for(let start=0;start+n<=13;start++)runs.push(Array.from({length:n},(_,i)=>start+i));
    if(n>=3&&n<=5){
      // A-2-3 through Q-K-A, plus the 10-J-Q-K-A run.
      const start=14-n;
      runs.push([...Array.from({length:n-1},(_,i)=>start+i),0]);
    }
    return runs.some(run=>fixedRanks.every(r=>run.includes(r))&&run.length-fixedRanks.length===wilds.length);
  }
  function setGroup(cards,wildRank){
    if(cards.length<3||cards.length>4)return false;
    for(let target=0;target<13;target++){
      const naturals=cards.filter(c=>!isPrintedJoker(c)&&rankOf(c)===target);
      const substitutes=cards.filter(c=>isPrintedJoker(c)||(rankOf(c)!==target&&isWild(c,wildRank)));
      if(naturals.length+substitutes.length!==cards.length||naturals.length===0)continue;
      if(unique(naturals.map(suitOf)))return true;
    }
    return false;
  }
  function classifyGroup(cards,wildRank){
    if(!Array.isArray(cards)||cards.length<3)return "invalid";
    if(pureSequence(cards))return "pure";
    if(sequenceWithWild(cards,wildRank))return "sequence";
    if(setGroup(cards,wildRank))return "set";
    return "invalid";
  }
  function validateHand(cards,wildRank){
    if(!Array.isArray(cards)||cards.length!==13)return{valid:false,reason:"A declaration must contain exactly 13 cards.",groups:[]};
    const n=cards.length,full=(1<<n)-1,candidates=[];
    for(let mask=1;mask<=full;mask++){
      const count=popcount(mask);if(count<3||count>13)continue;
      const group=[];for(let i=0;i<n;i++)if(mask&(1<<i))group.push(cards[i]);
      const type=classifyGroup(group,wildRank);if(type!=="invalid")candidates.push({mask,type,cards:group});
    }
    const byCard=Array.from({length:n},()=>[]);
    for(const g of candidates)for(let i=0;i<n;i++)if(g.mask&(1<<i))byCard[i].push(g);
    const memo=new Map();
    function solve(remaining,seqCount,hasPure){
      if(remaining===0)return seqCount>=2&&hasPure?[]:null;
      const key=remaining+"|"+Math.min(seqCount,2)+"|"+(hasPure?1:0);if(memo.has(key))return memo.get(key);
      let options=null;
      for(let i=0;i<n;i++)if(remaining&(1<<i)){const valid=byCard[i].filter(g=>(g.mask&remaining)===g.mask);if(options===null||valid.length<options.length){options=valid;if(!valid.length)break;}}
      if(!options||!options.length){memo.set(key,null);return null;}
      for(const g of options){const nextSeq=seqCount+((g.type==="pure"||g.type==="sequence")?1:0);const result=solve(remaining^g.mask,nextSeq,hasPure||g.type==="pure");if(result){const answer=[g,...result];memo.set(key,answer);return answer;}}
      memo.set(key,null);return null;
    }
    const solution=solve(full,0,false);
    if(!solution)return{valid:false,reason:"Need at least two separate sequences, including one pure sequence; all remaining cards must form valid sequences or sets.",groups:[]};
    return{valid:true,reason:"Valid declaration.",groups:solution.map(g=>({type:g.type,cards:g.cards}))};
  }
  function popcount(x){let n=0;while(x){x&=x-1;n++;}return n;}
  function penalty(cards,wildRank){return cards.reduce((sum,c)=>{if(isWild(c,wildRank))return sum;const r=rankOf(c);return sum+(r===0?10:r>=10?10:r+1);},0);}
  function createDeck(deckCount=1){
    if(!Number.isInteger(deckCount)||deckCount<1||deckCount>3)throw new Error("Deck count must be 1, 2 or 3.");
    const deck=[];
    for(let pack=0;pack<deckCount;pack++){
      for(let si=0;si<4;si++)for(let ri=0;ri<13;ri++)deck.push({id:pack+"-"+si+"-"+ri,pack,si,ri,suit:SUITS[si],rank:RANKS[ri],red:si===1||si===3,joker:false});
      for(let copy=0;copy<2;copy++)deck.push({id:"joker-"+pack+"-"+copy,pack,joker:true,rank:"JOKER",suit:"★",si:4,ri:13,red:false});
    }
    return deck;
  }
  function shuffle(deck,random=Math.random){for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
  function deckCountForCapacity(capacity){if(!Number.isInteger(capacity)||capacity<2||capacity>6)throw new Error("Room capacity must be 2–6.");return Math.ceil(capacity/2);}
  function deal(roomCapacity=2,random=Math.random){
    const deckCount=deckCountForCapacity(roomCapacity),stock=shuffle(createDeck(deckCount),random);
    let indicator=stock.pop();
    if(indicator.joker){stock.push(indicator);const replacement=stock.findIndex(c=>!c.joker);indicator=stock.splice(replacement,1)[0];}
    const hands=Array.from({length:roomCapacity},()=>stock.splice(0,13));
    let up=stock.pop();if(up&&up.joker){stock.push(up);const i=stock.findIndex(c=>!c.joker);up=stock.splice(i,1)[0];}
    return{stock,hands,discard:up?[up]:[],wildCard:indicator,wildRank:rankOf(indicator),deckCount,roomCapacity};
  }
  root.RummyEngine={RANKS,SUITS,createDeck,shuffle,deal,deckCountForCapacity,classifyGroup,validateHand,penalty,isWild};
})(typeof window!=="undefined"?window:globalThis);
