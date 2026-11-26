import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isListed, type GameId } from "../domain/game";
import { hasSavedGame, SAVE_KEYS, chessInProgress } from "../lib/localSave";
import { useAccount } from "../auth/account";
import { TILES, findResume } from "../home/Home";
import * as R from "../economy/rules";
import { claimChest, claimDaily, claimMission, collectGames, refreshDay, useWallet, useWalletReady, type Earned } from "../economy/wallet";
import { motionReduced, setMotionReduced } from "../lib/motion";
import "./playhouse.css";
import "./independent-app.css";

export type AppTab = "home" | "games" | "friends" | "learn" | "profile" | "settings";
/* Original Ambaro illustrations for this app. These are intentionally independent of the legacy web game's artwork. */
const ART: Record<GameId, () => ReactNode> = {
  ekah: () => <AmbaroArt game="ekah" />, ludo: () => <AmbaroArt game="ludo" />, snakes: () => <AmbaroArt game="snakes" />, chess: () => <AmbaroArt game="chess" />, sudoku: () => <AmbaroArt game="sudoku" />, words: () => <AmbaroArt game="words" />,
  spades: () => <AmbaroArt game="ekah" />, rummy: () => <AmbaroArt game="ekah" />,
};
const TITLES: Partial<Record<GameId, string>> = { ludo: "Ludo", snakes: "Snakes & Ladders", chess: "Chess", ekah: "EKAH", sudoku: "Sudoku", words: "Word Quest" };
const DETAILS: Partial<Record<GameId, string>> = { ludo: "Bring your crew to the board.", snakes: "Climb higher. Watch the tail.", chess: "Make every move count.", ekah: "Four elements. One last card.", sudoku: "A quiet puzzle, every day.", words: "Find today's hidden word." };
const FEATURED: GameId[] = ["ludo", "ekah", "chess", "words"];
const GAME_IDS = TILES.filter(g => isListed(g.id)).map(g => g.id);
const fmt = (n: number) => n.toLocaleString("en-IN");
function Coin({size=22}:{size?:number}){return <svg className="ph-coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="7.6"/><path d="M12 5.5c1.7 1.9 1.8 3.5 0 6.1-1.8-2.6-1.7-4.2 0-6.1ZM7.2 9c2 .4 3.3 1.7 4 4.3-2.8-.5-4-1.8-4-4.3Zm9.6 0c0 2.5-1.2 3.8-4 4.3.7-2.6 2-3.9 4-4.3ZM7.6 14.4c2.9 1.8 6 1.8 8.8 0-.9 2.3-2.4 3.5-4.4 3.5s-3.5-1.2-4.4-3.5Z"/></svg>}
function BadgeIcon({kind}:{kind:"people"|"spark"|"reward"|"back"}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==="people"?<><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.5-3.5 2.3-5.2 5.5-5.2s5 1.7 5.5 5.2m1-4.2c3.8-.4 6.1 1.1 6.8 4.2"/></>:kind==="spark"?<><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></>:kind==="reward"?<><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4"/><path d="M3 7v13a2 2 0 0 0 2 2h12"/></>:<path d="m15 5-7 7 7 7"/>}</svg>}
function DockIcon({id}:{id:AppTab}){const d:Record<AppTab,ReactNode>={home:<><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></>,games:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 9v6m-3-3h6m6-1h.01m2 3h.01"/></>,friends:<><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c.5-3.3 2.5-5 6-5s5.5 1.7 6 5m1-4c3.2-.4 5.1 1 5.7 4"/></>,learn:<><path d="M3 5.5c3-1.4 6-.8 9 1.1v13c-3-1.9-6-2.5-9-1.1zM21 5.5c-3-1.4-6-.8-9 1.1v13c3-1.9 6-2.5 9-1.1z"/></>,profile:<><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4.2 3.4-6.3 8-6.3s7.3 2.1 8 6.3"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 2-2 2-2-1.2a8 8 0 0 1-1.5.6l-.6 2.3h-2.8l-.6-2.3a8 8 0 0 1-1.5-.6l-2 1.2-2-2 1.2-2a8 8 0 0 1-.6-1.5L4 12.9v-2.8l2.3-.6a8 8 0 0 1 .6-1.5l-1.2-2 2-2 2 1.2a8 8 0 0 1 1.5-.6l.6-2.3h2.8l.6 2.3a8 8 0 0 1 1.5.6l2-1.2 2 2-1.2 2a8 8 0 0 1 .6 1.5l2.3.6v2.8l-2.3.6a8 8 0 0 1-.7 1.5z"/></>};return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d[id]}</svg>}

