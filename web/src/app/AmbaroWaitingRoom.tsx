import { useState } from "react";
import type { WaitProps, WaitSeat } from "../room/RoomScreens";
import { copyText, shareOnWhatsApp } from "../lib/share";
import "./independent-app.css";

export default function AmbaroWaitingRoom({p}:{p:WaitProps}){
  const seated=p.seats.filter(Boolean) as WaitSeat[];
  const humansOk=seated.filter(s=>!s.bot).every(s=>s.connected),ready=seated.length>=2&&humansOk;
  const full=seated.length>=p.seats.length,anyBot=seated.some(s=>s.bot),hostSeat=p.hostSeat??(p.isHost?p.you:undefined);
  const[copied,setCopied]=useState(false);
  const copy=()=>{void copyText(p.invite).then(ok=>{if(ok){setCopied(true);window.setTimeout(()=>setCopied(false),1800)}else p.onMsg(p.invite)})};
  return <section className="amb-waiting">
    <header className="amb-wait-head"><button className="amb-icon-button" onClick={p.onBack} aria-label="Back"><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><div><small>AMBARO · FRIENDS TABLE</small><h1>{p.game}</h1></div><span className="amb-live-pill"><i/>LIVE</span></header>
    <main className="amb-wait-scroll">
      <section className="amb-room-code"><span>YOUR ROOM CODE</span><strong>{p.code}</strong><div className="amb-pin-row"><small>PASSCODE</small><b>{p.passcode}</b></div><p>Share both with your friends to bring them to the table.</p><div className="amb-share-row"><button onClick={()=>shareOnWhatsApp(p.invite)}>Share invite</button><button onClick={copy}>{copied?"Copied ✓":"Copy invite"}</button></div></section>
      <div className="amb-section-heading"><span>PLAYERS AT THE TABLE</span><b>{seated.length} / {p.seats.length}</b></div>
      <section className="amb-player-list"><ul>{seated.map(s=><li key={s.seat} className={s.seat===p.you?"you":""}><span className="amb-seat-avatar" style={p.colors?{borderColor:p.colors[s.seat]}:undefined}>{p.avatar?p.avatar(s):s.name.slice(0,1).toUpperCase()}</span><span className="amb-seat-name"><b>{s.name}{s.seat===p.you?" (you)":""}</b><small>{s.bot?"Computer player":!s.connected?"Offline":s.seat===hostSeat?"Host":"Ready"}</small></span><span className={`amb-seat-status ${!s.connected&&!s.bot?"offline":""}`}>{!s.connected&&!s.bot?"Offline":"Ready"}</span></li>)}{Array.from({length:p.seats.length-seated.length},(_,i)=><li key={`open-${i}`} className="open"><span className="amb-seat-avatar">＋</span><span className="amb-seat-name"><b>Open seat</b><small>Invite a friend or add a computer</small></span></li>)}</ul>
        {p.isHost&&<div className="amb-wait-tools"><button disabled={full} onClick={p.onAddBot}>＋ Add computer</button><button disabled={!anyBot} onClick={p.onRemoveBot}>Remove computer</button></div>}
        {p.blocked?<div className="amb-wait-blocked">{p.blocked}</div>:p.isHost?<button className="amb-play-button" disabled={!ready} onClick={p.onStart}>{ready?`Start game · ${seated.length} players`:(seated.length<2?"Invite a friend or add a computer":"Waiting for everyone")}<svg viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>:<p className="amb-wait-note">Waiting for the host to start the game.</p>}
        {p.msg&&<p className="amb-error" role="alert">{p.msg}</p>}
      </section>
      {p.children&&<section className="amb-wait-extra">{p.children}</section>}
      {p.note&&<p className="amb-wait-note">{p.note}</p>}
      <button className="amb-leave-room" onClick={p.onLeave}>Leave this table</button>
    </main>
  </section>
}
