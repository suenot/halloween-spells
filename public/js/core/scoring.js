const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function scoreAttempt({ phraseSim, gestureOk, difficulty = 1, lenient = true }) {
  const p = clamp01(phraseSim);
  const g = clamp01(gestureOk);
  const word = Math.round(p * 50);
  const gesture = Math.round(g * 50);
  const d = Math.min(5, Math.max(1, Math.round(Number.isFinite(difficulty) ? difficulty : 1)));
  const total = Math.round((word + gesture) * (1 + (d - 1) * 0.25));
  const threshold = lenient ? 0.5 : 0.8;
  return { word, gesture, total, success: p >= threshold && g >= threshold };
}
