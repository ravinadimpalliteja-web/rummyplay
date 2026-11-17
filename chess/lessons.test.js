/* Checks every Learn Chess class: positions are legal, every answer is a legal move, mates really are mates,
   puzzle answers are the only winning moves, and "goal" boards can be finished in the stated number of moves.
   Run: node --test chess/  (the uniqueness search takes a minute or two). */
import test from "node:test";
import assert from "node:assert/strict";
import { Chess, AI, core, LEVELS } from "./load.js";

const strip = (san) => san.replace(/[+#]/g, "");
const ALL = LEVELS.flatMap((lv) => lv.classes.map((c) => ({ ...c, level: lv.n })));

function mateIn(g, n) {
  for (const m of g.moves()) {
    g.move(m.san);
    const st = g.status();
    let ok;
    if (st.over) ok = st.reason === "checkmate";
    else if (n === 1) ok = false;
    else {
      ok = true;
      for (const r of g.moves()) { g.move(r.san); const sub = !g.status().over && mateIn(g, n - 1); g.undo(); if (!sub) { ok = false; break; } }
    }
    g.undo();
    if (ok) return true;
  }
  return false;
}
/** Does this first move force mate within n moves (counting itself)? */
function forcesMate(g, san, n) {
  g.move(san);
  const st = g.status();
  let ok;
  if (st.over) ok = st.reason === "checkmate";
  else if (n === 1) ok = false;
  else {
    ok = true;
    for (const r of g.moves()) { g.move(r.san); const sub = !g.status().over && mateIn(g, n - 1); g.undo(); if (!sub) { ok = false; break; } }
  }
  g.undo();
  return ok;
}
function score(g, san) {
  g.move(san);
  const st = g.status();
  const s = st.over ? (st.reason === "checkmate" ? 100000 : 0) : -AI.bestMove(g.fen(), "hard", { depth: 4, timeMs: 6000, noise: 0 }).score;
  g.undo();
  return s;
}
function placementOk(fen) {
  const rows = String(fen).split(" ")[0].split("/");
  assert.equal(rows.length, 8, "8 ranks");
  for (const r of rows) assert.equal([...r].reduce((a, ch) => a + (/\d/.test(ch) ? Number(ch) : 1), 0), 8, `rank "${r}" has 8 squares`);
}

test("52 classes, unique ids, numbered in order, first three free", () => {
  assert.ok(ALL.length >= 50);
  assert.equal(new Set(ALL.map((c) => c.id)).size, ALL.length);
  ALL.forEach((c, i) => assert.equal(c.n, i + 1, c.id));
  assert.equal(ALL.filter((c) => c.free).map((c) => c.n).join(), "1,2,3");
  for (const c of ALL) { assert.ok(!c.soon, c.id); assert.ok(c.steps.length >= 3, c.id); }
});

for (const c of ALL) {
  test(`class ${c.n} ${c.id}`, () => {
    c.steps.forEach((s, i) => {
      const where = `${c.id} step ${i + 1} (${s.kind})`;
      assert.ok(s.text && s.text.length > 3, where + " text");
      if (s.fen) placementOk(s.fen);
      if (s.kind === "quiz") {
        assert.ok(Array.isArray(s.options) && s.options.length >= 2, where);
        assert.ok(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < s.options.length, where);
      } else if (s.kind === "tap") {
        assert.match(s.answer, /^[a-h][1-8]$/, where);
      } else if (s.kind === "goal") {
        assert.equal(core.solve(s.fen, s.stars || []), s.par, where + " par");
      } else if (s.kind === "play") {
        const g = new Chess(s.fen);
        assert.equal(g.status().over, false, where);
        assert.ok(s.par > 0, where);
      } else if (s.kind === "move") {
        const g = new Chess(s.fen);
        const other = new Chess(s.fen.replace(/ [wb] /, (m) => (m === " w " ? " b " : " w ")));
        assert.equal(other.inCheck(), false, where + ": side not to move is in check");
        for (const p of s.pre || []) assert.ok(g.move(p), `${where}: pre move ${p}`);
        assert.equal(g.status().over, false, where + " game over before the step");
        const legal = g.moves().map((m) => m.san);
        if (s.accept === "mate") {
          assert.ok(legal.some((m) => m.endsWith("#")), where + ": no mate in 1");
        } else if (s.accept === "any") {
          assert.ok(legal.length > 0, where);
        } else {
          for (const a of s.accept) assert.ok(legal.map(strip).includes(a), `${where}: ${a} is not legal (${legal.join(" ")})`);
          if (s.mate) {
            for (const a of s.accept) assert.ok(forcesMate(g, a, s.mate), `${where}: ${a} does not mate in ${s.mate}`);
            if (!s.theory) {
              const extra = legal.map(strip).filter((m) => !s.accept.includes(m) && forcesMate(g, m, s.mate));
              assert.equal(extra.length, 0, `${where}: other moves also mate in ${s.mate}: ${extra.join(" ")}`);
            }
          } else if (!s.theory && c.level >= 2) {
            const sc = legal.map(strip).map((m) => ({ m, s: score(g, m) }));
            const good = Math.min(...sc.filter((x) => s.accept.includes(x.m)).map((x) => x.s));
            const rest = sc.filter((x) => !s.accept.includes(x.m));
            const bestOther = rest.length ? Math.max(...rest.map((x) => x.s)) : -Infinity;
            assert.ok(good >= bestOther + 100, `${where}: accepted ${s.accept} scores ${good}, but ${rest.sort((a, b) => b.s - a.s)[0]?.m} scores ${bestOther}`);
          }
        }
      }
    });
  });
}
