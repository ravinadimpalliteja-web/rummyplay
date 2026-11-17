/* Checks every Learn Sudoku lesson: each answer matches the puzzle's real solution, tapped squares are the only
   place for their number, quiz answers exist, and the advanced lessons' eliminations are correct. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import S from "./load.js";

const NEW = new Set(["start", "speed", "mistakes", "tips", "boxline", "ntriple", "htriple", "xwing", "swordfish", "skyscraper", "kite", "xywing", "xyzwing", "ur", "order", "final"]);
const html = readFileSync(new URL("../web/public/sudoku/learn.html", import.meta.url), "utf8");
let src = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
assert.ok(src.includes("  renderHome();\n  const want"), "learn.html start-up line moved: update this test");
src = src.replace("  renderHome();\n  const want", "  globalThis.__L = L; return;\n  const want");
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()), apply: () => stub(), set: () => true });
const ctx = { document: stub(), localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { search: "" }, URLSearchParams, console };
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const L = ctx.__L;
const R = (i) => Math.floor(i / 9), C = (i) => i % 9, B = (i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
const sees = (a, b) => a !== b && (R(a) === R(b) || C(a) === C(b) || B(a) === B(b));
const cands = (g, i) => g[i] ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !g.some((v, j) => v === d && sees(i, j)));
/* All solutions of a position (up to a limit). The older lessons show positions cut from puzzles, which can have
   more than one completion; a square counts as known when every completion agrees on it. */
function allSolutions(g, limit = 500) {
  const out = [], w = g.slice();
  (function go() {
    if (out.length >= limit) return;
    let best = -1, bc = null;
    for (let i = 0; i < 81; i++) if (!w[i]) { const c = cands(w, i); if (!c.length) return; if (!bc || c.length < bc.length) { best = i; bc = c; } }
    if (best < 0) { out.push(w.slice()); return; }
    for (const d of bc) { w[best] = d; go(); w[best] = 0; }
  })();
  return out;
}
const solCache = new Map();
const solution = (gs) => {
  if (!solCache.has(gs)) {
    const sols = allSolutions(gs.split("").map(Number));
    assert.ok(sols.length >= 1, "position is solvable");
    solCache.set(gs, sols[0].map((v, i) => (sols.every((x) => x[i] === v) ? v : -1)));
  }
  return solCache.get(gs);
};

test("25 lessons with unique ids", () => {
  assert.equal(L.length, 25);
  assert.equal(new Set(L.map((l) => l.id)).size, 25);
  L.forEach((l, i) => assert.equal(l.n, i + 1));
});

for (const l of L) {
  test(`lesson ${l.n} ${l.id}`, () => {
    assert.ok(l.steps.length >= 3);
    l.steps.forEach((st, k) => {
      const where = `${l.id} step ${k + 1} (${st.k})`;
      assert.match(st.g, /^\d{81}$/, where);
      const g = st.g.split("").map(Number), sol = solution(st.g);
      if (NEW.has(l.id)) assert.equal(S.countSolutions(g, 2), 1, where + ": new lessons use positions with one solution");
      g.forEach((v, i) => { if (v) assert.equal(v, sol[i], where + " givens match the solution"); });
      for (const [i, ds] of Object.entries(st.n || {})) {
        assert.equal(g[+i], 0, where + " notes on a filled square");
        if (sol[+i] > 0) assert.ok(ds.includes(sol[+i]), `${where}: notes on ${i} miss the real answer`);
        for (const d of ds) assert.ok(cands(g, +i).includes(d), `${where}: note ${d} on ${i} is impossible`);
      }
      for (const [i, ds] of Object.entries(st.x || {})) for (const d of ds) assert.notEqual(sol[+i], d, `${where}: crossed-out ${d} on ${i} is the answer`);
      if (st.k === "digit") {
        assert.equal(g[st.cell], 0, where);
        assert.equal(st.ans, sol[st.cell], where + " answer");
        const left = (st.n && st.n[st.cell]) ? st.n[st.cell].filter((d) => !((st.x || {})[st.cell] || []).includes(d)) : null;
        if (left && st.x && st.x[st.cell]) assert.deepEqual([...left], [st.ans], where + " one note left after crossing out");
      } else if (st.k === "cell") {
        assert.equal(g[st.ans], 0, where);
        assert.equal(sol[st.ans], st.digit, where + " tapped square holds the digit");
      } else if (st.k === "quiz") {
        assert.ok(st.ans >= 0 && st.ans < st.opts.length, where);
        assert.equal(new Set(st.opts).size, st.opts.length, where + " options are different");
      }
    });
  });
}
