// Чистая логика генеративной музыки: настроения, аккорды, события шага.
// Звук делает engine/audio.js, здесь только данные и правила (тестируется в node).

export const SCALES = {
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

// root: MIDI тоника, prog: степени аккордов по тактам (индекс ступени 0..6), 16 шагов (шестнадцатых) в такте
export const MOODS = {
  menu: { bpm: 74, root: 50, scale: "harmonicMinor", prog: [0, 5, 3, 4], bell: 0.55, bellSteps: [0, 3, 6, 8, 11, 14], pad: true, drums: false, bass: "long" },
  play: { bpm: 104, root: 50, scale: "phrygian", prog: [0, 0, 5, 4], bell: 0.28, bellSteps: [2, 6, 10, 14], pad: true, drums: "soft", bass: "pulse" },
  fight: { bpm: 140, root: 52, scale: "harmonicMinor", prog: [0, 5, 3, 4], bell: 0.45, bellSteps: [0, 2, 4, 6, 8, 10, 12, 14], pad: false, drums: "hard", bass: "drive" },
  board: { bpm: 112, root: 50, scale: "major", prog: [0, 4, 5, 3], bell: 0.7, bellSteps: [0, 2, 4, 6, 8, 10, 12, 14], pad: true, drums: "soft", bass: "quarter" },
};

export const STEPS_PER_BAR = 16;
export const stepSeconds = (mood) => 60 / MOODS[mood].bpm / 4;
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (s) => {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/** MIDI ноты по ступени лада; ступени за пределами 0..6 уходят в соседние октавы. */
export function degreeMidi(mood, degree, octave = 0) {
  const m = MOODS[mood];
  const sc = SCALES[m.scale];
  const oct = Math.floor(degree / sc.length);
  const idx = ((degree % sc.length) + sc.length) % sc.length;
  return m.root + sc[idx] + (oct + octave) * 12;
}

export function chordMidis(mood, bar) {
  const m = MOODS[mood];
  const d = m.prog[((bar % m.prog.length) + m.prog.length) % m.prog.length];
  return [degreeMidi(mood, d), degreeMidi(mood, d + 2), degreeMidi(mood, d + 4)];
}

/**
 * События одного шага. mem хранит блуждание мелодии между вызовами.
 * Голоса: pad, bass, bell, kick, snare, hat, stab. steps: длительность в шагах.
 */
export function stepEvents(mood, step, rng, mem = {}) {
  const m = MOODS[mood];
  const s = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const chord = chordMidis(mood, bar);
  const ev = [];

  if (m.pad && s === 0) for (const n of chord) ev.push({ v: "pad", midi: n + 12, steps: STEPS_PER_BAR, vel: 0.5 });

  if (m.bass === "long" && s === 0) ev.push({ v: "bass", midi: chord[0] - 12, steps: STEPS_PER_BAR - 2, vel: 0.9 });
  if (m.bass === "pulse" && s % 4 === 0) ev.push({ v: "bass", midi: chord[0] - 12, steps: 3, vel: s === 0 ? 0.95 : 0.7 });
  if (m.bass === "quarter" && s % 4 === 0) ev.push({ v: "bass", midi: chord[s % 8 === 0 ? 0 : 2] - 12, steps: 3, vel: 0.8 });
  if (m.bass === "drive" && s % 2 === 0) ev.push({ v: "bass", midi: chord[0] - 12 + (s % 8 === 6 ? 12 : 0), steps: 2, vel: s % 8 === 0 ? 0.95 : 0.65 });

  if (m.drums) {
    const hard = m.drums === "hard";
    if (hard ? s % 4 === 0 : s === 0 || s === 8) ev.push({ v: "kick", vel: 1 });
    if (s === 4 || s === 12) ev.push({ v: "snare", vel: hard ? 0.9 : 0.5 });
    if (hard ? s % 2 === 1 : s % 4 === 2) ev.push({ v: "hat", vel: hard ? 0.5 : 0.35 });
  }

  if (m.bellSteps.includes(s) && rng() < m.bell) {
    const deg = mem.deg ?? 4;
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rng() * 7)];
    mem.deg = Math.max(0, Math.min(10, deg + move));
    ev.push({ v: "bell", midi: degreeMidi(mood, mem.deg, 1), steps: 4, vel: 0.5 + rng() * 0.3 });
  }

  if ((mood === "fight" || mood === "play") && (mood === "fight" ? s % 4 === 3 : s === 7 || s === 15) && rng() < 0.55) {
    ev.push({ v: "stab", midi: chord[Math.floor(rng() * 3)] + 12, steps: 2, vel: 0.55 });
  }
  return ev;
}
