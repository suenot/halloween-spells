// Живая магия над руками игрока: шар в ладони растет по мере движения, по событию движения вспыхивает разряд.
// frame() рисует один кадр по результату MotionTracker.push() и ничего не знает о камере.
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const R = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + 1.7) * 43758.5453; return x - Math.floor(x); };
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(a)})`; };
const lighten = (hex, t) => "#" + rgb(hex).map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");

function glow(c, x, y, r, hex, a = 1) {
  if (!(r > 0) || !(a > 0)) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hex, a)); g.addColorStop(1, rgba(hex, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
function ring(c, x, y, r, hex, w, a) {
  if (!(r > 0) || !(a > 0)) return;
  c.strokeStyle = rgba(hex, a); c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
}
function orb(c, x, y, r, hex, now, energy) {
  glow(c, x, y, r * 2.2, hex, 0.25 * energy);
  glow(c, x, y, r, hex, 0.55);
  glow(c, x, y, r * 0.4, "#ffffff", 0.55);
  c.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a0 = now / (260 - 60 * energy) + (i * TAU) / 3;
    c.strokeStyle = rgba(lighten(hex, 0.6), 0.55); c.lineWidth = Math.max(1.5, r * 0.07);
    c.beginPath(); c.arc(x, y, r * (0.7 + 0.18 * i), a0, a0 + 1.5); c.stroke();
  }
}

const LIFE = { push: 700, crush: 650, shake: 550, charge: 800, spin: 800, spread: 800 };

export class HandFx {
  constructor() { this.bursts = []; }

  // m: результат MotionTracker.push; show: нормализованная точка -> пиксели холста
  frame(c, { W, H, now, color, m, show }) {
    const base = Math.max(14, (m.size || 0.1) * H * 0.9);
    const [p0, p1] = m.palms.map(show);
    for (const id of m.events) if (p0) this.bursts.push({ id, t0: now, x: p0.x, y: p0.y, x1: p1?.x, y1: p1?.y, base });
    c.save(); c.globalCompositeOperation = "lighter";
    if (p0) {
      const { charge, spin, spread } = m.live;
      if (charge > 0) {
        for (let i = 0; i < 26; i++) { // искры стекаются в ладонь
          const ph = (now / 650 + R(i)) % 1, a = R(i, 1) * TAU + now / 1100, rad = (1 - ph) * base * (1.6 + 1.6 * charge);
          glow(c, p0.x + Math.cos(a) * rad, p0.y + Math.sin(a) * rad, 2 + base * 0.05, lighten(color, 0.4), 0.2 + 0.7 * ph * charge);
        }
        orb(c, p0.x, p0.y, base * (0.2 + 0.6 * charge), color, now, charge);
        if (charge >= 1) ring(c, p0.x, p0.y, base * (1.4 + 0.2 * Math.sin(now / 90)), color, 3, 0.7);
      }
      if (spin > 0.05) {
        orb(c, p0.x, p0.y, base * (0.2 + 0.55 * spin), color, now, spin);
        for (let k = 0; k < 3; k++) { // спираль вокруг шара
          c.strokeStyle = rgba(lighten(color, 0.5), 0.5 * spin); c.lineWidth = 2.5; c.beginPath();
          for (let s = 0; s <= 36; s++) {
            const u = s / 36, a = now / 160 + k * 2.09 + u * 5, rr = base * (0.35 + 1.1 * u) * (0.6 + 0.6 * spin);
            const x = p0.x + Math.cos(a) * rr, y = p0.y + Math.sin(a) * rr * 0.8;
            s ? c.lineTo(x, y) : c.moveTo(x, y);
          }
          c.stroke();
        }
      }
      if (spread > 0.05 && p1) {
        const w = base * (0.1 + 0.3 * spread);
        glow(c, p0.x, p0.y, base * 0.8 * spread, color, 0.8); glow(c, p1.x, p1.y, base * 0.8 * spread, color, 0.8);
        for (const [wd, a] of [[w * 3, 0.15], [w * 1.4, 0.4], [w * 0.5, 0.95]]) {
          c.strokeStyle = rgba(wd < w ? "#ffffff" : color, a * spread); c.lineWidth = wd; c.lineCap = "round";
          c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
        }
      }
    }
    this.bursts = this.bursts.filter((b) => now - b.t0 < LIFE[b.id]);
    for (const b of this.bursts) this.#burst(c, b, clamp((now - b.t0) / LIFE[b.id]), color, now);
    c.restore();
  }

  #burst(c, b, k, color, now) {
    const f = 1 - k, e = 1 - f * f * f;
    if (b.id === "push") {
      for (let i = 0; i < 3; i++) ring(c, b.x, b.y, b.base * (0.5 + 5.5 * Math.max(0, e - i * 0.12)), color, 6 * f, 0.8 * f);
      glow(c, b.x, b.y, b.base * 2 * f, "#ffffff", 0.8 * f);
    } else if (b.id === "crush") {
      ring(c, b.x, b.y, b.base * 3 * f * f, color, 5, 0.9 * f); glow(c, b.x, b.y, b.base * (0.4 + 1.4 * k), "#ffffff", 0.9 * f);
    } else if (b.id === "shake") {
      for (let i = 0; i < 7; i++) {
        const a = R(i, Math.floor(now / 70)) * TAU, len = b.base * (0.8 + 1.4 * R(i, 2));
        c.strokeStyle = rgba(lighten(color, 0.7), 0.9 * f); c.lineWidth = 2.5; c.beginPath(); c.moveTo(b.x, b.y);
        for (let s = 1; s <= 4; s++) c.lineTo(b.x + Math.cos(a + (R(s, i) - 0.5)) * len * (s / 4), b.y + Math.sin(a + (R(s, i + 3) - 0.5)) * len * (s / 4));
        c.stroke();
      }
    } else if (b.id === "spread" && b.x1 !== undefined) {
      c.strokeStyle = rgba("#ffffff", 0.9 * f); c.lineWidth = b.base * 0.4 * f + 2; c.lineCap = "round";
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x1, b.y1); c.stroke();
      glow(c, (b.x + b.x1) / 2, (b.y + b.y1) / 2, b.base * 3 * e, color, 0.5 * f);
    } else { // charge, spin: шар вспыхивает и разлетается искрами
      glow(c, b.x, b.y, b.base * (1 + 2.5 * e), color, 0.7 * f); ring(c, b.x, b.y, b.base * (1 + 3 * e), "#ffffff", 4 * f, 0.8 * f);
      for (let i = 0; i < 14; i++) { const a = R(i) * TAU, d = b.base * (0.6 + 3 * e * (0.5 + R(i, 4))); glow(c, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 4 + b.base * 0.08, lighten(color, 0.5), 0.9 * f); }
    }
  }
}
