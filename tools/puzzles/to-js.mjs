/* Turns tools/puzzles/out/puzzles.json (made by the puzzle-pick workflow) into web/public/chess/puzzles.js. */
import { readFileSync, writeFileSync } from "node:fs";
const src = JSON.parse(readFileSync(new URL("./out/puzzles.json", import.meta.url), "utf8"));
const order = { warm: 0, standard: 1, hard: 2 };
const byClass = {};
for (const [cid, list] of Object.entries(src)) {
  byClass[cid] = list
    .slice()
    .sort((a, b) => order[a.tier] - order[b.tier] || a.rating - b.rating)
    .map(({ id, fen, moves, rating, tier, url }) => ({ id, fen, moves, rating, tier, url }));
}
const body = `/* Learn Chess practice puzzles: positions from real games, from the Lichess puzzle database
   (https://database.lichess.org/#puzzles, CC0). Picked and checked with Stockfish by tools/puzzles (build time only).
   In each puzzle the first move is the opponent's; the player finds every move after it. Generated file. */
(function (root) {
  root.RoyalChessPuzzles = { source: 'Lichess puzzle database (CC0)', byClass: ${JSON.stringify(byClass)} };
})(typeof self !== 'undefined' ? self : this);
`;
writeFileSync(new URL("../../web/public/chess/puzzles.js", import.meta.url), body);
console.log(Object.entries(byClass).map(([k, v]) => `${k}:${v.length}`).join(" "));
