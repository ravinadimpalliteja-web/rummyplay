/* Royal Club game art — "Royal Gold, jewel colours" set.
   One jewel colour per game (EKAH ruby, Ludo emerald, Snakes & Ladders sapphire, Sudoku amethyst, Chess onyx),
   shared gold, crowns and a soft sunburst so the five read as one family. All artwork is original.
   <GameArtDefs /> must be rendered once on the page; every art piece below points at its gradients and filters. */
import type { ReactNode } from "react";

const RAYS = [
  "120,120 340,120 333,173", "120,120 311,230 278,273", "120,120 230,311 181,331", "120,120 120,340 67,333",
  "120,120 10,311 -33,278", "120,120 -71,230 -91,181", "120,120 -100,120 -93,67", "120,120 -71,10 -38,-33",
  "120,120 10,-71 59,-91", "120,120 120,-100 173,-93", "120,120 230,-71 273,-38", "120,120 311,10 331,59",
];

export const GameArtDefs = () => (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
    <defs>
      <g id="rcg-rays">{RAYS.map(p => <polygon key={p} points={p} />)}</g>
      <g id="rcg-crown">
        <polygon points="-20,10 -26,-12 -10,-2 0,-20 10,-2 26,-12 20,10" fill="url(#rcg-gold)" stroke="#7A5508" strokeWidth="2" strokeLinejoin="round" />
        <rect x="-21" y="8" width="42" height="8" rx="3" fill="url(#rcg-gold)" stroke="#7A5508" strokeWidth="2" />
        <circle cx="0" cy="-20" r="3.5" fill="#E0303F" /><circle cx="-26" cy="-12" r="3" fill="#22B573" /><circle cx="26" cy="-12" r="3" fill="#3B7BFF" />
      </g>
      <filter id="rcg-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#000" floodOpacity="0.4" /></filter>
      <filter id="rcg-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="11" /></filter>
      <linearGradient id="rcg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF0A8" /><stop offset="0.45" stopColor="#F2C23E" /><stop offset="1" stopColor="#A8740C" /></linearGradient>
      <radialGradient id="rcg-ruby" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stopColor="#E8394A" /><stop offset="1" stopColor="#3E0410" /></radialGradient>
      <radialGradient id="rcg-emerald" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stopColor="#2FBF7A" /><stop offset="1" stopColor="#053A24" /></radialGradient>
      <radialGradient id="rcg-sapphire" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stopColor="#3E7BFF" /><stop offset="1" stopColor="#0A1D5C" /></radialGradient>
      <radialGradient id="rcg-amethyst" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stopColor="#A65BEA" /><stop offset="1" stopColor="#2A0A4A" /></radialGradient>
      <radialGradient id="rcg-onyx" cx="0.5" cy="0.4" r="0.8"><stop offset="0" stopColor="#4E4757" /><stop offset="1" stopColor="#0B090D" /></radialGradient>
      <linearGradient id="rcg-ivory" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF6" /><stop offset="1" stopColor="#F0E2BF" /></linearGradient>
      <linearGradient id="rcg-snake" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8CF0B4" /><stop offset="1" stopColor="#14894A" /></linearGradient>
      <radialGradient id="rcg-sph-gold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFF6C4" /><stop offset="0.45" stopColor="#F2C23E" /><stop offset="1" stopColor="#8F600A" /></radialGradient>
      <radialGradient id="rcg-sph-red" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#FFB0A8" /><stop offset="0.45" stopColor="#E8394A" /><stop offset="1" stopColor="#8A0F20" /></radialGradient>
      <radialGradient id="rcg-sph-blue" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#C2DCFF" /><stop offset="0.45" stopColor="#3B7BFF" /><stop offset="1" stopColor="#173C9E" /></radialGradient>
      <linearGradient id="rcg-agni" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9554" /><stop offset="1" stopColor="#E5501A" /></linearGradient>
      <linearGradient id="rcg-jal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5C8CFF" /><stop offset="1" stopColor="#2050E0" /></linearGradient>
      <linearGradient id="rcg-prithvi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#50CD82" /><stop offset="1" stopColor="#16954B" /></linearGradient>
      <linearGradient id="rcg-vayu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#BE78F0" /><stop offset="1" stopColor="#8A36CC" /></linearGradient>

      <g id="rcg-card-agni"><rect width="84" height="118" rx="14" fill="url(#rcg-agni)" stroke="url(#rcg-gold)" strokeWidth="4" /><circle cx="42" cy="56" r="30" fill="#FFAE7A" opacity="0.7" /><path transform="translate(42 58) scale(1.65)" d="M 0 -22 C 12 -8 16 2 12 12 C 9 20 -9 20 -12 12 C -15 4 -8 -2 -4 -10 C -2 -2 2 0 4 -4 C 6 -10 2 -16 0 -22 Z" fill="#FFF" stroke="#6B2200" strokeWidth="3" strokeLinejoin="round" /></g>
      <g id="rcg-card-jal"><rect width="84" height="118" rx="14" fill="url(#rcg-jal)" stroke="url(#rcg-gold)" strokeWidth="4" /><circle cx="42" cy="56" r="30" fill="#86A8FF" opacity="0.7" /><g transform="translate(42 56) scale(1.65)" strokeLinejoin="round"><path d="M 0 -20 C 8 -8 14 0 14 8 A 14 14 0 0 1 -14 8 C -14 0 -8 -8 0 -20 Z" fill="#FFF" stroke="#0E2470" strokeWidth="3" /><path d="M -6 8 Q 0 13 6 8" fill="none" stroke="#2F6BFF" strokeWidth="2.5" strokeLinecap="round" /></g></g>
      <g id="rcg-card-prithvi"><rect width="84" height="118" rx="14" fill="url(#rcg-prithvi)" stroke="url(#rcg-gold)" strokeWidth="4" /><circle cx="42" cy="56" r="30" fill="#7EDDA3" opacity="0.7" /><g transform="translate(42 58) scale(1.65)" stroke="#0A4623" strokeLinejoin="round"><path d="M -20 14 L -6 -10 L 2 2 L 8 -6 L 20 14 Z" fill="#FFF" strokeWidth="3" /><circle cx="10" cy="-16" r="5" fill="#FFF" strokeWidth="2.5" /></g></g>
      <g id="rcg-card-vayu"><rect width="84" height="118" rx="14" fill="url(#rcg-vayu)" stroke="url(#rcg-gold)" strokeWidth="4" /><circle cx="42" cy="56" r="30" fill="#D4A2F5" opacity="0.7" /><g transform="translate(42 58) scale(1.65)" fill="none" strokeLinecap="round"><path d="M -18 -8 H 8 A 7 7 0 1 0 1 -15 M -18 2 H 14 A 7 7 0 1 1 7 9 M -14 12 H 0" stroke="#3C145F" strokeWidth="9" /><path d="M -18 -8 H 8 A 7 7 0 1 0 1 -15 M -18 2 H 14 A 7 7 0 1 1 7 9 M -14 12 H 0" stroke="#FFF" strokeWidth="4.5" /></g></g>
    </defs>
  </svg>
);

