import { h, toast } from "./dom.js";
import { state, save, settings, spellById } from "../store.js";
import { nextTurn, recordAttempt, finishTournament } from "../core/tournament.js";
import { bestSimilarity } from "../core/fuzzy.js";
import { listen, speechSupported } from "../engine/speech.js";
import { castEffect, ELEMENT_INFO } from "../engine/fx.js";
import { audio } from "../engine/audio.js";

const TIME_PER_MONSTER = 40;
const monsterById = (id) => state.monsters.find((m) => m.id === id);

export function renderChorus(root) {
  const cfg = settings();
  let t = state.current;
  let mic = null, timer = null, phase = "ready"; // ready | fight | over
  let fight = null;
  const fx = h("canvas", { class: "fx-layer" });
  const arena = h("div", { class: "arena" });
  const controls = h("div", { class: "controls" });
  const notice = h("p", { class: "notice" });
  const left = h("aside", { class: "side left" });
  const viewport = h("div", { class: "viewport chorus" }, arena, fx);
  root.append(h("div", { class: "stage chorus-stage" }, left, h("section", { class: "center" }, viewport, controls, notice)));

  const key = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); phase === "ready" ? begin() : phase === "over" ? next() : null; } else if (e.key === "1" && phase === "fight") hit(true); };
  addEventListener("keydown", key);

  const cur = () => nextTurn(t);
  const score = () => t.attempts.reduce((s, a) => s + a.total, 0);

  function paintSide() {
    left.replaceChildren(h("h3", {}, "Монстры"), h("div", { class: "qitem total" }, h("strong", {}, `⭐ ${score()} баллов`)),
      ...t.queue.map((q, i) => {
        const m = monsterById(q.monsterId); const a = t.attempts.find((x) => x.turn === i);
        return h("div", { class: `qitem${i === t.cursor ? " now" : ""}` }, h("span", { class: "avatar sm" }, a ? (a.success ? "💥" : "💨") : m.emoji), h("div", {}, h("strong", {}, m.name), h("small", {}, a ? (a.success ? "побежден" : "сбежал") : m.action)));
      }));
  }

  function paintReady() {
    const c = cur();
    if (!c) return finish();
    const m = monsterById(c.monsterId); const sp = spellById(m.spellId);
    phase = "ready";
    arena.className = "arena ready";
    arena.style.setProperty("--c", sp.color);
    arena.replaceChildren(
      h("small", {}, `Монстр ${c.index + 1} из ${t.queue.length}`),
      h("div", { class: "monster big", "data-state": "idle" }, m.emoji),
      h("h2", {}, m.name), h("p", { class: "story-line" }, m.taunt),
      h("p", { class: "hint" }, `${m.action} Кричите все вместе:`),
      h("p", { class: "phrase big" }, `"${sp.phrase}"`));
    controls.replaceChildren(h("button", { class: "btn primary big", onclick: begin }, "⚔️ В бой! (Enter)"));
    paintSide();
  }

  function paintFight() {
    const m = fight.m, sp = fight.sp;
    const timeLeft = Math.max(0, Math.ceil(fight.left));
    arena.className = "arena fight";
    arena.replaceChildren(
      h("div", { class: "castbar" }, h("div", { class: "ring" }, timeLeft), h("strong", {}, m.name)),
      h("div", { class: "monster big", id: "monster", "data-state": fight.hurt ? "hurt" : "idle" }, m.emoji),
      h("div", { class: "hearts" }, Array.from({ length: m.hp }, (_, i) => h("span", { class: i < fight.hp ? "" : "lost" }, "❤️"))),
      h("p", { class: "hint" }, m.action),
      h("p", { class: "phrase big" + (fight.hurt ? " ok" : "") }, `"${sp.phrase}"`),
      fight.heard ? h("p", { class: "heard" }, `Я слышу: ${fight.heard}`) : h("p", { class: "heard" }, mic ? "Кричите хором!" : "Микрофон не слышит: ведущий жмет «Удар!»"));
    controls.replaceChildren(h("button", { class: "btn good big", onclick: () => hit(true) }, "💥 Удар! (1)"), h("button", { class: "btn ghost", onclick: () => end(false) }, "Монстр сбежал"));
  }

  function begin() {
    if (phase !== "ready") return;
    const c = cur(); const m = monsterById(c.monsterId); const sp = spellById(m.spellId);
    fight = { m, sp, hp: m.hp, left: TIME_PER_MONSTER, t0: performance.now(), lastHit: 0, heard: "", hurt: false, turn: c.index };
    phase = "fight";
    audio.mood("fight"); audio.hush(true); audio.sfx("roar");
    const aliases = [sp.phrase, ...(m.aliases ?? [])];
    if (cfg.useSpeech && speechSupported()) {
      mic = listen((text) => {
        fight.heard = text;
        const sim = Math.max(...aliases.map((a) => bestSimilarity(text, a)));
        if (sim >= (cfg.lenient ? 0.65 : 0.8) && performance.now() - fight.lastHit > 1400) hit(false);
      }, { onError: (e) => { notice.textContent = `Микрофон не работает (${e}). Ведущий жмет «Удар!».`; mic?.stop(); mic = null; } });
    } else notice.textContent = "Этот браузер не слышит речь (нужен Chrome). Ведущий жмет «Удар!».";
    paintFight();
    timer = setInterval(() => {
      fight.left = TIME_PER_MONSTER - (performance.now() - fight.t0) / 1000;
      if (fight.left <= 0) return end(false);
      paintFight();
    }, 250);
  }

  function hit() {
    if (phase !== "fight") return;
    fight.hp -= 1; fight.lastHit = performance.now(); fight.hurt = true;
    castEffect(fx, fight.sp.element, { power: fight.sp.power, y: 180, spell: fight.sp });
    audio.sfx("monsterHit");
    setTimeout(() => { if (fight) { fight.hurt = false; } }, 600);
    if (fight.hp <= 0) end(true); else paintFight();
  }

  async function end(win) {
    if (phase !== "fight") return;
    phase = "over"; clearInterval(timer); mic?.stop(); mic = null;
    audio.hush(false); audio.mood("play"); audio.sfx(win ? "monsterDie" : "fail");
    if (win) setTimeout(() => audio.sfx("success"), 700);
    const m = fight.m, sp = fight.sp;
    const total = win ? Math.round(m.hp * sp.difficulty * 25 + fight.left * 2) : 0;
    t = recordAttempt(t, { turn: fight.turn, playerId: null, spellId: sp.id, word: 0, gesture: 0, total, success: win });
    state.current = t; await save("current");
    arena.className = `arena over ${win ? "win" : "lose"}`;
    arena.replaceChildren(h("div", { class: "monster big", "data-state": win ? "dead" : "idle" }, win ? "💥" : m.emoji),
      h("h1", {}, win ? "Монстр побежден!" : "Монстр убежал..."), h("div", { class: "score" }, "+", total, " баллов"),
      h("p", { class: "muted" }, win ? "Вот что значит работать вместе! 🎃" : "Ничего, следующего поймаем!"));
    if (win) { castEffect(fx, "light", { power: 9, y: 200, silent: true }); }
    controls.replaceChildren(h("button", { class: "btn primary big", onclick: next }, "Дальше (Enter) →"));
    paintSide();
  }

  function next() { if (phase !== "over") return; fight = null; paintReady(); }

  async function finish() {
    t = finishTournament(t);
    state.tournaments.push(t); state.current = null;
    await Promise.all([save("tournaments"), save("current")]);
    toast("Все монстры позади! 🏆");
    location.hash = "#/board";
  }

  paintReady();
  return { destroy() { removeEventListener("keydown", key); clearInterval(timer); mic?.stop(); audio.hush(false); } };
}
