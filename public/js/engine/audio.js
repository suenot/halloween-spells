// Звук без файлов: все эффекты и музыка синтезируются Web Audio прямо в браузере (работает офлайн).
// Рецепты принимают (ac, out, t, opts), поэтому их можно рендерить и в OfflineAudioContext.
import { MOODS, STEPS_PER_BAR, stepSeconds, stepEvents, midiToHz, mulberry32, hashString } from "../core/music.js";

const KEY = "hs-audio";
const noiseCache = new WeakMap();

/* ------------------------------------------------------------ primitives */
function noiseBuffer(ac) {
  let b = noiseCache.get(ac);
  if (!b) {
    b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ac, b);
  }
  return b;
}

function envelope(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(ac, out, { type = "sine", f = 440, f2, t = 0, a = 0.005, d = 0.2, g = 0.3, det = 0, lp, q = 1, lfo }) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + a + d);
  if (det) o.detune.value = det;
  const gain = ac.createGain(); envelope(gain, t, a, d, g);
  let node = o;
  if (lp) { const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; fl.Q.value = q; o.connect(fl); node = fl; }
  node.connect(gain); gain.connect(out);
  if (lfo) { const l = ac.createOscillator(); const lg = ac.createGain(); l.frequency.value = lfo.hz; lg.gain.value = lfo.depth; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + a + d + 0.1); }
  o.start(t); o.stop(t + a + d + 0.05);
  return o;
}

function noise(ac, out, { t = 0, a = 0.01, d = 0.3, g = 0.3, type = "bandpass", f = 1000, f2, q = 1 }) {
  const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac); s.loop = true;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + a + d);
  const gain = ac.createGain(); envelope(gain, t, a, d, g);
  s.connect(fl); fl.connect(gain); gain.connect(out);
  s.start(t, Math.random()); s.stop(t + a + d + 0.05);
}

const semis = (n) => 2 ** (n / 12);

