import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FX_PRIMITIVES, drawFx } from "../public/js/engine/spellfx.js";

const spells = JSON.parse(readFileSync(new URL("../data/spells.json", import.meta.url), "utf8"));

test("у каждого заклинания свой герой-эффект", () => {
  const heroes = spells.map((s) => s.fx?.[0]?.p);
  assert.ok(heroes.every(Boolean), "у всех есть fx");
  assert.equal(new Set(heroes).size, spells.length, `повторы: ${heroes.filter((h, i) => heroes.indexOf(h) !== i)}`);
});

test("все слои fx известны движку", () => {
  for (const s of spells) for (const l of s.fx) assert.ok(FX_PRIMITIVES.includes(l.p), `${s.id}: нет примитива ${l.p}`);
});

test("кадры эффектов рисуются без ошибок и NaN", () => {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => grad : typeof k === "string" && !(k in t) ? (...a) => { for (const v of a) if (typeof v === "number" && Number.isNaN(v)) calls.push(k); } : t[k]),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  for (const s of spells) for (let k = 0; k <= 1; k += 0.1) drawFx(ctx, s.fx, k, { W: 320, H: 240, color: s.color, power: s.power });
  assert.deepEqual(calls, []);
});
