/* Royal Club Ludo: token sets and dice finishes. Purely visual; chosen per device and remembered. */
import type { Color } from "./engine";

export const TOKEN_SETS = [
  { id: "sentry", name: "Indian sentries", note: "Palace guards in turbans, with spear and shield" },
  { id: "pawn", name: "Royal pawn", note: "The classic Ludo piece, lacquered with a gold collar" },
  { id: "crown", name: "Crowns", note: "Jewelled crowns for a royal table" },
  { id: "gem", name: "Gemstones", note: "Cut ruby, emerald, topaz and sapphire" },
  { id: "lotus", name: "Lotus", note: "Lotus blooms with golden hearts" },
  { id: "chakra", name: "Chakra", note: "Spinning wheels with gold spokes" },
  { id: "disc", name: "Classic disc", note: "Flat round counters, easy to read" },
] as const;
export type TokenSet = typeof TOKEN_SETS[number]["id"];

/* Same finishes as the Snakes & Ladders die. */
export const DICE = [
  { id: "ivory", name: "Classic ivory" }, { id: "brass", name: "Polished brass" }, { id: "glass", name: "Emerald glass" },
  { id: "rosewood", name: "Carved rosewood" }, { id: "onyx", name: "Black onyx" },
] as const;
export type DiceId = typeof DICE[number]["id"];

const TONES: Record<Color, { hi: string; base: string; lo: string }> = {
  red: { hi: "#ff9aa0", base: "#cf2f3d", lo: "#6d0f19" },
  green: { hi: "#8ff0bd", base: "#1f9a5c", lo: "#0b4a2a" },
  yellow: { hi: "#fff0a8", base: "#e8a516", lo: "#7a4c03" },
  blue: { hi: "#a9c6ff", base: "#2f63c4", lo: "#122d6b" },
};
const COLS: Color[] = ["red", "green", "yellow", "blue"];

