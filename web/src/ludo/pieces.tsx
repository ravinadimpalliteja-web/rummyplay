/* Royal Club Ludo: token sets and dice finishes. Purely visual; chosen per device and remembered. */
import type { Color } from "./engine";
import { SHOP } from "../economy/rules";

export const TOKEN_SETS = [
  { id: "ambaro", name: "Ambaro elephants", note: "The Ambaro elephant, carrying its golden ambari" },
  { id: "sentry", name: "Indian sentries", note: "Palace guards in turbans, with spear and shield" },
  { id: "horse", name: "Royal horses", note: "White Marwari horses in coloured caparisons" },
  { id: "tiger", name: "Toy tigers", note: "Lacquered Channapatna-style tigers" },
  { id: "peacock", name: "Peacocks", note: "Peacocks with their fans open" },
  { id: "chariot", name: "Chariots", note: "Temple chariots with gold wheels" },
] as const;
export type TokenSet = typeof TOKEN_SETS[number]["id"];

/* Token sets unlock with room wins against real players: finishing 1st in a room game where at least one other
   real, signed-in player was seated. The room server records these wins on the player's account. The Ambaro
   elephants (the default) and the sentries are free. */
export const UNLOCK: Record<TokenSet, number> = { ambaro: 0, sentry: 0, horse: 1, tiger: 5, peacock: 10, chariot: 15 };
/* Or bought with coins (src/economy/rules.ts SHOP, ids "ludo-<set>"). */
export const shopId = (set: TokenSet) => `ludo-${set}`;
export const tokenPrice = (set: TokenSet) => SHOP.find(x => x.id === shopId(set))?.price ?? 0;
export const isUnlocked = (set: TokenSet, wins: number, owned: readonly string[] = []) => wins >= UNLOCK[set] || owned.includes(shopId(set));
export const unlockText = (set: TokenSet, wins: number, signedIn: boolean) => {
  const n = UNLOCK[set], what = `${n} room win${n > 1 ? "s" : ""} against real players`;
  return signedIn ? `Unlocks after ${what} (${Math.min(wins, n)} of ${n}), or buy with coins` : `Unlocks after ${what} (sign in), or buy with coins`;
};

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
      <linearGradient id="ldp-coat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffaf0" /><stop offset=".6" stopColor="#efe4cf" /><stop offset="1" stopColor="#cdbd9c" /></linearGradient>
      <linearGradient id="ldp-hide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8a29c" /><stop offset=".6" stopColor="#8b847e" /><stop offset="1" stopColor="#625c57" /></linearGradient>
      <linearGradient id="ldp-jade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fd096" /><stop offset=".5" stopColor="#1f9464" /><stop offset="1" stopColor="#0c5537" /></linearGradient>
      <linearGradient id="ldp-jade-d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1c8a5b" /><stop offset="1" stopColor="#0a4630" /></linearGradient>
      <radialGradient id="ldp-pearl" cx=".38" cy=".32" r=".7"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#efe6d2" /><stop offset="1" stopColor="#b9a87e" /></radialGradient>
      {COLS.map(c => <g key={c}>
        <radialGradient id={`ldp-${c}-ball`} cx=".36" cy=".3" r=".75"><stop offset="0" stopColor={TONES[c].hi} /><stop offset=".45" stopColor={TONES[c].base} /><stop offset="1" stopColor={TONES[c].lo} /></radialGradient>
        <linearGradient id={`ldp-${c}-body`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={TONES[c].lo} /><stop offset=".32" stopColor={TONES[c].base} /><stop offset=".52" stopColor={TONES[c].hi} /><stop offset=".72" stopColor={TONES[c].base} /><stop offset="1" stopColor={TONES[c].lo} /></linearGradient>
        <linearGradient id={`ldp-${c}-v`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={TONES[c].hi} /><stop offset=".5" stopColor={TONES[c].base} /><stop offset="1" stopColor={TONES[c].lo} /></linearGradient>
      </g>)}
    </defs>
  </svg>;
}

/** One token drawn in the chosen set, in the player's colour. Animals face right (towards the token they attack).
    Each piece's art sits in a group (.ld-art) so the capture animations can move parts of it. */
export function Piece({ set, color }: { set: TokenSet; color: Color }) {
  const ball = `url(#ldp-${color}-ball)`, body = `url(#ldp-${color}-body)`, v = `url(#ldp-${color}-v)`, t = TONES[color];
  const gold = "url(#ldp-gold)", goldH = "url(#ldp-gold-h)";
  if (set === "sentry") {
    /* A Rajput-style palace guard: turban and angarkha in the player's colour, gold sash and shield, a spear.
       Drawn tall (viewBox 52 x 60) with a bold silhouette so the colour still reads on small phones. */
    return <svg className="ld-piece" viewBox="2 -0.5 36 59" aria-hidden="true" focusable="false">
      <ellipse cx="20" cy="57.6" rx="12" ry="2.4" fill="rgba(0,0,0,.3)" />
      <ellipse cx="20" cy="55" rx="12" ry="3.6" fill="#a87a24" /><ellipse cx="20" cy="54" rx="11" ry="2.7" fill={goldH} />
      <g className="ld-spear">
        <line x1="32" y1="4" x2="32" y2="54" stroke="#6e4518" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M32 0.4 L34.3 6.2 L29.7 6.2 Z" fill="#dfe3ea" stroke="#8e96a3" strokeWidth=".4" />
      </g>
      <rect x="15.4" y="40.5" width="4.2" height="13" rx="1.6" fill="#f6eedb" /><rect x="20.4" y="40.5" width="4.2" height="13" rx="1.6" fill="#f6eedb" />
      <rect x="15" y="52" width="4.8" height="2.2" rx="1.1" fill="#5a3412" /><rect x="20.2" y="52" width="4.8" height="2.2" rx="1.1" fill="#5a3412" />
      <rect x="27.4" y="23" width="4" height="13.5" rx="2" fill={t.lo} /><circle cx="31.4" cy="36" r="2.1" fill="#d6a379" />
      <path d="M12.4 21.6 L27.6 21.6 L31 43.6 L9 43.6 Z" fill={body} stroke={t.lo} strokeWidth=".6" strokeLinejoin="round" />
      <path d="M12.6 23 L27.4 33.4 L27.6 36.4 L12.6 26 Z" fill={gold} />
      <rect x="9" y="41.8" width="22" height="2" rx=".6" fill={goldH} />
      <circle cx="9.6" cy="31.4" r="5.6" fill={gold} stroke="#7a5214" strokeWidth=".7" />
      <circle cx="9.6" cy="31.4" r="3.4" fill={t.base} stroke="#7a5214" strokeWidth=".5" /><circle cx="9.6" cy="31.4" r="1.2" fill="#f6dc8e" />
      <circle cx="20" cy="17.4" r="4.1" fill="#d6a379" />
      <path d="M17.6 19.3 q2.4 1.3 4.8 0" stroke="#3b2414" strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="20" cy="12.4" rx="7" ry="5" fill={ball} stroke={t.lo} strokeWidth=".6" />
      <path d="M13.6 12 Q20 8.2 26.4 12" stroke={t.hi} strokeWidth="1.2" fill="none" opacity=".8" />
      <path d="M13.8 14.4 Q20 10.8 26.2 14.4" stroke={t.lo} strokeWidth="1" fill="none" />
      <circle cx="20" cy="8.6" r="1.6" fill={gold} />
      <path d="M20 7.6 q-1.2 -5.4 2.8 -7.4 q-.6 3.8 -2.1 7.4 z" fill="#fff6dc" stroke="#d9b45a" strokeWidth=".3" />
    </svg>;
  }
  let art;
  switch (set) {
    case "horse":
      /* A white Marwari horse (curled ears) in a caparison of the player's colour with a gold border and plume. */
      art = <>
        <path d="M10 20 C5 22 3.6 29 5.2 36 C6.4 31 7.6 27 10.8 24 Z" fill="#e6dac2" stroke="#b9a882" strokeWidth=".5" />
        <rect x="11.2" y="28" width="3.2" height="15" rx="1.4" fill="url(#ldp-coat)" /><rect x="15.6" y="28" width="3.2" height="15" rx="1.4" fill="#e8dcc4" />
        <rect x="27.4" y="28" width="3.2" height="15" rx="1.4" fill="#e8dcc4" /><rect x="31.6" y="27" width="3.2" height="16" rx="1.4" fill="url(#ldp-coat)" />
        {[11, 15.4, 27.2, 31.4].map(x => <rect key={x} x={x - .1} y="41.6" width="3.6" height="2.4" rx=".8" fill="#4a3a2a" />)}
        <ellipse cx="21.5" cy="24" rx="12.6" ry="7.4" fill="url(#ldp-coat)" stroke="#b9a882" strokeWidth=".5" />
        <path d="M28 21 C30 15 31.6 10.4 34 7.6 L38.4 10.6 C36.2 14 34.6 19.6 34.4 26 Z" fill="url(#ldp-coat)" stroke="#b9a882" strokeWidth=".5" />
        <path d="M33.4 6.6 C37.6 6.4 42.8 10 44.4 13.6 C44.8 15 43.6 16 42 15.4 C39.6 14.6 36.6 13.2 34.2 11.6 Z" fill="url(#ldp-coat)" stroke="#b9a882" strokeWidth=".5" />
        <path d="M33.6 7.2 C33 4.4 33.8 2.6 35.4 2 C35.2 3.8 35.6 5.4 36 6.6 Z" fill="#e8dcc4" stroke="#b9a882" strokeWidth=".4" />
        <path d="M30.4 9.4 C29 14 28.6 18 28.8 21.6" stroke="#8a7458" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="37.6" cy="9.6" r=".8" fill="#2b2118" /><circle cx="43" cy="14" r=".5" fill="#6b5a46" />
        <path d="M35.2 3.2 C34 0.8 35.6 -.6 37.4 .4 C36.4 1.4 36.4 2.4 36.6 3.6 Z" fill={v} />
        <path d="M34 8 L39.4 11.6 M38.6 7.4 L36 12.2" stroke={gold} strokeWidth="1" />
        <path d="M9.6 17.8 C15 15.6 25 15.6 30.8 17.8 L32 30 L29.6 32.4 L27.2 30.4 L24.8 32.6 L22.4 30.4 L20 32.6 L17.6 30.4 L15.2 32.6 L12.8 30.4 L10.4 32.4 L8.6 30 Z" fill={body} stroke={t.lo} strokeWidth=".6" strokeLinejoin="round" />
        <path d="M9.2 28.4 L31.8 28.4" stroke={goldH} strokeWidth="1.6" />
        <circle cx="20.4" cy="23" r="2.6" fill={gold} stroke="#7a5214" strokeWidth=".5" /><circle cx="20.4" cy="23" r="1.1" fill={t.hi} />
        <path d="M28.4 21.4 C30 23 31.6 24.6 34 25" stroke={goldH} strokeWidth="1.4" fill="none" />
      </>; break;
    case "ambaro":
      /* The Ambaro elephant from the logo: a faceted ivory elephant with gold anklets and headdress, trunk raised,
         a ruby-red jhool with a gold lotus with a gold medallion, and a golden ambari whose canopy is in the
         player's colour. */
      art = <>
        <path d="M6.4 23.4 C4.4 25.6 3.8 29 4.6 32.2" stroke="#b69a72" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M4.6 32.2 l-1 2.4 l2.2 -.8 Z" fill={gold} />
        {[8.8, 14.4, 25.6, 31.2].map((x, i) => <g key={x}>
          <path d={`M${x} 29 h5.4 l-.3 13.6 h-4.8 Z`} fill="url(#ldp-coat)" stroke="#b69a72" strokeWidth=".4" />
          <rect x={x - .3} y="38.4" width="6" height="1.8" rx=".5" fill={goldH} /><rect x={x - .2} y="41.6" width="5.8" height="1.4" rx=".5" fill={gold} />
        </g>)}
        <path d="M6.4 22 C7.4 15.8 13 13.6 20.4 13.6 C28.6 13.6 34.4 16.4 35.2 23.4 C35.8 30.6 30 35.4 20.6 35.4 C11.4 35.4 5.6 30.4 6.4 22 Z" fill="url(#ldp-coat)" stroke="#b69a72" strokeWidth=".5" />
        <path d="M9 30.6 L16 24 L22 33.8 Z M24 33.6 L30 25.4 L33.4 30.2 Z" fill="#e7d8bd" opacity=".55" />
        <path d="M31.4 13.8 C35 11.6 40.6 12.6 41.8 17.4 C42.6 20.8 41.2 24.6 38.8 26 C36 27.6 32 26 30.4 22.6 Z" fill="url(#ldp-coat)" stroke="#b69a72" strokeWidth=".5" />
        <path className="ld-trunk" d="M40.4 24.6 C43.4 23.8 45.6 20.6 45.2 16.4 C45 14.2 46.4 12.8 47.8 13.6" stroke="#f1e3cc" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M40.4 24.6 C43.4 23.8 45.6 20.6 45.2 16.4" stroke="#b69a72" strokeWidth=".5" fill="none" opacity=".6" />
        <path d="M38.2 25.6 C40.4 27.6 43.4 28 45.8 26.8" stroke="#fffaf0" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        <g transform="translate(43 7) rotate(-12)"><path d="M0 1 L5 -1 L10 2 L5 5 Z" fill="#ffe58a" stroke="#9a6517" strokeWidth=".45"/><path d="M0 1 L5 5 L5 11 L0 7 Z" fill="#d99516" stroke="#9a6517" strokeWidth=".45"/><path d="M5 5 L10 2 L10 8 L5 11 Z" fill="#f5b92d" stroke="#9a6517" strokeWidth=".45"/><circle cx="2.4" cy="3.5" r=".55" fill="#38210a"/><circle cx="7.5" cy="4.2" r=".55" fill="#38210a"/><circle cx="7.5" cy="8.3" r=".55" fill="#38210a"/></g>
        <path d="M27.6 15.4 L34.8 14.4 L35.6 25 L30.6 28.6 L27 22.4 Z" fill="url(#ldp-coat)" stroke={gold} strokeWidth=".8" strokeLinejoin="round" />
        <path d="M28.8 18 L33.6 17.2 L32.6 23.4 Z" fill="#fff7e9" opacity=".7" />
        <circle cx="38.6" cy="18.8" r=".85" fill="#1a120a" /><path d="M37.4 17.4 q1.3 -.7 2.6 0" stroke="#b69a72" strokeWidth=".5" fill="none" />
        <path d="M33.4 12.8 C36 10.6 40.4 10.8 42.6 13.6 L41.2 16.6 C39.4 15.2 36.4 14.8 34.2 15.8 Z" fill={gold} stroke="#7a5214" strokeWidth=".4" />
        <path d="M38.4 11.6 l1.4 1.6 l-1.4 1.6 l-1.4 -1.6 Z" fill="#159b67" stroke="#7a5214" strokeWidth=".3" />
        <path d="M5.8 16 C2.2 14.8 1.8 20.8 5.8 25.8 L9.4 28.4 L11.2 19 Z" fill="url(#ldp-coat)" stroke="#b69a72" strokeWidth=".5" />
        <path d="M8 16.8 C14 14.6 25 14.6 29.8 16.6 L30.4 32 L28.2 34.2 L26 32.2 L23.8 34.4 L21.6 32.2 L19.4 34.4 L17.2 32.2 L15 34.4 L12.8 32.2 L10.6 34.4 L8.4 32.2 L6.8 30 Z" fill="url(#ldp-red-v)" stroke={gold} strokeWidth=".9" strokeLinejoin="round" />
        <path d="M7.2 29.6 L30.4 29.6" stroke={goldH} strokeWidth="1.3" />
        <circle cx="18.6" cy="23" r="4.4" fill={gold} stroke="#7a5214" strokeWidth=".5" />
        <circle cx="18.6" cy="23" r="3.2" fill="#8f1520" />
        <path d="M18.6 20.2 C16.2 21.6 16.1 23.1 18.6 25.6 C21.1 23.1 21 21.6 18.6 20.2 Z M18.6 21.2 C16.6 20.1 15.8 21.2 16.2 22.7 M18.6 21.2 C20.6 20.1 21.4 21.2 21 22.7" fill="#f5c94f" stroke="#fff0b2" strokeWidth=".35" />
        <rect x="9.6" y="12.2" width="18.6" height="3.4" rx=".6" fill={goldH} stroke="#7a5214" strokeWidth=".4" />
        <path d="M11 12.2 V5.6 M15.6 12.2 V5.6 M22.4 12.2 V5.6 M27 12.2 V5.6" stroke={gold} strokeWidth="1.1" />
        <path d="M9.4 6.2 C10.6 0.4 15 -1.8 18.9 -1.8 C22.8 -1.8 27.2 0.4 28.4 6.2 Z" fill="url(#ldp-red-v)" stroke={gold} strokeWidth=".8" />
        <path d="M13.6 5.8 C14.2 2 16.4 -.6 18.9 -1.2 M24.2 5.8 C23.6 2 21.4 -.6 18.9 -1.2" stroke={goldH} strokeWidth=".7" fill="none" />
        <path d="M9 6 h19.8" stroke={goldH} strokeWidth="1.4" />
        <path d="M18.9 -1.8 V-3.6" stroke={gold} strokeWidth="1" /><circle cx="18.9" cy="-3.6" r="1.1" fill={gold} />
        {[9.6, 28.2].map(x => <g key={x}><path d={`M${x} 6 V3.2`} stroke={gold} strokeWidth=".8" /><circle cx={x} cy="2.6" r=".9" fill={gold} /></g>)}
        <path d="M17.6 13.6 l1.3 -1.4 l1.3 1.4 l-1.3 1.4 Z" fill="#159b67" stroke="#7a5214" strokeWidth=".3" />
      </>; break;
    case "tiger":
      /* A lacquered Channapatna-style toy tiger painted in the player's colour, with dark stripes and a gold collar. */
      art = <>
        <path className="ld-tail" d="M8.4 26 C4 24.4 2.6 19 5 14.4" stroke={t.base} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <path d="M4.4 17.6 l2.2 .6 M4.8 15 l2 .4" stroke={t.lo} strokeWidth="1.1" strokeLinecap="round" />
        {[9.6, 14.6, 26.4, 31.4].map(x => <g key={x}><rect x={x} y="30" width="4.2" height="12.4" rx="2" fill={t.base} />
          <ellipse cx={x + 2.4} cy="42.6" rx="3" ry="1.6" fill="#fff6e6" /></g>)}
        <ellipse cx="21" cy="28" rx="14" ry="8" fill={ball} />
        <ellipse cx="21.4" cy="33.4" rx="10.6" ry="2.6" fill="#fff6e6" opacity=".9" />
        {[12, 16.6, 21.2, 25.8].map(x => <path key={x} d={`M${x} 20.6 C${x + 1.6} 24 ${x + .4} 27.4 ${x + 1.8} 30.4`} stroke={t.lo} strokeWidth="1.6" fill="none" strokeLinecap="round" />)}
        <circle cx="31.4" cy="16" r="2.4" fill={t.base} /><circle cx="31.4" cy="16" r="1.2" fill={t.lo} />
        <circle cx="38.6" cy="16" r="2.4" fill={t.base} /><circle cx="38.6" cy="16" r="1.2" fill={t.lo} />
        <circle cx="35" cy="22" r="7.6" fill={ball} />
        <path d="M33 15.4 l.8 2.8 M35 15 v3 M37 15.4 l-.8 2.8" stroke={t.lo} strokeWidth="1.1" strokeLinecap="round" />
        <ellipse cx="37.6" cy="25.4" rx="4" ry="2.9" fill="#fff6e6" />
        <path d="M37 23.6 h2.2 l-1.1 1.4 Z" fill="#2b1a12" />
        <circle cx="33.2" cy="20.6" r="1.1" fill="#fff6e6" /><circle cx="33.4" cy="20.6" r=".6" fill="#1a120c" />
        <circle cx="38.8" cy="20.6" r="1.1" fill="#fff6e6" /><circle cx="39" cy="20.6" r=".6" fill="#1a120c" />
        <path d="M40.6 25.4 l3.4 -.6 M40.6 26.4 l3.4 .6" stroke="#5a3a20" strokeWidth=".4" />
        <path d="M28.2 26.8 C29.6 28.6 31.6 29.4 33.6 29.2" stroke={goldH} strokeWidth="1.6" fill="none" />
        <circle cx="31.4" cy="29.4" r="1" fill={gold} />
      </>; break;
    case "peacock":
      /* A peacock with its fan open behind it: fan and body in the player's colour, gold-ringed eyes. */
      art = <>
        <path d="M18 36 L1.6 26 A17 17 0 0 1 6 9 A17 17 0 0 1 22.6 2.6 Z" fill={body} stroke={t.lo} strokeWidth=".6" strokeLinejoin="round" />
        {Array.from({ length: 7 }, (_, i) => { const a = (205 + i * 21) * Math.PI / 180; return <line key={i} x1="18" y1="36" x2={18 + Math.cos(a) * 16.4} y2={36 + Math.sin(a) * 16.4} stroke={t.hi} strokeWidth=".6" opacity=".7" />; })}
        {Array.from({ length: 6 }, (_, i) => { const a = (213 + i * 23) * Math.PI / 180, x = 18 + Math.cos(a) * 12.6, y = 36 + Math.sin(a) * 12.6;
          return <g key={i}><ellipse cx={x} cy={y} rx="2.5" ry="3" fill={gold} /><ellipse cx={x} cy={y} rx="1.5" ry="1.9" fill={t.lo} /><circle cx={x} cy={y - .3} r=".6" fill={t.hi} /></g>; })}
        <path d="M21.4 36.6 L20.4 44 M25.4 36.6 L26.6 44" stroke="#8a6a3a" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M18.6 44 h3.4 M25 44 h3.4" stroke="#8a6a3a" strokeWidth="1" strokeLinecap="round" />
        <ellipse cx="23.6" cy="30.4" rx="6.6" ry="7.6" fill={ball} />
        <path d="M25.6 25 C26.6 20 27.6 15.4 29.8 12.6 L32.4 13.6 C30.4 17 29.6 21.6 29.4 27 Z" fill={ball} />
        <circle cx="31" cy="11.6" r="3.4" fill={ball} />
        <path d="M30.2 8.4 L29.2 4.4 M31.2 8.2 L31.4 4 M32.2 8.6 L33.6 4.8" stroke={t.lo} strokeWidth=".6" />
        <circle cx="29.2" cy="4.2" r=".9" fill={gold} /><circle cx="31.4" cy="3.8" r=".9" fill={gold} /><circle cx="33.6" cy="4.6" r=".9" fill={gold} />
        <path d="M33.8 11.2 L37.6 12.4 L33.8 13.2 Z" fill={gold} />
        <ellipse cx="31.8" cy="11" rx="1.2" ry=".8" fill="#fff" /><circle cx="32" cy="11" r=".5" fill="#1a120c" />
        <path d="M18.6 28 C21.4 26 25.4 26.2 27.6 28.6" stroke={gold} strokeWidth=".9" fill="none" />
      </>; break;
    default:
      /* A temple chariot (ratha): the body and canopy in the player's colour, a gold wheel that spins as it rolls. */
      art = <>
        <path d="M33.6 30 L46 27.4" stroke="#6e4518" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M45 25.4 v4" stroke="#6e4518" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M11.4 23.6 V10 M28.4 23.6 V10" stroke={gold} strokeWidth="1.3" />
        <path d="M8.4 10.6 C9.4 4.6 15 1.2 19.9 1.2 C24.8 1.2 30.4 4.6 31.4 10.6 Z" fill={v} stroke={gold} strokeWidth=".8" />
        <path d="M8.4 10.6 h23" stroke={goldH} strokeWidth="1.4" />
        <path d="M19.9 1.2 V-3" stroke="#6e4518" strokeWidth=".8" /><path d="M20 -3 l4.6 1.4 l-4.6 1.4 Z" fill={t.hi} stroke={t.lo} strokeWidth=".3" />
        <path d="M6.6 23 H34.4 L37.4 29.2 C39.6 27.8 41 25.4 41 22.6 L42.6 22.6 C42.6 27.6 39.4 31.4 35 32 L8.4 32 Z" fill={body} stroke={t.lo} strokeWidth=".6" strokeLinejoin="round" />
        <path d="M7.2 25.6 H35.6" stroke={goldH} strokeWidth="1.4" />
        <path d="M12 28.4 h3 M18 28.4 h3 M24 28.4 h3" stroke={gold} strokeWidth="1.2" strokeLinecap="round" />
        <g className="ld-wheel">
          <circle cx="18" cy="35" r="8.6" fill="none" stroke={gold} strokeWidth="2.2" />
          <circle cx="18" cy="35" r="8.6" fill="none" stroke="#7a5214" strokeWidth=".5" />
          {Array.from({ length: 8 }, (_, i) => <line key={i} x1="18" y1="35" x2={18 + Math.cos(i * Math.PI / 4) * 7.6} y2={35 + Math.sin(i * Math.PI / 4) * 7.6} stroke={gold} strokeWidth="1.1" />)}
          <circle cx="18" cy="35" r="2" fill={gold} stroke="#7a5214" strokeWidth=".5" />
        </g>
      </>;
  }
  return <svg className="ld-piece" viewBox="0 -3 48 50" aria-hidden="true" focusable="false">
    <ellipse cx="22" cy="44.6" rx="16" ry="2.2" fill="rgba(0,0,0,.3)" />
    <g className="ld-art">{art}</g>
  </svg>;
}

/** A die face with nine pip slots (same drawing as the Snakes & Ladders die). */
const PIPS: Record<number, number[]> = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const Face = ({ v }: { v: number }) => <>{Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[v]?.includes(i) ? "on" : ""} />)}</>;
export const setPips = (face: Element | null, v: number) => { if (face) Array.from(face.children).forEach((p, i) => p.classList.toggle("on", (PIPS[v] ?? []).includes(i))); };
