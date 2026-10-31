// Движения рук по ряду кадров: накопить силу, раскрутить шар, толчок, растянуть, сжать, встряхнуть.
// Чистая логика без DOM: кадры приходят от трекера рук (21 точка MediaPipe, x уже зеркальный), время в мс.
import { describeHand } from "./gestures.js";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export const MOTION_CFG = {
  chargeMs: 900,          // сколько держать кулак
  spinRad: Math.PI * 2.5, // 1.25 оборота ладонью
  spinWindow: 1700,
  pushRatio: 1.4,         // рост размера ладони за pushWindow
  pushWindow: 450,
  crushWindow: 500,
  spreadGap: 1.6,         // на сколько размеров ладони разошлись руки
  spreadWindow: 800,
  shakeWindow: 800,
  shakeReversals: 5,
  cooldown: 900,
  lostMs: 300,            // дольше без рук: забываем историю
};

// Искусственная ладонь для тестов и демонстраций: пальцы вверх, curl 0 (открыта) .. 1 (кулак).
// cx, cy: центр ладони, s: расстояние от запястья до основания среднего пальца.
export function synthHand({ cx = 0.5, cy = 0.5, s = 0.1, curl = 0, rot = 0 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const FING = [[5, -0.3, -0.95, [0.45, 0.28, 0.25]], [9, 0, -1, [0.5, 0.3, 0.27]], [13, 0.28, -0.95, [0.45, 0.28, 0.25]], [17, 0.52, -0.85, [0.35, 0.2, 0.2]]];
  lm[0] = { x: 0, y: 0, z: 0 };
  for (const [base, x, y, seg] of FING) {
    let px = x, py = y, ang = -Math.PI / 2;
    lm[base] = { x: px, y: py, z: 0 };
    seg.forEach((len, i) => {
      if (i) ang += curl * (Math.PI * 0.56);
      px += Math.cos(ang) * len; py += Math.sin(ang) * len;
      lm[base + 1 + i] = { x: px, y: py, z: 0 };
    });
  }
  const tcurl = curl * 0.9;
  lm[1] = { x: -0.3, y: -0.25, z: 0 };
  lm[2] = { x: -0.55 + 0.3 * tcurl, y: -0.5 - 0.1 * tcurl, z: 0 };
  lm[3] = { x: -0.72 + 0.5 * tcurl, y: -0.72 + 0.1 * tcurl, z: 0 };
  lm[4] = { x: -0.85 + 0.75 * tcurl, y: -0.9 + 0.3 * tcurl, z: 0 };
  const c = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + lm[i].x / 5, y: a.y + lm[i].y / 5 }), { x: 0, y: 0 });
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return lm.map((p) => {
    const x = p.x - c.x, y = p.y - c.y;
    return { x: cx + (x * cos - y * sin) * s, y: cy + (x * sin + y * cos) * s, z: 0 };
  });
}

export class MotionTracker {
  constructor(cfg = {}) {
    this.cfg = { ...MOTION_CFG, ...cfg };
    this.reset();
  }

  reset() {
    this.frames = [];
    this.fistSince = null; this.fistGap = 0; this.chargeFired = false;
    this.last = {};
    this.mark = { spin: -Infinity, push: -Infinity, spread: -Infinity, shake: -Infinity, crush: -Infinity };
    this.primary = null;
    this.seenAt = -Infinity;
  }