function AmbaroArt({game}:{game:GameId}) {
  const palette:Record<string,[string,string,string]>={ludo:["#168c56","#f4c942","#ed6748"],snakes:["#176747","#8acb54","#e8b84a"],chess:["#28251f","#d5aa4e","#e5d3a2"],ekah:["#6e1720","#d8a332","#4eb2cf"],sudoku:["#e9dfbe","#24644b","#d3ae55"],words:["#24634b","#f2d875","#e88548"]};
  const [a,b,c]=palette[game]??palette.ekah;
  return <svg className={`ph-original-art ph-art-${game}`} viewBox="0 0 320 180" role="img" aria-label={`${TITLES[game]??game} game artwork`}>
    <defs><linearGradient id={`art-${game}`} x2="1" y2="1"><stop stopColor={a}/><stop offset="1" stopColor="#062b21"/></linearGradient><pattern id={`grain-${game}`} width="22" height="22" patternUnits="userSpaceOnUse"><path d="M0 11h22M11 0v22" stroke="#fff" strokeOpacity=".055"/></pattern></defs>
    <rect width="320" height="180" rx="20" fill={`url(#art-${game})`}/><rect width="320" height="180" rx="20" fill={`url(#grain-${game})`}/>
    {game==="ludo"&&<g transform="translate(66 22) rotate(-7 95 70)"><rect x="0" y="0" width="190" height="132" rx="17" fill="#f5e8c6"/><path d="M95 0v132M0 66h190" stroke="#c8ad78" strokeWidth="2"/><path d="M70 45h50v42H70z" fill={b}/><circle cx="35" cy="34" r="14" fill="#e85d49"/><circle cx="155" cy="34" r="14" fill={c}/><circle cx="35" cy="99" r="14" fill="#3b8fc4"/><circle cx="155" cy="99" r="14" fill="#58a95d"/><circle cx="95" cy="66" r="9" fill="#fff"/></g>}
    {game==="snakes"&&<g transform="translate(38 18)"><path d="M28 130c80-5 15-69 104-80s51 54 112-34" fill="none" stroke={b} strokeWidth="17" strokeLinecap="round"/><path d="M28 130c80-5 15-69 104-80s51 54 112-34" fill="none" stroke="#f2da84" strokeWidth="3" strokeDasharray="5 8"/><path d="M78 137V53m18 84V53m18 84V53M70 65h50m-50 17h50m-50 17h50" stroke={c} strokeWidth="4" strokeLinecap="round"/><circle cx="245" cy="18" r="13" fill={b}/></g>}
    {game==="chess"&&<g textAnchor="middle" fontFamily="Georgia,serif" fontWeight="700" fill={b}><path d="M111 141 124 48h31l13 93z"/><path d="M119 56c-15-22 0-38 18-38s34 16 18 38z"/><path d="M131 32h17M139 23v19" stroke="#fff0be" strokeWidth="5"/><path d="M185 141 193 85h25l9 56z" fill={c}/><path d="M191 91c-8-15 1-25 15-25s24 10 15 25z" fill={c}/><rect x="72" y="142" width="170" height="10" rx="5"/></g>}
    {game==="ekah"&&<g transform="translate(80 18) rotate(-8 80 70)"><rect x="20" y="28" width="82" height="118" rx="10" fill={b} stroke="#f7df9b" strokeWidth="4"/><rect x="80" y="11" width="82" height="118" rx="10" fill="#14749c" stroke="#f7df9b" strokeWidth="4"/><rect x="140" y="31" width="82" height="118" rx="10" fill="#287344" stroke="#f7df9b" strokeWidth="4"/><text x="61" y="104" fill="#fff0bb" fontSize="45" textAnchor="middle">♨</text><text x="121" y="86" fill="#c7f4ff" fontSize="45" textAnchor="middle">≈</text><text x="181" y="105" fill="#d6f3c8" fontSize="45" textAnchor="middle">❧</text></g>}
    {game==="sudoku"&&<g transform="translate(98 20)"><rect width="124" height="140" rx="13" fill="#f6edcf"/><path d="M41 0v140m42-140v140M0 47h124M0 93h124" stroke={a} strokeWidth="3"/><g fill={b} fontFamily="Georgia" fontWeight="700" fontSize="23" textAnchor="middle"><text x="21" y="32">4</text><text x="63" y="32">8</text><text x="104" y="32">2</text><text x="21" y="79">9</text><text x="104" y="79">6</text><text x="63" y="126">3</text></g></g>}
    {game==="words"&&<g transform="translate(42 33)">{[0,1,2,3,4].map(i=><g key={i} transform={`translate(${i*49} 0)`}><rect width="42" height="46" rx="8" fill={i===2?b:"#f3ebd4"}/><text x="21" y="32" textAnchor="middle" fontFamily="Georgia" fontWeight="700" fontSize="24" fill={i===2?"#113c2c":a}>{"AMBAR"[i]}</text></g>)}<path d="M15 79h220" stroke={c} strokeWidth="9" strokeLinecap="round"/><circle cx="45" cy="95" r="7" fill={b}/><circle cx="110" cy="95" r="7" fill={b}/><circle cx="175" cy="95" r="7" fill={b}/></g>}
  </svg>;
}