/* Shared backdrop: the jewel colour plus a faint gold sunburst, oversized so any tile shape stays covered. */
const Backdrop = ({ jewel }: { jewel: string }) => (
  <>
    <rect x="-80" y="-80" width="400" height="400" fill={`url(#rcg-${jewel})`} />
    <use href="#rcg-rays" fill="#FFD36B" opacity="0.12" />
  </>
);

/* All five use the same frame, pinned to the top ("xMidYMin slice"): on wide or short tiles the bottom is
   trimmed instead of the top, so the crowns always show and the dark label strip covers only the base. */
const Frame = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMin slice" aria-hidden="true">{children}</svg>
);

export const EkahArt = () => (
  <Frame>
    <Backdrop jewel="ruby" />
    <circle cx="120" cy="120" r="64" fill="#FFD36B" opacity="0.4" filter="url(#rcg-glow)" />
    <g filter="url(#rcg-shadow)">
      <use href="#rcg-card-vayu" transform="rotate(27 120 236) translate(80 54) scale(0.95)" />
      <use href="#rcg-card-prithvi" transform="rotate(9 120 236) translate(80 54) scale(0.95)" />
      <use href="#rcg-card-jal" transform="rotate(-9 120 236) translate(80 54) scale(0.95)" />
      <use href="#rcg-card-agni" transform="rotate(-27 120 236) translate(80 54) scale(0.95)" />
    </g>
    <use href="#rcg-crown" filter="url(#rcg-shadow)" transform="translate(120 34) scale(1.15)" />
  </Frame>
);

