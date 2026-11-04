import {sortHand,type Card,type Match,type Played,type Player,type RoundRecord,type Suit} from "./spades";

/* ---------- what the room server sends ---------- */
export type SeatInfo={seat:number;name:string;connected:boolean;away:boolean}|null;
export type View={
  t:"state";code:string;passcode:string;now:number;you:number;host:boolean;
  phase:"lobby"|"bidding"|"playing"|"trickPause"|"roundEnd"|"gameEnd";
  seats:SeatInfo[];
  round?:number;dealer?:number;turn?:number;trick?:{seat:number;card:string}[];trickWinner?:number|null;spadesBroken?:boolean;
  deadline?:number|null;stage?:"review"|"starting";
  players?:{seat:number;bid:number|null;blind:boolean;tricks:number;total:number;bags:number;handCount:number}[];
  hand?:string[]|null;legal?:string[];bidStage?:{max:number;canBlind:boolean}|null;
  history?:{round:number;rows:{seat:number;bid:number;blind:boolean;tricks:number;points:number;bagsGained:number;bags:number;penalty:number;total:number}[]}[];
  final?:{ranking:{seat:number;total:number;bags:number;rank:number;winner:boolean}[]}|null;
  continued?:number[];
};

/* ---------- server address ---------- */
type Env={env?:Record<string,string|undefined>};
/** The room server's address comes from the VITE_ROOM_SERVER_URL build setting. For local and preview testing only,
    ?server=wss://... may override it (never on the live site). */
export const serverUrl=():string=>{
  const fromEnv=((import.meta as unknown as Env).env?.VITE_ROOM_SERVER_URL??"").trim();
  const host=window.location.hostname;
  const testing=host==="localhost"||host==="127.0.0.1"||host.startsWith("deploy-preview-")||host.includes("--");
  const q=testing?new URLSearchParams(window.location.search).get("server"):null;
  const url=(q||fromEnv).trim();
  return /^wss?:\/\//.test(url)?url:"";
};

/* ---------- this device's seat (so a refresh or a dropped connection can resume) ---------- */
const TOKEN_KEY="rc-token",ROOM_KEY="rc-room";
const memory:Record<string,string>={};
const read=(k:string)=>{try{return window.localStorage.getItem(k)}catch{return memory[k]??null}};
const write=(k:string,v:string|null)=>{try{if(v===null)window.localStorage.removeItem(k);else window.localStorage.setItem(k,v)}catch{if(v===null)delete memory[k];else memory[k]=v}};
export const deviceToken=():string=>{let t=read(TOKEN_KEY);if(!t||!/^[A-Za-z0-9_-]{8,64}$/.test(t)){const b=new Uint8Array(18);crypto.getRandomValues(b);t=Array.from(b,x=>x.toString(36).padStart(2,"0")).join("").slice(0,32);write(TOKEN_KEY,t)}return t};
/* Each game keeps its own saved room, so a Spades refresh never resumes a Snakes & Ladders room or the reverse. */
export const savedRoom=(key:string=ROOM_KEY):string|null=>read(key);
export const saveRoom=(code:string|null,key:string=ROOM_KEY)=>write(key,code);
export const randomPasscode=()=>{const b=new Uint32Array(1);crypto.getRandomValues(b);return String(b[0]%10000).padStart(4,"0")};

