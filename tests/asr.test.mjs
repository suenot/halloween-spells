import test from "node:test";
import assert from "node:assert/strict";
import { UtteranceGate } from "../public/js/engine/asr/vad-gate.js";
import { ENGINES, DEFAULT_ENGINES, engineDef } from "../public/js/engine/asr/engines.js";

const chunk = (level, ms = 100) => Float32Array.from({ length: 16 * ms }, (_, i) => (i % 2 ? level : -level));

test("gate cuts one utterance after trailing silence and keeps pre-roll", () => {
  const ends = [], ticks = [];
  const g = new UtteranceGate({ onTick: (x) => ticks.push(x.length), onEnd: (x) => ends.push(x.length), interimMs: 500, silenceMs: 300, preMs: 200 });
  for (let i = 0; i < 5; i++) g.push(chunk(0.001));
  for (let i = 0; i < 12; i++) g.push(chunk(0.2));
  assert.equal(ends.length, 0);
  assert.ok(ticks.length >= 2, "interim ticks while speaking");
  for (let i = 0; i < 4; i++) g.push(chunk(0.001));
  assert.equal(ends.length, 1);
  assert.ok(ends[0] >= 16 * (200 + 1200), "pre-roll plus speech");
});

test("gate ignores silence and force-ends very long speech", () => {
  const ends = [];
  const g = new UtteranceGate({ onTick() {}, onEnd: (x) => ends.push(x.length), maxMs: 1000 });
  for (let i = 0; i < 30; i++) g.push(chunk(0.002));
  assert.equal(ends.length, 0);
  for (let i = 0; i < 25; i++) g.push(chunk(0.3));
  assert.ok(ends.length >= 2);
});

test("engine registry is consistent", () => {
  assert.equal(new Set(ENGINES.map((e) => e.id)).size, ENGINES.length);
  assert.ok(DEFAULT_ENGINES.every((id) => engineDef(id)));
  for (const e of ENGINES.filter((x) => x.model?.kind === "sherpa")) assert.ok(e.model.files.tokens && e.model.repo && e.model.dir);
});
