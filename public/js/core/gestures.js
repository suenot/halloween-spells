// Trace points are {x,y,t} in 0..1 screen space AS THE PLAYER SEES IT (x already mirrored), y grows downward.
export const WAND = ["circle", "swipe_right", "swipe_left", "up", "down", "zigzag"];
export const SEALS = ["prayer", "fist_palm", "double_fist", "peace", "open_hands", "fist_up"];
// Движения руки во времени (core/motions.js): их видно только по ряду кадров, а не по одной позе.
export const MOTIONS = ["charge", "spin", "push", "spread", "crush", "shake"];

export const GESTURE_LABELS = {
  circle: "Нарисуй круг палочкой",
  swipe_right: "Взмах вправо",
  swipe_left: "Взмах влево",
  up: "Взмах вверх",
  down: "Рубящий удар вниз",
  zigzag: "Зигзаг, как молния",
  prayer: "Тигр: ладони вместе, пальцы вверх",
  fist_palm: "Собака: кулак в ладонь",
  double_fist: "Свинья: два кулака рядом",
  peace: "Овца: два пальца вверх",
  open_hands: "Обезьяна: обе ладони открыты и раздвинуты",
  fist_up: "Змея: кулак высоко над головой (упрощенно)",
  charge: "Накопи силу: сожми кулак и держи",
  spin: "Раскрути шар: води ладонью кругами",
  push: "Толчок: резко выбрось ладонь к камере",
  spread: "Растяни: разведи руки в стороны",
  crush: "Сожми: раскрытая ладонь в кулак",
  shake: "Встряхни: быстрая дрожь кулака",
};

export const gestureKind = (id) => (WAND.includes(id) ? "wand" : SEALS.includes(id) ? "seal" : MOTIONS.includes(id) ? "motion" : null);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const NONE = { id: null, confidence: 0 };

export function classifyTrace(points) {
  if (!Array.isArray(points) || points.length < 8) return NONE;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const size = Math.max(w, h);
  if (size < 0.1) return NONE;

  let path = 0;
  for (let i = 1; i < points.length; i++) path += dist(points[i - 1], points[i]);
  const first = points[0];
  const last = points[points.length - 1];
  const net = dist(first, last);

  // circle: closed loop sweeping nearly a full turn
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  let swept = 0;
  let prevA = Math.atan2(points[0].y - cy, points[0].x - cx);
  for (let i = 1; i < points.length; i++) {
    const a = Math.atan2(points[i].y - cy, points[i].x - cx);
    let d = a - prevA;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
    prevA = a;
  }
  const aspect = Math.min(w, h) / Math.max(w, h);
  if (Math.abs(swept) > 5.2 && net < 0.45 * size && aspect > 0.45) {
    return { id: "circle", confidence: Math.min(1, Math.abs(swept) / (2 * Math.PI)) };
  }

  // zigzag: several reversals of horizontal direction with real amplitude
  let reversals = 0;
  let dir = 0;
  let anchor = points[0].x;
  for (const p of points) {
    const dx = p.x - anchor;
    if (Math.abs(dx) > 0.05) {
      const nd = Math.sign(dx);
      if (dir !== 0 && nd !== dir) reversals++;
      dir = nd;
      anchor = p.x;
    }
  }
  if (reversals >= 2 && net < 0.6 * path) {
    return { id: "zigzag", confidence: Math.min(1, reversals / 3) };
  }

  // straight swipe
  if (net >= 0.2 && net / path >= 0.7) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const conf = Math.min(1, net / 0.4);
    if (Math.abs(dx) >= Math.abs(dy)) return { id: dx > 0 ? "swipe_right" : "swipe_left", confidence: conf };
    return { id: dy < 0 ? "up" : "down", confidence: conf };
  }
  return NONE;
}

// MediaPipe layout: 0 wrist, 5/9/13/17 finger MCPs, (6,8) (10,12) (14,16) (18,20) = (pip, tip)
const FINGERS = [[6, 8], [10, 12], [14, 16], [18, 20]];

export function describeHand(lm) {
  const wrist = lm[0];
  const size = dist(wrist, lm[9]) || 1e-6;
  const extended = FINGERS.map(([pip, tip]) => dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.15);
  const palm = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + lm[i].x / 5, y: a.y + lm[i].y / 5 }), { x: 0, y: 0 });
  const up = FINGERS.every(([, tip]) => lm[tip].y < wrist.y);
  return { extended, count: extended.filter(Boolean).length, size, palm, wrist, up };
}

export function classifyPose(hands) {
  if (!Array.isArray(hands) || hands.length === 0) return NONE;
  const hs = hands.filter((h) => Array.isArray(h) && h.length >= 21).map(describeHand);
  const ok = (id) => ({ id, confidence: 0.9 });
  if (hs.length >= 2) {
    const [a, b] = hs;
    const gap = dist(a.palm, b.palm) / ((a.size + b.size) / 2);
    if (a.count >= 3 && b.count >= 3 && gap < 1.4 && a.up && b.up) return ok("prayer");
    if (gap < 2.4 && ((a.count <= 1 && b.count >= 3) || (b.count <= 1 && a.count >= 3))) return ok("fist_palm");
    if (gap < 2.4 && a.count <= 1 && b.count <= 1) return ok("double_fist");
    if (a.count === 4 && b.count === 4 && gap > 2.6) return ok("open_hands");
  }
  for (const h of hs) {
    const [i, m, r, p] = h.extended;
    if (i && m && !r && !p) return ok("peace");
  }
  for (const h of hs) {
    if (h.count <= 1 && h.wrist.y < 0.4) return ok("fist_up");
  }
  return NONE;
}

// fraction of expected steps that appear in observed, in order
export function matchSequence(expected, observed) {
  if (!expected?.length) return 0;
  let j = 0;
  for (const step of observed ?? []) {
    if (j < expected.length && step === expected[j]) j++;
  }
  return j / expected.length;
}
