import test from "node:test";
import assert from "node:assert/strict";
import { rgbToHsv, matchesColor, tipFromMask, hueDistance } from "../public/js/engine/wand.js";

test("rgbToHsv basics", () => {
  const red = rgbToHsv(255, 0, 0);
  assert.equal(red.h, 0); assert.equal(red.s, 1); assert.equal(red.v, 1);
  assert.ok(Math.abs(rgbToHsv(0, 255, 0).h - 1 / 3) < 1e-9);
  assert.equal(rgbToHsv(0, 0, 0).s, 0);
});

test("hue wraps around", () => assert.ok(hueDistance(0.98, 0.02) < 0.05));

test("matchesColor: coloured wand tolerates brightness, rejects other hue", () => {
  const calib = { ...rgbToHsv(200, 60, 30), tol: 0.06 };
  assert.ok(matchesColor(rgbToHsv(160, 48, 24), calib));
  assert.ok(!matchesColor(rgbToHsv(30, 60, 200), calib));
  assert.ok(!matchesColor(rgbToHsv(120, 120, 120), calib));
});

test("tipFromMask: farthest from wrist, null for tiny blobs", () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ x: 0.5, y: 0.9 - i * 0.03 }));
  assert.deepEqual(tipFromMask(pts, { x: 0.5, y: 1 }), { x: 0.5, y: 0.9 - 19 * 0.03 });
  assert.equal(tipFromMask(pts.slice(0, 3), null), null);
});
