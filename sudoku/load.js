/* Loads the browser Sudoku engine (a plain script) into Node for the tests. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("../web/public/sudoku/engine.js", import.meta.url), "utf8");
const module = { exports: {} };
vm.runInNewContext(src, { module, globalThis: {} });
export default module.exports;