/* ------------------------------------------------------------ sfx recipes */
// o: { power 1..10, seed (число для вариации заклинаний), n (для отсчета) }
const ELEMENT_SFX = {
  fire(ac, out, t, o) {
    const k = o.k;
    noise(ac, out, { t, a: 0.06, d: 0.7 * o.len, g: 0.5, f: 400 * k, f2: 2200 * k, q: 0.9 });
    tone(ac, out, { f: 130 * k, f2: 45, t, d: 0.35, g: 0.7 });
    for (let i = 0; i < 6 + o.power; i++) noise(ac, out, { t: t + 0.1 + Math.random() * 0.8 * o.len, a: 0.002, d: 0.03, g: 0.35, type: "highpass", f: 2500 + Math.random() * 3000 });
  },
  water(ac, out, t, o) {
    const k = o.k;
    noise(ac, out, { t, a: 0.1, d: 0.6 * o.len, g: 0.25, type: "lowpass", f: 900, f2: 300 });
    for (let i = 0; i < 6; i++) { const f = (400 + Math.random() * 800) * k; tone(ac, out, { f, f2: f * 1.6, t: t + i * 0.07 + Math.random() * 0.04, d: 0.09, g: 0.28 }); }
    tone(ac, out, { f: 300 * k, f2: 120, t, d: 0.4, g: 0.4 });
  },
  earth(ac, out, t, o) {
    const k = o.k;
    tone(ac, out, { f: 95 * k, f2: 34, t, d: 0.6 * o.len, g: 0.65 });
    noise(ac, out, { t, a: 0.02, d: 0.8 * o.len, g: 0.5, type: "lowpass", f: 260, q: 0.7 });
    noise(ac, out, { t, a: 0.002, d: 0.06, g: 0.5, type: "highpass", f: 1500 });
    noise(ac, out, { t: t + 0.18, a: 0.002, d: 0.05, g: 0.3, type: "highpass", f: 1100 });
  },
  air(ac, out, t, o) {
    const k = o.k;
    noise(ac, out, { t, a: 0.25 * o.len, d: 0.6 * o.len, g: 0.45, f: 300 * k, f2: 3200 * k, q: 1.4 });
    noise(ac, out, { t: t + 0.35 * o.len, a: 0.1, d: 0.5, g: 0.3, f: 3000 * k, f2: 500, q: 1.4 });
    tone(ac, out, { f: 900 * k, f2: 1500 * k, t, d: 0.7, g: 0.05, lfo: { hz: 6, depth: 25 } });
  },
  lightning(ac, out, t, o) {
    const k = o.k;
    noise(ac, out, { t, a: 0.001, d: 0.12, g: 0.9, type: "highpass", f: 3000 });
    tone(ac, out, { type: "sawtooth", f: 2200 * k, f2: 90, t, d: 0.3, g: 0.35, lp: 3500 });
    noise(ac, out, { t: t + 0.1, a: 0.05, d: 0.9 * o.len, g: 0.6, type: "lowpass", f: 250 });
    for (let i = 1; i <= 3; i++) noise(ac, out, { t: t + 0.07 * i + Math.random() * 0.03, a: 0.001, d: 0.05, g: 0.5, type: "highpass", f: 4000 });
  },
  ice(ac, out, t, o) {
    const k = o.k;
    [1, 2.76, 5.4, 8.93].forEach((r, i) => tone(ac, out, { f: 1046 * k * r / (i > 1 ? 2 : 1), t: t + i * 0.025, a: 0.002, d: 0.9 * o.len / (1 + i * 0.5), g: 0.22 / (1 + i * 0.3) }));
    noise(ac, out, { t, a: 0.002, d: 0.12, g: 0.4, type: "highpass", f: 6500 });
    noise(ac, out, { t: t + 0.05, a: 0.2, d: 0.5, g: 0.1, type: "highpass", f: 8000 });
  },
  dark(ac, out, t, o) {
    const k = o.k;
    tone(ac, out, { type: "sawtooth", f: 110 * k, f2: 62, t, a: 0.3, d: 0.9 * o.len, g: 0.35, lp: 500, q: 3 });
    tone(ac, out, { type: "sawtooth", f: 116.5 * k, f2: 58, t, a: 0.3, d: 0.9 * o.len, g: 0.3, lp: 450, q: 3, det: 15 });
    noise(ac, out, { t: t + 0.1, a: 0.4, d: 0.7, g: 0.12, f: 1300, q: 9 });
    tone(ac, out, { f: 55, f2: 40, t, d: 0.9, g: 0.5 });
  },
  light(ac, out, t, o) {
    const k = o.k;
    [0, 4, 7, 12, 16, 19].forEach((s, i) => {
      const f = 523 * k * semis(s);
      tone(ac, out, { type: "triangle", f, t: t + i * 0.06, a: 0.004, d: 0.7 * o.len, g: 0.22 });
      tone(ac, out, { f: f * 3, t: t + i * 0.06, a: 0.002, d: 0.25, g: 0.07 });
    });
    noise(ac, out, { t, a: 0.4, d: 0.6, g: 0.1, type: "highpass", f: 7500 });
  },
};

