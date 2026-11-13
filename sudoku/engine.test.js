import test from "node:test";
import assert from "node:assert/strict";
import S from "./load.js";

const valid = (g) => g.every((v, i) => v >= 1 && v <= 9 && S.PEERS[i].every((p) => g[p] !== v));

for (const level of ["easy", "medium", "hard", "expert"]) {
  test(`${level}: unique solution that matches the stored answer`, () => {
    for (let k = 0; k < 6; k++) {
      const p = S.generate(level, `test-${level}-${k}`);
      assert.equal(S.countSolutions(p.puzzle, 2), 1);
      assert.deepEqual(S.solve(p.puzzle), p.solution);
      assert.ok(valid(p.solution));
      p.puzzle.forEach((v, i) => { if (v) assert.equal(v, p.solution[i]); });
      assert.ok(p.clues <= S.LEVELS[level].clues + 2);
    }
  });
}

test("easy and medium are solvable with plain logic", () => {
  for (const level of ["easy", "medium"]) for (let k = 0; k < 6; k++) assert.ok(S.solvableBySingles(S.generate(level, `logic-${k}`).puzzle));
});

test("daily puzzle is the same for everyone on a date and changes the next day", () => {
  const a = S.daily(new Date(2026, 10, 13)), b = S.daily(new Date(2026, 10, 13)), c = S.daily(new Date(2026, 10, 14));
  assert.equal(a.daily, "2026-11-13");
  assert.deepEqual(a.puzzle, b.puzzle);
  assert.notDeepEqual(a.puzzle, c.puzzle);
  assert.equal(a.level, "hard"); // Friday
  assert.equal(c.level, "hard"); // Saturday
  assert.equal(S.daily(new Date(2026, 10, 16)).level, "easy"); // Monday
});

test("conflicts and hints", () => {
  const p = S.generate("easy", "hint-test");
  const g = p.puzzle.slice();
  const empty = g.indexOf(0);
  const clash = S.PEERS[empty].find((i) => g[i]);
  g[empty] = g[clash];
  assert.ok(S.conflicts(g).has(empty));
  const h = S.hint(g, p.solution);
  assert.equal(h.cell, empty, "a wrong entry is corrected first");
  assert.equal(h.value, p.solution[empty]);
  g[empty] = 0;
  const h2 = S.hint(g, p.solution);
  assert.equal(g[h2.cell], 0);
  assert.equal(h2.value, p.solution[h2.cell]);
  assert.ok(S.candidates(g, h2.cell).includes(h2.value));
});
