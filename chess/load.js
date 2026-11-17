/* Loads the browser chess scripts (plain scripts) into Node for the tests. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
const read = (f) => readFileSync(new URL("../web/public/chess/" + f, import.meta.url), "utf8");
const ctx = { self: {}, console };
ctx.self = ctx;
vm.createContext(ctx);
for (const f of ["engine.js", "ai.js", "learn-core.js", "lessons.js"]) vm.runInContext(read(f), ctx, { filename: f });
export const Chess = ctx.RoyalChess.Chess;
export const AI = ctx.RoyalChessAI;
export const core = ctx.LearnCore;
export const LEVELS = ctx.RoyalChessLessons.LEVELS;
