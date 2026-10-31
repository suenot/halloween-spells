import { h } from "./dom.js";
import { state, spellById } from "../store.js";

export function render(root) {
  let universe = "all";
  const grid = h("div", { class: "stories" });
  const filter = h("div", { class: "filters" });
  const uniName = (id) => (id === "mixed" ? { icon: "🎭", name: "Две вселенные" } : state.universes.find((u) => u.id === id) ?? { icon: "📖", name: id });

  function paint() {
    const ids = ["all", ...new Set(state.stories.map((s) => s.universe))];
    filter.replaceChildren(h("div", { class: "seggroup wrap" }, ids.map((id) => h("button", { class: `seg${universe === id ? " on" : ""}`, onclick: () => { universe = id; paint(); } },
      id === "all" ? "Все вселенные" : `${uniName(id).icon} ${uniName(id).name}`))));
    const list = state.stories.filter((s) => universe === "all" || s.universe === universe);
    grid.replaceChildren(...list.map((s, i) => {
      const u = uniName(s.universe);
      return h("article", { class: "story", style: { "--d": `${i * 80}ms` } },
        h("div", { class: "row" }, h("span", { class: "chip" }, `${u.icon} ${u.name}`), h("span", { class: "chip" }, s.mode === "ensemble" ? "📜 Общий сюжет, 8 ролей" : "🧙 Соло-сценарий")),
        h("h3", {}, s.title),
        h("p", {}, s.intro),
        s.mode === "ensemble"
          ? [h("div", { class: "roles" }, s.roles.map((r) => h("span", { class: "chip" }, `${r.title}: ${spellById(r.spellId)?.name ?? "?"}`))),
             h("ol", { class: "scene-list" }, s.scenes.map((sc) => h("li", {}, sc.text)))]
          : h("div", { class: "roles" }, s.spellIds.map((id, k) => h("span", { class: "chip" }, `${k + 1}. ${spellById(id)?.name ?? "?"}`))),
        h("a", { class: "btn primary", href: `#/play/${s.id}` }, "🎃 Играть"));
    }));
    if (!list.length) grid.append(h("p", { class: "empty" }, "Сюжетов этой вселенной пока нет 🕸️"));
  }
  paint();
  root.append(h("section", { class: "hero" }, h("h1", {}, "Сюжеты"),
    h("p", {}, "Истории по мотивам Гарри Поттера и Наруто. В общем сюжете у каждого игрока своя роль, а в соло-сценарии каждый проходит свою цепочку заклинаний.")), filter, grid);
}