const RECIPES = {
  click(ac, out, t) { tone(ac, out, { type: "triangle", f: 880, f2: 1250, t, d: 0.07, g: 0.25 }); },
  pop(ac, out, t) { tone(ac, out, { f: 300, f2: 700, t, d: 0.12, g: 0.35 }); noise(ac, out, { t, a: 0.002, d: 0.04, g: 0.15, type: "highpass", f: 3000 }); },
  whoosh(ac, out, t) { noise(ac, out, { t, a: 0.12, d: 0.35, g: 0.22, f: 400, f2: 2600, q: 0.8 }); },
  tick(ac, out, t, o) {
    const last = o.n === 1;
    tone(ac, out, { type: "triangle", f: last ? 784 : 523, t, d: 0.18, g: 0.5 });
    tone(ac, out, { f: last ? 1568 : 1046, t, d: 0.1, g: 0.15 });
  },
  go(ac, out, t) {
    [0, 4, 7, 12].forEach((s, i) => tone(ac, out, { type: "sawtooth", f: 392 * semis(s), t: t + i * 0.03, a: 0.01, d: 0.6, g: 0.16, lp: 2600 }));
    noise(ac, out, { t, a: 0.05, d: 0.5, g: 0.25, f: 500, f2: 4000, q: 0.8 });
  },
  success(ac, out, t) {
    [0, 4, 7, 12, 16].forEach((s, i) => {
      tone(ac, out, { type: "triangle", f: 523 * semis(s), t: t + i * 0.08, d: 0.5, g: 0.28 });
      tone(ac, out, { f: 1046 * semis(s), t: t + i * 0.08, d: 0.25, g: 0.1 });
    });
    for (let i = 0; i < 8; i++) tone(ac, out, { f: 2000 + Math.random() * 3000, t: t + 0.3 + Math.random() * 0.5, a: 0.002, d: 0.08, g: 0.07 });
  },
  fail(ac, out, t) {
    [[330, 262], [262, 196]].forEach(([a, b], i) => tone(ac, out, { type: "sawtooth", f: a, f2: b, t: t + i * 0.28, a: 0.02, d: 0.3, g: 0.3, lp: 900, q: 4 }));
    tone(ac, out, { type: "sawtooth", f: 196, f2: 150, t: t + 0.56, d: 0.6, g: 0.25, lp: 700, q: 4 });
  },
  award(ac, out, t) {
    tone(ac, out, { type: "square", f: 988, t, d: 0.08, g: 0.15 });
    tone(ac, out, { type: "square", f: 1319, t: t + 0.08, d: 0.4, g: 0.15 });
  },
  roar(ac, out, t) {
    tone(ac, out, { type: "sawtooth", f: 95, f2: 55, t, a: 0.05, d: 0.9, g: 0.5, lp: 600, q: 5, lfo: { hz: 28, depth: 20 } });
    noise(ac, out, { t, a: 0.05, d: 0.8, g: 0.3, type: "lowpass", f: 700, f2: 200, q: 2 });
  },
  monsterHit(ac, out, t) {
    tone(ac, out, { f: 160, f2: 45, t, d: 0.25, g: 0.55 });
    tone(ac, out, { type: "square", f: 700, f2: 120, t, d: 0.18, g: 0.2 });
    noise(ac, out, { t, a: 0.002, d: 0.1, g: 0.3, type: "highpass", f: 1800 });
  },
  monsterDie(ac, out, t) {
    tone(ac, out, { type: "sawtooth", f: 700, f2: 60, t, a: 0.02, d: 0.9, g: 0.3, lp: 1400, q: 3, lfo: { hz: 12, depth: 40 } });
    noise(ac, out, { t: t + 0.7, a: 0.01, d: 0.5, g: 0.5, type: "lowpass", f: 1200, f2: 150 });
    tone(ac, out, { f: 90, f2: 30, t: t + 0.7, d: 0.5, g: 0.8 });
  },
  fanfare(ac, out, t) {
    const brass = (f, at, d) => {
      tone(ac, out, { type: "sawtooth", f, t: t + at, a: 0.03, d, g: 0.2, lp: 2200, q: 1.5 });
      tone(ac, out, { type: "sawtooth", f: f * 1.005, t: t + at, a: 0.03, d, g: 0.16, lp: 2000 });
    };
    brass(261.6, 0, 0.25); brass(329.6, 0.22, 0.25); brass(392, 0.44, 0.25); brass(523.2, 0.66, 1.1); brass(392, 0.66, 1.1); brass(659.3, 0.9, 0.9);
    tone(ac, out, { f: 98, f2: 60, t, d: 0.4, g: 0.7 }); tone(ac, out, { f: 98, f2: 60, t: t + 0.66, d: 0.6, g: 0.8 });
    noise(ac, out, { t: t + 0.66, a: 0.01, d: 1, g: 0.12, type: "highpass", f: 6000 });
  },
  ghost(ac, out, t) { tone(ac, out, { f: 380, f2: 700, t, a: 0.3, d: 0.8, g: 0.2, lfo: { hz: 5, depth: 30 } }); },
  bat(ac, out, t) { for (let i = 0; i < 3; i++) tone(ac, out, { f: 3000, f2: 5200, t: t + i * 0.09, a: 0.004, d: 0.05, g: 0.1 }); },
  creak(ac, out, t) { tone(ac, out, { type: "sawtooth", f: 140, f2: 260, t, a: 0.1, d: 0.8, g: 0.15, lp: 700, q: 8, lfo: { hz: 14, depth: 25 } }); },
};

