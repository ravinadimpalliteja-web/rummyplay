/* Royal Club Snakes & Ladders player tokens: three collections, twelve original designs drawn as SVG in code
   (no image files, no third-party art). The same picture is used on the selection screen and on the board.
   server/snakes.js keeps the same list of ids (a server test checks they match). */

export type CollectionId = "traditional" | "explorers" | "animals";
export type PieceId =
  | "pawn-gold" | "pawn-green" | "pawn-red" | "pawn-blue"
  | "young-explorer" | "jungle-adventurer" | "mountain-adventurer" | "outdoor-explorer"
  | "lion" | "panda" | "elephant" | "rabbit";
export type Piece = { id: PieceId; name: string; collection: CollectionId; accent: string };

export const COLLECTIONS: { id: CollectionId; name: string; blurb: string }[] = [
  { id: "traditional", name: "Traditional", blurb: "Classic glossy pawns" },
  { id: "explorers", name: "Explorers & Adventurers", blurb: "Ready for the trail" },
  { id: "animals", name: "Animals", blurb: "Friendly faces" },
];
export const PIECES: Piece[] = [
  { id: "pawn-gold", name: "Gold Pawn", collection: "traditional", accent: "#e3b23c" },
  { id: "pawn-green", name: "Green Pawn", collection: "traditional", accent: "#2fbf6c" },
  { id: "pawn-red", name: "Red Pawn", collection: "traditional", accent: "#e8434f" },
  { id: "pawn-blue", name: "Blue Pawn", collection: "traditional", accent: "#3d7be8" },
  { id: "young-explorer", name: "Young Explorer", collection: "explorers", accent: "#d4a85a" },
  { id: "jungle-adventurer", name: "Jungle Adventurer", collection: "explorers", accent: "#1f9e8f" },
  { id: "mountain-adventurer", name: "Mountain Adventurer", collection: "explorers", accent: "#3a6fc4" },
  { id: "outdoor-explorer", name: "Outdoor Explorer", collection: "explorers", accent: "#e0a526" },
  { id: "lion", name: "Lion", collection: "animals", accent: "#e8a33a" },
  { id: "panda", name: "Panda", collection: "animals", accent: "#2b2f36" },
  { id: "elephant", name: "Elephant", collection: "animals", accent: "#8d9bb0" },
  { id: "rabbit", name: "Rabbit", collection: "animals", accent: "#f2a7bd" },
];
export const PIECE_IDS = PIECES.map((p) => p.id);
export const pieceById = (id: string | null | undefined): Piece => PIECES.find((p) => p.id === id) ?? PIECES[0];
/** Each seat's starting token, so a match always has four different pieces even if nobody picks. */
export const DEFAULT_PIECES: PieceId[] = ["pawn-gold", "pawn-green", "pawn-red", "pawn-blue"];

