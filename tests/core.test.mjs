import test from "node:test";
import assert from "node:assert/strict";
import { similarity, bestSimilarity } from "../public/js/core/fuzzy.js";
import { scoreAttempt } from "../public/js/core/scoring.js";
import { splitTeams } from "../public/js/core/teams.js";

test("similarity tolerates small speech errors", () => {
  assert.ok(similarity("Экспеллиармус", "экспелиармус") > 0.85);
  assert.equal(similarity("", "x"), 0);
  assert.equal(similarity("Ёлка", "елка"), 1);
  assert.equal(similarity("экспекто патронум", "экспектопатронум"), 1);
});

test("bestSimilarity finds phrase inside longer speech", () => {
  assert.ok(bestSimilarity("ну давай люмос максима", "люмос максима") > 0.95);
  assert.equal(bestSimilarity(undefined, "люмос"), 0);
});

test("scoreAttempt multiplies by difficulty, never NaN", () => {
  const r = scoreAttempt({ phraseSim: 1, gestureOk: 1, difficulty: 5, lenient: true });
  assert.equal(r.total, 200);
  assert.equal(r.success, true);
  const bad = scoreAttempt({ phraseSim: NaN, gestureOk: undefined, difficulty: 99 });
  assert.equal(bad.total, 0);
  assert.equal(bad.success, false);
});

test("lenient threshold is lower than strict", () => {
  const args = { phraseSim: 0.6, gestureOk: 0.6, difficulty: 1 };
  assert.equal(scoreAttempt({ ...args, lenient: true }).success, true);
  assert.equal(scoreAttempt({ ...args, lenient: false }).success, false);
});

test("splitTeams by gender, odd count, empty", () => {
  const ps = [
    { id: "1", gender: "f" }, { id: "2", gender: "f" }, { id: "3", gender: "m" },
  ];
  const g = splitTeams(ps, { by: "gender" });
  assert.deepEqual(g.teams[0].playerIds, ["1", "2"]);
  assert.deepEqual(g.teams[1].playerIds, ["3"]);
  const r = splitTeams([{ id: "a" }, { id: "b" }, { id: "c" }], { rng: () => 0.5 });
  assert.equal(r.teams[0].playerIds.length + r.teams[1].playerIds.length, 3);
  assert.ok(splitTeams([]).warning);
  assert.ok(splitTeams([{ id: "x" }]).warning);
});
