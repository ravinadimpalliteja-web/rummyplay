/* Standalone Ambaro game lobby. Game rules and room actions arrive through StartProps; this file owns only the app UI. */
import { useState } from "react";
import { CPU_LEVELS, RoomAccountLine, type StartProps } from "../room/RoomScreens";
import "./independent-app.css";

type Mode="computer"|"pass"|"friends";
const MODE_KEY=(game:string)=>`ambaro-mode-${game.toLowerCase().replace(/[^a-z]+/g,"-")}`;
function Mark({mode}:{mode:Mode}){return <svg viewBox="0 0 32 32" aria-hidden="true" className="amb-mark" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{mode==="computer"?<><rect x="5" y="8" width="22" height="17" rx="5"/><path d="M16 8V4m-5 12h.1m9.8 0h.1M11 25v3m10-3v3"/><path d="M12 21h8"/></>:mode==="pass"?<><rect x="8" y="3" width="16" height="26" rx="3"/><path d="M13 24h6m-3-17v7m-3-3 3 3 3-3"/></>:<><circle cx="12" cy="11" r="5"/><circle cx="23" cy="13" r="4"/><path d="M3 28c.5-5 3.8-8 9-8s8.5 3 9 8m-1-7c4.8-.7 7.6 1.8 8 6"/></>}</svg>}
function Arrow(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>}
export default function AppLobby(p:StartProps){
  const f=p.friends,hasPass=!!p.passPlay&&!!p.passStart;
  const[mode,setMode]=useState<Mode>(()=>{if(p.msg)return"friends";try{const v=localStorage.getItem(MODE_KEY(p.game));return v==="friends"?"friends":v==="pass"&&hasPass?"pass":"computer"}catch{return"computer"}});
  const[rules,setRules]=useState(false);
  const choose=(m:Mode)=>{setMode(m);try{localStorage.setItem(MODE_KEY(p.game),m)}catch{}}
  const play=mode==="computer"?{label:p.vsComputer.playLabel?.replace(/\s*→$/," ").trim()??"Play game",go:p.vsComputer.onPlay,busy:false}:mode==="pass"?{label:"Start pass & play",go:p.passStart!,busy:false}:{label:f.busy?"Connecting…":"Create a friends table",go:f.onCreate,busy:f.busy};
  const modes:[Mode,string,string][]=[["computer","Quick game","Play against computer players"],...(hasPass?[["pass","Pass & play","Take turns on this phone"] as [Mode,string,string]]:[]),["friends","With friends","Create a table or join by code"]];
  return <section className="amb-lobby">
    <header className="amb-lobby-head"><button className="amb-icon-button" onClick={p.onBack} aria-label="Back"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><div><small>AMBARO · GAME ROOM</small><h1>{p.game}</h1></div><button className="amb-icon-button" onClick={()=>setRules(true)} aria-label="Game rules"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.5 2.5c-.8.4-1 1-1 2M12 17.5h.01"/></svg></button></header>
    <div className="amb-lobby-scroll">
      <div className="amb-lobby-hero"><div className="amb-lobby-orbit"/><div className="amb-lobby-symbol" aria-hidden="true"><span>{p.game.slice(0,1).toUpperCase()}</span></div><div className="amb-lobby-herotext"><span>{p.meta??p.tagline}</span><strong>Ready when<br/>you are.</strong></div><div className="amb-lobby-stat"><b>{p.meta?.split("·")[0]?.trim()??"Play your way"}</b><small>Choose a table below</small></div></div>
      {p.extra&&<div className="amb-lobby-extras">{p.extra}</div>}
      <div className="amb-section-heading"><span>CHOOSE YOUR TABLE</span><button onClick={()=>setRules(true)}>Rules <b>↗</b></button></div>
      <div className="amb-mode-grid" role="radiogroup" aria-label="Game mode">{modes.map(([id,title,sub])=><button key={id} type="button" role="radio" aria-checked={mode===id} className={`amb-mode-card${mode===id?" selected":""}`} onClick={()=>choose(id)}><span className="amb-mode-icon"><Mark mode={id}/></span><b>{title}</b><small>{sub}</small><i>{mode===id?"✓":""}</i></button>)}</div>
      {mode==="computer"&&<div className="amb-options"><div className="amb-option-row"><b>Computer players</b><div className="amb-chips">{p.vsComputer.options.map(n=><button key={n} className={p.vsComputer.count===n?"active":""} aria-pressed={p.vsComputer.count===n} onClick={()=>p.vsComputer.onCount(n)}>{n}</button>)}</div></div>{p.vsComputer.level&&<div className="amb-option-row"><b>Difficulty</b><div className="amb-difficulty">{CPU_LEVELS.map(l=><button key={l.id} className={p.vsComputer.level!.value===l.id?"active":""} onClick={()=>p.vsComputer.level!.onLevel(l.id)}><b>{l.name}</b><small>{l.note}</small></button>)}</div></div>}</div>}
      {mode==="pass"&&<div className="amb-options">{p.passPlay}</div>}
      {mode==="friends"&&<div className="amb-options amb-friends"><RoomAccountLine/><div className="amb-divider"><span>OR JOIN A FRIEND</span></div><div className="amb-code-row"><input value={f.code} maxLength={4} autoCapitalize="characters" autoComplete="off" aria-label="Room code" placeholder="ROOM CODE" onChange={e=>f.onCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/><input value={f.pass} maxLength={4} inputMode="numeric" autoComplete="off" aria-label="Passcode" placeholder="PIN" onChange={e=>f.onPass(e.target.value.replace(/\D/g,""))}/><button type="button" onClick={f.onJoin} disabled={f.busy}>Join <Arrow/></button></div>{p.msg&&<p className="amb-error" role="alert">{p.msg}</p>}</div>}
      {p.after&&<details className="amb-customize"><summary>Customize your game <span>＋</span></summary><div>{p.after}</div></details>}
    </div>
    <footer className="amb-lobby-footer"><button className="amb-play-button" disabled={play.busy} onClick={play.go}>{play.label}<Arrow/></button></footer>
    {rules&&p.rules&&<div className="amb-rules-scrim" onClick={()=>setRules(false)}><section className="amb-rules-sheet" role="dialog" aria-modal="true" aria-label={`Rules for ${p.game}`} onClick={e=>e.stopPropagation()}><header><div><small>AMBARO · RULEBOOK</small><h2>How to play</h2></div><button className="amb-icon-button" onClick={()=>setRules(false)} aria-label="Close rules">×</button></header><div className="amb-rules-copy">{p.rules}</div><button className="amb-play-button" onClick={()=>setRules(false)}>Got it <Arrow/></button></section></div>}
  </section>
}
