import { useState } from "react";
import { COLLECTIONS, PIECES, pieceById, pieceUrl, type CollectionId, type PieceId } from "./tokens";

export type PickerPlayer = { key: number; name: string; piece: PieceId; color: string; editable: boolean };

/** Token selection before a match. Every player has a token; tokens can come from any collection, and no two players share one.
    Tap a player (when you may choose for them), then a token. */
export default function TokenPicker({ players, active, onActive, onPick, note }: {
  players: PickerPlayer[]; active: number; onActive: (key: number) => void; onPick: (key: number, piece: PieceId) => void; note?: string;
}) {
  const cur = players.find((p) => p.key === active) ?? players[0];
  const curPiece = pieceById(cur?.piece);
  const [tab, setTab] = useState<CollectionId>(curPiece.collection);
  const owner = (id: PieceId) => players.find((p) => p.piece === id && p.key !== cur?.key);
  return <div className="tp">
    <div className="tp-side">
      <ul className="tp-players" aria-label="Players and their tokens">
        {players.map((p) => {
          const piece = pieceById(p.piece);
          const on = p.key === cur?.key;
          return <li key={p.key}>
            <button type="button" className={`tp-player ${on ? "on" : ""}`} aria-pressed={on} disabled={!p.editable}
              onClick={() => { onActive(p.key); setTab(piece.collection); }}>
              <span className="tp-player-img" style={{ borderColor: p.color }}><img src={pieceUrl(p.piece)} alt="" /></span>
              <span className="tp-player-text"><b>{p.name}</b><small>{piece.name}</small></span>
              {on && p.editable && <span className="tp-choosing">Choosing</span>}
            </button>
          </li>;
        })}
      </ul>
      <figure className="tp-preview" aria-live="polite">
        <span className="tp-stage"><img key={curPiece.id} src={pieceUrl(curPiece.id)} alt={`${curPiece.name} token`} /></span>
        <figcaption><b>{curPiece.name}</b><span>{cur?.name === "You" ? "Your token" : `${cur?.name}'s token`} · {COLLECTIONS.find((c) => c.id === curPiece.collection)?.name}</span></figcaption>
      </figure>
    </div>
    <div className="tp-main">
      <div className="tp-tabs" role="tablist" aria-label="Token collections">
        {COLLECTIONS.map((c) => <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} className={tab === c.id ? "on" : ""} onClick={() => setTab(c.id)}>
          <span>{c.name}</span><small>{c.blurb}</small>
        </button>)}
      </div>
      <div className="tp-grid" role="tabpanel">
        {PIECES.filter((p) => p.collection === tab).map((p) => {
          const taken = owner(p.id), mine = p.id === cur?.piece, can = !!cur?.editable && !taken;
          return <button key={p.id} type="button" className={`tp-token ${mine ? "on" : ""} ${taken ? "taken" : ""}`} aria-pressed={mine} disabled={!can && !mine}
            onClick={() => cur && can && onPick(cur.key, p.id)} aria-label={`${p.name}${taken ? `, taken by ${taken.name}` : ""}`}>
            <img src={pieceUrl(p.id)} alt="" />
            <span>{p.name}</span>
            {taken && <em>{taken.name}</em>}
            {mine && <i className="tp-check" aria-hidden="true">✓</i>}
          </button>;
        })}
      </div>
      {note && <p className="tp-note">{note}</p>}
    </div>
  </div>;
}