/* ---------- connection ---------- */
export type NetStatus="idle"|"connecting"|"open"|"down";
export class RoomClient{
  private ws:WebSocket|null=null;private closed=false;private retries=0;private timer=0;
  constructor(private url:string,private first:object,private onMessage:(m:Record<string,unknown>)=>void,private onStatus:(s:NetStatus)=>void,private opts:{roomKey?:string;game?:string}={}){this.connect()}
  private connect(){
    this.onStatus("connecting");
    const ws=new WebSocket(this.url);this.ws=ws;
    ws.onopen=()=>{this.retries=0;this.onStatus("open");const code=savedRoom(this.opts.roomKey);ws.send(JSON.stringify(code?{t:"hello",code,token:deviceToken(),...(this.opts.game?{game:this.opts.game}:{})}:this.first))};
    ws.onmessage=e=>{try{this.onMessage(JSON.parse(String(e.data)))}catch{/* ignore malformed */}};
    ws.onclose=()=>{if(this.closed||this.ws!==ws)return;this.ws=null;if(!savedRoom(this.opts.roomKey)){this.onStatus("idle");return}this.onStatus("down");this.timer=window.setTimeout(()=>this.connect(),Math.min(8000,700*2**this.retries++))};
  }
  send(o:object){if(this.ws&&this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(o))}
  close(){this.closed=true;window.clearTimeout(this.timer);const w=this.ws;this.ws=null;w?.close();this.onStatus("idle")}
}

/* ---------- server state -> the Match shape the table screen already draws ---------- */
const SUIT:Record<string,Suit>={S:"spades",H:"hearts",D:"diamonds",C:"clubs"};
const FACE:Record<number,string>={11:"J",12:"Q",13:"K",14:"A"};
export const toCard=(c:string):Card=>{const v=Number(c.slice(1));return{id:c,suit:SUIT[c[0]],rank:v<=10?String(v):FACE[v],value:v}};
/* Screen positions: 0 = you (bottom), then clockwise: left = 2, top = 1, right = 3 (the table's existing numbering). */
const LOCAL=[0,2,1,3];
export const toMatch=(v:View):Match=>{
  const you=v.you,loc=(seat:number)=>LOCAL[(seat-you+4)%4];
  const seatOfLocal=[0,0,0,0];for(let s=0;s<4;s++)seatOfLocal[loc(s)]=s;
  const dummy=(seat:number,n:number):Card[]=>Array.from({length:n},(_,k)=>({id:"x"+seat+"-"+k,suit:"spades" as Suit,rank:"?",value:0}));
  const players:Player[]=[0,1,2,3].map(i=>{
    const seat=seatOfLocal[i],p=v.players![seat],info=v.seats[seat];
    const mine=seat===you;
    return{id:"p"+i,name:mine?"You":(info?.name??"Player")+(info?.away?" (away)":""),
      hand:mine&&v.hand?sortHand(v.hand.map(toCard)):dummy(seat,p.handCount),
      bid:p.bid,tricks:p.tricks,score:p.total,bags:p.bags,isBot:false,blind:p.blind,seen:mine?v.hand!=null:true};
  });
  const phase:Match["phase"]=v.phase==="bidding"?"bidding":v.phase==="playing"?"playing":v.phase==="trickPause"?"trick-complete":"round-complete";
  const trick:Played[]=(v.trick??[]).map(t=>({player:loc(t.seat),card:toCard(t.card)}));
  const turn=v.phase==="trickPause"&&v.trickWinner!=null?loc(v.trickWinner):loc(v.turn??you);
  const history:RoundRecord[]=(v.history??[]).map(h=>({round:h.round,players:[0,1,2,3].map(i=>{const r=h.rows[seatOfLocal[i]];return{bid:r.bid,tricks:r.tricks,roundPoints:r.points,bagsAdded:r.bagsGained,bagPenalty:r.penalty,totalScore:r.total,remainingBags:r.bags,blind:r.blind}})}));
  const message=v.phase==="bidding"?(v.bidStage?"Your turn to bid.":players[turn].name+" is bidding.")
    :v.phase==="playing"?(turn===0?"Your turn — select a card.":players[turn].name+" to play.")
    :v.phase==="trickPause"?players[turn].name+" won the trick.":v.phase==="gameEnd"?"Game over.":"Round complete. Review the scorecard.";
  return{round:v.round??1,dealer:loc(v.dealer??0),turn,phase,players,trick,lastTrick:trick,spadesBroken:!!v.spadesBroken,message,mode:"online",history};
};
