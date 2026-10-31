import { h } from "./dom.js";
import { ELEMENT_INFO, SCHOOL_INFO } from "../engine/fx.js";
import { GESTURE_LABELS } from "../core/gestures.js";

export const GESTURE_ICONS = {
  circle: "⭕", swipe_right: "➡️", swipe_left: "⬅️", up: "⬆️", down: "⬇️", zigzag: "⚡",
  prayer: "🙏", fist_palm: "🤜", double_fist: "👊", peace: "✌️", open_hands: "🖐️", fist_up: "✊",
};

export const pumpkins = (n, total = 5) =>
  h("span", { class: "pumpkins", title: `Сложность ${n} из ${total}` },
    Array.from({ length: total }, (_, i) => h("i", { class: i < n ? "on" : "", style: { "--i": i } }, "🎃")));

export const gesturePills = (steps, active = -1) =>
  h("div", { class: "gpills" }, steps.map((g, i) =>
    h("span", { class: `gpill${i === active ? " active" : ""}${i < active ? " done" : ""}`, title: GESTURE_LABELS[g] },
      h("b", {}, GESTURE_ICONS[g] ?? "?"), h("em", {}, GESTURE_LABELS[g] ?? g))));

export function spellCard(spell, { onClick, index = 0 } = {}) {
  const el = ELEMENT_INFO[spell.element];
  const school = SCHOOL_INFO[spell.school];
  const card = h("article", { class: "spell", tabindex: "0", style: { "--c": spell.color, "--d": `${Math.min(index, 14) * 55}ms` }, onclick: onClick,
    onkeydown: (e) => (e.key === "Enter" || e.key === " ") && onClick?.() },
    h("div", { class: "spell-glow" }),
    h("header", {}, h("span", { class: "badge" }, `${school.icon} ${school.label}`), h("span", { class: "badge el" }, `${el.icon} ${el.label}`)),
    h("h3", {}, spell.name),
    h("p", { class: "phrase" }, `"${spell.phrase}"`),
    gesturePills(spell.gesture),
    h("p", { class: "desc" }, spell.description),
    h("footer", {}, pumpkins(spell.difficulty),
      h("span", { class: "stats" }, `⚔️ ${spell.power}`, `🔋 ${spell.cost}`, `🎯 ${spell.range}`)));
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--rx", `${(0.5 - y) * 9}deg`);
    card.style.setProperty("--ry", `${(x - 0.5) * 11}deg`);
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
  });
  card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  return card;
}
