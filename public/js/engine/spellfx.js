// Уникальные эффекты заклинаний. Чистая отрисовка без состояния: drawFx(ctx, fx, k, geo) рисует кадр k (0..1),
// поэтому один и тот же кадр можно получить в любой момент (проверка, превью, замедление).
// fx в data/spells.json: [{ p: "torch", at?, len?, c?, ...параметры }]; первый слой - "герой" заклинания, он уникален.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t;
const lerp = (a, b, t) => a + (b - a) * t;
const R = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + 1.7) * 43758.5453; return x - Math.floor(x); };
const fade = (k, a = 0.12, b = 0.25) => clamp(k / a) * clamp((1 - k) / b);

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(a)})`; };
const mix = (h1, h2, t) => {
  const a = rgb(h1), b = rgb(h2);
  return "#" + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, "0")).join("");
};
const lighten = (h, t) => mix(h, "#ffffff", t);
const darken = (h, t) => mix(h, "#000000", t);

function glow(c, x, y, r, hex, a = 1) {
  if (r <= 0 || a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hex, a)); g.addColorStop(1, rgba(hex, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
function stroke(c, pts, hex, w, a = 1) {
  c.strokeStyle = rgba(hex, a); c.lineWidth = w; c.lineCap = "round"; c.lineJoin = "round";
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
}
// светящаяся линия: широкий мягкий слой, потом тонкое яркое ядро
function neon(c, pts, hex, w, a = 1) {
  stroke(c, pts, hex, w * 3, a * 0.18); stroke(c, pts, hex, w * 1.6, a * 0.45); stroke(c, pts, lighten(hex, 0.7), w * 0.6, a);
}
function star4(c, x, y, r, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot); c.beginPath();
  for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.22 : r; const a = (i * TAU) / 8; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  c.closePath(); c.fill(); c.restore();
}
function bolt(c, x1, y1, x2, y2, seed, jag = 0.07, depth = 3) {
  const pts = [[x1, y1]]; const n = 9; const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  for (let i = 1; i < n; i++) {
    const t = i / n, o = (R(i, seed) - 0.5) * len * jag * 2;
    pts.push([lerp(x1, x2, t) + nx * o, lerp(y1, y2, t) + ny * o]);
  }
  pts.push([x2, y2]);
  return pts;
}

/* ---------- примитивы: (g, k, p). g = { c, W, H, x, y, col, pw, S } ---------- */
const P = {};

P.torch = (g, k, p) => { // люмос: мягкий факел и блик линзы
  const { c } = g, f = fade(k, 0.15, 0.3);
  const y = lerp(g.y, g.H * 0.36, easeOut(clamp(k / 0.35))), x = g.x;
  const fl = 1 + 0.06 * Math.sin(k * 90) + 0.04 * Math.sin(k * 53);
  glow(c, x, y, g.S * 0.42 * fl * f, g.col, 0.5); glow(c, x, y, g.S * 0.18 * fl, "#ffffff", 0.9 * f);
  c.fillStyle = rgba("#ffffff", 0.5 * f); c.fillRect(x - g.S * 0.5 * f, y - 1.5, g.S * 1.0 * f, 3);
  for (let i = 0; i < 20; i++) {
    const t = (k * 1.4 + R(i)) % 1, a = fade(t, 0.2, 0.5) * f;
    glow(c, x + Math.sin(t * 6 + i) * g.S * 0.18, y - t * g.S * 0.55, 3 + R(i, 2) * 4, lighten(g.col, 0.4), a);
  }
};

P.converge = (g, k, p) => { // репаро: осколки слетаются и собираются
  const { c } = g, cx = g.x, cy = g.y - g.H * 0.28, t = clamp(k / 0.62);
  for (let i = 0; i < 30; i++) {
    const a = R(i) * TAU, r0 = g.S * (0.3 + R(i, 1) * 0.35), e = easeIn(t) , r = r0 * (1 - e);
    const x = cx + Math.cos(a + e * 2) * r, y = cy + Math.sin(a + e * 2) * r * 0.8, s = 5 + R(i, 3) * 9;
    c.save(); c.translate(x, y); c.rotate(a + e * 6); c.fillStyle = rgba(i % 3 ? g.col : lighten(g.col, 0.5), 0.9 * (1 - clamp((k - 0.6) * 4)));
    c.beginPath(); c.moveTo(-s, -s * 0.4); c.lineTo(s, -s * 0.2); c.lineTo(s * 0.3, s * 0.6); c.closePath(); c.fill(); c.restore();
  }
  const fk = clamp((k - 0.6) / 0.4);
  if (k > 0.58) { glow(c, cx, cy, g.S * (0.1 + fk * 0.4), lighten(g.col, 0.6), 0.9 * (1 - fk)); c.strokeStyle = rgba("#fff", 0.8 * (1 - fk)); c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, g.S * 0.1 + fk * g.S * 0.35, 0, TAU); c.stroke(); }
};

P.jet = (g, k, p) => { // аква: струя воды дугой и всплеск
  const { c } = g, dir = p.dir ?? 1, f = fade(k, 0.1, 0.3), reach = easeOut(clamp(k / 0.5));
  const pt = (t) => [g.x + dir * t * g.W * 0.42, g.y - Math.sin(t * Math.PI * 0.85) * g.H * 0.38 + t * t * g.H * 0.1];
  const pts = []; for (let i = 0; i <= 28; i++) { const t = (i / 28) * reach; pts.push(pt(t)); }
  stroke(c, pts, g.col, g.S * 0.07, 0.25 * f); stroke(c, pts, lighten(g.col, 0.4), g.S * 0.03, 0.7 * f); stroke(c, pts, "#ffffff", g.S * 0.008, 0.8 * f);
  for (let i = 0; i < 40; i++) {
    const t = ((i / 40) * reach + (k * 0.8) % 0.1), [x, y] = pt(Math.min(t, reach));
    glow(c, x + (R(i) - 0.5) * 22, y + (R(i, 1) - 0.5) * 22 + (k * 60 * R(i, 4)), 2 + R(i, 2) * 4, lighten(g.col, 0.6), 0.7 * f);
  }
  const [ex, ey] = pt(reach);
  for (let i = 0; i < 18; i++) { const a = -Math.PI * R(i), s = (k - 0.5) * 140 * R(i, 1); if (k > 0.45) glow(c, ex + Math.cos(a) * s, ey + Math.sin(a) * s + s * s * 0.004, 3 + R(i, 3) * 3, "#e1f5fe", 0.8 * (1 - clamp((k - 0.45) * 1.8))); }
};

P.pillar = (g, k, p) => { // инчендио: столб пламени
  const { c } = g, h = easeOut(clamp(k / 0.3)) * g.H * 0.68, f = fade(k, 0.1, 0.3);
  for (let i = 0; i < 46; i++) {
    const t = (i / 46), y = g.y - t * h, sway = Math.sin(k * 14 + t * 7 + i) * g.S * 0.04 * (0.4 + t);
    const w = g.S * 0.1 * (1 - t * 0.55) * (0.8 + 0.3 * Math.sin(k * 30 + i));
    glow(c, g.x + sway, y, w * 2.1, i % 3 ? "#ff6a1a" : "#ffb347", 0.25 * f * (1 - t * 0.5));
    if (i % 3 === 0) glow(c, g.x + sway, y, w * 0.9, "#ffe08a", 0.4 * f * (1 - t));
  }
  for (let i = 0; i < 26; i++) { const t = (k * 1.6 + R(i)) % 1; glow(c, g.x + (R(i, 2) - 0.5) * g.S * 0.3, g.y - t * g.H * 0.85, 3 + R(i, 3) * 3, "#ffcc66", fade(t, 0.1, 0.5) * f); }
  glow(c, g.x, g.y, g.S * 0.28, "#ff5a00", 0.4 * f);
};

P.crystals = (g, k, p) => { // глациус: ледяные шипы из земли
  const { c } = g, f = fade(k, 0.08, 0.28), n = 11;
  for (let i = 0; i < n; i++) {
    const bx = g.x + (i - (n - 1) / 2) * g.S * 0.075, grow = easeOut(clamp((k - i * 0.025) / 0.3));
    const h = g.H * (0.16 + 0.34 * (1 - Math.abs(i - 5) / 6) + R(i) * 0.08) * grow, w = g.S * 0.034;
    const lean = (i - 5) * 0.012 * g.S;
    c.fillStyle = rgba(lighten(g.col, 0.15), 0.85 * f); c.beginPath(); c.moveTo(bx - w, g.y); c.lineTo(bx + lean, g.y - h); c.lineTo(bx + w * 0.2, g.y); c.fill();
    c.fillStyle = rgba("#ffffff", 0.7 * f); c.beginPath(); c.moveTo(bx + w * 0.2, g.y); c.lineTo(bx + lean, g.y - h); c.lineTo(bx + w, g.y); c.fill();
  }
  glow(c, g.x, g.y, g.S * 0.45, g.col, 0.25 * f);
  for (let i = 0; i < 36; i++) { const t = (k * 0.7 + R(i)) % 1; c.fillStyle = rgba("#fff", 0.8 * fade(t, 0.1, 0.4) * f); c.fillRect(g.x + (R(i, 1) - 0.5) * g.W * 0.6 + Math.sin(t * 8 + i) * 10, g.y - g.H * 0.7 + t * g.H * 0.7, 3, 3); }
};

P.lift = (g, k, p) => { // левитейт: кольца вверх и поднимающиеся предметы
  const { c } = g, f = fade(k, 0.1, 0.25);
  for (let i = 0; i < 6; i++) {
    const t = (k * 1.1 + i / 6) % 1, y = g.y - t * g.H * 0.6, rx = g.S * (0.2 - t * 0.08);
    c.strokeStyle = rgba(lighten(g.col, 0.3), (1 - t) * 0.7 * f); c.lineWidth = 3; c.beginPath(); c.ellipse(g.x, y, rx, rx * 0.28, 0, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const t = clamp(k * 1.2 - R(i) * 0.3), x = g.x + (R(i, 1) - 0.5) * g.S * 0.5 + Math.sin(k * 5 + i) * 12, y = g.y - easeOut(t) * g.H * (0.3 + R(i, 2) * 0.35);
    c.save(); c.translate(x, y); c.rotate(Math.sin(k * 4 + i) * 0.6); c.fillStyle = rgba(i % 2 ? "#ffffff" : g.col, 0.85 * f);
    c.beginPath(); c.ellipse(0, 0, 4 + R(i, 3) * 6, 2 + R(i, 4) * 2, 0, 0, TAU); c.fill(); c.restore();
  }
  glow(c, g.x, g.y, g.S * 0.3, g.col, 0.25 * f);
};

P.bolt = (g, k, p) => { // ступефай: молния с неба и вспышка
  const { c } = g, flick = Math.floor(k * 22) % 2 ? 1 : 0.55, f = fade(k, 0.05, 0.25) * flick, n = p.n ?? 1;
  for (let b = 0; b < n; b++) {
    const tx = g.x + (b - (n - 1) / 2) * g.S * 0.28, seed = Math.floor(k * 9) + b * 7;
    const pts = bolt(c, tx + (R(b) - 0.5) * 80, 0, tx, g.y - g.H * 0.12, seed, 0.08);
    neon(c, pts, g.col, 3.5, f);
    for (let j = 2; j < pts.length - 2; j += 3) neon(c, bolt(c, pts[j][0], pts[j][1], pts[j][0] + (R(j, b) - 0.5) * g.S * 0.5, pts[j][1] + g.H * 0.18, seed + j, 0.1), g.col, 1.6, f * 0.8);
  }
  if (k < 0.18) { c.fillStyle = rgba("#ffffff", (0.18 - k) * 3 * flick); c.fillRect(0, 0, g.W, g.H); }
  glow(c, g.x, g.y - g.H * 0.1, g.S * 0.3 * (0.8 + flick * 0.4), g.col, 0.6 * f);
};

P.cracks = (g, k, p) => { // терра: расколы земли и камни
  const { c } = g, grow = easeOut(clamp(k / 0.45)), f = fade(k, 0.05, 0.3);
  const branch = (x, y, a, len, d, seed) => {
    if (d > 3 || len < 8) return;
    const x2 = x + Math.cos(a) * len * grow, y2 = y + Math.sin(a) * len * grow * 0.5;
    neon(c, [[x, y], [lerp(x, x2, 0.5) + (R(seed) - 0.5) * 14, lerp(y, y2, 0.5) + (R(seed, 1) - 0.5) * 6], [x2, y2]], "#ff8a3c", 2.4 - d * 0.5, f);
    branch(x2, y2, a + 0.5 + R(seed, 2) * 0.3, len * 0.6, d + 1, seed * 3 + 1); branch(x2, y2, a - 0.5 - R(seed, 3) * 0.3, len * 0.6, d + 1, seed * 3 + 2);
  };
  for (let i = 0; i < 7; i++) branch(g.x, g.y, (i / 7) * TAU + 0.2, g.S * 0.3, 0, i + 1);
  glow(c, g.x, g.y, g.S * 0.28 * grow, "#ff7a1a", 0.35 * f);
  for (let i = 0; i < 16; i++) {
    const t = clamp((k - 0.1) / 0.8), vx = (R(i) - 0.5) * g.S * 0.9, vy = -(0.4 + R(i, 1) * 0.6) * g.H * 1.1;
    const x = g.x + vx * t, y = g.y + vy * t + t * t * g.H * 1.0 * (0.6 + R(i, 2) * 0.3), s = 5 + R(i, 3) * 9;
    c.save(); c.translate(x, y); c.rotate(t * 8 * (R(i, 4) - 0.5)); c.fillStyle = rgba(i % 2 ? g.col : darken(g.col, 0.3), 0.95 * (1 - t * 0.5));
    c.fillRect(-s / 2, -s / 2, s, s * 0.8); c.restore();
  }
};

P.dome = (g, k, p) => { // протего: купол щита с шестиугольниками
  const { c } = g, r = g.S * 0.34 * easeOut(clamp(k / 0.2)), f = fade(k, 0.1, 0.3), cx = g.x, cy = g.y - g.H * 0.1;
  const gr = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  gr.addColorStop(0, rgba(g.col, 0)); gr.addColorStop(1, rgba(g.col, 0.5 * f));
  c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, r, Math.PI, TAU); c.closePath(); c.fill();
  c.strokeStyle = rgba(lighten(g.col, 0.5), 0.9 * f); c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r, Math.PI, TAU); c.stroke();
  c.lineWidth = 1; c.strokeStyle = rgba("#fff", 0.35 * f);
  const hs = r * 0.22;
  for (let row = -4; row <= 0; row++) for (let col = -5; col <= 5; col++) {
    const hx = cx + col * hs * 1.73 + (row % 2 ? hs * 0.87 : 0), hy = cy + row * hs * 1.5;
    if (Math.hypot(hx - cx, hy - cy) > r * 0.97 || hy > cy) continue;
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6 + TAU / 12; c.lineTo(hx + Math.cos(a) * hs * 0.9, hy + Math.sin(a) * hs * 0.9); } c.closePath(); c.stroke();
  }
  for (let i = 0; i < 3; i++) { const t = (k * 2 + i / 3) % 1, a = Math.PI * (1.2 + R(i) * 0.6); glow(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 8 + t * 40, "#fff", (1 - t) * 0.7 * f); }
};

P.ring = (g, k, p) => { // экспеллиармус: ударная волна и лучи
  const { c } = g, cy = g.y - g.H * 0.22;
  for (let i = 0; i < 3; i++) {
    const t = clamp((k - i * 0.1) / 0.6), r = easeOut(t) * g.S * 0.6;
    c.strokeStyle = rgba(lighten(g.col, 0.3), (1 - t) * 0.9); c.lineWidth = 8 * (1 - t) + 1; c.beginPath(); c.ellipse(g.x, cy, r, r * 0.55, 0, 0, TAU); c.stroke();
  }
  const t = clamp(k / 0.5);
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, r1 = g.S * 0.1 + easeOut(t) * g.S * 0.55, r2 = r1 + g.S * 0.12 * (1 - t); c.strokeStyle = rgba("#fff", (1 - t) * 0.8); c.lineWidth = 2; c.beginPath(); c.moveTo(g.x + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.55); c.lineTo(g.x + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.55); c.stroke(); }
  glow(c, g.x, cy, g.S * 0.35 * (1 - t), "#fff", 0.8 * (1 - t));
};

P.vortex = (g, k, p) => { // умбра: тьма втягивается в воронку
  const { c } = g, cx = g.x, cy = g.y - g.H * 0.3, f = fade(k, 0.12, 0.25), R0 = g.S * 0.42;
  for (let i = 0; i < 160; i++) {
    const arm = i % 5, t = (i / 160 + k * 0.5 * (1 + arm * 0.05)) % 1, r = R0 * (1 - t) , a = arm * (TAU / 5) + t * 9 - k * 6;
    glow(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 4 + (1 - t) * 8, i % 2 ? "#8a3df0" : "#c39bff", (0.25 + t * 0.5) * f);
  }
  c.globalCompositeOperation = "source-over";
  const rr = g.S * 0.1 * f; const gr = c.createRadialGradient(cx, cy, 0, cx, cy, rr * 2);
  gr.addColorStop(0, rgba("#000000", 1)); gr.addColorStop(0.55, rgba("#000000", 0.95)); gr.addColorStop(1, rgba("#000000", 0));
  c.fillStyle = gr; c.beginPath(); c.ellipse(cx, cy, rr * 2, rr, 0, 0, TAU); c.fill();
  c.globalCompositeOperation = "lighter"; c.strokeStyle = rgba("#d1b3ff", 0.8 * f); c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cy, rr * 1.3, rr * 0.65, 0, 0, TAU); c.stroke();
};

const STAG = [
  [[-0.9, 0.05], [-0.7, -0.12], [-0.2, -0.15], [0.35, -0.1], [0.6, 0], [0.78, -0.28], [0.9, -0.48], [1.08, -0.52], [1.2, -0.46], [1.1, -0.4]],
  [[-0.9, 0.05], [-0.95, 0.2], [-0.7, 0.2], [-0.2, 0.18], [0.4, 0.15], [0.6, 0]],
  [[0.45, 0.15], [0.55, 0.5], [0.5, 0.55]], [[0.35, 0.17], [0.2, 0.45], [0.25, 0.52]], [[-0.7, 0.2], [-0.6, 0.5], [-0.68, 0.55]], [[-0.55, 0.19], [-0.35, 0.42], [-0.28, 0.5]],
  [[0.92, -0.5], [0.88, -0.75], [0.8, -0.95]], [[0.88, -0.75], [1.0, -0.85]], [[0.9, -0.62], [0.7, -0.72]], [[0.97, -0.5], [1.05, -0.78], [1.18, -0.95]], [[1.05, -0.78], [1.2, -0.8]],
];
P.spirit = (g, k, p) => { // патронус: сияющий олень
  const { c } = g, f = fade(k, 0.15, 0.25), sc = g.S * 0.26, x0 = lerp(g.W * 0.18, g.W * 0.82, ease(k)), bob = Math.sin(k * 26) * sc * 0.04, y0 = g.y - g.H * 0.28 + bob;
  glow(c, x0, y0, sc * 1.4, g.col, 0.25 * f);
  for (const line of STAG) {
    const pts = line.map(([x, y]) => [x0 + x * sc, y0 + y * sc]);
    stroke(c, pts, g.col, sc * 0.1, 0.18 * f); stroke(c, pts, lighten(g.col, 0.4), sc * 0.045, 0.6 * f); stroke(c, pts, "#ffffff", sc * 0.016, 0.95 * f);
  }
  for (let i = 0; i < 44; i++) { const t = (i / 44 + k * 1.2) % 1, tx = x0 - t * sc * 2.4, ty = y0 + Math.sin(t * 9 + i) * sc * 0.22 + t * sc * 0.15; glow(c, tx, ty, 2 + (1 - t) * 6, lighten(g.col, 0.5), (1 - t) * 0.8 * f); }
};

P.ripples = (g, k, p) => { // кай: тонкие кольца снятия иллюзии и печать
  const { c } = g, cx = g.x, cy = g.y - g.H * 0.3, f = fade(k, 0.05, 0.2);
  for (let i = 0; i < 10; i++) {
    const t = clamp((k * 1.3 - i * 0.07) / 0.7); if (t <= 0) continue;
    c.strokeStyle = rgba(i % 2 ? "#ffffff" : g.col, (1 - t) * 0.85); c.lineWidth = 1.5 + (1 - t) * 2; c.beginPath(); c.arc(cx, cy, easeOut(t) * g.S * 0.55, 0, TAU); c.stroke();
  }
  c.strokeStyle = rgba("#fff", 0.9 * f); c.lineWidth = 3; const r = g.S * 0.07 * (1 + k);
  c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r); c.stroke();
  glow(c, cx, cy, g.S * 0.2, g.col, 0.5 * f);
};

P.log = (g, k, p) => { // каварими: бревно вместо тела и облако дыма
  const { c } = g, ly = g.y - g.H * 0.05, drop = easeOut(clamp(k / 0.3)), y = lerp(g.y - g.H * 0.55, ly, drop);
  c.globalCompositeOperation = "source-over";
  const lw = g.S * 0.1, lh = g.S * 0.34, a = clamp(1 - (k - 0.8) * 4);
  c.globalAlpha = a; c.fillStyle = "#6b4a2b"; c.beginPath(); c.roundRect(g.x - lw, y - lh, lw * 2, lh, 6); c.fill();
  c.fillStyle = "#8a6038"; c.fillRect(g.x - lw * 0.5, y - lh, lw * 0.35, lh);
  c.fillStyle = "#c9a06a"; c.beginPath(); c.ellipse(g.x, y - lh, lw, lw * 0.35, 0, 0, TAU); c.fill(); c.strokeStyle = "#8a6038"; c.lineWidth = 2; c.beginPath(); c.ellipse(g.x, y - lh, lw * 0.55, lw * 0.18, 0, 0, TAU); c.stroke();
  c.globalAlpha = 1;
  for (let i = 0; i < 18; i++) {
    const t = clamp((k - 0.28) / 0.6), ang = R(i) * TAU, d = easeOut(t) * g.S * (0.1 + R(i, 1) * 0.28);
    const x = g.x + Math.cos(ang) * d * 1.3, yy = ly - g.S * 0.1 + Math.sin(ang) * d * 0.7 - t * g.S * 0.1;
    if (t > 0) glow(c, x, yy, g.S * (0.05 + R(i, 2) * 0.08) * (0.6 + t), "#d8d8e0", 0.55 * (1 - t));
  }
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 12; i++) { const t = clamp((k - 0.3) / 0.7), ang = R(i, 5) * TAU, d = t * g.S * 0.4; c.save(); c.translate(g.x + Math.cos(ang) * d, ly - g.S * 0.15 + Math.sin(ang) * d * 0.6 + t * 30); c.rotate(t * 7 + i); c.fillStyle = rgba("#7ac36a", (1 - t) * 0.9); c.beginPath(); c.ellipse(0, 0, 7, 3, 0, 0, TAU); c.fill(); c.restore(); }
};

P.dash = (g, k, p) => { // сюнсин: остаточные образы и линии скорости
  const { c } = g, f = fade(k, 0.05, 0.3), cy = g.y - g.H * 0.28;
  for (let i = 0; i < 26; i++) { const y = cy + (R(i) - 0.5) * g.H * 0.5, t = (k * 1.8 + R(i, 1)) % 1, x = lerp(g.W * 0.05, g.W * 0.95, t); c.strokeStyle = rgba("#fff", (1 - t) * 0.6 * f); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - g.S * (0.15 + R(i, 2) * 0.25), y); c.stroke(); }
  for (let i = 0; i < 7; i++) {
    const t = clamp(k * 1.5 - i * 0.05), x = lerp(g.W * 0.12, g.W * 0.82, easeOut(t)); if (t <= 0) continue;
    const w = g.S * 0.045, h = g.S * 0.2, a = (i === 0 ? 0.9 : 0.5 - i * 0.05) * f;
    const gr = c.createLinearGradient(x, cy - h, x, cy + h); gr.addColorStop(0, rgba(g.col, 0)); gr.addColorStop(0.5, rgba(lighten(g.col, 0.3), a)); gr.addColorStop(1, rgba(g.col, 0));
    c.fillStyle = gr; c.beginPath(); c.ellipse(x - i * g.S * 0.05, cy, w, h, 0, 0, TAU); c.fill();
  }
  for (let i = 0; i < 14; i++) { const t = (k * 1.2 + R(i)) % 1; c.save(); c.translate(lerp(g.W * 0.1, g.W * 0.9, t), cy + Math.sin(t * 12 + i) * g.S * 0.18); c.rotate(t * 14); c.fillStyle = rgba("#a6e58a", (1 - t) * 0.8 * f); c.beginPath(); c.ellipse(0, 0, 6, 2.5, 0, 0, TAU); c.fill(); c.restore(); }
};

P.slashes = (g, k, p) => { // футон: серпы ветра
  const { c } = g, cy = g.y - g.H * 0.28;
  for (let i = 0; i < 6; i++) {
    const t = clamp((k * 1.4 - i * 0.1) / 0.6); if (t <= 0 || t >= 1) continue;
    const ang = (i - 2.5) * 0.28, d = easeOut(t) * g.S * 0.75, x = g.x + Math.cos(ang) * d * 1.2, y = cy + Math.sin(ang) * d * 0.7 - i * 6, r = g.S * (0.22 + R(i) * 0.1);
    c.save(); c.translate(x, y); c.rotate(ang + 0.2);
    const a = (1 - t) * 0.95; c.fillStyle = rgba(lighten(g.col, 0.3), a);
    c.beginPath(); c.arc(0, 0, r, -1.1, 1.1); c.arc(-r * 0.28, 0, r * 1.07, 1.1, -1.1, true); c.closePath(); c.fill();
    c.strokeStyle = rgba("#fff", a); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r, -1.1, 1.1); c.stroke(); c.restore();
  }
  for (let i = 0; i < 30; i++) { const t = (k * 1.2 + R(i)) % 1, a = R(i, 1) * TAU + t * 5; c.strokeStyle = rgba("#fff", (1 - t) * 0.5); c.lineWidth = 1.5; c.beginPath(); c.arc(g.x, cy, g.S * (0.1 + t * 0.55), a, a + 0.5); c.stroke(); }
};

P.tendrils = (g, k, p) => { // каге: тени тянутся из земли
  const { c } = g, f = fade(k, 0.1, 0.3);
  for (let i = 0; i < 9; i++) {
    const bx = g.x + (i - 4) * g.S * 0.1, grow = easeOut(clamp((k - R(i) * 0.15) / 0.5)), pts = [];
    for (let j = 0; j <= 18; j++) { const t = (j / 18) * grow; pts.push([bx + Math.sin(t * 5 + k * 6 + i) * g.S * 0.05 * t + (g.x - bx) * t * 0.5, g.y - t * g.H * (0.35 + R(i, 1) * 0.35)]); }
    stroke(c, pts, "#3a1670", g.S * 0.045, 0.6 * f); stroke(c, pts, g.col, g.S * 0.022, 0.8 * f); stroke(c, pts, "#d9baff", g.S * 0.006, 0.9 * f);
    const e = pts[pts.length - 1]; glow(c, e[0], e[1], 10, "#e0c8ff", 0.9 * f);
  }
  for (let i = 0; i < 12; i++) { const t = (k * 0.6 + R(i)) % 1; glow(c, g.x + (R(i, 1) - 0.5) * g.S * 0.9, g.y - t * g.H * 0.2, g.S * 0.12, "#2a0f55", 0.5 * f); }
};

P.fireball = (g, k, p) => { // катон: огненный шар летит и взрывается
  const { c } = g, tf = clamp(k / 0.62), bx = lerp(g.x, g.W * 0.8, easeIn(tf) * 0.4 + tf * 0.6), by = lerp(g.y - g.H * 0.1, g.H * 0.4, tf) - Math.sin(tf * Math.PI) * g.H * 0.15;
  if (k < 0.66) {
    for (let i = 0; i < 40; i++) { const t = i / 40, tx = bx - (bx - g.x) * t * 0.5 + Math.sin(k * 20 + i) * 6, ty = by - (by - g.y) * t * 0.5 + (R(i) - 0.5) * 10 + t * 14; glow(c, tx, ty, g.S * 0.07 * (1 - t) + 4, i % 2 ? "#ff6a1a" : "#ffb347", 0.5 * (1 - t)); }
    glow(c, bx, by, g.S * 0.17, "#ff5a00", 0.8); glow(c, bx, by, g.S * 0.09, "#fff1b0", 1);
  } else {
    const t = clamp((k - 0.62) / 0.38);
    for (let i = 0; i < 40; i++) { const a = R(i) * TAU, d = easeOut(t) * g.S * (0.1 + R(i, 1) * 0.4); glow(c, bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.8, g.S * 0.06 * (1 - t) + 3, i % 3 ? "#ff7a1a" : "#ffd27a", (1 - t) * 0.85); }
    glow(c, bx, by, g.S * (0.1 + t * 0.4), "#ff9a3c", (1 - t) * 0.7);
  }
};

P.wall = (g, k, p) => { // дотон: каменная стена
  const { c } = g, f = fade(k, 0.05, 0.25), n = 9;
  for (let i = 0; i < n; i++) {
    const rise = easeOut(clamp((k * 1.5 - Math.abs(i - 4) * 0.07) / 0.35)), w = g.S * 0.075, h = g.H * (0.34 + R(i) * 0.12) * rise, x = g.x + (i - 4) * w * 1.02;
    c.fillStyle = rgba(darken(g.col, 0.15 + R(i, 1) * 0.15), 0.95 * f); c.fillRect(x - w / 2, g.y - h, w, h);
    c.fillStyle = rgba(lighten(g.col, 0.25), 0.85 * f); c.fillRect(x - w / 2, g.y - h, w * 0.28, h);
    c.fillStyle = rgba(lighten(g.col, 0.4), f); c.fillRect(x - w / 2, g.y - h, w, 4);
  }
  for (let i = 0; i < 30; i++) { const t = (k * 1.2 + R(i)) % 1; glow(c, g.x + (R(i, 1) - 0.5) * g.S * 0.9, g.y - t * g.H * 0.25, g.S * 0.04 + t * 10, "#b79b7a", (1 - t) * 0.5 * f); }
};

P.mirrors = (g, k, p) => { // хйотон: ледяные зеркала и иглы
  const { c } = g, f = fade(k, 0.1, 0.25), cx = g.x, cy = g.y - g.H * 0.3, rad = g.S * 0.3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + k * 0.4, s = easeOut(clamp((k - i * 0.03) / 0.25)), x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.7, hs = g.S * 0.075 * s;
    c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
    c.fillStyle = rgba(g.col, 0.25 * f); c.strokeStyle = rgba("#fff", 0.9 * f); c.lineWidth = 2; c.beginPath();
    for (let j = 0; j < 6; j++) c.lineTo(Math.cos((j * TAU) / 6) * hs, Math.sin((j * TAU) / 6) * hs * 1.3); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = rgba("#fff", 0.5 * f); c.beginPath(); c.moveTo(-hs * 0.5, -hs * 0.5); c.lineTo(hs * 0.2, hs * 0.2); c.stroke(); c.restore();
  }
  for (let i = 0; i < 20; i++) { const t = (k * 1.4 + R(i)) % 1, a = R(i, 1) * TAU, d0 = rad * 1.5, r = lerp(d0, 0, t); c.strokeStyle = rgba("#dff7ff", (0.9 - t * 0.5) * f); c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7); c.lineTo(cx + Math.cos(a) * (r + 22), cy + Math.sin(a) * (r + 22) * 0.7); c.stroke(); }
  glow(c, cx, cy, g.S * 0.2, g.col, 0.4 * f);
};

P.tsunami = (g, k, p) => { // суйтон: водяная стена
  const { c } = g, f = fade(k, 0.08, 0.3), h = g.H * 0.55 * easeOut(clamp(k / 0.45)) , x0 = g.W * 0.1, x1 = g.W * 0.9;
  const crest = (x) => { const u = (x - x0) / (x1 - x0); return g.y - h * (0.35 + 0.65 * Math.sin(u * Math.PI)) + Math.sin(u * 14 - k * 18) * 8 - Math.pow(Math.max(0, u - 0.6), 2) * h * 0.5; };
  c.beginPath(); c.moveTo(x0, g.y + 30); for (let x = x0; x <= x1; x += 8) c.lineTo(x, crest(x)); c.lineTo(x1, g.y + 30); c.closePath();
  const gr = c.createLinearGradient(0, g.y - h, 0, g.y + 30); gr.addColorStop(0, rgba("#bfeaff", 0.7 * f)); gr.addColorStop(0.35, rgba(g.col, 0.5 * f)); gr.addColorStop(1, rgba(darken(g.col, 0.4), 0.3 * f)); c.fillStyle = gr; c.fill();
  const edge = []; for (let x = x0; x <= x1; x += 8) edge.push([x, crest(x)]); neon(c, edge, "#e8f8ff", 2.5, f);
  for (let i = 0; i < 40; i++) { const x = lerp(x0, x1, R(i)), t = (k * 1.5 + R(i, 1)) % 1; glow(c, x, crest(x) - t * g.H * 0.15, 3 + R(i, 2) * 3, "#fff", (1 - t) * 0.8 * f); }
};

P.mist = (g, k, p) => { // интон: призрачный туман и глаза
  const { c } = g, f = fade(k, 0.2, 0.3);
  for (let i = 0; i < 22; i++) { const t = (k * 0.5 + R(i)) % 1, x = g.x + (R(i, 1) - 0.5) * g.W * 0.8 + Math.sin(k * 3 + i) * 20, y = g.y - t * g.H * 0.55; glow(c, x, y, g.S * (0.12 + R(i, 2) * 0.12), i % 2 ? "#a58bd6" : "#e6dcff", 0.18 * f * (1 - t * 0.4)); }
  const e = clamp((k - 0.3) / 0.15) * clamp((0.85 - k) / 0.15), cx = g.x, cy = g.y - g.H * 0.4;
  for (const s of [-1, 1]) { const ex = cx + s * g.S * 0.1; c.fillStyle = rgba("#ffffff", 0.9 * e); c.beginPath(); c.ellipse(ex, cy, g.S * 0.05, g.S * 0.018 * (0.4 + 0.6 * e), s * 0.25, 0, TAU); c.fill(); glow(c, ex, cy, g.S * 0.12, "#c9a6ff", 0.7 * e); }
};

P.chidori = (g, k, p) => { // райтон: звенящая шаровая молния
  const { c } = g, f = fade(k, 0.08, 0.25), cx = g.x, cy = g.y - g.H * 0.28, seed = Math.floor(k * 18);
  glow(c, cx, cy, g.S * 0.32, g.col, 0.45 * f); glow(c, cx, cy, g.S * 0.1, "#ffffff", 1 * f);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + R(i, seed) * 0.3, len = g.S * (0.18 + R(i, seed + 3) * 0.28); neon(c, bolt(c, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, seed + i, 0.12), g.col, 2, f); }
  for (let i = 0; i < 8; i++) { const x = g.x + (R(i, seed) - 0.5) * g.S * 0.9; neon(c, bolt(c, x, g.y, x + (R(i, seed + 1) - 0.5) * 40, g.y - 24 - R(i, seed + 2) * 30, seed + i, 0.2), g.col, 1.4, f * 0.8); }
};

P.serpent = (g, k, p) => { // рюка: огненный дракон
  const { c } = g, f = fade(k, 0.08, 0.2), N = 70, head = easeOut(clamp(k / 0.8));
  const at = (u) => { const x = lerp(g.W * 0.05, g.W * 0.92, u); return [x, g.H * 0.38 + Math.sin(u * 8 - k * 7) * g.H * 0.12 * (0.4 + u) - u * g.H * 0.08]; };
  for (let i = N; i >= 0; i--) {
    const u = head * (1 - i / N * 0.62), [x, y] = at(u), w = g.S * 0.075 * (1 - i / N * 0.85) + 3;
    glow(c, x, y, w * 1.9, "#ff5a00", 0.35 * f); glow(c, x, y, w, i % 4 ? "#ff9a3c" : "#ffe08a", 0.75 * f);
    if (i % 5 === 0) glow(c, x + (R(i) - 0.5) * 20, y + (R(i, 1) - 0.5) * 20 - 14, 5, "#ffcc66", 0.7 * f);
  }
  const [hx, hy] = at(head), [px, py] = at(Math.max(0, head - 0.02)), a = Math.atan2(hy - py, hx - px);
  c.save(); c.translate(hx, hy); c.rotate(a); c.fillStyle = rgba("#ffe9a8", 0.95 * f);
  c.beginPath(); c.moveTo(g.S * 0.1, 0); c.lineTo(-g.S * 0.02, -g.S * 0.05); c.lineTo(-g.S * 0.05, g.S * 0.05); c.closePath(); c.fill();
  c.fillStyle = rgba("#ff3d00", f); c.beginPath(); c.moveTo(-g.S * 0.02, -g.S * 0.04); c.lineTo(-g.S * 0.1, -g.S * 0.11); c.lineTo(-g.S * 0.05, -g.S * 0.02); c.fill();
  c.fillStyle = rgba("#2a0a00", f); c.beginPath(); c.arc(g.S * 0.02, -g.S * 0.012, 3, 0, TAU); c.fill();
  for (let i = 0; i < 18; i++) { const t = (k * 3 + i / 18) % 1; glow(c, g.S * 0.1 + t * g.S * 0.25, (R(i) - 0.5) * g.S * 0.1 * t, 4 + t * 12, "#ff7a1a", (1 - t) * 0.8 * f); }
  c.restore();
};

P.stars = (g, k, p) => { // старлайт: мерцающие звезды
  const { c } = g, f = fade(k, 0.1, 0.25);
  for (let i = 0; i < 44; i++) {
    const t = (k * 1.1 + R(i)) % 1, tw = Math.sin(t * Math.PI), x = R(i, 1) * g.W, y = g.y - R(i, 2) * g.H * 0.85;
    c.fillStyle = rgba(i % 3 ? "#fffbe0" : g.col, tw * 0.95 * f); star4(c, x, y, 4 + R(i, 3) * 12 * tw, t * 2);
    glow(c, x, y, 14 * tw, "#fff7c4", 0.25 * f);
  }
  const t = clamp((k - 0.2) / 0.5); if (t > 0 && t < 1) neon(c, [[g.W * (0.8 - t * 0.6), g.H * (0.05 + t * 0.4)], [g.W * (0.8 - t * 0.6 + 0.12), g.H * (0.05 + t * 0.4 - 0.1)]], "#fff6c0", 3, 1 - t);
};

P.comet = (g, k, p) => { // эарендиль: падающая звезда расцветает
  const { c } = g, cx = g.x, cy = g.y - g.H * 0.4, t = clamp(k / 0.5), x = lerp(g.W * 0.05, cx, easeIn(t)), y = lerp(-g.H * 0.05, cy, easeIn(t));
  if (k < 0.52) {
    const tail = [[x, y], [x - (cx - g.W * 0.05) * 0.35, y - (cy + g.H * 0.05) * 0.35]];
    stroke(c, tail, g.col, g.S * 0.07, 0.3); stroke(c, tail, "#ffffff", g.S * 0.02, 0.9); glow(c, x, y, g.S * 0.12, "#fff", 0.9);
  } else {
    const b = clamp((k - 0.5) / 0.5), f = 1 - b * 0.4;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + b * 0.6, len = g.S * (i % 2 ? 0.2 : 0.4) * easeOut(b); neon(c, [[cx, cy], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], g.col, 2, f); }
    glow(c, cx, cy, g.S * (0.1 + b * 0.3), "#fff", 0.9 * f); c.fillStyle = rgba("#fff", f); star4(c, cx, cy, g.S * 0.25 * easeOut(b), b * 1.5);
  }
};

P.tree = (g, k, p) => { // энтвейк: дерево вырастает
  const { c } = g, grow = clamp(k / 0.7), f = fade(k, 0.05, 0.2);
  c.globalCompositeOperation = "source-over"; c.lineCap = "round"; c.globalAlpha = f;
  const limb = (x, y, a, len, d, seed) => {
    if (d > 6) return;
    const t = clamp(grow * 7 - d), l = len * t, x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    c.strokeStyle = d < 3 ? "#5a3b22" : "#7a5a30"; c.lineWidth = Math.max(1.2, (6 - d) * 3.2); c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    if (t < 1) return;
    if (d >= 4) { c.fillStyle = rgba(R(seed) > 0.5 ? "#6fcf5a" : "#b8e86a", 0.95); c.beginPath(); c.arc(x2, y2, 7 + R(seed, 1) * 6, 0, TAU); c.fill(); }
    limb(x2, y2, a - 0.45 - R(seed) * 0.25, len * 0.74, d + 1, seed * 2 + 1); limb(x2, y2, a + 0.45 + R(seed, 2) * 0.25, len * 0.74, d + 1, seed * 2 + 2);
  };
  limb(g.x, g.y, -Math.PI / 2, g.H * 0.26, 0, 1);
  c.globalAlpha = 1; c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 24; i++) { const t = (k * 1.2 + R(i)) % 1; glow(c, g.x + (R(i, 1) - 0.5) * g.S * 0.7, g.y - R(i, 2) * g.H * 0.7 - t * 20, 4, "#c8ff9a", fade(t, 0.2, 0.4) * f); }
};

P.flock = (g, k, p) => { // орлы: стая летит
  const { c } = g, f = fade(k, 0.08, 0.2);
  for (let i = 0; i < 9; i++) {
    const row = i === 0 ? 0 : Math.ceil(i / 2), side = i % 2 ? 1 : -1, t = clamp(k * 1.05 - 0.02 * row), x = lerp(-g.W * 0.1, g.W * 1.05, t) - row * g.S * 0.1, y = lerp(g.y, g.H * 0.15, t) + side * row * g.S * 0.045 + Math.sin(k * 8 + i) * 6;
    const flap = Math.sin(k * 26 + i * 0.7), s = g.S * (0.1 - row * 0.006);
    c.save(); c.translate(x, y); c.rotate(-0.35);
    glow(c, 0, 0, s * 0.9, g.col, 0.35 * f);
    c.fillStyle = rgba("#fff6d6", 0.92 * f);
    for (const d of [-1, 1]) { // крыло: изогнутый серп, взмах меняет угол подъема
      c.beginPath(); c.moveTo(0, -s * 0.05);
      c.quadraticCurveTo(d * s * 0.6, -s * (0.55 + flap * 0.45), d * s * 1.15, -s * (0.1 + flap * 0.7));
      c.quadraticCurveTo(d * s * 0.6, -s * (0.2 + flap * 0.25), 0, s * 0.12); c.closePath(); c.fill();
    }
    c.beginPath(); c.ellipse(0, s * 0.02, s * 0.1, s * 0.22, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(0, -s * 0.2); c.lineTo(s * 0.08, -s * 0.26); c.lineTo(0, -s * 0.3); c.fill();
    c.restore();
    for (let j = 0; j < 6; j++) glow(c, x - j * 12 - 10, y + j * 5, 4 - j * 0.5, "#fff6d6", (1 - j / 6) * 0.5 * f);
  }
};

P.gate = (g, k, p) => { // ты не пройдешь: барьер света
  const { c } = g, f = fade(k, 0.08, 0.3), h = g.H * 0.8 * easeOut(clamp(k / 0.25)), cx = g.x;
  const gr = c.createLinearGradient(cx - g.S * 0.15, 0, cx + g.S * 0.15, 0); gr.addColorStop(0, rgba(g.col, 0)); gr.addColorStop(0.5, rgba(g.col, 0.7 * f)); gr.addColorStop(1, rgba(g.col, 0));
  c.fillStyle = gr; c.fillRect(cx - g.S * 0.15, g.y - h, g.S * 0.3, h);
  neon(c, [[cx, g.y - h], [cx, g.y]], "#ffffff", 3, f);
  for (let i = 0; i < 5; i++) { const y = g.y - h * (0.15 + i * 0.18); c.strokeStyle = rgba("#fff", 0.6 * f); c.lineWidth = 2; c.beginPath(); c.arc(cx, y, g.S * 0.1, -Math.PI / 2, Math.PI / 2, i % 2 === 0); c.stroke(); }
  for (let i = 0; i < 28; i++) { const t = (k * 3 + R(i)) % 1, y = g.y - R(i, 1) * h, x = cx + g.S * 0.55 * (1 - t); neon(c, [[x, y], [x + 26, y + (R(i, 2) - 0.5) * 8]], "#ff9a3c", 1.5, (1 - t) * 0.8 * f); if (t > 0.9) glow(c, cx + 6, y, 18, "#fff", 0.8); }
  const st = clamp((k - 0.05) / 0.35); c.strokeStyle = rgba("#fff", (1 - st) * 0.8); c.lineWidth = 5 * (1 - st) + 1; c.beginPath(); c.ellipse(cx, g.y, easeOut(st) * g.S * 0.5, easeOut(st) * g.S * 0.12, 0, 0, TAU); c.stroke();
};

P.meteor = (g, k, p) => { // гора огня: метеориты и лава
  const { c } = g, f = fade(k, 0.05, 0.22);
  for (let i = 0; i < 8; i++) {
    const t = clamp((k * 1.5 - i * 0.07) / 0.45); if (t <= 0 || t > 1.2) continue;
    const tx = g.W * (0.2 + R(i) * 0.7), ty = g.y - R(i, 1) * g.H * 0.12, x = lerp(tx - g.W * 0.4, tx, t), y = lerp(-g.H * 0.1, ty, t);
    if (t < 1) { neon(c, [[x, y], [x - g.W * 0.12, y - g.H * 0.18]], "#ff7a1a", 4, 0.9); glow(c, x, y, g.S * 0.06, "#ffe08a", 1); }
    else { const b = t - 1; for (let j = 0; j < 8; j++) { const a = -Math.PI * R(j, i), d = b * 160 * R(j, 4); glow(c, tx + Math.cos(a) * d, ty + Math.sin(a) * d + d * d * 0.003, 5, "#ffb347", (1 - b * 5) * 0.8); } glow(c, tx, ty, 30 * (1 - b * 4), "#ff5a00", 0.7); }
  }
  const lk = clamp((k - 0.3) / 0.6);
  for (let i = 0; i < 70; i++) { const t = (k * 2 + R(i)) % 1, vx = (R(i, 1) - 0.5) * g.S * 0.9, x = g.x + vx * t, y = g.y - (t * (1 - t) * 4) * g.H * (0.2 + R(i, 2) * 0.5) * lk; glow(c, x, y, 3 + R(i, 3) * 4, i % 3 ? "#ff5a00" : "#ffd27a", (0.9 - t * 0.5) * lk * f); }
  glow(c, g.x, g.y, g.S * 0.3 * lk, "#ff4500", 0.5 * f);
};

/* общие дополнения к герою */
P.motes = (g, k, p) => { // частицы, поднимающиеся вверх
  const { c } = g, n = p.n ?? 24, f = fade(k, 0.1, 0.3);
  for (let i = 0; i < n; i++) { const t = (k * 1.3 + R(i, 7)) % 1; glow(c, g.x + (R(i, 8) - 0.5) * g.S * (p.spread ?? 0.6), g.y - t * g.H * (p.rise ?? 0.6), 3 + R(i, 9) * 3, p.c ?? lighten(g.col, 0.4), fade(t, 0.1, 0.5) * f); }
};
P.flash = (g, k, p) => { const a = clamp(1 - k / (p.len ?? 0.12)) * (p.a ?? 0.35); if (a > 0) { g.c.fillStyle = rgba(p.c ?? g.col, a); g.c.fillRect(0, 0, g.W, g.H); } };
P.embers = (g, k, p) => {
  const { c } = g, f = fade(k, 0.1, 0.3);
  for (let i = 0; i < (p.n ?? 24); i++) { const t = (k * 1.2 + R(i, 11)) % 1; glow(c, g.x + (R(i, 12) - 0.5) * g.S * 0.7 + Math.sin(t * 6 + i) * 12, g.y - t * g.H * 0.7, 2 + R(i, 13) * 3, p.c ?? "#ffb347", (1 - t) * f); }
};

/* ---------- примитивы для движений рук (core/motions.js) ---------- */
P.orbblast = (g, k) => { // расенган: вихрь в ладони крутится, летит и взрывается
  const { c, S } = g, t1 = clamp(k / 0.5), t2 = clamp((k - 0.5) / 0.5);
  const x = lerp(g.x, g.W * 0.5, easeOut(t2)), y = lerp(g.y, g.H * 0.3, easeOut(t2));
  if (t2 < 0.4) {
    const r = S * 0.1 * (0.4 + 0.6 * ease(t1)) * (1 + 0.12 * Math.sin(k * 60));
    glow(c, x, y, r * 2.4, g.col, 0.35); glow(c, x, y, r, g.col, 0.85); glow(c, x, y, r * 0.45, "#ffffff", 1);
    for (let i = 0; i < 5; i++) {
      const a0 = k * 40 + (i * TAU) / 5;
      c.strokeStyle = rgba(lighten(g.col, 0.6), 0.6); c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * (0.6 + 0.12 * i), a0, a0 + 1.2); c.stroke();
    }
  }
  if (t2 > 0.3) {
    const b = clamp((t2 - 0.3) / 0.7), f = 1 - b;
    glow(c, x, y, S * 0.5 * easeOut(b), g.col, 0.6 * f); glow(c, x, y, S * 0.18 * (1 - b * 0.5), "#ffffff", 0.9 * f);
    c.strokeStyle = rgba("#ffffff", 0.8 * f); c.lineWidth = 8 * f + 1; c.beginPath(); c.arc(x, y, S * 0.5 * easeOut(b), 0, TAU); c.stroke();
    for (let i = 0; i < 12; i++) { const a = R(i) * TAU, d = S * 0.5 * easeOut(b) * (0.5 + R(i, 2) * 0.6); glow(c, x + Math.cos(a) * d, y + Math.sin(a) * d, 4 + S * 0.01, lighten(g.col, 0.5), 0.9 * f); }
  }
};

P.blade = (g, k) => { // райкири: рука трещит и колет вперед молниеносным клинком
  const { c, S } = g, f = fade(k, 0.08, 0.35), reach = easeOut(clamp(k / 0.35));
  const tx = lerp(g.x, g.W * 0.5, reach), ty = lerp(g.y, g.H * 0.3, reach), seed = Math.floor(k * 40);
  glow(c, g.x, g.y, S * (0.1 + 0.08 * Math.sin(k * 90)), g.col, 0.8 * f);
  if (Math.hypot(tx - g.x, ty - g.y) > 2) for (let i = 0; i < 5; i++) neon(c, bolt(c, g.x, g.y, tx, ty, seed + i * 7, 0.06 + 0.02 * i), i ? lighten(g.col, 0.4) : g.col, i ? 1.4 : 4, f * (i ? 0.55 : 1));
  if (reach > 0.9) { glow(c, tx, ty, S * 0.3 * f, g.col, 0.6); for (let i = 0; i < 10; i++) { const a = R(i, seed) * TAU, d = S * 0.15 * R(i, 1); glow(c, tx + Math.cos(a) * d, ty + Math.sin(a) * d, 3, "#ffffff", 0.9 * f); } }
};

P.clones = (g, k) => { // теневые клоны: облачка дыма и ряд силуэтов
  const { c, S } = g, f = fade(k, 0.1, 0.3);
  for (let i = -2; i <= 2; i++) {
    const lk = clamp((k - Math.abs(i) * 0.08) / 0.4), x = g.W * 0.5 + i * S * 0.2, y = g.y;
    glow(c, x, y - S * 0.06, S * 0.16 * (1 - lk * 0.4), "#ffffff", 0.5 * (1 - lk));
    const a = ease(lk) * f;
    glow(c, x, y - S * 0.2, S * 0.05, g.col, 0.9 * a);
    c.save(); c.translate(x, y - S * 0.06); c.scale(0.55, 1.5); glow(c, 0, 0, S * 0.09, g.col, 0.75 * a); c.restore();
  }
};

P.blast = (g, k) => { // бомбарда: вспышка, огненный шар и разлетающиеся осколки
  const { c, S } = g, cx = g.W * 0.5, cy = g.H * 0.45, e = easeOut(clamp(k / 0.5)), f = 1 - clamp((k - 0.3) / 0.7);
  glow(c, cx, cy, S * 0.45 * e, "#ff7a1a", 0.8 * f); glow(c, cx, cy, S * 0.25 * e, "#ffd36b", 0.9 * f); glow(c, cx, cy, S * 0.1 * e, "#ffffff", f);
  c.strokeStyle = rgba("#ffd36b", 0.8 * f); c.lineWidth = 6 * f + 1; c.beginPath(); c.arc(cx, cy, S * 0.5 * e, 0, TAU); c.stroke();
  for (let i = 0; i < 18; i++) {
    const a = R(i) * TAU, d = S * (0.1 + 0.5 * e * (0.5 + R(i, 3)));
    stroke(c, [[cx + Math.cos(a) * d * 0.7, cy + Math.sin(a) * d * 0.7], [cx + Math.cos(a) * d, cy + Math.sin(a) * d]], "#ffb04a", 3, 0.9 * f);
  }
};

P.shockwave = (g, k) => { // эверте статум: волны давления летят от кастера к цели
  const { c, S } = g, f = fade(k, 0.1, 0.4), tx = g.W * 0.5, ty = g.H * 0.32;
  for (let i = 0; i < 4; i++) {
    const t = clamp(k * 1.4 - i * 0.12), x = lerp(g.x, tx, easeOut(t)), y = lerp(g.y, ty, easeOut(t)), r = S * (0.08 + 0.22 * t);
    c.strokeStyle = rgba(lighten(g.col, 0.4), 0.8 * (1 - t) * f); c.lineWidth = 6 * (1 - t) + 1; c.beginPath(); c.ellipse(x, y, r, r * 0.5, 0, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 10; i++) { const o = (R(i) - 0.5) * S * 0.3, t = clamp(k * 1.4 - R(i, 1) * 0.3); stroke(c, [[lerp(g.x, tx, t * 0.7) + o, lerp(g.y, ty, t * 0.7)], [lerp(g.x, tx, t) + o, lerp(g.y, ty, t)]], g.col, 2, 0.5 * f); }
};

P.implode = (g, k) => { // редукто: преграда сжимается в точку и рассыпается осколками
  const { c, S } = g, cx = g.W * 0.5, cy = g.H * 0.4;
  if (k < 0.55) {
    const t = k / 0.55;
    for (let i = 0; i < 3; i++) { const r = S * 0.4 * (1 - clamp(t - i * 0.1)); c.strokeStyle = rgba(g.col, 0.7 * t); c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke(); }
    for (let i = 0; i < 24; i++) { const a = R(i) * TAU, d = S * (0.45 - 0.4 * t) * (0.6 + R(i, 2) * 0.6); glow(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + S * 0.008, lighten(g.col, 0.3), 0.8); }
    glow(c, cx, cy, S * 0.1 * t, "#ffffff", 0.9 * t);
  } else {
    const b = (k - 0.55) / 0.45, f = 1 - b;
    glow(c, cx, cy, S * 0.4 * f, "#ffffff", 0.9 * f);
    for (let i = 0; i < 16; i++) { const a = R(i, 5) * TAU, d = S * 0.45 * easeOut(b) * (0.4 + R(i, 7)); stroke(c, [[cx + Math.cos(a) * d * 0.8, cy + Math.sin(a) * d * 0.8], [cx + Math.cos(a) * d, cy + Math.sin(a) * d]], g.col, 3, 0.9 * f); }
  }
};

export const FX_PRIMITIVES = Object.keys(P);

/**
 * Рисует один кадр эффекта. fx: слои, k: 0..1 по длительности, geo: { W, H, x, y, color, power }.
 * Контекст должен быть в системе координат CSS-пикселей.
 */
export function drawFx(ctx, fx, k, geo) {
  const g = { c: ctx, W: geo.W, H: geo.H, x: geo.x ?? geo.W / 2, y: geo.y ?? geo.H * 0.72, col: geo.color ?? "#ffffff", pw: geo.power ?? 5, S: Math.min(geo.W, geo.H) };
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const layer of fx) {
    const at = layer.at ?? 0, len = layer.len ?? 1 - at, lk = (k - at) / len;
    if (lk < 0 || lk > 1) continue;
    const draw = P[layer.p]; if (!draw) continue;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 1;
    const g2 = layer.c ? { ...g, col: layer.c } : g;
    draw(g2, lk, layer);
    ctx.restore();
  }
  ctx.restore();
}

export const fxDuration = (power = 5) => 2.6 + power * 0.1;

/** Запускает анимацию на canvas. Возвращает функцию отмены. */
export function playFx(canvas, fx, { x, y, power = 5, color } = {}) {
  const ctx = canvas.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1), rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const dur = fxDuration(power), geo = { W: rect.width, H: rect.height, x, y, color, power };
  const t0 = performance.now(); let alive = true;
  const frame = (now) => {
    if (!alive) return;
    const k = (now - t0) / 1000 / dur;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    if (k >= 1) return;
    drawFx(ctx, fx, k, geo);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => { alive = false; ctx.clearRect(0, 0, rect.width, rect.height); };
}