type Props = { tab: AppTab; onTab: (tab: AppTab) => void; onOpen: (id: GameId) => void; onJoin: (id: "ludo" | "snakes", code: string) => void; profile: ReactNode };

export default function PlayhouseShell({ tab, onTab, onOpen, onJoin, profile }: Props) {
  const wallet = useWallet();
  const ready = useWalletReady();
  const { username, guest, session } = useAccount();
  const [notice, setNotice] = useState("");
  const [earned, setEarned] = useState<Earned | null>(null);
  useEffect(() => { if (!ready) return; refreshDay(); const e = collectGames(); if (e.games) setEarned(e); }, [ready]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(""), 2300); return () => window.clearTimeout(t); }, [notice]);
  const earn = (amount: number, label: string) => { if (amount > 0) setNotice(`+${fmt(amount)} coins · ${label}`); };
  const who = username ?? (session && !guest ? "Player" : "Guest");
  return <div className="playhouse">
    <header className="ph-topbar">
      <img src="/brand/ambaro-logo.webp" alt="Ambaro" className="ph-logo" />
      <div className="ph-player"><span className="ph-avatar">{who.slice(0,1).toUpperCase()}</span><span className="ph-wallet"><Coin size={22}/>{fmt(wallet.coins)}</span></div>
    </header>
    <main className="ph-screen" key={tab}>
      {tab === "home" && <PlayhouseHome who={who} wallet={wallet} onOpen={onOpen} onTab={onTab}/>}
      {tab === "games" && <ArcadeHall onOpen={onOpen}/>}
      {tab === "friends" && <SocialTable onOpen={onOpen} onJoin={onJoin}/>}
      {tab === "learn" && <ProgressRoom wallet={wallet} earn={earn}/>}
      {tab === "profile" && <AccountRoom profile={profile} onSettings={() => onTab("settings")}/>}
      {tab === "settings" && <Preferences/>}
    </main>
    <nav className="ph-dock" aria-label="Ambaro Playhouse">
      {([["home","Home"],["games","Games"],["friends","Friends"],["learn","Learn"],["profile","Profile"]] as [AppTab,string][]).map(([id,label])=><button key={id} type="button" className={tab===id?"active":""} aria-current={tab===id?"page":undefined} onClick={()=>onTab(id)}><span aria-hidden="true"><DockIcon id={id}/></span><small>{label}</small></button>)}
    </nav>
    {notice && <div className="ph-toast" role="status"><Coin size={20}/>{notice}</div>}
    {earned && <div className="ph-scrim" onClick={() => setEarned(null)}><section className="ph-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}><div className="ph-modal-mark"><BadgeIcon kind="reward"/></div><p className="ph-overline">SESSION COMPLETE</p><h2>Nice run.</h2><p>You earned <strong>{fmt(earned.coins)} coins</strong> and {fmt(earned.xp)} XP from {earned.games} game{earned.games===1?"":"s"}.</p><button className="ph-primary" onClick={() => setEarned(null)}>Back to the Playhouse</button></section></div>}
  </div>;
}

