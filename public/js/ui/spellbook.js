import { h, openModal } from "./dom.js";
import { state } from "../store.js";
import { spellCard, gesturePills, pumpkins } from "./labels.js";
import { demoPlayer } from "./demo.js";
import { castEffect, ELEMENT_INFO, SCHOOL_INFO } from "../engine/fx.js";

export function showSpell(spell) {
  const canvas = h("canvas", { class: "fx-canvas" });
  const info = ELEMENT_INFO[spell.element];
  const demo = demoPlayer(spell.gesture, { color: spell.color });
  const body = h("div", { class: "spell-modal", style: { "--c": spell.color } },
    canvas,
    h("span", { class: "badge" }, `${SCHOOL_INFO[spell.school].icon} ${SCHOOL_INFO[spell.school].label} · ${info.icon} ${info.label}`),
    h("h2", {}, spell.name),
    h("p", { class: "phrase big" }, `"${spell.phrase}"`),
    demo,
    h("p", { class: "desc" }, spell.description),
    h("p", { class: "hint" }, "Как делать: " + spell.hint),
    h("div", { class: "row" }, pumpkins(spell.difficulty), h("span", { class: "stats" }, `⚔️ сила ${spell.power}`, `🔋 цена ${spell.cost}`, `🎯 ${spell.range}`)),
    h("button", { class: "btn primary", onclick: () => castEffect(canvas, spell.element, { power: spell.power, spell }) }, "✨ Показать эффект"));
  const m = openModal(body, { onClose: () => demo.destroy() });
  setTimeout(() => castEffect(canvas, spell.element, { power: spell.power, spell }), 450);
  return m;
}

export function render(root) {
  let school = "all", element = "all", sort = "diff";
  const grid = h("div", { class: "grid spells" });
  const filters = h("div", { class: "filters" });

  const seg = (label, value, get, set) =>
    h("button", { class: `seg${get() === value ? " on" : ""}`, onclick: () => { set(value); paint(); } }, label);

  function paint() {
    filters.replaceChildren(
      h("div", { class: "seggroup" },
        seg("Все школы", "all", () => school, (v) => (school = v)),
        ...Object.entries(SCHOOL_INFO).map(([k, v]) => seg(`${v.icon} ${v.label}`, k, () => school, (x) => (school = x)))),
      h("div", { class: "seggroup wrap" },
        seg("Все стихии", "all", () => element, (v) => (element = v)),
        ...Object.entries(ELEMENT_INFO).map(([k, v]) => seg(`${v.icon} ${v.label}`, k, () => element, (x) => (element = x)))),
      h("div", { class: "seggroup" },
        seg("Сначала простые", "diff", () => sort, (v) => (sort = v)),
        seg("Сначала сильные", "power", () => sort, (v) => (sort = v))));
    const list = state.spells
      .filter((s) => (school === "all" || s.school === school) && (element === "all" || s.element === element))
      .sort((a, b) => (sort === "diff" ? a.difficulty - b.difficulty || a.power - b.power : b.power - a.power));
    grid.replaceChildren(...(list.length ? list.map((s, i) => spellCard(s, { index: i, onClick: () => showSpell(s) }))
      : [h("p", { class: "empty" }, "Таких заклинаний пока нет 🕸️")]));
  }
  paint();

  root.append(
    h("section", { class: "hero" },
      h("h1", {}, "Книга заклинаний"),
      h("p", {}, "Сказать правильное слово и сделать верное движение: так рождается магия. Выбери школу и стихию, нажми на заклинание, чтобы увидеть его в деле.")),
    filters, grid);
}
