import { h, openModal, toast, flip } from "./dom.js";
import { state, save, uid } from "../store.js";
import { splitTeams } from "../core/teams.js";
import { tiles, toggle, stepper, avatarPicker } from "./controls.js";

const KIND = { child: "Дети", adult: "Взрослые" };
const uni = (id) => state.universes.find((u) => u.id === id);

const AVATARS = ["🦇", "👻", "🧛‍♀️", "🎃", "🕸️", "🧚", "🌙", "🧙", "🧙‍♀️", "🥷", "🧝", "🦉", "🐉", "🦊", "🐺", "🧞", "🧟", "🦄", "⭐", "🔥", "⚡", "🧌", "🐱", "🦁"];
const GENDERS = [{ id: "f", name: "Девочка / женщина", icon: "👧" }, { id: "m", name: "Мальчик / мужчина", icon: "👦" }];
const KINDS = [{ id: "child", name: "Ребенок", icon: "🧒" }, { id: "adult", name: "Взрослый", icon: "🧌", hint: "Великан" }];
const asTiles = (list) => list.map((x) => ({ id: x.id, name: x.name, icon: x.icon, color: x.color }));

export function describePlayer(p) {
  const u = uni(p.universe);
  const bits = [];
  if (u) {
    bits.push(`${u.icon} ${u.name}`);
    const c = u.classes.find((x) => x.id === p.class); if (c) bits.push(`${c.icon} ${c.name}`);
    const r = u.races.find((x) => x.id === p.race); if (r) bits.push(`${r.icon} ${r.name}`);
    const f = u.factions.find((x) => x.id === p.faction); if (f) bits.push({ text: `${f.icon} ${f.name}`, color: f.color });
  } else if (p.race === "giant") bits.push("🧌 Великан");
  if (p.heightCm) bits.push(`📏 ${p.heightCm} см`);
  if (p.weightKg) bits.push(`⚖️ ${p.weightKg} кг`);
  return bits;
}

const factionColor = (p) => uni(p.universe)?.factions.find((f) => f.id === p.faction)?.color;

/** Карточка героя: используется в списке и как живое превью в редакторе. */
function heroCard(p, { onEdit, onToggle, index = 0, preview = false } = {}) {
  const color = factionColor(p) ?? (p.kind === "adult" ? "#7dff6a" : "#ff7a1a");
  const bits = describePlayer(p);
  const card = h("article", { class: `hero-card ${p.kind}${p.active ? "" : " off"}${preview ? " preview" : ""}`, style: { "--c": color, "--d": `${index * 60}ms` }, tabindex: preview ? null : "0" },
    h("div", { class: "aura" }),
    h("div", { class: "avatar" }, p.avatar ?? "🎃"),
    h("h3", {}, p.name || "Без имени"),
    h("div", { class: "badges" }, bits.length ? bits.slice(0, 4).map((b) => h("span", { class: "chip", style: b.color ? { color: b.color, borderColor: b.color } : null }, b.text ?? b)) : h("span", { class: "chip hint" }, "✨ выбери вселенную")),
    !preview && h("div", { class: "hc-actions" },
      h("button", { class: `ready${p.active ? " on" : ""}`, onclick: (e) => { e.stopPropagation(); onToggle(); } }, p.active ? "✓ В игре" : "Не в игре"),
      h("button", { class: "btn ghost edit", "aria-label": "Изменить героя", title: "Изменить героя", onclick: (e) => { e.stopPropagation(); onEdit(); } }, "✎")));
  if (!preview) card.addEventListener("click", onEdit);
  return card;
}

function editPlayer(p, done) {
  const draft = { ...p };
  const body = h("div", { class: "creator" });
  const m = openModal(body);
  const section = (title, ...kids) => h("section", { class: "cr-sec" }, h("h4", {}, title), ...kids);
  const paint = () => {
    const u = uni(draft.universe);
    const avatars = AVATARS.includes(draft.avatar) || !draft.avatar ? AVATARS : [draft.avatar, ...AVATARS];
    const previewHost = h("div", { class: "cr-preview" });
    const refresh = () => previewHost.replaceChildren(heroCard(draft, { preview: true }));
    refresh();
    body.replaceChildren(
      h("aside", { class: "cr-side" }, previewHost,
        section("Рост", stepper({ value: draft.heightCm ?? 130, min: 60, max: 230, unit: "см", label: "Рост", onChange: (v) => { draft.heightCm = v; refresh(); } })),
        section("Вес", stepper({ value: draft.weightKg ?? 30, min: 10, max: 200, unit: "кг", label: "Вес", onChange: (v) => { draft.weightKg = v; refresh(); } }))),
      h("div", { class: "cr-main" },
        h("h2", {}, p._new ? "Новый герой" : "Герой"),
        h("input", { class: "namefield", value: draft.name, placeholder: "Как зовут героя?", "aria-label": "Имя", maxlength: "24", oninput: (e) => { draft.name = e.target.value; refresh(); } }),
        section("Облик", avatarPicker(avatars, draft.avatar ?? "🎃", (v) => { draft.avatar = v; refresh(); })),
        h("div", { class: "cr-two" },
          section("Кто это", tiles(KINDS, draft.kind, (v) => { draft.kind = v; if (v === "adult") draft.race = draft.race ?? "giant"; paint(); }, { cols: 2 })),
          section("Команда по полу", tiles(GENDERS, draft.gender ?? null, (v) => { draft.gender = v ?? undefined; }, { nullable: true, cols: 2 }))),
        section("Вселенная", tiles(asTiles(state.universes), draft.universe, (v) => { draft.universe = v; draft.class = draft.faction = null; if (draft.race !== "giant") draft.race = null; paint(); }, { nullable: true })),
        u && section("Класс", tiles(asTiles(u.classes), draft.class, (v) => { draft.class = v; refresh(); }, { nullable: true })),
        u && section("Раса", tiles(asTiles(u.races), draft.race, (v) => { draft.race = v; refresh(); }, { nullable: true })),
        u && u.factions.length > 0 && section(u.factionLabel, tiles(asTiles(u.factions), draft.faction, (v) => { draft.faction = v; paint(); }, { nullable: true })),
        h("div", { class: "cr-foot" },
          toggle("Участвует в игре", draft.active, (v) => { draft.active = v; refresh(); }),
          h("div", { class: "row end" },
            p._new ? null : h("button", { class: "btn ghost danger", onclick: async () => { if (!confirm(`Удалить героя ${p.name}?`)) return; state.players = state.players.filter((x) => x.id !== p.id); await save("players"); m.close(); done(); } }, "Удалить"),
            h("button", { class: "btn primary big", onclick: async () => {
              if (!draft.name?.trim()) return toast("Нужно имя");
              draft.name = draft.name.trim(); delete draft._new;
              const i = state.players.findIndex((x) => x.id === draft.id);
              if (i >= 0) state.players[i] = draft; else state.players.push(draft);
              await save("players"); m.close(); done();
            } }, "💾 Сохранить")))));
  };
  paint();
}