export const LudoArt = () => (
  <Frame>
    <Backdrop jewel="emerald" />
    <g transform="translate(120 164) scale(1.1 0.62) rotate(45)">
      <rect x="-64" y="-64" width="128" height="128" rx="18" fill="#03261A" transform="translate(10 10)" />
      <rect x="-64" y="-64" width="128" height="128" rx="18" fill="url(#rcg-ivory)" stroke="url(#rcg-gold)" strokeWidth="6" />
      <rect x="-56" y="-56" width="52" height="52" rx="10" fill="#D42A3E" />
      <rect x="4" y="-56" width="52" height="52" rx="10" fill="#1E9A5F" />
      <rect x="4" y="4" width="52" height="52" rx="10" fill="#F0B020" />
      <rect x="-56" y="4" width="52" height="52" rx="10" fill="#2D63DA" />
    </g>
    <g filter="url(#rcg-shadow)"><ellipse cx="70" cy="170" rx="14" ry="5" fill="#8A0F20" /><path d="M 64 136 Q 58 154 56 166 L 84 166 Q 82 154 76 136 Z" fill="url(#rcg-sph-red)" /><circle cx="70" cy="128" r="11" fill="url(#rcg-sph-red)" /><ellipse cx="66" cy="124" rx="3.5" ry="2.2" fill="#FFF" opacity="0.8" /></g>
    <g filter="url(#rcg-shadow)"><ellipse cx="170" cy="172" rx="14" ry="5" fill="#173C9E" /><path d="M 164 138 Q 158 156 156 168 L 184 168 Q 182 156 176 138 Z" fill="url(#rcg-sph-blue)" /><circle cx="170" cy="130" r="11" fill="url(#rcg-sph-blue)" /><ellipse cx="166" cy="126" rx="3.5" ry="2.2" fill="#FFF" opacity="0.8" /></g>
    <circle cx="120" cy="110" r="40" fill="#FFD36B" opacity="0.45" filter="url(#rcg-glow)" />
    <g filter="url(#rcg-shadow)"><ellipse cx="120" cy="160" rx="24" ry="8" fill="#8F600A" /><path d="M 110 104 Q 98 136 94 156 L 146 156 Q 142 136 130 104 Z" fill="url(#rcg-sph-gold)" /><ellipse cx="120" cy="104" rx="16" ry="5" fill="#C08A12" /><circle cx="120" cy="86" r="19" fill="url(#rcg-sph-gold)" /><ellipse cx="113" cy="79" rx="5.5" ry="3.5" fill="#FFF" opacity="0.8" /></g>
    <use href="#rcg-crown" filter="url(#rcg-shadow)" transform="translate(120 58) scale(0.85)" />
  </Frame>
);

