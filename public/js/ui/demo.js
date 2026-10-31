// Анимированная демонстрация жестов: 3D-ролики руки (tools/blender) по шагам заклинания.
// Для палочки поверх ролика рисуется светящийся след по заранее записанной траектории кончика.
import { h } from "./dom.js";
import { WAND, MOTIONS, GESTURE_LABELS } from "../core/gestures.js";
import { createMotionDemo } from "./motion-demo.js";
import { GESTURE_ICONS } from "./labels.js";

const clipOf = (g) => (WAND.includes(g) ? `w_${g}` : g);
const url = (g, ext) => `assets/gestures/${clipOf(g)}.${ext}`;
const traces = new Map();

async function loadTrace(g) {
  if (!WAND.includes(g)) return null;
  if (!traces.has(g)) traces.set(g, fetch(url(g, "json")).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return traces.get(g);
}

/**
 * steps: id жестов по порядку. opts.compact: меньше размер (подсказка во время каста).
 * Возвращает элемент; у него есть .destroy().
 */
export function demoPlayer(steps, { compact = false, color } = {}) {
  let i = 0, raf = 0, trace = null, alive = true, motion = null;
  const video = h("video", { muted: true, playsinline: true, preload: "auto", class: "demo-video" });
  video.muted = true;
  const canvas = h("canvas", { class: "demo-trail", width: 420, height: 420 });
  const stage = h("div", { class: "demo-stage" }, video, canvas);
  const caption = h("div", { class: "demo-caption" });
  const chips = h("div", { class: "demo-steps" });
  const root = h("div", { class: `demo${compact ? " compact" : ""}` }, stage, caption, steps.length > 1 ? chips : "");

  function paintChips() {
    chips.replaceChildren(...steps.map((g, k) =>
      h("button", { type: "button", class: `demo-chip${k === i ? " on" : ""}${k < i ? " done" : ""}`, onclick: () => go(k) },
        h("b", {}, GESTURE_ICONS[g] ?? "?"), h("span", {}, `${k + 1}`))));
    caption.replaceChildren(
      h("span", { class: "demo-n" }, steps.length > 1 ? `Шаг ${i + 1} из ${steps.length}` : "Как делать"),
      h("strong", {}, GESTURE_LABELS[steps[i]] ?? steps[i]));
  }

  async function go(k) {
    i = (k + steps.length) % steps.length;
    paintChips();
    const g = steps[i];
    trace = null;
    clearTrail();
    if (MOTIONS.includes(g)) {
      video.pause(); video.removeAttribute("src"); video.style.display = "none";
      motion = createMotionDemo(g, { color: /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : "#ffb84a", once: steps.length > 1 });
      return;
    }
    motion = null; video.style.display = "";
    video.loop = steps.length === 1;
    video.src = url(g, "webm");
    video.play().catch(() => {});
    trace = await loadTrace(g);
  }

  function clearTrail() { canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height); }

  function drawTrail() {
    if (!alive) return;
    raf = requestAnimationFrame(drawTrail);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (motion) {
      motion.draw(ctx, canvas.width, canvas.height);
      if (motion.done) setTimeout(() => alive && go(i + 1), 350), motion = null;
      return;
    }
    if (!trace || !video.duration) return;
    const f = Math.floor(video.currentTime * trace.fps);
    const [a, b] = trace.trace;
    if (f <= a) return;
    const end = Math.min(f, b);
    const fade = f > trace.hold ? Math.max(0, 1 - (f - trace.hold) / 8) : 1;
    if (!fade) return;
    const W = canvas.width, H = canvas.height;
    const pts = trace.tip.slice(a, end + 1).map(([x, y]) => [x * W, y * H]);
    if (pts.length < 2) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.globalAlpha = fade;
    for (const [w, c] of [[16, "rgba(255,190,70,0.18)"], [9, "rgba(255,210,110,0.4)"], [4, "rgba(255,248,210,0.95)"]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  video.addEventListener("ended", () => { if (steps.length > 1) setTimeout(() => alive && go(i + 1), 350); });
  go(0);
  raf = requestAnimationFrame(drawTrail);
  root.destroy = () => { alive = false; cancelAnimationFrame(raf); video.pause(); video.removeAttribute("src"); video.load(); };
  return root;
}
