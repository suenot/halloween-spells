// Стартовый экран: логотип, главная кнопка и плитки режимов, как меню игры.
import { h } from "./dom.js";
import { state } from "../store.js";

const MODES = [
  { id: "solo", icon: "🧙", title: "Соло-турнир", text: "Каждый колдует по своему сценарию", c: "#ff7a1a" },
  { id: "ensemble", icon: "📜", title: "Общий сюжет", text: "Роли, как в настоящей сказке", c: "#8a5cff" },
  { id: "teams", icon: "⚔️", title: "Команды", text: "Две команды, чья магия сильнее", c: "#2fa8ff" },
  { id: "chorus", icon: "👹", title: "Хор против монстров", text: "Кричим заклинания вместе", c: "#ff5fa8" },
];
const MENU = [
  { href: "#/roster", icon: "🧝", title: "Герои" },
  { href: "#/book", icon: "📖", title: "Книга заклинаний" },
  { href: "#/stories", icon: "🗺️", title: "Сюжеты" },
  { href: "#/board", icon: "🏆", title: "Рейтинг" },
];

export function render(root) {
  const active = state.players.filter((p) => p.active);
  const resume = state.current?.queue || state.current?.mode === "chorus";
  const stat = (n, label) => h("div", { class: "hstat" }, h("b", {}, n), h("span", {}, label));
  root.append(h("section", { class: "home" },
    h("div", { class: "logo" },
      h("div", { class: "logo-pumpkin" }, "🎃"),
      h("h1", {}, h("span", {}, "Хэллоуин"), h("span", {}, "Заклинания")),
      h("p", {}, "Скажи слово. Сделай жест. Стань магом.")),
    h("div", { class: "cta" },
      resume
        ? h("a", { class: "btn primary huge", href: "#/play" }, "▶ Продолжить турнир")
        : h("a", { class: "btn primary huge", href: "#/play" }, "▶ Играть"),
      null),
    h("div", { class: "mode-grid" }, MODES.map((m, i) =>
      h("a", { class: "mode-tile", href: `#/play/@${m.id}`, style: { "--c": m.c, "--i": i } },
        h("span", { class: "mt-icon" }, m.icon), h("strong", {}, m.title), h("small", {}, m.text)))),
    h("div", { class: "hstats" }, stat(active.length, "героев в игре"), stat(state.spells.length, "заклинаний"), stat(state.tournaments?.length ?? 0, "турниров сыграно")),
    h("nav", { class: "home-menu" }, MENU.map((m) => h("a", { class: "hm", href: m.href }, h("span", {}, m.icon), m.title)))));
}
