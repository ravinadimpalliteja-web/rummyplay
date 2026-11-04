import { LADDERS, SNAKES } from "./engine";

/* The board is drawn on a 600 x 600 logical canvas: 10 x 10 squares of 60, numbered in a zigzag from the bottom left. */
export const W = 600, S = 60;
export type Pt = { x: number; y: number };

export const center = (n: number): Pt => {
  const row = Math.floor((n - 1) / 10);
  let col = (n - 1) % 10;
  if (row % 2) col = 9 - col;
  return { x: col * S + S / 2, y: (9 - row) * S + S / 2 };
};
/** Where a token waits before entering (just off the board, left of square 1). */
export const OFF: Pt = { x: -S / 2, y: center(1).y };

export function snakePath(head: number, tail: number): Pt[] {
  const h = center(head), t = center(tail);
  const dx = t.x - h.x, dy = t.y - h.y, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len, waves = Math.max(2, Math.round(len / 75)), pts: Pt[] = [];
  for (let i = 0; i <= 80; i++) {
    const k = i / 80, w = Math.sin(k * Math.PI * waves) * 15 * (1 - k * 0.4);
    pts.push({ x: h.x + dx * k + nx * w, y: h.y + dy * k + ny * w });
  }
  return pts;
}

const SNAKE_COLORS = ["#1f7a4f", "#a8262f", "#24508f", "#b8741a", "#0f7a72", "#6e3a8a", "#6f7a1a", "#b33c6e"];
const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16), c = (v: number) => Math.min(255, Math.max(0, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

function tiles(g: CanvasRenderingContext2D) {
  for (let n = 1; n <= 100; n++) {
    const p = center(n), row = Math.floor((n - 1) / 10), col = (n - 1) % 10;
    g.fillStyle = (row + col) % 2 ? "#e9dcb4" : "#f6efdc";
    g.fillRect(p.x - S / 2, p.y - S / 2, S, S);
    g.strokeStyle = "rgba(13,59,43,.10)"; g.lineWidth = 1;
    g.strokeRect(p.x - S / 2 + .5, p.y - S / 2 + .5, S - 1, S - 1);
    g.fillStyle = "rgba(13,59,43,.72)"; g.font = "700 12px 'DM Sans', sans-serif"; g.textAlign = "left";
    g.fillText(String(n), p.x - S / 2 + 5, p.y - S / 2 + 15);
  }
  const m = center(100), grad = g.createLinearGradient(m.x - S / 2, m.y - S / 2, m.x + S / 2, m.y + S / 2);
  grad.addColorStop(0, "#f6e4ae"); grad.addColorStop(1, "#c79f50");
  g.fillStyle = grad; g.fillRect(m.x - S / 2, m.y - S / 2, S, S);
  g.fillStyle = "#3d2a0c"; g.textAlign = "center";
  g.font = "700 19px 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Mangal', sans-serif";
  g.fillText("मोक्ष", m.x, m.y + 7);
  g.font = "800 10px 'DM Sans', sans-serif"; g.fillText("100", m.x, m.y + 22);
  const s = center(1);
  g.fillStyle = "rgba(13,59,43,.75)"; g.font = "800 9px 'DM Sans', sans-serif";
  g.fillText("START", s.x, s.y + 22);
}

function ladder(g: CanvasRenderingContext2D, a: number, b: number) {
  const p1 = center(a), p2 = center(b), dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
  const nx = -dy / len * 10, ny = dx / len * 10;
  g.lineCap = "round";
  const rails = (ox: number, oy: number, col: string, w: number) => [1, -1].forEach(s => {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    g.moveTo(p1.x + nx * s + ox, p1.y + ny * s + oy); g.lineTo(p2.x + nx * s + ox, p2.y + ny * s + oy); g.stroke();
  });
  rails(3, 4, "rgba(0,0,0,.22)", 7);
  const rungs = Math.floor(len / 18);
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs, x = p1.x + dx * t, y = p1.y + dy * t;
    g.strokeStyle = "#c9974a"; g.lineWidth = 4; g.beginPath(); g.moveTo(x + nx, y + ny); g.lineTo(x - nx, y - ny); g.stroke();
  }
  rails(0, 0, "#7a4f1c", 5);
  rails(-1, -1, "#d9b96f", 1.6);
}

function snake(g: CanvasRenderingContext2D, head: number, tail: number, color: string) {
  const pts = snakePath(head, tail), h = center(head), t = center(tail);
  const dx = t.x - h.x, dy = t.y - h.y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, ux = dx / len, uy = dy / len;
  g.lineCap = "round";
  const body = (ox: number, oy: number, col: (i: number) => string) => {
    for (let i = 0; i < pts.length - 1; i++) {
      g.strokeStyle = col(i); g.lineWidth = 15 - (i / 80) * 11;
      g.beginPath(); g.moveTo(pts[i].x + ox, pts[i].y + oy); g.lineTo(pts[i + 1].x + ox, pts[i + 1].y + oy); g.stroke();
    }
  };
  body(3, 4, () => "rgba(0,0,0,.18)");
  body(0, 0, i => (Math.floor(i / 4) % 2 ? shade(color, 50) : color));
  g.fillStyle = color;
  g.beginPath(); g.ellipse(h.x - ux * 3, h.y - uy * 3, 14, 11, Math.atan2(dy, dx), 0, Math.PI * 2); g.fill();
  const tip = (k: number, side = 0) => ({ x: h.x - ux * k + nx * side, y: h.y - uy * k + ny * side });
  g.strokeStyle = "#e0262a"; g.lineWidth = 2; g.beginPath();
  const a = tip(16), b = tip(24), c = tip(28, 3), d = tip(28, -3);
  g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.moveTo(b.x, b.y); g.lineTo(d.x, d.y); g.stroke();
  [1, -1].forEach(s => {
    const e = { x: h.x - ux * 7 + nx * 5 * s, y: h.y - uy * 7 + ny * 5 * s };
    g.fillStyle = "#fff"; g.beginPath(); g.arc(e.x, e.y, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.arc(e.x, e.y, 1.8, 0, Math.PI * 2); g.fill();
  });
}

/** Paints the static board (tiles, ladders, snakes) into `layer` at the given pixel ratio. */
export function paintBoard(layer: HTMLCanvasElement, dpr: number) {
  layer.width = layer.height = Math.round(W * dpr);
  const g = layer.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  tiles(g);
  Object.entries(LADDERS).forEach(([a, b]) => ladder(g, +a, b));
  Object.entries(SNAKES).forEach(([h, t], i) => snake(g, +h, t, SNAKE_COLORS[i % SNAKE_COLORS.length]));
}

export function paintToken(g: CanvasRenderingContext2D, p: Pt, color: string, label: string, active: boolean) {
  const r = 13;
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(p.x + 2, p.y + 5, r, r * .6, 0, 0, Math.PI * 2); g.fill();
  if (active) { g.strokeStyle = "#f0d99d"; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, r + 5, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#fffaf0"; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = "#fff"; g.font = "800 12px 'DM Sans', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(label, p.x, p.y + 1); g.textBaseline = "alphabetic";
}
