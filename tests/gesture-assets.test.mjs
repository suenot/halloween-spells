import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { WAND, SEALS } from "../public/js/core/gestures.js";

const dir = new URL("../public/assets/gestures/", import.meta.url);

test("каждый жест имеет ролик демонстрации", () => {
  for (const g of SEALS) assert.ok(existsSync(new URL(`${g}.webm`, dir)), `нет ролика ${g}`);
  for (const g of WAND) assert.ok(existsSync(new URL(`w_${g}.webm`, dir)), `нет ролика w_${g}`);
});

test("у жестов палочки есть след кончика", () => {
  for (const g of WAND) {
    const t = JSON.parse(readFileSync(new URL(`w_${g}.json`, dir), "utf8"));
    assert.equal(t.tip.length, t.frames);
    assert.ok(t.trace[0] < t.trace[1] && t.trace[1] <= t.frames);
    for (const [x, y] of t.tip) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${g}: кончик вне кадра`);
  }
});