  // hands: массив из 21 точки; t: мс. Возвращает { events, live, palms, size }.
  push(hands, t) {
    const c = this.cfg;
    const hs = (hands ?? []).filter((x) => Array.isArray(x) && x.length >= 21).map(describeHand);
    if (!hs.length) {
      if (t - this.seenAt > c.lostMs) this.reset();
      return { events: [], live: { charge: 0, spin: 0, spread: 0 }, palms: [], size: 0 };
    }
    this.seenAt = t;
    const main = this.primary ? hs.reduce((a, b) => (dist(b.palm, this.primary) < dist(a.palm, this.primary) ? b : a)) : hs[0];
    this.primary = main.palm;
    const other = hs.find((x) => x !== main);
    const gap = other ? dist(main.palm, other.palm) / ((main.size + other.size) / 2) : null;
    const f = { t, x: main.palm.x, y: main.palm.y, size: main.size, count: main.count, gap };
    this.frames.push(f);
    while (this.frames.length && t - this.frames[0].t > 2200) this.frames.shift();

    const events = [];
    const fire = (id) => { if (t - (this.last[id] ?? -Infinity) >= c.cooldown) { this.last[id] = t; events.push(id); return true; } return false; };
    const live = { charge: 0, spin: 0, spread: 0 };

    // charge: кулак держится дольше chargeMs (короткие потери кадров прощаем)
    if (f.count <= 1) { this.fistSince ??= t; this.fistGap = 0; }
    else if (this.fistSince !== null && (this.fistGap += 1) > 4) { this.fistSince = null; this.chargeFired = false; }
    if (this.fistSince !== null) {
      live.charge = clamp((t - this.fistSince) / c.chargeMs);
      if (live.charge >= 1 && !this.chargeFired) { this.chargeFired = true; fire("charge"); }
    }

    // spin: ладонь описывает круги около одной точки
    const sp = this.frames.filter((x) => t - x.t <= c.spinWindow && x.t > this.mark.spin);
    if (sp.length >= 12) {
      const cx = sp.reduce((a, x) => a + x.x, 0) / sp.length, cy = sp.reduce((a, x) => a + x.y, 0) / sp.length;
      const radius = sp.reduce((a, x) => a + Math.hypot(x.x - cx, x.y - cy), 0) / sp.length;
      if (radius > 0.015 && radius < 0.25) {
        let swept = 0, prev = Math.atan2(sp[0].y - cy, sp[0].x - cx);
        for (let i = 1; i < sp.length; i++) {
          const a = Math.atan2(sp[i].y - cy, sp[i].x - cx);
          let d = a - prev;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          swept += d; prev = a;
        }
        live.spin = clamp(Math.abs(swept) / c.spinRad);
        if (live.spin >= 1 && fire("spin")) this.mark.spin = t;
      }
    }

    // push: ладонь резко приближается к камере и растет в кадре
    const pw = this.frames.filter((x) => t - x.t <= c.pushWindow && x.t > this.mark.push);
    if (pw.length >= 3) {
      const min = pw.reduce((a, x) => (x.size < a.size ? x : a), pw[0]);
      if (min !== pw[pw.length - 1] && f.size / min.size >= c.pushRatio && fire("push")) this.mark.push = t;
    }

    // crush: открытая ладонь быстро становится кулаком
    const cw = this.frames.filter((x) => t - x.t <= c.crushWindow && x.t > this.mark.crush);
    if (f.count <= 1 && cw.filter((x) => x.count >= 4).length >= 2 && fire("crush")) this.mark.crush = t;

    // spread: две руки быстро расходятся
    const gw = this.frames.filter((x) => t - x.t <= c.spreadWindow && x.gap !== null && x.t > this.mark.spread);
    if (gap !== null && gw.length >= 3) {
      const gMin = Math.min(...gw.map((x) => x.gap));
      live.spread = clamp((gap - gMin) / c.spreadGap);
      if (live.spread >= 1 && fire("spread")) this.mark.spread = t;
    }

    // shake: частая дрожь рукой по одной линии
    const kw = this.frames.filter((x) => t - x.t <= c.shakeWindow && x.t > this.mark.shake);
    if (kw.length >= 10) {
      const rx = Math.max(...kw.map((x) => x.x)) - Math.min(...kw.map((x) => x.x));
      const ry = Math.max(...kw.map((x) => x.y)) - Math.min(...kw.map((x) => x.y));
      const axis = rx >= ry ? "x" : "y";
      const range = Math.max(rx, ry);
      if (range >= 0.012 && range < 0.2) {
        let rev = 0, dir = 0, anchor = kw[0][axis];
        const step = Math.max(0.006, range * 0.3);
        for (const x of kw) {
          const d = x[axis] - anchor;
          if (Math.abs(d) >= step) { const nd = Math.sign(d); if (dir && nd !== dir) rev++; dir = nd; anchor = x[axis]; }
        }
        if (rev >= c.shakeReversals && fire("shake")) this.mark.shake = t;
      }
    }

    return { events, live, palms: other ? [main.palm, other.palm] : [main.palm], size: main.size };
  }
}