export const SFX_NAMES = [...Object.keys(RECIPES), ...Object.keys(ELEMENT_SFX).map((e) => `spell:${e}`)];

function playRecipe(ac, out, t, name, o = {}) {
  const power = o.power ?? 5;
  const base = { power, len: 0.8 + power * 0.05, n: o.n, k: 1 };
  if (name.startsWith("spell:")) {
    const seed = o.seed ?? 0;
    base.k = semis((seed % 7) - 3); // тот же элемент, но у каждого заклинания своя высота
    (ELEMENT_SFX[name.slice(6)] ?? ELEMENT_SFX.light)(ac, out, t, base);
  } else RECIPES[name]?.(ac, out, t, base);
}

/* ------------------------------------------------------------ music voices */
function musicVoice(ac, out, t, e, mood, stepDur) {
  const f = e.midi != null ? midiToHz(e.midi) : 0;
  const len = (e.steps ?? 1) * stepDur;
  switch (e.v) {
    case "pad":
      tone(ac, out, { type: "sawtooth", f, t, a: Math.min(1.2, len * 0.4), d: len, g: 0.05 * e.vel, lp: 700, det: -8 });
      tone(ac, out, { type: "sawtooth", f, t, a: Math.min(1.2, len * 0.4), d: len, g: 0.05 * e.vel, lp: 700, det: 8 });
      break;
    case "bass":
      tone(ac, out, { type: "sawtooth", f, t, a: 0.01, d: Math.min(len, 1.2), g: 0.2 * e.vel, lp: 320, q: 2 });
      tone(ac, out, { f, t, a: 0.01, d: Math.min(len, 1.2), g: 0.28 * e.vel });
      break;
    case "bell":
      tone(ac, out, { type: "triangle", f, t, a: 0.003, d: 1.4, g: 0.16 * e.vel });
      tone(ac, out, { f: f * 4, t, a: 0.002, d: 0.3, g: 0.05 * e.vel });
      break;
    case "stab":
      tone(ac, out, { type: "sawtooth", f, f2: f * 0.97, t, a: 0.005, d: 0.2, g: 0.1 * e.vel, lp: 2200, q: 3 });
      break;
    case "kick": tone(ac, out, { f: 150, f2: 42, t, a: 0.002, d: 0.18, g: 0.8 * e.vel }); break;
    case "snare":
      noise(ac, out, { t, a: 0.002, d: 0.12, g: 0.22 * e.vel, f: 1900, q: 0.8 });
      tone(ac, out, { type: "triangle", f: 220, f2: 140, t, d: 0.08, g: 0.15 * e.vel });
      break;
    case "hat": noise(ac, out, { t, a: 0.001, d: 0.04, g: 0.1 * e.vel, type: "highpass", f: 7500 }); break;
  }
}

/* ------------------------------------------------------------ live engine */
const prefs = (() => {
  const d = { muted: false, volume: 0.7, music: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return d; }
})();
const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ } };

let ac = null, master = null, sfxBus = null, musicBus = null, run = null;
let wantMood = null, hushed = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn({ ...prefs }));

function ensure() {
  if (ac) return ac;
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return null;
  ac = new Ctor();
  const comp = ac.createDynamicsCompressor();
  master = ac.createGain(); sfxBus = ac.createGain(); musicBus = ac.createGain();
  sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ac.destination);
  applyLevels();
  return ac;
}

function applyLevels() {
  if (!ac) return;
  const now = ac.currentTime;
  master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, now, 0.05);
  sfxBus.gain.setTargetAtTime(1, now, 0.05);
  musicBus.gain.setTargetAtTime(prefs.music ? (hushed ? 0.06 : 0.55) : 0, now, hushed ? 0.15 : 0.6);
}

