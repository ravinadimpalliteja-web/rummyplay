/* Turns the game artwork in web/src/home/GameArt.tsx into standalone SVG files (web/public/art/<game>.svg) for the
   plain-HTML game pages (EKAH, Chess, Sudoku, Word Puzzle), so their app lobby shows the same art as the app home.
   Run after changing GameArt.tsx:  node tools/art/export-art.mjs  (needs the "typescript" package). */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
let ts;
try { ts = require("typescript"); } catch { ts = require(process.env.TYPESCRIPT || "typescript"); }

const src = readFileSync(resolve(root, "web/src/home/GameArt.tsx"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: "h", jsxFragmentFactory: "Fragment", module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

const ATTR = { className: "class", htmlFor: "for" };
const attr = (k) => ATTR[k] ?? (/^(aria|data)[A-Z]/.test(k) ? k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())
  : /^(viewBox|gradientUnits|gradientTransform|patternUnits|patternTransform|stdDeviation|preserveAspectRatio|textLength|lengthAdjust|startOffset|markerWidth|markerHeight|refX|refY|tableValues|numOctaves|baseFrequency|keyTimes|keySplines|calcMode|attributeName|repeatCount|dur|xlinkHref)$/.test(k) ? (k === "xlinkHref" ? "href" : k)
  : k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const Fragment = Symbol("Fragment");
const flat = (c) => c.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false && x !== true).join("");
function h(type, props, ...children) {
  props = props || {};
  if (typeof type === "function") return type({ ...props, children });
  const inner = flat([children.length ? children : props.children ?? []]);
  if (type === Fragment) return inner;
  let a = "";
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || k === "key" || v === undefined || v === null || v === false) continue;
    if (k === "style" && typeof v === "object") { a += ` style="${esc(Object.entries(v).map(([p, x]) => `${p.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}:${x}`).join(";"))}"`; continue; }
    a += ` ${attr(k)}="${esc(v)}"`;
  }
  return `<${type}${a}>${inner}</${type}>`;
}
const mod = { exports: {} };
new Function("module", "exports", "require", "h", "Fragment", js)(mod, mod.exports, () => ({}), h, Fragment);
const A = mod.exports;
const defs = A.GameArtDefs().replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
const pieces = { ekah: A.EkahArt, ludo: A.LudoArt, snakes: A.SnakesArt, chess: A.ChessArt, sudoku: A.SudokuArt, words: A.WordArt };
mkdirSync(resolve(root, "web/public/art"), { recursive: true });
for (const [id, fn] of Object.entries(pieces)) {
  if (typeof fn !== "function") { console.warn("missing", id); continue; }
  const svg = fn();
  // put the shared gradients and filters inside each picture so it stands alone
  const out = svg.replace(/^<svg([^>]*)>/, (m, at) => `<svg xmlns="http://www.w3.org/2000/svg"${at.replace(/ aria-hidden="true"/, "")}>${defs}`);
  writeFileSync(resolve(root, `web/public/art/${id}.svg`), out + "\n");
  console.log(id, out.length, "bytes");
}