function PlayhouseHome({ who, wallet, onOpen, onTab }: { who: string; wallet: ReturnType<typeof useWallet>; onOpen: (id: GameId) => void; onTab: (t: AppTab) => void }) {
  const [featured, setFeatured] = useState(0);
  const current = FEATURED[featured];
  const lv = R.levelOf(wallet.xp);
  const resume = findResume();
  const lastGame = resume?.id ?? (hasSavedGame(SAVE_KEYS.ludo) ? "ludo" : chessInProgress() ? "chess" : "snakes");
  const saved = lastGame === "ludo" ? hasSavedGame(SAVE_KEYS.ludo) : lastGame === "snakes" ? hasSavedGame(SAVE_KEYS.snakes) : lastGame === "chess" ? chessInProgress() : !!resume;
  const mission = R.missionView(wallet, Date.now()).list.find(m => !m.claimed);
  return <div className="ph-home">
    <section className="ph-greeting"><div><span className="ph-overline">YOUR TABLE IS READY</span><h1>Good to see you,<br/><b>{who}.</b></h1></div><button className="ph-level" onClick={() => onTab("learn")}><span>LVL</span><strong>{lv.level}</strong></button></section>
    <section className={`ph-showcase ph-showcase-${current}`} onTouchStart={e => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0]?.clientX ?? 0); }} onTouchEnd={e => { const x=Number((e.currentTarget as HTMLElement).dataset.touchX??0), dx=(e.changedTouches[0]?.clientX??x)-x; if(Math.abs(dx)>44)setFeatured(i=>(i+(dx<0?1:-1)+FEATURED.length)%FEATURED.length); }}>
      <div className="ph-showcase-art">{ART[current]()}</div><div className="ph-showcase-shade"/>
      <div className="ph-showcase-copy"><span className="ph-overline">TONIGHT'S FEATURE</span><h2>{TITLES[current]}</h2><p>{DETAILS[current]}</p><button className="ph-primary" onClick={() => onOpen(current)}>Enter the table <b>↗</b></button></div>
      <div className="ph-slider-controls" aria-label="Featured games">{FEATURED.map((id,i)=><button key={id} aria-label={`Show ${TITLES[id]}`} aria-pressed={featured===i} className={featured===i?"active":""} onClick={() => setFeatured(i)}/>)}</div>
    </section>
    <div className="ph-home-tools"><button onClick={() => onTab("friends")}><span><BadgeIcon kind="people"/></span><b>Invite your people</b><small>Start a private table</small></button><button onClick={() => onTab("learn")}><span><BadgeIcon kind="spark"/></span><b>Today's challenge</b><small>{mission?.text ?? "Your daily reward is ready"}</small></button></div>
    <section className="ph-section"><div className="ph-heading"><div><span className="ph-overline">PICK UP WHERE YOU LEFT OFF</span><h2>Back to the table</h2></div><button onClick={() => onTab("games")}>All games ↗</button></div><button className="ph-continue" onClick={() => onOpen(lastGame)}><span className={`ph-continue-art ph-art-${lastGame}`}>{ART[lastGame]()}</span><span className="ph-continue-copy"><b>{TITLES[lastGame]??lastGame}</b><small>{saved ? "A game is waiting for you" : "Your next favourite might be here"}</small></span><span className="ph-round-button">{saved?"↻":"→"}</span></button></section>
    <section className="ph-section"><div className="ph-heading"><div><span className="ph-overline">THE AMBARO ARCADE</span><h2>Find your kind of fun</h2></div><button onClick={() => onTab("games")}>Explore ↗</button></div><div className="ph-shelf">{GAME_IDS.slice(0,5).map(id=><button key={id} className="ph-shelf-card" onClick={() => onOpen(id)}><span className="ph-shelf-art">{ART[id]()}</span><span><b>{TITLES[id]??id}</b><small>{DETAILS[id]}</small></span></button>)}</div></section>
    <section className="ph-stats-strip"><span><b>{fmt(wallet.life.played)}</b><small>games played</small></span><i/><span><b>{fmt(wallet.life.wins)}</b><small>tables won</small></span><i/><span><b>{wallet.streak}</b><small>day streak</small></span></section>
  </div>;
}