function ready() { return ac && ac.state === "running" && !prefs.muted; }

function startMusic(mood) {
  stopRun();
  if (!MOODS[mood] || !ready()) return;
  const bus = ac.createGain(); bus.gain.value = 0.0001; bus.connect(musicBus);
  bus.gain.setTargetAtTime(1, ac.currentTime, 0.8);
  const r = { mood, bus, step: 0, next: ac.currentTime + 0.15, rng: mulberry32(hashString(mood) ^ (Date.now() & 0xffff)), mem: {}, timer: 0 };
  const sd = stepSeconds(mood);
  r.timer = setInterval(() => {
    if (r.next < ac.currentTime - 0.4) r.next = ac.currentTime + 0.05; // вкладка спала
    while (r.next < ac.currentTime + 0.4) {
      for (const e of stepEvents(mood, r.step, r.rng, r.mem)) musicVoice(ac, bus, r.next, e, mood, sd);
      r.next += sd; r.step++;
    }
  }, 100);
  run = r;
}

function stopRun() {
  if (!run) return;
  const r = run; run = null;
  clearInterval(r.timer);
  r.bus.gain.cancelScheduledValues(ac.currentTime);
  r.bus.gain.setTargetAtTime(0.0001, ac.currentTime, 0.25);
  setTimeout(() => r.bus.disconnect(), 2000);
}

function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") c.resume().then(() => { if (wantMood && !run) startMusic(wantMood); });
  else if (wantMood && !run) startMusic(wantMood);
}
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, unlock, { capture: true });

export const audio = {
  prefs: () => ({ ...prefs }),
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setMuted(m) { prefs.muted = !!m; savePrefs(); applyLevels(); if (prefs.muted) stopRun(); else if (wantMood && !run) startMusic(wantMood); emit(); },
  setVolume(v) { prefs.volume = Math.max(0, Math.min(1, v)); savePrefs(); applyLevels(); emit(); },
  setMusic(on) { prefs.music = !!on; savePrefs(); applyLevels(); if (on && wantMood && !run) startMusic(wantMood); emit(); },
  /** Настроение музыки: menu | play | fight | board | null (тишина). */
  mood(name) { if (name === wantMood && (run || !ready())) return; wantMood = name; if (!name) return stopRun(); if (ac) startMusic(name); },
  /** Приглушить музыку, пока микрофон слушает игрока. */
  hush(on) { hushed = !!on; applyLevels(); },
  sfx(name, opts) { if (!ready()) return; try { playRecipe(ac, sfxBus, ac.currentTime + 0.01, name, opts); } catch { /* звук не критичен */ } },
  /** Звук заклинания: стихия + высота по id заклинания. */
  spell(spell, power) { if (spell) audio.sfx(`spell:${spell.element}`, { power: power ?? spell.power, seed: hashString(spell.id) }); },
  spellByElement(element, power) { audio.sfx(`spell:${element}`, { power }); },
};

/** Рендер звука без динамиков (проверка и экспорт). Возвращает AudioBuffer. */
export async function renderOffline(name, opts = {}, seconds = 2.5, sampleRate = 22050) {
  const oc = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const g = oc.createGain(); g.connect(oc.destination);
  playRecipe(oc, g, 0.01, name, opts);
  return oc.startRendering();
}

export async function renderMusicOffline(mood, bars = 2, sampleRate = 22050) {
  const sd = stepSeconds(mood);
  const oc = new OfflineAudioContext(1, Math.ceil(bars * STEPS_PER_BAR * sd * sampleRate), sampleRate);
  const g = oc.createGain(); g.connect(oc.destination);
  const rng = mulberry32(7), mem = {};
  for (let s = 0; s < bars * STEPS_PER_BAR; s++) for (const e of stepEvents(mood, s, rng, mem)) musicVoice(oc, g, s * sd, e, mood, sd);
  return oc.startRendering();
}
