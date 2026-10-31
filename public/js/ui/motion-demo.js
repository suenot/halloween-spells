// Демонстрация движений рук: искусственная ладонь выполняет движение, а то же самое распознавание (MotionTracker)
// и те же живые эффекты (HandFx), что в игре, рисуют результат. Так показ и проверка не расходятся.
import { MotionTracker, synthHand } from "../core/motions.js";
import { HandFx } from "../engine/handfx.js";

const trem = (t, a = 0.003) => a * Math.sin(t / 53);
const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// t в мс от начала цикла -> руки (опции synthHand)
export const SCENES = {
  charge: { dur: 2800, hands: (t) => [{ cx: 0.5 + trem(t), cy: 0.56, s: 0.17, curl: ramp(t, 200, 600) }] },
  spin: { dur: 3000, hands: (t) => { const a = Math.max(0, t - 300) / 170; return [{ cx: 0.5 + 0.07 * Math.cos(a), cy: 0.55 + 0.07 * Math.sin(a), s: 0.15, curl: 0.4 }]; } },
  push: { dur: 2400, hands: (t) => [{ cx: 0.5, cy: 0.55, s: 0.12 + 0.09 * ramp(t, 800, 1050), curl: 0 }] },
  spread: { dur: 2800, hands: (t) => { const d = 0.08 + 0.3 * ramp(t, 800, 1400); return [{ cx: 0.5 - d, cy: 0.55, s: 0.14, curl: 0.8, rot: 0.5 }, { cx: 0.5 + d, cy: 0.55, s: 0.14, curl: 0.8, rot: -0.5 }]; } },
  crush: { dur: 2400, hands: (t) => [{ cx: 0.5, cy: 0.55, s: 0.16, curl: ramp(t, 900, 1100) }] },
  shake: { dur: 2600, hands: (t) => [{ cx: 0.5 + (t > 400 && t < 1700 ? 0.028 * Math.sin(t / 45) : 0), cy: 0.56, s: 0.17, curl: 1 }] },
};

function drawHand(c, lm, W, H, color) {
  const P = (i) => [lm[i].x * W, lm[i].y * H];
  const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) * W;
  c.save(); c.lineCap = "round"; c.lineJoin = "round";
  c.fillStyle = "rgba(255,218,190,.88)"; c.shadowColor = color; c.shadowBlur = 18;
  c.beginPath(); [0, 1, 5, 9, 13, 17].forEach((i, k) => { const [x, y] = P(i); k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fill();
  c.strokeStyle = "rgba(255,218,190,.88)"; c.lineWidth = size * 0.3; c.stroke();
  c.strokeStyle = "rgba(255,218,190,.95)"; c.lineWidth = size * 0.2;
  for (const chain of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
    c.beginPath(); chain.forEach((i, k) => { const [x, y] = P(i); k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
  }
  c.shadowBlur = 0; c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2;
  for (const i of [4, 8, 12, 16, 20]) { const [x, y] = P(i); c.beginPath(); c.arc(x, y, size * 0.07, 0, 6.283); c.stroke(); }
  c.restore();
}

/** once: сыграть один раз и поставить done (для цепочки шагов); иначе повторять. */
export function createMotionDemo(id, { color = "#ffb84a", once = false } = {}) {
  const scene = SCENES[id];
  const tracker = new MotionTracker();
  const fx = new HandFx();
  let t0 = null;
  const demo = {
    done: false,
    draw(c, W, H, now = performance.now()) {
      if (t0 === null) t0 = now;
      let t = now - t0;
      if (t > scene.dur) {
        if (once) { demo.done = true; return; }
        t0 = now; t = 0; tracker.reset(); fx.bursts.length = 0;
      }
      const hands = scene.hands(t).map(synthHand);
      const m = tracker.push(hands, now);
      for (const lm of hands) drawHand(c, lm, W, H, color);
      fx.frame(c, { W, H, now, color, m, show: (p) => ({ x: p.x * W, y: p.y * H }) });
    },
  };
  return demo;
}
