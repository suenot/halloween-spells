import test from "node:test";
import assert from "node:assert/strict";
import { classifyTrace, classifyPose, matchSequence } from "../public/js/core/gestures.js";

const circle = Array.from({ length: 40 }, (_, i) => {
  const a = (i / 40) * 2 * Math.PI;
  return { x: 0.5 + 0.15 * Math.cos(a), y: 0.5 + 0.15 * Math.sin(a), t: i * 30 };
});
const line = (dx, dy) => Array.from({ length: 20 }, (_, i) => ({ x: 0.3 + (dx * i) / 19, y: 0.5 + (dy * i) / 19, t: i * 30 }));

test("trace shapes", () => {
  assert.equal(classifyTrace(circle).id, "circle");
  assert.equal(classifyTrace(line(0.4, 0)).id, "swipe_right");
  assert.equal(classifyTrace(line(-0.4, 0)).id, "swipe_left");
  assert.equal(classifyTrace(line(0, -0.4)).id, "up");
  assert.equal(classifyTrace(line(0, 0.4)).id, "down");
  const zig = Array.from({ length: 40 }, (_, i) => ({ x: 0.5 + 0.12 * Math.sign(Math.sin(i / 3)), y: 0.3 + i * 0.01, t: i }));
  assert.equal(classifyTrace(zig).id, "zigzag");
});

test("trace noise and too few points give null", () => {
  assert.equal(classifyTrace([]).id, null);
  assert.equal(classifyTrace(undefined).id, null);
  const still = Array.from({ length: 20 }, (_, i) => ({ x: 0.5 + (i % 2) * 0.001, y: 0.5, t: i }));
  assert.equal(classifyTrace(still).id, null);
});

// synthetic hand pointing up; flags = which of [index, middle, ring, pinky] are extended
function hand(flags, cx, cy, s = 0.1) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const xs = [-1.5, -0.5, 0.5, 1.5].map((k) => cx + k * s * 0.3);
  const mcps = [5, 9, 13, 17];
  const pips = [6, 10, 14, 18];
  const tips = [8, 12, 16, 20];
  for (let f = 0; f < 4; f++) {
    lm[mcps[f]] = { x: xs[f], y: cy - s, z: 0 };
    lm[pips[f]] = { x: xs[f], y: cy - 1.5 * s, z: 0 };
    lm[tips[f]] = { x: xs[f], y: cy - (flags[f] ? 2.2 * s : 0.9 * s), z: 0 };
  }
  return lm;
}

test("poses", () => {
  const open = [true, true, true, true];
  const fist = [false, false, false, false];
  assert.equal(classifyPose([hand(open, 0.45, 0.6), hand(open, 0.55, 0.6)]).id, "prayer");
  assert.equal(classifyPose([hand(fist, 0.4, 0.6), hand(open, 0.55, 0.6)]).id, "fist_palm");
  assert.equal(classifyPose([hand(fist, 0.45, 0.6), hand(fist, 0.55, 0.6)]).id, "double_fist");
  assert.equal(classifyPose([hand(open, 0.2, 0.6), hand(open, 0.8, 0.6)]).id, "open_hands");
  assert.equal(classifyPose([hand([true, true, false, false], 0.5, 0.6)]).id, "peace");
  assert.equal(classifyPose([]).id, null);
  assert.equal(classifyPose([hand([true, false, true, false], 0.5, 0.6)]).id, null);
});

test("matchSequence", () => {
  assert.equal(matchSequence(["a", "b"], ["x", "a", "b"]), 1);
  assert.equal(matchSequence(["a", "b"], ["b", "a"]), 0.5);
  assert.equal(matchSequence([], ["a"]), 0);
});
