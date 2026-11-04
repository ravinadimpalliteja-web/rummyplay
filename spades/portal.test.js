import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("portal inline JavaScript parses without syntax errors", () => {
  const html = readFileSync(new URL("../portal/index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, "portal should contain its game script");
  for (const match of scripts) {
    assert.doesNotThrow(() => new Function(match[1]));
  }
});
