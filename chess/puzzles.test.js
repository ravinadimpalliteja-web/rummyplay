/* Checks every Learn Chess practice puzzle with the app's own chess rules: the setup move and every
   solution move are legal, the player always has the move after the setup, and mate puzzles end in mate. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Chess, LEVELS } from "./load.js";

const ctx = { self: {} }; ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../web/public/chess/puzzles.js", import.meta.url), "utf8"), ctx);
const byClass = ctx.RoyalChessPuzzles.byClass;
const ids = new Set(LEVELS.flatMap((l) => l.classes.map((c) => c.id)));
const MATE = new Set(["backrank", "mate2"]);

test("puzzle sets belong to real classes, 15 each, no repeats", () => {
  const seen = new Set();
  for (const [cid, list] of Object.entries(byClass)) {
    assert.ok(ids.has(cid), cid);
    assert.equal(list.length, 15, cid);
    for (const p of list) { assert.ok(!seen.has(p.id), p.id); seen.add(p.id); }
    assert.deepEqual(list.map((p) => p.tier).join(), "warm,warm,warm,warm,warm,standard,standard,standard,standard,standard,hard,hard,hard,hard,hard");
  }
});

for (const [cid, list] of Object.entries(byClass)) {
  test(`puzzles for ${cid}`, () => {
    for (const p of list) {
      const g = new Chess(p.fen);
      assert.ok(p.moves.length >= 2 && p.moves.length % 2 === 0, `${p.id}: setup move + player/reply pairs`);
      p.moves.forEach((u, i) => {
        if (u[4]) assert.equal(u[4], "q", `${p.id}: only queen promotions (the board promotes to a queen)`);
        const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        assert.ok(mv, `${p.id}: move ${i + 1} ${u} is illegal`);
      });
      if (MATE.has(cid)) assert.equal(g.status().reason, "checkmate", `${p.id}: should end in mate`);
      assert.match(p.url, /^https:\/\/lichess\.org\//);
    }
  });
}
