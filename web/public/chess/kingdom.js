/* Royal Club "Kingdom" chess pieces — original artwork drawn in code (no image files, no third-party art).
   Pawn: foot soldier with spear and shield.  Rook: soldier on an elephant with a battlement howdah.
   Knight: soldier on a horse.  Bishop: soldier on a camel.  Queen and King: royal figures with crowns.
   White pieces are ivory and gold; black pieces are ebony with gold. Riders face the opponent.
   Each piece is drawn in a 45 x 45 box, the same size as the classic set. */
(function () {
  'use strict';
  const C = {
    w: { body: '#f7eedb', shade: '#e2cfa6', line: '#2b1d0e', trim: '#b8862b', skin: '#e9b98a', dark: '#6b4a22', eye: '#2b1d0e' },
    b: { body: '#24302a', shade: '#16201b', line: '#e2c27a', trim: '#d9b45a', skin: '#b07a52', dark: '#0d1411', eye: '#f3dfa6' },
  };
  const BASE = (k) => `<path d="M10.5 40h24v-2.1a2.2 2.2 0 0 0-2.2-2.2H12.7a2.2 2.2 0 0 0-2.2 2.2z" fill="${k.body}"/><path d="M12 38.4h21" stroke="${k.trim}" stroke-width="1.1" fill="none"/>`;

  const DRAW = {
    // Foot soldier: round helmet with crest, tunic, round shield, upright spear.
    P: (k) => `
      <path d="M31.5 4.5v31" stroke="${k.dark}" stroke-width="1.5" fill="none"/>
      <path d="M31.5 2.5l2 4.2h-4z" fill="${k.trim}"/>
      <path d="M16.5 35.7l1.2-9.2c.3-2.6 2.4-4.5 5-4.5s4.7 1.9 5 4.5l1.2 9.2z" fill="${k.body}"/>
      <path d="M18 29.5h9.4" stroke="${k.trim}" stroke-width="1.1" fill="none"/>
      <circle cx="22.7" cy="16.5" r="4.3" fill="${k.skin}"/>
      <path d="M17.9 15.6a4.8 4.8 0 0 1 9.6 0z" fill="${k.trim}"/>
      <path d="M22.7 10.8c-1.2-1.8-.4-3.6 1.6-4.3-.2 1.5.6 2.5 1.4 3.3z" fill="${k.trim}"/>
      <circle cx="24.4" cy="17.2" r=".75" fill="${k.eye}" stroke="none"/>
      <path d="M29.5 24.5c.9.9 1.6 1.9 2 3" stroke="${k.line}" fill="none"/>
      <circle cx="15.6" cy="28.3" r="5.6" fill="${k.body}"/>
      <circle cx="15.6" cy="28.3" r="3.3" fill="none" stroke="${k.trim}" stroke-width="1.1"/>
      <circle cx="15.6" cy="28.3" r="1.1" fill="${k.trim}" stroke="none"/>`,

    // Rook: war elephant (trunk, tusk, big ear) carrying a battlement howdah with a rider.
    R: (k) => `
      <path d="M12.6 35.7v-7M17.4 35.7v-6.4M24.4 35.7v-6.4M28.6 35.7v-7" stroke="${k.line}" stroke-width="4.2" stroke-linecap="round" fill="none"/>
      <path d="M12.6 35.7v-7M17.4 35.7v-6.4M24.4 35.7v-6.4M28.6 35.7v-7" stroke="${k.body}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M8.6 25.2c0-4.6 4.6-7.6 11.2-7.6 5.6 0 9.6 2.2 10.8 6.4.5 1.9.4 3.9-.6 5.4-1 1.4-2.7 2-5 2H14.6c-3.8 0-6-2.2-6-6.2z" fill="${k.body}"/>
      <path d="M8.9 23.8c-1.3.3-2.2 1.5-2.2 3.2" stroke="${k.line}" fill="none"/>
      <path d="M29.2 19.8c1.4-1.8 3.4-2.6 5.3-2.2 2.4.5 3.6 2.6 3.4 5.2l-.2 3.2c-.1 2.2.6 4 2 5.4.7.7.4 1.8-.6 1.9-2.5.2-4.4-1.4-4.8-4l-.4-2.7c-1 .9-2.4 1.3-3.8 1z" fill="${k.body}"/>
      <path d="M29.4 20.4c-1.6.8-2.4 2.6-2.2 4.6.2 1.8 1.4 3 3 3.2 1-.9 1.4-2.4 1.2-4-.2-1.8-.9-3.2-2-3.8z" fill="${k.shade}"/>
      <path d="M34.6 26.8c1.6.6 3.4.3 4.4-.9" stroke="${k.trim}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="34.6" cy="21.4" r=".8" fill="${k.eye}" stroke="none"/>
      <path d="M11.8 18.2h14.2v-5.4h-2.2v2h-2.3v-2h-2.6v2h-2.3v-2h-2.6v2h-2.2z" fill="${k.trim}"/>
      <path d="M11.2 18.2h15.4v2.4H11.2z" fill="${k.shade}"/>
      <path d="M12.6 20.6l1.2 4.2h10.4l1.2-4.2" fill="${k.trim}" opacity=".55" stroke="none"/>
      <circle cx="18.9" cy="8.7" r="2.9" fill="${k.skin}"/>
      <path d="M15.8 8a3.2 3.2 0 0 1 6.2 0z" fill="${k.trim}"/>
      <path d="M16.3 11.6h5.2l.6 1.6h-6.4z" fill="${k.body}"/>`,

    // Knight: horse with an armoured rider holding a lance.
    N: (k) => `
      <path d="M14.2 35.7l.6-6.4M18.2 35.7l.2-5.4M26.8 35.7l-.4-5.6M30.4 35.7l-1-6.6" stroke="${k.line}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
      <path d="M14.2 35.7l.6-6.4M18.2 35.7l.2-5.4M26.8 35.7l-.4-5.6M30.4 35.7l-1-6.6" stroke="${k.body}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <path d="M11.5 27.6c0-3.7 3.4-6 8.6-6h6.7l2.6-6.2c.8-2 2.4-3.1 4.3-3l3.9 3.2c.7.6.6 1.6-.2 2l-2.4.7-1.7 2.8c-.4 3.9-.9 6.9-2.6 8.6-1.2 1.2-3 1.6-5.4 1.6h-8c-3.6 0-5.8-1.4-5.8-3.7z" fill="${k.body}"/>
      <path d="M30.2 12.6l1.6-3.6 1.6 3.6" fill="${k.body}"/>
      <circle cx="34" cy="15.2" r=".75" fill="${k.eye}" stroke="none"/>
      <path d="M29 14.5c-1.8 1.6-2.6 3.4-3 5.6M27.8 13.4c-1.6 1.2-2.6 2.5-3.2 4" stroke="${k.trim}" stroke-width="1.1" fill="none"/>
      <path d="M11.7 25.6c-2.3.2-3.6 2-3.6 4.6 1.5-.6 2.6-1.6 3.4-2.9" fill="${k.dark}" stroke="none"/>
      <path d="M17 22.2l1.2-6.6c.3-1.7 1.7-2.7 3.4-2.7s3 1 3.2 2.7l.6 6.6z" fill="${k.trim}"/>
      <circle cx="21.6" cy="10" r="2.9" fill="${k.skin}"/>
      <path d="M18.5 9.7a3.1 3.1 0 0 1 6.2 0z" fill="${k.shade}"/>
      <path d="M21.6 6.8c.2-1.6 1.4-2.6 3.2-2.8-.4 1.1-1 2-1.9 2.7" fill="${k.trim}"/>
      <path d="M12.5 6.5l14 13" stroke="${k.dark}" stroke-width="1.4" fill="none"/>
      <path d="M11.4 5.3l2.9.6-1.5 1.7z" fill="${k.trim}"/>`,

    // Bishop: camel (hump, long neck) with a turbaned rider.
    B: (k) => `
      <path d="M13.3 35.7l.4-9M17 35.7l.3-8.4M26.6 35.7l-.2-8.4M30 35.7l-.6-9" stroke="${k.line}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M13.3 35.7l.4-9M17 35.7l.3-8.4M26.6 35.7l-.2-8.4M30 35.7l-.6-9" stroke="${k.body}" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <g transform="translate(1.8 .6) scale(.92)">
      <path d="M10.5 26.4c0-3.2 2-5.4 4.6-6.3 1.2-3.8 3.5-5.6 6.4-5.6s4.8 1.9 5.6 5.4c1.5.2 2.3.9 2.8 2l1.6-8.6c.3-1.6 1.6-2.6 3.1-2.6l2.6.4c1.2.2 2.1 1.1 2.4 2.3l.3 1.4c.2.8-.4 1.6-1.2 1.6h-3l-2.4 13c-.5 2.6-2.1 3.9-4.8 3.9h-11c-3.6 0-5.8-1.6-5.8-4.4z" fill="${k.body}"/>
      <circle cx="35.6" cy="10.2" r=".75" fill="${k.eye}" stroke="none"/>
      <path d="M33.6 8.4l-.6-1.8" stroke="${k.line}" fill="none"/>
      <path d="M10.8 25.6c-1.4.4-2.2 1.6-2.1 3.3" stroke="${k.line}" fill="none"/>
      <path d="M14.5 22.4h13.2" stroke="${k.trim}" stroke-width="1.6" fill="none"/>
      <path d="M17.5 15.4l.9-5.2c.3-1.5 1.5-2.5 3-2.5s2.7 1 3 2.5l.9 5.2z" fill="${k.trim}"/>
      <circle cx="21.4" cy="5.9" r="2.8" fill="${k.skin}"/>
      <path d="M18.3 5.2c0-2.3 1.4-3.6 3.1-3.6s3.1 1.3 3.1 3.6c-1.9-.6-4.3-.6-6.2 0z" fill="${k.body}"/>
      <circle cx="21.4" cy="2.4" r=".9" fill="${k.trim}" stroke="none"/></g>`,

    // Queen: crowned queen in a flowing gown with a veil.
    Q: (k) => `
      <path d="M13 35.7c1.6-6.2 3.3-11.2 5.2-14.6h8.6c1.9 3.4 3.6 8.4 5.2 14.6z" fill="${k.body}"/>
      <path d="M15.6 31.5h13.8M17 27.5h11" stroke="${k.trim}" stroke-width="1.1" fill="none"/>
      <path d="M18.6 21.1l.8-3.4c.4-1.6 1.6-2.4 3.1-2.4s2.7.8 3.1 2.4l.8 3.4z" fill="${k.shade}"/>
      <path d="M18.4 12.4c-1.6 3.8-2.2 7.6-1.7 11.2l3.1-2.4M26.6 12.4c1.6 3.8 2.2 7.6 1.7 11.2l-3.1-2.4" fill="${k.shade}"/>
      <circle cx="22.5" cy="12.3" r="3.8" fill="${k.skin}"/>
      <path d="M17.8 8.8l1.6 1.4 1.4-3.6 1.7 3.2 1.7-3.2 1.4 3.6 1.6-1.4-.7 3.5h-8z" fill="${k.trim}"/>
      <circle cx="22.5" cy="5.6" r="1" fill="${k.trim}"/>
      <circle cx="21.2" cy="12.6" r=".55" fill="${k.eye}" stroke="none"/><circle cx="23.8" cy="12.6" r=".55" fill="${k.eye}" stroke="none"/>
      <circle cx="22.5" cy="20" r="1" fill="${k.trim}" stroke="none"/>`,

    // King: crowned king with a jewelled turban crest, beard and sceptre.
    K: (k) => `
      <path d="M31.8 8v27.7" stroke="${k.dark}" stroke-width="1.4" fill="none"/>
      <circle cx="31.8" cy="7" r="1.6" fill="${k.trim}"/>
      <path d="M13.8 35.7l1.6-11.2c.4-2.6 2.5-4.4 5.2-4.4h3.8c2.7 0 4.8 1.8 5.2 4.4l1.6 11.2z" fill="${k.body}"/>
      <path d="M22.5 20.4v15.3" stroke="${k.trim}" stroke-width="1.1" fill="none"/>
      <path d="M15.2 30.2h14.6" stroke="${k.trim}" stroke-width="1.1" fill="none"/>
      <path d="M29.6 24.4c.9 1 1.5 2 1.8 3.2" stroke="${k.line}" fill="none"/>
      <circle cx="22.5" cy="14" r="4" fill="${k.skin}"/>
      <path d="M19.2 16.2c.7 2.4 1.9 3.5 3.3 3.5s2.6-1.1 3.3-3.5c-1 .6-2.1.9-3.3.9s-2.3-.3-3.3-.9z" fill="${k.dark}"/>
      <path d="M17.6 11.6l.4-4.1 2.2 1.7 2.3-3.4 2.3 3.4 2.2-1.7.4 4.1z" fill="${k.trim}"/>
      <path d="M17.4 11.4h10.2v1.6H17.4z" fill="${k.trim}"/>
      <circle cx="22.5" cy="9" r=".95" fill="${k.body}" stroke="none"/>
      <circle cx="21.1" cy="14.1" r=".55" fill="${k.eye}" stroke="none"/><circle cx="23.9" cy="14.1" r=".55" fill="${k.eye}" stroke="none"/>`,
  };

  /** SVG markup for a piece letter (uppercase white, lowercase black). Black pieces face the other way. */
  function svg(p, cls) {
    const white = p === p.toUpperCase(), k = white ? C.w : C.b, T = p.toUpperCase();
    const flip = white ? '' : ' transform="matrix(-1 0 0 1 45 0)"';
    return `<svg class="${cls || ''} kd kd-${T}" viewBox="0 0 45 45" aria-hidden="true"><g fill="${k.body}" stroke="${k.line}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"${flip}>${DRAW[T](k)}${BASE(k)}</g></svg>`;
  }
  window.RoyalKingdom = { svg };
})();