/* ---------- drawing helpers ---------- */
type Stops = [number, string][];
const stops = (s: Stops) => s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
const rg = (id: string, s: Stops, cx = .35, cy = .3, r = .75) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
const lg = (id: string, s: Stops, horizontal = false) => `<linearGradient id="${id}" x1="0" y1="0" x2="${horizontal ? 1 : 0}" y2="${horizontal ? 0 : 1}">${stops(s)}</linearGradient>`;
const svg = (defs: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><defs>${defs}</defs>${body}</svg>`;
const OUT = `stroke="#2a1a0e" stroke-width="1.2" stroke-linejoin="round"`;

/** The polished stand that characters and animals stand on: dark lacquer with a gold rim. */
const stand = () => ({
  defs: lg("st", [[0, "#5a3d20"], [1, "#1d1209"]]) + lg("str", [[0, "#fbe7a6"], [.5, "#d9ad54"], [1, "#8f6620"]]),
  body: `<ellipse cx="50" cy="111" rx="31" ry="6.5" fill="#000" opacity=".28"/>
    <ellipse cx="50" cy="107" rx="30" ry="8.5" fill="url(#str)"/>
    <ellipse cx="50" cy="105.5" rx="27.5" ry="7" fill="url(#st)"/>
    <ellipse cx="44" cy="103.5" rx="12" ry="2" fill="#fff" opacity=".12"/>`,
});
const eyes = (y = 41, dx = 8, c = "#2a1a12") => [50 - dx, 50 + dx].map((x) =>
  `<ellipse cx="${x}" cy="${y}" rx="3.1" ry="3.9" fill="${c}"/><circle cx="${x + 1.1}" cy="${y - 1.5}" r="1.2" fill="#fff"/><circle cx="${x - .9}" cy="${y + 1.3}" r=".55" fill="#fff" opacity=".7"/>`).join("");
const cheeks = (y = 48, dx = 13) => [50 - dx, 50 + dx].map((x) => `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.1" fill="#ff7f7f" opacity=".42"/>`).join("");
const smile = (y = 49) => `<path d="M45 ${y} Q50 ${y + 4.5} 55 ${y}" fill="none" stroke="#6b2a1a" stroke-width="1.8" stroke-linecap="round"/>`;
const shine = (x: number, y: number, rx: number, ry: number, o = .55, rot = -25) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${o}" transform="rotate(${rot} ${x} ${y})"/>`;

/* ---------- traditional pawns ---------- */
function pawn(c: [string, string, string, string]) {
  const [hi, mid, lo, deep] = c;
  const defs = rg("ph", [[0, hi], [.45, mid], [1, deep]], .36, .3, .8) +
    lg("pb", [[0, deep], [.22, lo], [.42, mid], [.55, hi], [.7, mid], [1, deep]], true) +
    lg("pd", [[0, lo], [1, deep]]) + lg("pc", [[0, hi], [1, lo]]);
  return svg(defs, `
    <ellipse cx="50" cy="111" rx="30" ry="6" fill="#000" opacity=".3"/>
    <ellipse cx="50" cy="104" rx="28" ry="9.5" fill="url(#pd)"/>
    <ellipse cx="50" cy="101" rx="27" ry="8.5" fill="url(#pb)"/>
    <path d="M32 100 C34 86 41 76 42.5 65 L57.5 65 C59 76 66 86 68 100 Q50 106 32 100 Z" fill="url(#pb)"/>
    <ellipse cx="50" cy="65" rx="13.5" ry="4.6" fill="url(#pc)"/>
    <ellipse cx="50" cy="63.5" rx="10.5" ry="3" fill="${deep}" opacity=".35"/>
    <circle cx="50" cy="45" r="17" fill="url(#ph)"/>
    ${shine(44, 38, 6, 3.8, .8)}
    <path d="M44 72 C42.5 82 39 90 37.5 98" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>
    ${shine(40, 99, 6, 1.8, .35, -4)}`);
}

/* ---------- explorers and adventurers (chibi figures on a stand) ---------- */
type Person = {
  skin: [string, string]; shirt: [string, string]; pants: string; boots: string;
  back?: string; hairBack?: string; front?: string; hair?: string; hat?: string; face?: string; armColor?: string;
};
function person(o: Person) {
  const s = stand();
  const defs = s.defs + rg("sk", [[0, o.skin[0]], [1, o.skin[1]]], .38, .32, .8) + lg("sh", [[0, o.shirt[0]], [1, o.shirt[1]]]) + lg("pa", [[0, o.pants], [1, "#1c1410"]]);
  const arm = o.armColor ?? "url(#sh)";
  return svg(defs, `${s.body}
    ${o.back ?? ""}${o.hairBack ?? ""}
    <rect x="39" y="84" width="9.5" height="18" rx="4" fill="url(#pa)" ${OUT}/>
    <rect x="51.5" y="84" width="9.5" height="18" rx="4" fill="url(#pa)" ${OUT}/>
    <ellipse cx="43.5" cy="102.5" rx="6.6" ry="3.6" fill="${o.boots}" ${OUT}/>
    <ellipse cx="56.5" cy="102.5" rx="6.6" ry="3.6" fill="${o.boots}" ${OUT}/>
    <path d="M33 66 Q33 57.5 42 57 L58 57 Q67 57.5 67 66 L66 87 Q66 91.5 61 91.5 L39 91.5 Q34 91.5 34 87 Z" fill="url(#sh)" ${OUT}/>
    <path d="M35.5 63 L29.5 79" stroke="#2a1a0e" stroke-width="10.4" stroke-linecap="round"/><path d="M35.5 63 L29.5 79" stroke="${arm}" stroke-width="8" stroke-linecap="round"/>
    <path d="M64.5 63 L70.5 79" stroke="#2a1a0e" stroke-width="10.4" stroke-linecap="round"/><path d="M64.5 63 L70.5 79" stroke="${arm}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="29.2" cy="81.5" r="4.4" fill="url(#sk)" ${OUT}/><circle cx="70.8" cy="81.5" r="4.4" fill="url(#sk)" ${OUT}/>
    ${o.front ?? ""}
    <circle cx="29.5" cy="40" r="4.2" fill="url(#sk)" ${OUT}/><circle cx="70.5" cy="40" r="4.2" fill="url(#sk)" ${OUT}/>
    <circle cx="50" cy="38" r="21" fill="url(#sk)" ${OUT}/>
    ${o.face ?? ""}${eyes()}${cheeks()}${smile()}
    ${o.hair ?? ""}${o.hat ?? ""}`);
}
const youngExplorer = () => person({
  skin: ["#e9b98a", "#b97f52"], shirt: ["#d9bb7e", "#a88645"], pants: "#6d6a3a", boots: "#6b3f1f",
  back: `<rect x="27" y="58" width="46" height="31" rx="9" fill="#3f8a4a" ${OUT}/><rect x="26" y="66" width="7" height="14" rx="3" fill="#2f6f39" ${OUT}/><rect x="67" y="66" width="7" height="14" rx="3" fill="#2f6f39" ${OUT}/>`,
  front: `<path d="M40 58 L41 90 M60 58 L59 90" stroke="#2f6f39" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="45" y="74" width="10" height="7" rx="2" fill="#a88645" ${OUT}/>
    <path d="M44 59 Q50 70 56 59" fill="none" stroke="#3b2a1a" stroke-width="1.2"/>
    <circle cx="46.2" cy="69" r="3.6" fill="#2b2f36" ${OUT}/><circle cx="53.8" cy="69" r="3.6" fill="#2b2f36" ${OUT}/>
    <circle cx="45.6" cy="68.2" r="1.3" fill="#9fd3ff"/><circle cx="53.2" cy="68.2" r="1.3" fill="#9fd3ff"/>`,
  hair: `<path d="M31 34 Q33 22 50 21 Q67 22 69 34 Q60 29 50 30 Q40 29 31 34 Z" fill="#4a2c18"/>`,
  hat: `<ellipse cx="50" cy="25" rx="28" ry="6.5" fill="#c8a565" ${OUT}/>
    <path d="M33 25 Q34 9.5 50 9 Q66 9.5 67 25 Z" fill="#dcc083" ${OUT}/>
    <path d="M33.6 21 Q50 25 66.4 21 L66.8 24.6 Q50 28.5 33.2 24.6 Z" fill="#7a5a2e"/>
    ${shine(42, 15, 6, 2.6, .35)}`,
});
const jungleAdventurer = () => person({
  skin: ["#f3cda6", "#cf9a6c"], shirt: ["#2fb3a1", "#16786c"], pants: "#5a4632", boots: "#7a4724",
  hairBack: `<path d="M64 38 Q80 46 76 70 Q74 78 68 82 Q72 64 62 50 Z" fill="#a4471f" ${OUT}/>`,
  front: `<path d="M41 57.5 L44 91 L37 91 Q34 91 34 87 L33.5 66 Q33.5 59 41 57.5 Z" fill="#8a5a2b" opacity=".95"/>
    <path d="M59 57.5 L56 91 L63 91 Q66 91 66 87 L66.5 66 Q66.5 59 59 57.5 Z" fill="#8a5a2b" opacity=".95"/>
    <path d="M40 58 L66 84" stroke="#5b3a1a" stroke-width="3" stroke-linecap="round"/>
    <rect x="61" y="80" width="12" height="10" rx="3" fill="#a8743b" ${OUT}/><rect x="61" y="80" width="12" height="4" rx="2" fill="#8a5a2b"/>
    <path d="M40 57 Q50 64 60 57 L59 61 Q50 67 41 61 Z" fill="#d9483b" ${OUT}/>
    <path d="M56 61 L59 70 L54 67 Z" fill="#d9483b" ${OUT}/>`,
  hair: `<path d="M30 38 Q29 20 50 19 Q71 20 70 38 Q66 28 58 27 Q50 31 40 28 Q33 30 30 38 Z" fill="#b5532a"/>`,
  hat: `<ellipse cx="50" cy="24" rx="31" ry="7" fill="#1f8f84" ${OUT}/>
    <path d="M34 24 Q35 8 50 8 Q65 8 66 24 Z" fill="#26a596" ${OUT}/>
    <path d="M34.6 20 Q50 24 65.4 20 L65.8 23.5 Q50 27.5 34.2 23.5 Z" fill="#f1c34a"/>
    <path d="M62 21 Q70 10 76 12 Q70 16 66 23 Z" fill="#e56a4a" ${OUT}/>
    ${shine(43, 14, 6, 2.6, .35)}`,
});
const mountainAdventurer = () => person({
  skin: ["#d9a679", "#a8704a"], shirt: ["#3f7fd6", "#234f94"], pants: "#3c3f47", boots: "#5a3218",
  back: `<rect x="26" y="47" width="48" height="44" rx="10" fill="#e07a2c" ${OUT}/>
    <rect x="22" y="40" width="56" height="11" rx="5.5" fill="#4b9a5a" ${OUT}/><ellipse cx="22.5" cy="45.5" rx="3" ry="5.5" fill="#3a7d47" ${OUT}/><ellipse cx="77.5" cy="45.5" rx="3" ry="5.5" fill="#6fc27e" ${OUT}/>`,
  front: `<path d="M50 58 L50 91" stroke="#18355f" stroke-width="1.6"/><path d="M40 58 L41 90 M60 58 L59 90" stroke="#b3561a" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="50" cy="73" r="4.5" fill="#f1c34a" ${OUT}/><circle cx="50" cy="73" r="3" fill="#fff7d6"/><path d="M50 70.8 L51 73 L50 75.2 L49 73 Z" fill="#d9483b"/>`,
  face: `<path d="M30 42 Q31 60 50 60 Q69 60 70 42 Q66 52 58 53 Q50 50 42 53 Q34 52 30 42 Z" fill="#4a2c18"/>
    <path d="M44 51.5 Q50 49 56 51.5 Q50 53.5 44 51.5 Z" fill="#4a2c18"/>`,
  hair: `<path d="M30 35 Q31 18 50 17 Q69 18 70 35 Q62 26 50 27 Q38 26 30 35 Z" fill="#3a2414"/>`,
  hat: `<path d="M29.5 30 Q50 22 70.5 30 L71 36 Q50 29 29 36 Z" fill="#d9483b" ${OUT}/>
    <circle cx="25" cy="34" r="2.6" fill="#d9483b" ${OUT}/><path d="M25 35 L20 44 L24 43 Z M25 35 L23 46 L27 44 Z" fill="#b8352b" ${OUT}/>
    <circle cx="40" cy="31" r=".9" fill="#fff"/><circle cx="50" cy="28.5" r=".9" fill="#fff"/><circle cx="60" cy="31" r=".9" fill="#fff"/>`,
});
const outdoorExplorer = () => person({
  skin: ["#a87650", "#6e4528"], shirt: ["#3c9a5f", "#1f6a3d"], pants: "#5b4a3a", boots: "#3a2414",
  back: `<path d="M76 56 L78 106" stroke="#2a1a0e" stroke-width="4.6" stroke-linecap="round"/><path d="M76 56 L78 106" stroke="#a8743b" stroke-width="3" stroke-linecap="round"/><circle cx="76" cy="55" r="2.6" fill="#7a5a2e" ${OUT}/>`,
  front: `<path d="M35 68 Q50 70 65 68 M34.5 77 Q50 79 65.5 77 M34.5 85 Q50 87 65.5 85" fill="none" stroke="#1a5a33" stroke-width="1.3"/>
    <path d="M38 57 Q50 64 62 57 L62 62 Q50 68 38 62 Z" fill="#f1c34a" ${OUT}/>
    <rect x="21" y="77" width="13" height="10" rx="1.5" fill="#f4ead2" ${OUT}/><path d="M24 80 L31 80 M24 83 L29 83" stroke="#7a5a2e" stroke-width="1"/><path d="M26.5 78 L26.5 86" stroke="#d9483b" stroke-width=".8" stroke-dasharray="1.2 1"/>`,
  hair: `<path d="M31 37 Q33 28 50 27 Q67 28 69 37 Q60 33 50 33 Q40 33 31 37 Z" fill="#1d120a"/>`,
  hat: `<path d="M29.5 33 Q29 12 50 11 Q71 12 70.5 33 Z" fill="#e0a526" ${OUT}/>
    <rect x="28.5" y="28" width="43" height="8" rx="4" fill="#c4861a" ${OUT}/>
    <path d="M36 15 L36 28 M43 12.5 L43 28 M50 11.5 L50 28 M57 12.5 L57 28 M64 15 L64 28" stroke="#c4861a" stroke-width="1.2" opacity=".8"/>
    <circle cx="50" cy="9" r="5" fill="#f4ead2" ${OUT}/>`,
});

/* ---------- animals ---------- */
const lion = () => {
  const s = stand();
  const defs = s.defs + rg("lb", [[0, "#ffd77a"], [1, "#d1862a"]]) + rg("lm", [[0, "#d9742a"], [1, "#8f3e12"]], .5, .45, .6) + rg("lf", [[0, "#ffe08f"], [1, "#e2a13e"]], .4, .3, .8);
  const mane = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return `<circle cx="${(50 + Math.cos(a) * 21).toFixed(1)}" cy="${(43 + Math.sin(a) * 21).toFixed(1)}" r="8.5" fill="url(#lm)" ${OUT}/>`; }).join("");
  return svg(defs, `${s.body}
    <path d="M66 92 Q82 90 80 74 Q79 68 84 66" fill="none" stroke="#2a1a0e" stroke-width="5.4" stroke-linecap="round"/><path d="M66 92 Q82 90 80 74 Q79 68 84 66" fill="none" stroke="#e2a13e" stroke-width="3.6" stroke-linecap="round"/>
    <ellipse cx="85" cy="64" rx="4.6" ry="5.6" fill="url(#lm)" ${OUT}/>
    <ellipse cx="50" cy="85" rx="20" ry="17" fill="url(#lb)" ${OUT}/>
    <ellipse cx="50" cy="89" rx="11" ry="10" fill="#fbe3a4"/>
    <ellipse cx="40" cy="101" rx="7.5" ry="4.6" fill="url(#lb)" ${OUT}/><ellipse cx="60" cy="101" rx="7.5" ry="4.6" fill="url(#lb)" ${OUT}/>
    <ellipse cx="36" cy="87" rx="5" ry="8" fill="url(#lb)" ${OUT}/><ellipse cx="64" cy="87" rx="5" ry="8" fill="url(#lb)" ${OUT}/>
    ${mane}<circle cx="50" cy="43" r="21" fill="url(#lm)"/>
    <circle cx="35" cy="28" r="5.5" fill="url(#lf)" ${OUT}/><circle cx="65" cy="28" r="5.5" fill="url(#lf)" ${OUT}/><circle cx="35" cy="28" r="2.6" fill="#c9783a"/><circle cx="65" cy="28" r="2.6" fill="#c9783a"/>
    <circle cx="50" cy="45" r="16.5" fill="url(#lf)" ${OUT}/>
    ${eyes(42, 7)}
    <ellipse cx="45" cy="52.5" rx="5.8" ry="4.4" fill="#fff4d6"/><ellipse cx="55" cy="52.5" rx="5.8" ry="4.4" fill="#fff4d6"/>
    <path d="M46.5 48 Q50 46.5 53.5 48 Q53 51 50 52 Q47 51 46.5 48 Z" fill="#6b3a1f"/>
    <path d="M50 52 L50 54.5 M46 55.5 Q50 58 54 55.5" fill="none" stroke="#6b3a1f" stroke-width="1.4" stroke-linecap="round"/>
    ${cheeks(50, 12)}${shine(43, 36, 5, 2.4, .4)}`);
};
const panda = () => {
  const s = stand();
  const defs = s.defs + rg("pw", [[0, "#ffffff"], [1, "#cfd6dc"]], .38, .3, .8) + rg("pk", [[0, "#4a4f58"], [1, "#121418"]], .38, .3, .8);
  return svg(defs, `${s.body}
    <ellipse cx="50" cy="85" rx="20" ry="17" fill="url(#pw)" ${OUT}/>
    <ellipse cx="40" cy="100" rx="8" ry="5.4" fill="url(#pk)" ${OUT}/><ellipse cx="60" cy="100" rx="8" ry="5.4" fill="url(#pk)" ${OUT}/>
    <ellipse cx="34.5" cy="82" rx="6" ry="10" transform="rotate(18 34.5 82)" fill="url(#pk)" ${OUT}/>
    <path d="M68 62 L70 96" stroke="#2a1a0e" stroke-width="5.4" stroke-linecap="round"/><path d="M68 62 L70 96" stroke="#7cc46a" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M67.6 72 L70.4 72 M68.4 84 L70.8 84" stroke="#3f8a3a" stroke-width="1.4"/><path d="M68 64 Q75 58 78 61 Q72 62 69 67 Z" fill="#5fae52" ${OUT}/>
    <ellipse cx="65.5" cy="82" rx="6" ry="10" transform="rotate(-18 65.5 82)" fill="url(#pk)" ${OUT}/>
    <circle cx="31" cy="24" r="8" fill="url(#pk)" ${OUT}/><circle cx="69" cy="24" r="8" fill="url(#pk)" ${OUT}/>
    <circle cx="50" cy="42" r="22" fill="url(#pw)" ${OUT}/>
    <ellipse cx="41" cy="42" rx="6.5" ry="8.6" transform="rotate(28 41 42)" fill="#1d2026"/><ellipse cx="59" cy="42" rx="6.5" ry="8.6" transform="rotate(-28 59 42)" fill="#1d2026"/>
    <circle cx="42" cy="42" r="2.6" fill="#fff"/><circle cx="58" cy="42" r="2.6" fill="#fff"/><circle cx="42.5" cy="42.5" r="1.4" fill="#111"/><circle cx="57.5" cy="42.5" r="1.4" fill="#111"/>
    <ellipse cx="50" cy="50" rx="3.8" ry="2.6" fill="#1d2026"/>
    <path d="M50 52.5 L50 54 M46.5 55 Q50 57.5 53.5 55" fill="none" stroke="#1d2026" stroke-width="1.4" stroke-linecap="round"/>
    ${cheeks(51, 13)}${shine(42, 30, 6, 2.6, .5)}`);
};
const elephant = () => {
  const s = stand();
  const defs = s.defs + rg("eg", [[0, "#c9d3df"], [1, "#6f7c8f"]], .38, .3, .8) + rg("ee", [[0, "#ffd0da"], [1, "#d98ea0"]], .5, .5, .6);
  return svg(defs, `${s.body}
    <ellipse cx="50" cy="86" rx="21" ry="16" fill="url(#eg)" ${OUT}/>
    <path d="M36 74 Q50 68 64 74 L62 84 Q50 80 38 84 Z" fill="#d9483b" ${OUT}/><path d="M38 84 Q50 80 62 84" fill="none" stroke="#f1c34a" stroke-width="1.6"/>
    <rect x="35" y="92" width="11" height="12" rx="4" fill="url(#eg)" ${OUT}/><rect x="54" y="92" width="11" height="12" rx="4" fill="url(#eg)" ${OUT}/>
    <path d="M37 103 h2 M40.5 103 h2 M56 103 h2 M59.5 103 h2" stroke="#f4ead2" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="25" cy="42" rx="15" ry="18" fill="url(#eg)" ${OUT}/><ellipse cx="25" cy="42" rx="9.5" ry="12.5" fill="url(#ee)"/>
    <ellipse cx="75" cy="42" rx="15" ry="18" fill="url(#eg)" ${OUT}/><ellipse cx="75" cy="42" rx="9.5" ry="12.5" fill="url(#ee)"/>
    <circle cx="50" cy="39" r="20" fill="url(#eg)" ${OUT}/>
    <path d="M50 46 Q50 60 47 66 Q45 71 51 72 Q57 72 60 66" fill="none" stroke="#2a1a0e" stroke-width="10.4" stroke-linecap="round"/>
    <path d="M50 46 Q50 60 47 66 Q45 71 51 72 Q57 72 60 66" fill="none" stroke="#8d9bb0" stroke-width="8" stroke-linecap="round"/>
    <path d="M47.5 58 h5 M47 63 h5" stroke="#6f7c8f" stroke-width="1"/>
    <path d="M42 52 Q40 58 43.5 61" fill="none" stroke="#fffaf0" stroke-width="3" stroke-linecap="round"/><path d="M58 52 Q60 58 56.5 61" fill="none" stroke="#fffaf0" stroke-width="3" stroke-linecap="round"/>
    ${eyes(38, 8)}${cheeks(46, 13)}${shine(42, 27, 6, 2.6, .45)}`);
};
const rabbit = () => {
  const s = stand();
  const defs = s.defs + rg("rw", [[0, "#ffffff"], [1, "#d9ccd6"]], .38, .3, .8) + lg("rp", [[0, "#ffc2d2"], [1, "#f08aa8"]]);
  return svg(defs, `${s.body}
    <circle cx="69" cy="92" r="6.5" fill="url(#rw)" ${OUT}/>
    <ellipse cx="50" cy="83" rx="19" ry="18.5" fill="url(#rw)" ${OUT}/><ellipse cx="50" cy="88" rx="10" ry="9" fill="#fff" opacity=".7"/>
    <ellipse cx="41" cy="101.5" rx="9" ry="4.6" fill="url(#rw)" ${OUT}/><ellipse cx="59" cy="101.5" rx="9" ry="4.6" fill="url(#rw)" ${OUT}/>
    <path d="M57 74 L66 95" stroke="#2a1a0e" stroke-width="6.4" stroke-linecap="round"/><path d="M57 74 L66 95" stroke="#f08a2c" stroke-width="4.8" stroke-linecap="round"/>
    <path d="M59 78 L61 77.5 M61.5 84 L63.5 83.5" stroke="#c4661a" stroke-width="1"/><path d="M57 74 Q53 66 55 64 Q58 67 58.5 72 Q60 66 63 66 Q61 71 58 75 Z" fill="#4fa84a" ${OUT}/>
    <ellipse cx="37" cy="81" rx="5" ry="7.5" fill="url(#rw)" ${OUT}/><ellipse cx="61" cy="78" rx="5" ry="6.5" fill="url(#rw)" ${OUT}/>
    <ellipse cx="40" cy="17" rx="7" ry="18" transform="rotate(-8 40 17)" fill="url(#rw)" ${OUT}/><ellipse cx="40" cy="18" rx="3.6" ry="13" transform="rotate(-8 40 18)" fill="url(#rp)"/>
    <ellipse cx="61" cy="17" rx="7" ry="18" transform="rotate(10 61 17)" fill="url(#rw)" ${OUT}/><ellipse cx="61" cy="18" rx="3.6" ry="13" transform="rotate(10 61 18)" fill="url(#rp)"/>
    <circle cx="50" cy="45" r="19" fill="url(#rw)" ${OUT}/>
    ${eyes(43, 7.5)}
    <path d="M47.6 49.5 Q50 48 52.4 49.5 Q51.6 51.6 50 52 Q48.4 51.6 47.6 49.5 Z" fill="#f07a98"/>
    <path d="M50 52 L50 53.5 M46.5 54.5 Q50 57 53.5 54.5" fill="none" stroke="#7a4a52" stroke-width="1.3" stroke-linecap="round"/>
    <rect x="48" y="55.6" width="4" height="3.4" rx=".8" fill="#fff" stroke="#bba" stroke-width=".6"/>
    <path d="M38 51 L30 50 M38 53 L30.5 54.5 M62 51 L70 50 M62 53 L69.5 54.5" stroke="#9a8a90" stroke-width=".8" stroke-linecap="round"/>
    ${cheeks(51, 12)}${shine(43, 34, 5.5, 2.4, .5)}`);
};