function ArcadeHall({ onOpen }: { onOpen: (id: GameId) => void }) {
  const [filter,setFilter]=useState("All");
  const labels=["All","Board","Cards","Solo"];
  const visible=GAME_IDS.filter(id=>filter==="All"||(filter==="Board"&&["ludo","snakes"].includes(id))||(filter==="Cards"&&id==="ekah")||(filter==="Solo"&&["chess","sudoku","words"].includes(id)));
  return <div className="ph-page"><span className="ph-overline">THE AMBARO ARCADE</span><h1>Choose your<br/><b>next story.</b></h1><div className="ph-filter-row">{labels.map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div><div className="ph-game-list">{visible.map((id,i)=><button key={id} className={`ph-game-row ph-game-${id}`} onClick={() => onOpen(id)}><span className="ph-game-art">{ART[id]()}</span><span className="ph-game-info"><small>{i===0?"PLAYER FAVOURITE":"AMBARO ORIGINAL"}</small><b>{TITLES[id]??id}</b><span>{DETAILS[id]}</span></span><span className="ph-round-button">→</span></button>)}</div></div>;
}

function SocialTable({ onOpen, onJoin }: { onOpen: (id: GameId) => void; onJoin: (id: "ludo"|"snakes",code:string) => void }) {
  const [game,setGame]=useState<"ludo"|"snakes">("ludo"); const [code,setCode]=useState(""); const [error,setError]=useState(""); const {username}=useAccount(); const resume=findResume();
  const join=(e:FormEvent)=>{e.preventDefault();const c=code.trim().toUpperCase();if(!/^[A-Z]{4}$/.test(c)){setError("Room codes are four letters.");return}setError("");onJoin(game,c)};
  return <div className="ph-page"><span className="ph-overline">MAKE IT A LITTLE LOUDER</span><h1>Better with<br/><b>your people.</b></h1><p className="ph-intro">{username?`Playing as ${username}. Invite friends to the same table.`:"Set up a table, share the code, and bring your friends in."}</p>{resume?.code&&<button className="ph-live-room" onClick={()=>onOpen(resume.id)}><span className="ph-live-dot"/><span><small>TABLE IN PROGRESS</small><b>{resume.name} · {resume.code}</b></span><b>Return →</b></button>}<div className="ph-mode-tabs">{(["ludo","snakes"] as const).map(id=><button key={id} className={game===id?"active":""} onClick={()=>setGame(id)}>{id==="ludo"?"Ludo table":"Snakes table"}</button>)}</div><section className="ph-invite-card"><div className="ph-invite-icon">♧</div><span className="ph-overline">HOST A PRIVATE GAME</span><h2>{game==="ludo"?"Set up a Ludo table":"Start a race to 100"}</h2><p>Choose the game. Ambaro will make a room code to share.</p><button className="ph-primary" onClick={() => onOpen(game)}>Create a table <b>↗</b></button></section><form className="ph-join-card" onSubmit={join}><span className="ph-overline">GOT AN INVITE?</span><h2>Join by room code</h2><div><input aria-label="Room code" placeholder="ABCD" maxLength={4} value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g,""))}/><button className="ph-primary" type="submit">Join →</button></div>{error&&<p className="ph-error" role="alert">{error}</p>}</form></div>;
}