export const SnakesArt = () => (
  <Frame>
    <Backdrop jewel="sapphire" />
    <g strokeLinecap="round" filter="url(#rcg-shadow)">
      <g stroke="#6E4E08"><line x1="78" y1="250" x2="100" y2="96" strokeWidth="15" /><line x1="162" y1="250" x2="140" y2="96" strokeWidth="15" /></g>
      <g stroke="url(#rcg-gold)">
        <line x1="96.6" y1="120" x2="143.4" y2="120" strokeWidth="8" /><line x1="92" y1="152" x2="148" y2="152" strokeWidth="8" />
        <line x1="87.4" y1="184" x2="152.6" y2="184" strokeWidth="8" /><line x1="82.9" y1="216" x2="157.1" y2="216" strokeWidth="8" />
        <line x1="78" y1="250" x2="100" y2="96" strokeWidth="10" /><line x1="162" y1="250" x2="140" y2="96" strokeWidth="10" />
      </g>
    </g>
    <circle cx="120" cy="58" r="46" fill="#FFD36B" opacity="0.55" filter="url(#rcg-glow)" />
    <g filter="url(#rcg-shadow)">
      <circle cx="120" cy="62" r="31" fill="url(#rcg-gold)" stroke="#8F600A" strokeWidth="3" />
      <circle cx="120" cy="62" r="24.5" fill="none" stroke="#FFF6C4" strokeWidth="1.5" opacity="0.85" />
      <text x="120" y="71" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="24" fill="#7A1020">100</text>
    </g>
    <use href="#rcg-crown" filter="url(#rcg-shadow)" transform="translate(120 25) scale(0.85)" />
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#rcg-shadow)">
      <path d="M 26 238 C 120 240, 196 212, 162 186 S 64 162, 90 134 S 166 124, 172 104" stroke="#06381E" strokeWidth="27" />
      <path d="M 26 238 C 120 240, 196 212, 162 186 S 64 162, 90 134 S 166 124, 172 104" stroke="url(#rcg-snake)" strokeWidth="20" />
      <path d="M 26 238 C 120 240, 196 212, 162 186 S 64 162, 90 134 S 166 124, 172 104" stroke="#FFE58A" strokeWidth="5" strokeDasharray="1 14" opacity="0.9" />
    </g>
    <g filter="url(#rcg-shadow)">
      <path d="M 160 86 L 152 76 M 152 76 L 152 68 M 152 76 L 144 72" stroke="#FF3B5C" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="176" cy="98" rx="22" ry="17" fill="url(#rcg-snake)" stroke="#06381E" strokeWidth="3" transform="rotate(-24 176 98)" />
      <circle cx="168" cy="92" r="7" fill="#FFF" /><circle cx="182" cy="88" r="7" fill="#FFF" />
      <circle cx="166" cy="91" r="3.8" fill="#121212" /><circle cx="180" cy="87" r="3.8" fill="#121212" />
      <circle cx="167.5" cy="89.5" r="1.3" fill="#FFF" /><circle cx="181.5" cy="85.5" r="1.3" fill="#FFF" />
    </g>
  </Frame>
);

export const SudokuArt = () => (
  <Frame>
    <Backdrop jewel="amethyst" />
    <g transform="translate(118 128) rotate(-8)">
      <rect x="-76" y="-66" width="152" height="152" rx="20" fill="#1A0530" />
      <g filter="url(#rcg-shadow)"><rect x="-76" y="-76" width="152" height="152" rx="20" fill="url(#rcg-ivory)" stroke="url(#rcg-gold)" strokeWidth="5" /></g>
      <g stroke="#D9B44A" strokeWidth="3" strokeLinecap="round"><line x1="-22" y1="-66" x2="-22" y2="66" /><line x1="22" y1="-66" x2="22" y2="66" /><line x1="-66" y1="-22" x2="66" y2="-22" /><line x1="-66" y1="22" x2="66" y2="22" /></g>
      <circle cx="0" cy="0" r="32" fill="#FFD36B" opacity="0.75" filter="url(#rcg-glow)" />
      <rect x="-20" y="-20" width="40" height="40" rx="10" fill="url(#rcg-gold)" stroke="#A8740C" strokeWidth="2" />
      <g fontFamily="Cinzel, serif" fontWeight="700" fontSize="30" textAnchor="middle" fill="#3A1460">
        <text x="-44" y="-33">5</text><text x="44" y="-33">3</text><text x="-44" y="11">1</text><text x="44" y="11">7</text>
      </g>
      <text x="0" y="12" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="34" fill="#7A1020">9</text>
    </g>
    <use href="#rcg-crown" filter="url(#rcg-shadow)" transform="translate(186 46) rotate(14) scale(1.05)" />
  </Frame>
);

