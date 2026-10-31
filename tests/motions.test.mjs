import test from "node:test";
import assert from "node:assert/strict";
import { MotionTracker, synthHand } from "../public/js/core/motions.js";
import { describeHand, MOTIONS, gestureKind } from "../public/js/core/gestures.js";

const DT = 33;
// frames: функция (мс) -> массив рук
function run(ms, make, tracker = new MotionTracker(), from = 0) {
  const seen = [];
  let last;
  for (let t = from; t <= from + ms; t += DT) {
    last = tracker.push(make(t - from), t);
    for (const e of last.events) seen.push([e, t - from]);
  }
  return { seen, last, tracker };
}
const ids = (r) => r.seen.map(([e]) => e);

test("искусственная ладонь читается как задумано", () => {
  assert.equal(describeHand(synthHand({ curl: 0 })).count, 4);
  assert.equal(describeHand(synthHand({ curl: 1 })).count, 0);
  const s = synthHand({ s: 0.12 });
  assert.ok(Math.abs(describeHand(s).size - 0.12) < 1e-6);
});

test("charge: кулак держится, событие один раз", () => {
  const r = run(1800, () => [synthHand({ curl: 1 })]);
  assert.deepEqual(ids(r), ["charge"]);
  assert.ok(r.seen[0][1] >= 850 && r.seen[0][1] <= 1000, `в ${r.seen[0][1]} мс`);
  assert.equal(r.last.live.charge, 1);
});

test("charge: открытая ладонь не копит силу", () => {
  const r = run(2000, () => [synthHand({ curl: 0 })]);
  assert.deepEqual(ids(r), []);
  assert.equal(r.last.live.charge, 0);
});

test("charge: живой прогресс растет", () => {
  const r = run(450, () => [synthHand({ curl: 1 })]);
  assert.ok(r.last.live.charge > 0.4 && r.last.live.charge < 0.6);
});

test("spin: круги ладонью", () => {
  const r = run(1600, (t) => [synthHand({ cx: 0.5 + 0.06 * Math.cos(t / 190), cy: 0.5 + 0.06 * Math.sin(t / 190), curl: 0.5 })]);
  assert.ok(ids(r).includes("spin"), ids(r).join());
});

test("spin: прямое движение и дрожь не считаются кругом", () => {
  const line = run(1600, (t) => [synthHand({ cx: 0.2 + t / 3000, cy: 0.5, curl: 0.5 })]);
  assert.ok(!ids(line).includes("spin"));
  const wobble = run(1600, (t) => [synthHand({ cx: 0.5 + 0.03 * Math.sin(t / 40), cy: 0.5, curl: 1 })]);
  assert.ok(!ids(wobble).includes("spin"));
});

test("push: ладонь быстро вырастает в кадре", () => {
  const r = run(600, (t) => [synthHand({ s: t < 200 ? 0.08 : Math.min(0.14, 0.08 + (t - 200) * 0.0002) })]);
  assert.ok(ids(r).includes("push"), ids(r).join());
});

test("push: медленное приближение не считается толчком", () => {
  const r = run(3000, (t) => [synthHand({ s: 0.08 + t * 0.00002 })]);
  assert.ok(!ids(r).includes("push"));
});

test("crush: ладонь превращается в кулак", () => {
  const r = run(1000, (t) => [synthHand({ curl: t < 400 ? 0 : Math.min(1, (t - 400) / 150) })]);
  assert.ok(ids(r).includes("crush"), ids(r).join());
});

test("crush: ладонь без изменений не срабатывает", () => {
  assert.ok(!ids(run(1500, () => [synthHand({ curl: 0 })])).includes("crush"));
});

test("spread: две руки расходятся", () => {
  const r = run(1200, (t) => {
    const d = t < 300 ? 0.1 : Math.min(0.45, 0.1 + (t - 300) * 0.0007);
    return [synthHand({ cx: 0.5 - d, curl: 0 }), synthHand({ cx: 0.5 + d, curl: 0 })];
  });
  assert.ok(ids(r).includes("spread"), ids(r).join());
});

test("spread: руки стоят на месте", () => {
  const r = run(1500, () => [synthHand({ cx: 0.3 }), synthHand({ cx: 0.7 })]);
  assert.ok(!ids(r).includes("spread"));
});

test("shake: быстрая дрожь", () => {
  const r = run(1000, (t) => [synthHand({ cx: 0.5 + 0.03 * Math.sin(t / 40), curl: 1 })]);
  assert.ok(ids(r).includes("shake"), ids(r).join());
});

test("shake: спокойная рука и большой взмах не считаются дрожью", () => {
  assert.ok(!ids(run(1500, () => [synthHand({ cx: 0.5, curl: 1 })])).includes("shake"));
  assert.ok(!ids(run(1500, (t) => [synthHand({ cx: 0.5 + 0.3 * Math.sin(t / 400) })])).includes("shake"));
});

test("потеря рук забывает историю, пустой кадр не падает", () => {
  const t = new MotionTracker();
  run(500, () => [synthHand({ curl: 1 })], t);
  const gone = t.push([], 2000);
  assert.deepEqual(gone.events, []);
  assert.equal(t.fistSince, null);
  assert.deepEqual(t.push(undefined, 2100).palms, []);
});

test("все движения известны движку жестов", () => {
  assert.equal(MOTIONS.length, 6);
  for (const m of MOTIONS) assert.equal(gestureKind(m), "motion");
});
