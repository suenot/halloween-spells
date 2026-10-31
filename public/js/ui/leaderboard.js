import { h, countUp } from "./dom.js";
import { state, save, playerById } from "../store.js";
import { standings, teamStandings, isFinished } from "../core/tournament.js";
import { castEffect } from "../engine/fx.js";
import { audio } from "../engine/audio.js";
import { describePlayer } from "./roster.js";

export function render(root) {
  const history = [...state.tournaments].reverse();
  let t = state.current ?? history[0] ?? null;
  const box = h("div", { class: "board" });

  function paint() {
    if (!t) { box.replaceChildren(h("p", { class: "empty" }, "Турниров еще не было. Самое время начать! 🎃")); return; }
    if (t.mode === "chorus") return paintChorus();
    const rows = standings(t);
    const live = t === state.current;
    const medals = ["🥇", "🥈", "🥉"];
    const scored = rows[0]?.total > 0;
    const podiumOrder = scored ? [rows[1], rows[0], rows[2]].map((r, i) => (r ? { r, place: [2, 1, 3][i] } : null)).filter(Boolean) : [];
    const fxCanvas = h("canvas", { class: "fx-canvas board-fx" });
    box.replaceChildren(
      h("div", { class: "row" }, h("h2", {}, t.name), h("span", { class: "chip" }, live ? "идет сейчас" : "завершен"),
        h("span", { class: "chip" }, `${new Set(t.attempts.map((a) => a.turn)).size} из ${t.queue.length} заклинаний`)),
      t.mode === "teams" ? h("div", { class: "row" }, teamStandings(t).map((x) => h("div", { class: "team", style: { "--c": x.color } }, h("h3", {}, x.name), h("strong", {}, `${x.total} баллов`)))) : null,
      h("div", { class: "podium-wrap" }, fxCanvas, scored ? null : h("div", { class: "podium-empty" }, h("span", {}, "🏆"), h("strong", {}, "Подиум ждет первых заклинаний"), h("small", {}, "Сделай заклинание, и лучшие герои встанут на пьедестал")), h("div", { class: "podium" }, podiumOrder.map(({ r, place }, i) => {
        const p = playerById(r.playerId);
        const pts = h("span", { class: "pts" }, "0");
        setTimeout(() => countUp(pts, r.total, 1200), 500 + i * 150);
        return h("div", { class: `pod p${place}`, style: { "--d": `${(place === 1 ? 0.5 : place === 2 ? 0.25 : 0)}s` } }, h("span", { class: "medal" }, medals[place - 1]), h("span", { class: "avatar" }, p?.avatar ?? "🎃"), h("strong", {}, p?.name ?? "?"), pts);
      }))),
      h("div", { class: "table" },
        h("div", { class: "trow head" }, h("span"), h("span", {}, "Игрок"), h("span", { class: "num" }, "Баллы"), h("span", { class: "num" }, "Успехи"), h("span", { class: "num" }, "Попытки")),
        rows.map((r, i) => {
          const p = playerById(r.playerId);
          return h("div", { class: "trow", style: { animation: `card-in .6s var(--ease) ${i * 70}ms both` } },
            h("span", { class: "rank" }, r.rank), h("span", { class: "who" }, h("span", { class: "avatar" }, p?.avatar ?? "🎃"), h("span", {}, p?.name ?? "?", " ", h("small", { class: "muted" }, p ? describePlayer(p).slice(0, 3).map((b) => b.text ?? b).join(" · ") : ""))),
            h("span", { class: "num" }, r.total), h("span", { class: "num" }, r.successes), h("span", { class: "num" }, r.attempts));
        })),
      h("div", { class: "row" },
        live ? h("a", { class: "btn primary", href: "#/play" }, "▶ Продолжить турнир") : null,
        h("button", { class: "btn " + (live ? "ghost" : "primary"), onclick: newTournament }, "🎃 Новый турнир")));
    if (!live && rows[0]?.total > 0) setTimeout(() => { castEffect(fxCanvas, "light", { power: 9, y: 120, silent: true }); audio.sfx("fanfare"); }, 900);
  }

  function paintChorus() {
    const live = t === state.current;
    const won = t.attempts.filter((a) => a.success).length;
    const total = t.attempts.reduce((s, a) => s + a.total, 0);
    const pts = h("b", { class: "total" }, "0");
    setTimeout(() => countUp(pts, total, 1200), 400);
    box.replaceChildren(
      h("div", { class: "row" }, h("h2", {}, t.name), h("span", { class: "chip" }, live ? "идет сейчас" : "завершен"), h("span", { class: "chip" }, "👹 Хор против монстров")),
      h("div", { class: "panel" }, h("h3", {}, `Побеждено монстров: ${won} из ${t.queue.length}`), h("div", { class: "score" }, pts, " баллов всей команде")),
      h("div", { class: "table" }, t.queue.map((q, i) => {
        const m = state.monsters.find((x) => x.id === q.monsterId); const a = t.attempts.find((x) => x.turn === i);
        return h("div", { class: "trow chorus-row", style: { animation: `card-in .6s var(--ease) ${i * 70}ms both` } },
          h("span", { class: "rank" }, m?.emoji ?? "👹"), h("span", { class: "who" }, m?.name ?? "?"), h("span", { class: "num" }, a ? (a.success ? "💥 побежден" : "💨 сбежал") : "—"), h("span", { class: "num" }, a?.total ?? 0), h("span"));
      })),
      h("div", { class: "row" }, live ? h("a", { class: "btn primary", href: "#/play" }, "▶ Продолжить") : null, h("button", { class: "btn " + (live ? "ghost" : "primary"), onclick: newTournament }, "🎃 Новый турнир")));
  }

  async function newTournament() {
    if (state.current && !isFinished(state.current) && !confirm("Текущий турнир не закончен. Закончить его и сохранить результаты?")) return;
    if (state.current) { state.tournaments.push({ ...state.current, finishedAt: Date.now() }); state.current = null; await Promise.all([save("tournaments"), save("current")]); }
    location.hash = "#/play";
  }

  const hist = h("div", { class: "history" }, history.map((x) => h("button", { class: "hist btn ghost", onclick: () => { t = x; paint(); scrollTo(0, 0); } },
    h("strong", {}, x.name), h("span", { class: "muted" }, new Date(x.finishedAt ?? x.startedAt).toLocaleString("ru-RU")),
    h("span", { class: "chip" }, ({ solo: "соло", ensemble: "сюжет", teams: "команды", chorus: "хор" })[x.mode] ?? x.mode),
    h("span", { class: "chip" }, x.mode === "chorus" ? `👹 ${x.attempts.filter((a) => a.success).length} из ${x.queue.length}` : `🏆 ${playerById(standings(x)[0]?.playerId)?.name ?? "—"}`))));
  paint();
  root.append(h("section", { class: "hero" }, h("h1", {}, "Рейтинг"), h("p", {}, "Таблица лучших волшебников и шиноби. Все турниры сохраняются.")), box,
    history.length ? h("section", {}, h("h2", { class: "group-title" }, "История турниров"), hist) : null);
}
