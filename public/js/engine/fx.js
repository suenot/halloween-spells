import { audio } from "./audio.js";
import { playFx } from "./spellfx.js";
// Canvas particle effects: ambient background + per-element spell effects.
const rand = (a, b) => a + Math.random() * (b - a);

export function startAmbient(canvas) {
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = innerWidth * dpr; h = canvas.height = innerHeight * dpr;
  };
  resize(); addEventListener("resize", resize);
  const sprites = ["🦇", "👻", "🕸️", "🦇", "🎃", "🦇"].map((e, i) => ({
    e, x: rand(0, 1), y: rand(0.05, 0.6), vx: rand(0.012, 0.03) * (i % 2 ? 1 : -1), ph: rand(0, 6), size: rand(22, 38), amp: rand(0.01, 0.04),
  }));
  const embers = Array.from({ length: 46 }, () => ({ x: rand(0, 1), y: rand(0, 1), r: rand(1, 3), v: rand(0.02, 0.07), ph: rand(0, 6) }));
  let last = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frame = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    ctx.clearRect(0, 0, w, h);
    for (const m of embers) {
      m.y -= m.v * dt; m.x += Math.sin(t / 1500 + m.ph) * 0.02 * dt;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t / 400 + m.ph);
      ctx.fillStyle = "#ff9a3c";
      ctx.beginPath(); ctx.arc(m.x * w, m.y * h, m.r * dpr, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 0.85;
    for (const s of sprites) {
      s.x += s.vx * dt;
      if (s.x > 1.1) s.x = -0.1; if (s.x < -0.1) s.x = 1.1;
      const y = (s.y + Math.sin(t / 900 + s.ph) * s.amp) * h;
      ctx.font = `${s.size * dpr}px serif`;
      ctx.save(); ctx.translate(s.x * w, y);
      if (s.e === "🦇") ctx.scale(1 + 0.25 * Math.sin(t / 110 + s.ph), 1);
      ctx.fillText(s.e, 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const SPAWN = {
  fire: (o) => ({ x: o.x + rand(-20, 20), y: o.y, vx: rand(-60, 60), vy: rand(-380, -120), life: rand(0.6, 1.3), r: rand(4, 11), g: -80, c: ["#ff3d00", "#ff9100", "#ffd54f"][(Math.random() * 3) | 0], shrink: true }),
  water: (o) => { const a = rand(-2.6, -0.5); const v = rand(200, 480); return { x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.7, 1.3), r: rand(3, 7), g: 700, c: ["#29b6f6", "#81d4fa", "#e1f5fe"][(Math.random() * 3) | 0] }; },
  earth: (o) => { const a = rand(-3, 0); const v = rand(150, 420); return { x: o.x + rand(-60, 60), y: o.y + 40, vx: Math.cos(a) * v * 0.5, vy: Math.sin(a) * v, life: rand(0.8, 1.4), r: rand(5, 13), g: 900, c: ["#8d6e63", "#a1887f", "#6d4c41"][(Math.random() * 3) | 0], square: true }; },
  air: (o) => { const a = rand(0, 6.283); return { x: o.x, y: o.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: rand(0.5, 1.0), r: rand(2, 4), g: 0, c: "#e3f6ff", swirl: a, trail: true }; },
  lightning: (o) => ({ x: o.x + rand(-250, 250), y: o.y - 300, vx: 0, vy: 0, life: rand(0.15, 0.35), r: 2, g: 0, c: "#fff59d", bolt: true }),
  ice: (o) => { const a = rand(-3, 0); const v = rand(120, 380); return { x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.9, 1.6), r: rand(4, 10), g: 220, c: ["#b3e5fc", "#e1f5fe", "#80deea"][(Math.random() * 3) | 0], shard: true }; },
  dark: (o) => ({ x: o.x + rand(-80, 80), y: o.y + rand(-40, 40), vx: rand(-40, 40), vy: rand(-110, -30), life: rand(1, 2), r: rand(14, 34), g: 0, c: ["#4a148c", "#7c4dff", "#1a0033"][(Math.random() * 3) | 0], soft: true }),
  light: (o) => { const a = rand(0, 6.283); const v = rand(80, 420); return { x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.8, 1.5), r: rand(3, 8), g: 30, c: ["#fff9c4", "#ffee58", "#ffffff"][(Math.random() * 3) | 0], star: true }; },
};

export function castEffect(canvas, element = "light", { x, y, power = 5, spell, silent } = {}) {
  if (!silent) spell ? audio.spell(spell, power) : audio.spellByElement(element, power);
  if (spell?.fx?.length) return playFx(canvas, spell.fx, { x, y, power, color: spell.color });
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const origin = { x: (x ?? rect.width / 2) , y: (y ?? rect.height * 0.7) };
  const spawn = SPAWN[element] ?? SPAWN.light;
  const parts = [];
  const dur = 1.3 + power * 0.1;
  const rate = 40 + power * 14;
  let t0 = performance.now(), last = t0, alive = true;
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const el = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (el < dur) for (let i = 0; i < rate * dt; i++) parts.push({ ...spawn(origin), age: 0 });
    ctx.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      const k = p.age / p.life;
      p.vy += p.g * dt;
      if (p.swirl !== undefined) { p.swirl += dt * 6; p.vx = Math.cos(p.swirl) * 260; p.vy = Math.sin(p.swirl) * 260 - 40; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = ctx.strokeStyle = p.c;
      const r = p.shrink ? p.r * (1 - k) : p.r;
      if (p.bolt) {
        ctx.lineWidth = 3; ctx.shadowColor = p.c; ctx.shadowBlur = 20; ctx.beginPath();
        let bx = p.x, by = p.y; ctx.moveTo(bx, by);
        while (by < origin.y + 40) { bx += rand(-35, 35); by += rand(20, 45); ctx.lineTo(bx, by); }
        ctx.stroke(); ctx.shadowBlur = 0;
      } else if (p.star) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * 4); ctx.fillRect(-r, -r / 4, r * 2, r / 2); ctx.fillRect(-r / 4, -r, r / 2, r * 2); ctx.restore();
      } else if (p.shard) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.beginPath(); ctx.moveTo(r * 1.8, 0); ctx.lineTo(-r, r * 0.6); ctx.lineTo(-r, -r * 0.6); ctx.fill(); ctx.restore();
      } else if (p.square) {
        ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
      } else if (p.soft) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.c); g.addColorStop(1, "transparent"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, r), 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (el < dur + 2 && (parts.length || el < dur)) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, rect.width, rect.height);
  };
  requestAnimationFrame(frame);
  return () => { alive = false; ctx.clearRect(0, 0, rect.width, rect.height); };
}

export const ELEMENT_INFO = {
  fire: { label: "Огонь", icon: "🔥" },
  water: { label: "Вода", icon: "💧" },
  earth: { label: "Земля", icon: "🪨" },
  air: { label: "Воздух", icon: "🌪️" },
  lightning: { label: "Молния", icon: "⚡" },
  ice: { label: "Лед", icon: "❄️" },
  dark: { label: "Тьма", icon: "🌑" },
  light: { label: "Свет", icon: "✨" },
};
export const SCHOOL_INFO = {
  wizard: { label: "Волшебники", icon: "🪄" },
  shinobi: { label: "Шиноби", icon: "🥷" },
};
