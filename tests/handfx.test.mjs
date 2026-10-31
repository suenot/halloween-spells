import test from "node:test";
import assert from "node:assert/strict";
import { HandFx } from "../public/js/engine/handfx.js";
import { MOTIONS } from "../public/js/core/gestures.js";

function fakeCtx(bad) {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get: (t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => grad : typeof k === "string" && !(k in t) ? (...a) => { for (const v of a) if (typeof v === "number" && !Number.isFinite(v)) bad.push(k); } : t[k]),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

test("живые эффекты рук рисуются без NaN для всех движений и кадров", () => {
  const bad = [];
  const c = fakeCtx(bad), fx = new HandFx();
  const show = (p) => ({ x: p.x * 640, y: p.y * 480 });
  const palms = [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }];
  for (let now = 0; now < 3000; now += 33) {
    const k = (now % 1000) / 1000;
    const events = now % 500 < 33 ? [MOTIONS[Math.floor(now / 500) % MOTIONS.length]] : [];
    fx.frame(c, { W: 640, H: 480, now, color: "#ff7a1a", show, m: { events, live: { charge: k, spin: k, spread: k }, palms, size: 0.1 } });
  }
  fx.frame(c, { W: 640, H: 480, now: 4000, color: "#ff7a1a", show, m: { events: [], live: { charge: 0, spin: 0, spread: 0 }, palms: [], size: 0 } });
  assert.deepEqual(bad, []);
  assert.equal(fx.bursts.length, 0, "вспышки гаснут");
});
