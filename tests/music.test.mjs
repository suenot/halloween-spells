import test from "node:test";
import assert from "node:assert/strict";
import { MOODS, STEPS_PER_BAR, stepEvents, chordMidis, mulberry32, hashString, stepSeconds } from "../public/js/core/music.js";

const VOICES = new Set(["pad", "bass", "bell", "kick", "snare", "hat", "stab"]);

test("все настроения дают валидные события без NaN", () => {
  for (const mood of Object.keys(MOODS)) {
    const rng = mulberry32(1), mem = {};
    for (let s = 0; s < STEPS_PER_BAR * 8; s++) {
      for (const e of stepEvents(mood, s, rng, mem)) {
        assert.ok(VOICES.has(e.v), `${mood}: голос ${e.v}`);
        assert.ok(e.vel > 0 && e.vel <= 1);
        if (e.midi != null) assert.ok(e.midi >= 20 && e.midi <= 110, `${mood}: midi ${e.midi}`);
      }
    }
    assert.ok(stepSeconds(mood) > 0);
  }
});

test("музыка детерминирована для одного seed", () => {
  const run = () => { const r = mulberry32(42), m = {}; return Array.from({ length: 64 }, (_, s) => stepEvents("menu", s, r, m)); };
  assert.deepEqual(run(), run());
});

test("в каждом такте есть аккорд из трех нот, а у боевых настроений бочка", () => {
  for (const mood of Object.keys(MOODS)) for (let b = 0; b < 8; b++) assert.equal(chordMidis(mood, b).length, 3);
  const fight = stepEvents("fight", 0, mulberry32(3), {});
  assert.ok(fight.some((e) => e.v === "kick"));
});

test("hashString разный для разных id", () => {
  assert.notEqual(hashString("expelliarmus"), hashString("lumos"));
});