export function render(root) {
  const wrap = h("div", { class: "roster" });

  const playerCard = (p, i) => heroCard(p, { index: i, onEdit: () => editPlayer(p, paint), onToggle: async () => { p.active = !p.active; await save("players"); paint(); } });

  function teamsBlock() {
    const active = state.players.filter((p) => p.active);
    const box = h("div", { class: "teams" });
    const tid = (pid) => state.teams.find((t) => t.playerIds.includes(pid))?.id;
    const setTeams = async (teams) => { state.teams = teams; await save("teams"); paint(); };
    const col = (t) => h("div", { class: "team", style: { "--c": t.color } },
      h("h3", {}, t.name),
      h("div", { class: "row" }, t.playerIds.map((id) => state.players.find((p) => p.id === id)).filter(Boolean).map((p) =>
        h("button", { class: "chip pick", "data-flip": p.id, title: "Перекинуть в другую команду", onclick: () => {
          const other = state.teams.find((x) => x.id !== t.id);
          t.playerIds = t.playerIds.filter((x) => x !== p.id); other.playerIds.push(p.id);
          const after = flip(box); save("teams"); paint(); after;
        } }, `${p.avatar ?? ""} ${p.name}`))));
    if (state.teams.length === 2) {
      // keep teams limited to active players
      for (const t of state.teams) t.playerIds = t.playerIds.filter((id) => active.some((p) => p.id === id));
      for (const p of active) if (!tid(p.id)) state.teams[state.teams[0].playerIds.length <= state.teams[1].playerIds.length ? 0 : 1].playerIds.push(p.id);
    }
    const doSplit = (by) => { const r = splitTeams(active, { by }); if (r.warning) toast(r.warning); setTeams(r.teams); };
    box.append(
      h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => doSplit("gender") }, "Разделить: девочки и мальчики"),
        h("button", { class: "btn", onclick: () => doSplit("random") }, "Разделить случайно"),
        state.teams.length ? h("button", { class: "btn ghost", onclick: () => setTeams([]) }, "Очистить") : null),
      state.teams.length === 2 ? h("div", { class: "team-cols" }, state.teams.map(col)) : h("p", { class: "muted" }, "Команды не заданы. Нужны минимум 2 игрока в игре."));
    return box;
  }

  function paint() {
    wrap.replaceChildren(
      ...Object.entries(KIND).map(([kind, title]) => {
        const list = state.players.filter((p) => p.kind === kind);
        return h("section", {},
          h("div", { class: "group-title" }, h("h2", {}, kind === "adult" ? `🧌 ${title}, великаны` : `${title}`), h("span", { class: "chip" }, `${list.filter((p) => p.active).length} из ${list.length} в игре`)),
          h("div", { class: "players" }, list.map(playerCard)),
          h("div", { class: "addrow" }, h("button", { class: "btn add-hero", onclick: () => editPlayer({ id: uid(kind), name: "", kind, avatar: kind === "adult" ? "🧌" : "🎃", active: true, universe: null, class: null, race: kind === "adult" ? "giant" : null, faction: null, heightCm: null, weightKg: null, _new: true }, paint) }, `➕ Новый герой: ${kind === "adult" ? "великан" : "ребенок"}`)));
      }),
      h("section", {}, h("div", { class: "group-title" }, h("h2", {}, "⚔️ Команды")), teamsBlock()));
  }
  paint();
  root.append(h("section", { class: "hero" }, h("h1", {}, "Выбор героев"), h("p", {}, "Нажми на героя, чтобы создать ему облик: вселенная, класс, раса, факультет. Кто в игре, того ведущий отмечает на карточке.")), wrap);
}