/** Gradients shared by every token on the page (one hidden SVG, referenced by id). */
export function PieceDefs() {
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="ldp-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c0" /><stop offset=".45" stopColor="#e6bd5f" /><stop offset="1" stopColor="#8a5f18" /></linearGradient>
      <linearGradient id="ldp-gold-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8a5f18" /><stop offset=".35" stopColor="#f6dc8e" /><stop offset=".6" stopColor="#fff3c0" /><stop offset="1" stopColor="#9a6c1e" /></linearGradient>
      <radialGradient id="ldp-pearl" cx=".38" cy=".32" r=".7"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#efe6d2" /><stop offset="1" stopColor="#b9a87e" /></radialGradient>
      {COLS.map(c => <g key={c}>
        <radialGradient id={`ldp-${c}-ball`} cx=".36" cy=".3" r=".75"><stop offset="0" stopColor={TONES[c].hi} /><stop offset=".45" stopColor={TONES[c].base} /><stop offset="1" stopColor={TONES[c].lo} /></radialGradient>
        <linearGradient id={`ldp-${c}-body`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={TONES[c].lo} /><stop offset=".32" stopColor={TONES[c].base} /><stop offset=".52" stopColor={TONES[c].hi} /><stop offset=".72" stopColor={TONES[c].base} /><stop offset="1" stopColor={TONES[c].lo} /></linearGradient>
        <linearGradient id={`ldp-${c}-v`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={TONES[c].hi} /><stop offset=".5" stopColor={TONES[c].base} /><stop offset="1" stopColor={TONES[c].lo} /></linearGradient>
      </g>)}
    </defs>
  </svg>;
}

const shadow = <ellipse cx="20" cy="35.2" rx="11" ry="2.8" fill="rgba(0,0,0,.38)" />;

/** One token drawn in the chosen set. viewBox 0 0 40 40; the piece's footprint sits on the square's centre. */
export function Piece({ set, color }: { set: TokenSet; color: Color }) {
  const ball = `url(#ldp-${color}-ball)`, body = `url(#ldp-${color}-body)`, v = `url(#ldp-${color}-v)`, t = TONES[color];
  if (set === "sentry") {
    /* A Rajput-style palace guard: turban and angarkha in the player's colour, gold sash and shield, a spear.
       Drawn tall (viewBox 52 x 60) with a bold silhouette so the colour still reads on small phones. */
    return <svg className="ld-piece" viewBox="2 -0.5 36 59" aria-hidden="true" focusable="false">
      <ellipse cx="20" cy="57.6" rx="12" ry="2.4" fill="rgba(0,0,0,.3)" />
      <ellipse cx="20" cy="55" rx="12" ry="3.6" fill="#a87a24" /><ellipse cx="20" cy="54" rx="11" ry="2.7" fill="url(#ldp-gold-h)" />
      <line x1="32" y1="4" x2="32" y2="54" stroke="#6e4518" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M32 0.4 L34.3 6.2 L29.7 6.2 Z" fill="#dfe3ea" stroke="#8e96a3" strokeWidth=".4" />
      <rect x="15.4" y="40.5" width="4.2" height="13" rx="1.6" fill="#f6eedb" /><rect x="20.4" y="40.5" width="4.2" height="13" rx="1.6" fill="#f6eedb" />
      <rect x="15" y="52" width="4.8" height="2.2" rx="1.1" fill="#5a3412" /><rect x="20.2" y="52" width="4.8" height="2.2" rx="1.1" fill="#5a3412" />
      <rect x="27.4" y="23" width="4" height="13.5" rx="2" fill={t.lo} /><circle cx="31.4" cy="36" r="2.1" fill="#d6a379" />
      <path d="M12.4 21.6 L27.6 21.6 L31 43.6 L9 43.6 Z" fill={body} stroke={t.lo} strokeWidth=".6" strokeLinejoin="round" />
      <path d="M12.6 23 L27.4 33.4 L27.6 36.4 L12.6 26 Z" fill="url(#ldp-gold)" />
      <rect x="9" y="41.8" width="22" height="2" rx=".6" fill="url(#ldp-gold-h)" />
      <circle cx="9.6" cy="31.4" r="5.6" fill="url(#ldp-gold)" stroke="#7a5214" strokeWidth=".7" />
      <circle cx="9.6" cy="31.4" r="3.4" fill={t.base} stroke="#7a5214" strokeWidth=".5" /><circle cx="9.6" cy="31.4" r="1.2" fill="#f6dc8e" />
      <circle cx="20" cy="17.4" r="4.1" fill="#d6a379" />
      <path d="M17.6 19.3 q2.4 1.3 4.8 0" stroke="#3b2414" strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="20" cy="12.4" rx="7" ry="5" fill={ball} stroke={t.lo} strokeWidth=".6" />
      <path d="M13.6 12 Q20 8.2 26.4 12" stroke={t.hi} strokeWidth="1.2" fill="none" opacity=".8" />
      <path d="M13.8 14.4 Q20 10.8 26.2 14.4" stroke={t.lo} strokeWidth="1" fill="none" />
      <circle cx="20" cy="8.6" r="1.6" fill="url(#ldp-gold)" />
      <path d="M20 7.6 q-1.2 -5.4 2.8 -7.4 q-.6 3.8 -2.1 7.4 z" fill="#fff6dc" stroke="#d9b45a" strokeWidth=".3" />
    </svg>;
  }
  let art;
  switch (set) {
    case "pawn":
      art = <>{shadow}
        <ellipse cx="20" cy="31.5" rx="12" ry="4.2" fill="url(#ldp-gold)" />
        <ellipse cx="20" cy="30" rx="10.5" ry="3" fill="url(#ldp-gold-h)" />
        <path d="M11.5 30 C12.6 24.4 15.6 21.6 16.6 18.2 L23.4 18.2 C24.4 21.6 27.4 24.4 28.5 30 Z" fill={body} />
        <ellipse cx="20" cy="18.4" rx="6.6" ry="2.3" fill="url(#ldp-gold-h)" />
        <circle cx="20" cy="11.2" r="6.6" fill={ball} />
        <ellipse cx="17.6" cy="8.6" rx="2.3" ry="1.5" fill="#fff" opacity=".7" />
      </>; break;
    case "crown":
      art = <>{shadow}
        <path d="M8.5 30.5 L7.5 14.5 L14.2 21 L20 9.5 L25.8 21 L32.5 14.5 L31.5 30.5 Z" fill={body} stroke={t.lo} strokeWidth=".8" strokeLinejoin="round" />
        <rect x="8" y="27" width="24" height="6" rx="1.6" fill="url(#ldp-gold)" />
        <circle cx="7.5" cy="13.6" r="2.4" fill="url(#ldp-gold)" /><circle cx="20" cy="8.4" r="2.6" fill="url(#ldp-gold)" /><circle cx="32.5" cy="13.6" r="2.4" fill="url(#ldp-gold)" />
        <path d="M20 19.2 L22.6 22.4 L20 25.6 L17.4 22.4 Z" fill="url(#ldp-pearl)" />
        <circle cx="13" cy="30" r="1.1" fill={t.hi} /><circle cx="20" cy="30" r="1.3" fill={t.base} stroke="#fff" strokeWidth=".4" /><circle cx="27" cy="30" r="1.1" fill={t.hi} />
      </>; break;
    case "gem":
      art = <>{shadow}
        <polygon points="20,4 33,11.5 33,27.5 20,35 7,27.5 7,11.5" fill={t.lo} stroke="url(#ldp-gold)" strokeWidth="1.6" strokeLinejoin="round" />
        <polygon points="20,4 33,11.5 26.5,15.4 20,11.6" fill={t.hi} />
        <polygon points="20,4 20,11.6 13.5,15.4 7,11.5" fill={t.base} />
        <polygon points="33,11.5 33,27.5 26.5,23.6 26.5,15.4" fill={t.base} />
        <polygon points="7,11.5 13.5,15.4 13.5,23.6 7,27.5" fill={t.hi} opacity=".85" />
        <polygon points="20,11.6 26.5,15.4 26.5,23.6 20,27.4 13.5,23.6 13.5,15.4" fill={v} />
        <polygon points="16.5,14.2 20,12.4 22,13.6 18.2,16" fill="#fff" opacity=".65" />
      </>; break;
    case "lotus":
      art = <>{shadow}
        <ellipse cx="20" cy="30.5" rx="12.5" ry="3.6" fill="#1d6b45" stroke="url(#ldp-gold)" strokeWidth=".8" />
        {[-58, -30, 30, 58].map(a => <ellipse key={a} cx="20" cy="17" rx="4.8" ry="11" transform={`rotate(${a} 20 28)`} fill={v} stroke={t.lo} strokeWidth=".6" />)}
        <ellipse cx="20" cy="16.5" rx="5.6" ry="12" fill={body} stroke={t.lo} strokeWidth=".6" />
        <path d="M20 7.5 C18.6 12 18.6 19 20 25" stroke={t.hi} strokeWidth="1" fill="none" opacity=".8" />
        <circle cx="20" cy="26.4" r="3" fill="url(#ldp-gold)" />
      </>; break;
    case "chakra":
      art = <>{shadow}
        <circle cx="20" cy="19.5" r="14.2" fill={ball} stroke="url(#ldp-gold)" strokeWidth="2.2" />
        <circle cx="20" cy="19.5" r="10" fill="none" stroke="url(#ldp-gold)" strokeWidth="1.1" />
        {Array.from({ length: 8 }, (_, i) => <line key={i} x1="20" y1="19.5" x2={20 + Math.cos(i * Math.PI / 4) * 10} y2={19.5 + Math.sin(i * Math.PI / 4) * 10} stroke="url(#ldp-gold)" strokeWidth="1.3" />)}
        <circle cx="20" cy="19.5" r="3.4" fill="url(#ldp-gold)" />
        <ellipse cx="14.5" cy="12.5" rx="3" ry="1.6" fill="#fff" opacity=".45" transform="rotate(-30 14.5 12.5)" />
      </>; break;
    default:
      art = <>{shadow}
        <circle cx="20" cy="19" r="15" fill="url(#ldp-gold)" />
        <circle cx="20" cy="19" r="13.4" fill={ball} />
        <circle cx="20" cy="19" r="7.4" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2.2" />
      </>;
  }
  return <svg className="ld-piece" viewBox="0 0 40 40" aria-hidden="true" focusable="false">{art}</svg>;
}

/** A die face with nine pip slots (same drawing as the Snakes & Ladders die). */
const PIPS: Record<number, number[]> = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const Face = ({ v }: { v: number }) => <>{Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[v]?.includes(i) ? "on" : ""} />)}</>;
export const setPips = (face: Element | null, v: number) => { if (face) Array.from(face.children).forEach((p, i) => p.classList.toggle("on", (PIPS[v] ?? []).includes(i))); };