const CHESS_LIGHT = [[-30, -60], [30, -60], [-60, -30], [0, -30], [-30, 0], [30, 0], [-60, 30], [0, 30]];
const CHESS_DARK = [[-60, -60], [0, -60], [-30, -30], [30, -30], [-60, 0], [0, 0], [-30, 30], [30, 30]];

export const ChessArt = () => (
  <Frame>
    <Backdrop jewel="onyx" />
    <g transform="translate(120 238) scale(1 0.45) rotate(45)">
      <rect x="-64" y="-64" width="128" height="128" rx="10" fill="url(#rcg-gold)" />
      <g fill="#1A161E">{CHESS_DARK.map(([x, y]) => <rect key={`d${x}${y}`} x={x} y={y} width="30" height="30" />)}</g>
      <g fill="#E9D9AE">{CHESS_LIGHT.map(([x, y]) => <rect key={`l${x}${y}`} x={x} y={y} width="30" height="30" />)}</g>
    </g>
    <circle cx="124" cy="120" r="64" fill="#FFD36B" opacity="0.35" filter="url(#rcg-glow)" />
    <g filter="url(#rcg-shadow)" transform="translate(126 216) scale(1.05)">
      <ellipse cx="0" cy="0" rx="50" ry="10" fill="#7A5508" />
      <rect x="-48" y="-12" width="96" height="12" rx="4" fill="url(#rcg-gold)" stroke="#8F600A" strokeWidth="1.5" />
      <rect x="-40" y="-24" width="80" height="13" rx="4" fill="url(#rcg-sph-gold)" stroke="#8F600A" strokeWidth="1.5" />
      <rect x="-33" y="-31" width="66" height="8" rx="3" fill="#C08A12" />
      <path d="M -30 -30 C -26 -52 -14 -66 -8 -78 C -18 -76 -34 -72 -44 -80 C -54 -86 -54 -98 -46 -104 C -34 -116 -22 -126 -10 -132 L -6 -146 L 4 -134 C 30 -128 42 -100 40 -70 C 38 -52 34 -40 30 -30 Z" fill="url(#rcg-sph-gold)" stroke="#8F600A" strokeWidth="2" strokeLinejoin="round" />
      <g stroke="#A8740C" strokeWidth="2.5" strokeLinecap="round" fill="none"><path d="M 14 -124 L 22 -118" /><path d="M 24 -112 L 32 -106" /><path d="M 30 -98 L 38 -94" /><path d="M 34 -84 L 41 -82" /></g>
      <path d="M -10 -128 C -26 -118 -40 -108 -46 -100" stroke="#FFF6C4" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M -24 -48 C -18 -60 -12 -68 -9 -76" stroke="#FFF6C4" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
      <ellipse cx="-20" cy="-112" rx="4.5" ry="3.5" fill="#2A1A06" />
      <circle cx="-46" cy="-96" r="2.6" fill="#2A1A06" />
      <path d="M -52 -86 Q -46 -84 -40 -87" stroke="#2A1A06" strokeWidth="2" strokeLinecap="round" fill="none" />
    </g>
    <use href="#rcg-crown" filter="url(#rcg-shadow)" transform="translate(114 52) rotate(-12) scale(1.05)" />
  </Frame>
);