const ART: Record<PieceId, () => string> = {
  "pawn-gold": () => pawn(["#fff4b8", "#f2c14e", "#b8860b", "#5e4205"]),
  "pawn-green": () => pawn(["#c8f7d4", "#2fbf6c", "#137a40", "#06331b"]),
  "pawn-red": () => pawn(["#ffd1d1", "#e8434f", "#a3121f", "#4a050c"]),
  "pawn-blue": () => pawn(["#d6e6ff", "#3d7be8", "#1a4fb3", "#081e4f"]),
  "young-explorer": youngExplorer, "jungle-adventurer": jungleAdventurer, "mountain-adventurer": mountainAdventurer, "outdoor-explorer": outdoorExplorer,
  lion, panda, elephant, rabbit,
};
const urls = new Map<string, string>();
/** The token picture as an image URL (an SVG data URL), for <img> on the selection screen. */
export function pieceUrl(id: string): string {
  const p = pieceById(id);
  let u = urls.get(p.id);
  if (!u) { u = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ART[p.id]()); urls.set(p.id, u); }
  return u;
}
const images = new Map<string, HTMLImageElement>();
/** The token picture as a loaded image for the board canvas; `onReady` runs once it can be drawn. */
export function pieceImage(id: string, onReady: () => void): HTMLImageElement {
  const p = pieceById(id);
  let img = images.get(p.id);
  if (!img) { img = new Image(); img.decoding = "async"; img.src = pieceUrl(p.id); images.set(p.id, img); }
  if (!img.complete) img.addEventListener("load", onReady, { once: true });
  return img;
}