function ProgressRoom({ wallet, earn }: { wallet: ReturnType<typeof useWallet>; earn: (n:number,label:string)=>void }) {
  const now=Date.now(), lv=R.levelOf(wallet.xp), daily=R.dailyStatus(wallet,now), chest=R.chestStatus(wallet,now), mission=R.missionView(wallet,now);
  return <div className="ph-page"><span className="ph-overline">PLAY. LEVEL UP. COME BACK.</span><h1>Your progress,<br/><b>your rewards.</b></h1><section className="ph-progress-card"><div><small>LEVEL {lv.level}</small><strong>{fmt(lv.into)} <i>/ {fmt(lv.need)} XP</i></strong></div><span className="ph-progress-track"><i style={{width:`${Math.round(lv.pct*100)}%`}}/></span><small>Every game earns XP. Wins move you faster.</small></section><section className="ph-reward-card"><div><span className="ph-reward-emblem">✦</span><span><small>DAILY STREAK · {wallet.streak} DAYS</small><b>{daily.done?"Your gift is collected":"Your daily gift is ready"}</b></span></div>{!daily.done&&<button className="ph-primary" onClick={()=>earn(claimDaily(),"daily gift")}>Collect <Coin size={17}/>{fmt(daily.coins)}</button>}</section><section className="ph-reward-card"><div><span className="ph-reward-emblem">▣</span><span><small>FREE COIN DROP</small><b>{chest.ready?`${chest.ready} gift${chest.ready>1?"s":""} ready`:`Next gift in ${chest.nextAt?Math.ceil((chest.nextAt-now)/60000)+" min":"a while"}`}</b></span></div><button className="ph-primary" disabled={!chest.ready} onClick={()=>earn(claimChest(),"free gift")}>Open</button></section><div className="ph-heading"><div><span className="ph-overline">TODAY'S RUN</span><h2>Small quests. Extra coins.</h2></div></div>{mission.list.map(m=><section className="ph-quest" key={m.id}><span className="ph-quest-check">{m.claimed?"✓":"·"}</span><span><b>{m.text}</b><small>{m.progress} / {m.goal}</small><i className="ph-quest-track"><i style={{width:`${Math.round(m.progress/m.goal*100)}%`}}/></i></span><button disabled={!m.done||m.claimed} onClick={()=>earn(claimMission(m.id),"quest")}>{m.claimed?"Done":`+${R.MISSION_COINS}`}</button></section>)}</div>;
}

function AccountRoom({ profile, onSettings }: { profile: ReactNode; onSettings:()=>void }) { const {username}=useAccount(); const wallet=useWallet(); const lv=R.levelOf(wallet.xp); return <div className="ph-page"><span className="ph-overline">YOUR SEAT AT THE TABLE</span><h1>Player<br/><b>{username??"Guest"}.</b></h1><div className="ph-profile-stats"><div><b>{lv.level}</b><small>Level</small></div><div><b>{fmt(wallet.life.played)}</b><small>Games</small></div><div><b>{fmt(wallet.life.wins)}</b><small>Wins</small></div></div><section className="ph-account-card">{profile}</section><button className="ph-settings-link" onClick={onSettings}>Preferences &amp; settings <span>→</span></button></div>; }
const VIBRATE_KEY="rc-vibrate";
const readVibrate=()=>{try{return window.localStorage.getItem(VIBRATE_KEY)!=="off"}catch{return true}};
function Preferences(){const [vibrate,setVibrate]=useState(readVibrate);const [lessMotion,setLessMotion]=useState(motionReduced);return <div className="ph-page"><span className="ph-overline">MAKE IT YOURS</span><h1>App<br/><b>preferences.</b></h1><section className="ph-pref-card"><label><span><b>Haptics</b><small>Feel the dice, cards and wins</small></span><input type="checkbox" checked={vibrate} onChange={e=>{setVibrate(e.target.checked);try{localStorage.setItem(VIBRATE_KEY,e.target.checked?"on":"off")}catch{}}}/></label><label><span><b>Reduce motion</b><small>Subtle transitions across the Playhouse</small></span><input type="checkbox" checked={lessMotion} onChange={e=>{setLessMotion(e.target.checked);setMotionReduced(e.target.checked)}}/></label></section><div className="ph-note-card">Ambaro Playhouse · built around the original Ambaro games.</div><a className="ph-policy-link" href="/privacy/">Privacy and account help ↗</a></div>}

export function PlayhouseDialog({ title, text, yes, no, onYes, onNo, tone }: { title:string;text:string;yes:string;no:string;onYes:()=>void;onNo:()=>void;tone?:"leave" }) {return <div className="ph-scrim" onClick={onNo}><section className="ph-modal" role="alertdialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="ph-modal-mark">{tone==="leave"?"↩":"✦"}</div><h2>{title}</h2><p>{text}</p><button className="ph-primary" onClick={onNo}>{no}</button><button className="ph-text-action" onClick={onYes}>{yes}</button></section></div>}
