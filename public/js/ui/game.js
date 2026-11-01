import { h, toast, countUp, flip } from "./dom.js";
import { state, save, settings, setSetting, spellById, playerById } from "../store.js";
import { createTournament, nextTurn, recordAttempt, standings, teamStandings, finishTournament } from "../core/tournament.js";
import { matchScore } from "../core/fuzzy.js";
import { scoreAttempt } from "../core/scoring.js";
import { classifyTrace, classifyPose, matchSequence, WAND, SEALS, MOTIONS } from "../core/gestures.js";
import { MotionTracker } from "../core/motions.js";
import { HandFx } from "../engine/handfx.js";
import { startCamera, createHandTracker } from "../engine/camera.js";
import { listen, speechSupported, prepareSpeech } from "../engine/speech.js";
import { castEffect, ELEMENT_INFO } from "../engine/fx.js";
import { gesturePills, pumpkins } from "./labels.js";
import { demoPlayer } from "./demo.js";
import { tiles, toggle } from "./controls.js";
import { renderChorus } from "./chorus.js";
import { openWandCalibration } from "./calibrate.js";
import { refClip } from "./refclip.js";
import { findWandTip } from "../engine/wand.js";
import { audio } from "../engine/audio.js";

const MODES = [
  { id: "solo", icon: "🧙", title: "Соло-турнир", text: "Каждый игрок проходит свой сценарий, потом общая таблица." },
  { id: "ensemble", icon: "📜", title: "Общий сюжет", text: "У каждого своя роль. Нужный игрок выходит и колдует по сюжету." },
  { id: "teams", icon: "⚔️", title: "Команды", text: "Две команды наперегонки: чьи заклинания сильнее?" },
  { id: "chorus", icon: "👹", title: "Хор против монстров", text: "Все вместе кричат слова заклинаний и побеждают монстров." },
];
const ENCOURAGE = ["Почти! Магия чуть-чуть дрогнула ✨", "Ничего, у великих волшебников тоже не с первого раза!", "Еще разочек, ты очень близко! 🎃", "Сила копится, попробуем снова!"];
const CHEER = ["Блестяще! ✨", "Вот это магия! 🔥", "Тыква гордится тобой! 🎃", "Невероятно! 🪄", "Заклинание сработало! ⚡"];
const pick = (a) => a[(Math.random() * a.length) | 0];

export async function render(root, rest = []) {
  const wantsNew = !!rest[0];
  if (!wantsNew && state.current?.mode === "chorus") return renderChorus(root);
  if (!wantsNew && state.current && state.current.queue) return renderStage(root);
  return renderSetup(root, rest[0]);
}

/* ---------------------------------------------------------------- setup */
let current = null; // handle of the stage started from setup, for cleanup
function renderSetup(root, presetStory) {
  const preset = state.stories.find((s) => s.id === presetStory);
  const presetMode = presetStory?.startsWith("@") ? presetStory.slice(1) : null;
  let mode = MODES.some((m) => m.id === presetMode) ? presetMode : preset?.mode === "ensemble" ? "ensemble" : "solo", storyId = preset?.id ?? null, school = "mixed";
  const body = h("div", { class: "setup" });
  const name = h("input", { class: "field", value: `Хэллоуин ${new Date().toLocaleDateString("ru-RU")}`, "aria-label": "Название турнира" });

  function paint() {
    const active = state.players.filter((p) => p.active);
    const stories = state.stories.filter((s) => (mode === "ensemble" ? s.mode === "ensemble" : s.mode === "solo"));
    if (!stories.some((s) => s.id === storyId)) storyId = stories[0]?.id ?? null;
    const story = state.stories.find((s) => s.id === storyId);
    const startBtn = h("button", { class: "btn primary big", onclick: start }, "🎃 Начать турнир");
    body.replaceChildren(
      h("div", { class: "modes" }, MODES.map((m, i) => h("button", { class: `mode${m.id === mode ? " on" : ""}${m.soon ? " soon" : ""}`, style: { "--d": `${i * 70}ms` }, disabled: m.soon, onclick: () => { mode = m.id; paint(); } },
        h("span", { class: "mi" }, m.icon), h("strong", {}, m.title), h("small", {}, m.text)))),
      h("div", { class: "panel" },
        h("h3", {}, `Игроки в турнире (${active.length})`),
        h("div", { class: "pickgrid" }, state.players.map((p) => h("button", { class: `pickhero${p.active ? " on" : ""}`, "aria-pressed": String(!!p.active), onclick: async () => { p.active = !p.active; await save("players"); paint(); } },
          h("span", { class: "ph-av" }, p.avatar ?? "🎃"), h("span", { class: "ph-n" }, p.name), p.kind === "adult" ? h("small", {}, "великан") : null))),
        h("p", { class: "muted" }, "Нажми на имя, чтобы добавить или убрать игрока. Подробности: раздел Игроки."),
        h("div", { class: "row" }, h("button", { class: "btn", onclick: () => openWandCalibration(() => paint()) }, settings().wand ? "🪄 Палочка запомнена, заново" : "🪄 Показать палочку камере"))),
      mode === "chorus"
        ? h("div", { class: "panel" }, h("h3", {}, "Монстры"), h("div", { class: "row" }, state.monsters.map((m) => h("span", { class: "chip" }, `${m.emoji} ${m.name}`))), h("p", { class: "muted" }, "Все игроки встают перед экраном и кричат слово заклинания хором. Нужен микрофон и браузер Chrome."))
        : mode === "teams"
        ? h("div", { class: "panel" }, h("h3", {}, "Команды"),
            state.teams.length === 2 ? h("div", { class: "row" }, state.teams.map((t) => h("span", { class: "chip", style: { color: t.color, borderColor: t.color } }, `${t.name}: ${t.playerIds.length}`)))
              : h("p", { class: "muted" }, "Сначала разделите игроков на команды в разделе Игроки."),
            h("h4", { class: "sub" }, "Школа заклинаний"),
            tiles([{ id: "mixed", name: "Обе школы", icon: "🔮" }, { id: "wizard", name: "Волшебники", icon: "🪄" }, { id: "shinobi", name: "Шиноби", icon: "🥷" }], school, (v) => { school = v ?? "mixed"; }, { cols: 3 }))
        : h("div", { class: "panel" }, h("h3", {}, mode === "ensemble" ? "Сюжет" : "Сценарий"),
            h("div", { class: "row" }, stories.map((s) => h("button", { class: `seg${s.id === storyId ? " on" : ""}`, onclick: () => { storyId = s.id; paint(); } }, s.title))),
            story && h("p", { class: "muted" }, story.intro),
            story?.mode === "ensemble" && h("div", { class: "roles" }, story.roles.map((r, i) => {
              const pl = active.length ? active[i % active.length] : null;
              return h("span", { class: "chip" }, `${r.title}: ${pl ? pl.name : "—"}`);
            }))),
      h("div", { class: "panel row" }, h("label", { class: "inline" }, "Название", name), startBtn));
  }

  async function start() {
    const players = state.players.filter((p) => p.active);
    try {
      let spells = state.spells;
      if (mode === "teams") {
        if (school !== "mixed") spells = spells.filter((s) => s.school === school);
        spells = [...spells].sort((a, b) => a.difficulty - b.difficulty);
        const step = Math.max(1, Math.floor(spells.length / 6));
        spells = spells.filter((_, i) => i % step === 0).slice(0, 6);
      }
      const story = state.stories.find((s) => s.id === storyId);
      const t = createTournament({ players, mode, spells, story, teams: state.teams, monsters: state.monsters, name: name.value || "Турнир" });
      state.current = t;
      await save("current");
      root.replaceChildren();
      current = mode === "chorus" ? renderChorus(root) : renderStage(root);
    } catch (e) { toast(e.message); }
  }
  paint();
  root.append(h("section", { class: "hero" }, h("h1", {}, "Игра"), h("p", {}, "Выбери режим и начни турнир. Результаты сохраняются сами, даже если страницу перезагрузят.")), body);
  return { destroy() { current?.destroy?.(); current = null; } };
}

/* ---------------------------------------------------------------- stage */
function renderStage(root) {
  const cfg = settings();
  let t = state.current;
  let phase = "ready"; // ready | countdown | cast | result
  let cam = null, tracker = null, mic = null, timer = null, camOk = false;
  let sess = null;
  let resolving = 0;
  const keyHandler = (e) => {
    if (e.target?.matches?.("input,select,textarea")) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); phase === "ready" ? begin() : phase === "result" ? next() : null; }
    else if (phase === "result") { if (e.key === "1") award(1, 1); else if (e.key === "2") award(0.6, 0.6); else if (e.key.toLowerCase() === "r") retry(); }
  };
  addEventListener("keydown", keyHandler);

  const video = h("video", { class: "cam", playsinline: "", muted: "" });
  const overlay = h("canvas", { class: "overlay" });
  const fx = h("canvas", { class: "fx-layer" });
  const hud = h("div", { class: "hud" });
  const left = h("aside", { class: "side left" });
  const right = h("aside", { class: "side right" });
  const stageBox = h("div", { class: `viewport${cfg.mirror ? "" : " nomirror"}` }, video, overlay, fx, hud);
  const controls = h("div", { class: "controls" });
  const notice = h("p", { class: "notice" });
  const center = h("section", { class: "center" }, stageBox, controls, notice);
  root.append(h("div", { class: "stage" }, left, center, right));

  const turn = () => nextTurn(t);

  /* ---- sidebars */
  function paintSides() {
    const cur = turn();
    const rows = standings(t);
    const after = flip(right);
    left.replaceChildren(h("h3", {}, "Очередь"), ...t.queue.slice(t.cursor, t.cursor + 8).map((q, i) => {
      const p = playerById(q.playerId); const sp = spellById(q.spellId);
      return h("div", { class: `qitem${i === 0 ? " now" : ""}` }, h("span", { class: "avatar sm" }, p?.avatar ?? "🎃"), h("div", {}, h("strong", {}, p?.name ?? "?"), h("small", {}, sp?.name ?? "")));
    }), cur ? null : h("p", { class: "muted" }, "Все отыграли!"));
    right.replaceChildren(h("h3", {}, t.mode === "teams" ? "Команды" : "Счет"),
      ...(t.mode === "teams" ? teamStandings(t).map((r) => h("div", { class: "srow", "data-flip": r.teamId, style: { "--c": r.color } }, h("strong", {}, r.name), h("b", {}, r.total))) : []),
      ...rows.map((r) => { const p = playerById(r.playerId); return h("div", { class: "srow", "data-flip": r.playerId }, h("span", { class: "rk" }, r.rank), h("span", {}, `${p?.avatar ?? ""} ${p?.name ?? "?"}`), h("b", {}, r.total)); }));
    after();
  }

  /* ---- hud + controls */
  let demo = null, demoKey = "";
  function demoFor(key, steps, compact, color) {
    if (demo && demoKey === key) return demo;
    demo?.destroy(); demoKey = key;
    demo = demoPlayer(steps, { compact, color });
    demo.classList.add("dock");
    return demo;
  }
  const dropDemo = () => { demo?.destroy(); demo = null; demoKey = ""; };

  function paintReady() {
    const cur = turn();
    if (!cur) return finish();
    const p = playerById(cur.playerId); const sp = spellById(cur.spellId);
    const el = ELEMENT_INFO[sp.element];
    hud.className = "hud ready";
    hud.style.setProperty("--c", sp.color);
    hud.replaceChildren(
      h("div", { class: "who" }, h("span", { class: "avatar" }, p?.avatar ?? "🎃"), h("div", {}, h("small", {}, `Ход ${cur.index + 1} из ${t.queue.length}${p?.race === "giant" ? " · великан" : ""}`), h("h2", {}, p?.name ?? "?"))),
      cur.text && h("p", { class: "story-line" }, cur.text),
      h("div", { class: "spellbox" }, h("small", {}, `${el.icon} ${el.label}`), h("h1", {}, sp.name), h("p", { class: "phrase big" }, `"${sp.phrase}"`), gesturePills(sp.gesture), h("p", { class: "hint" }, sp.hint), pumpkins(sp.difficulty)),
      refClip(sp.id, { compact: true }),
      demoFor(`r${cur.index}`, sp.gesture, true, sp.color));
    controls.replaceChildren(h("button", { class: "btn primary big", onclick: begin }, "▶ Колдовать (Enter)"),
      h("button", { class: "btn ghost", onclick: skip }, "Пропустить"));
  }

  function paintCast() {
    const cur = turn(); const sp = spellById(cur.spellId);
    const got = matchedCount(sp);
    hud.className = "hud cast";
    hud.replaceChildren(
      h("div", { class: "castbar" }, h("div", { class: "ring" }, h("b", { id: "secs" }, Math.ceil(sess.remaining))), h("strong", {}, sp.name)),
      h("p", { class: "phrase big" + (sess.phraseSim >= 0.8 ? " ok" : "") }, `"${sp.phrase}"`),
      h("div", { class: "meters" },
        meter("🗣️ Слово", sess.phraseSim), meter("🪄 Жест", matchSequence(sp.gesture, sess.observed))),
      gesturePills(sp.gesture, got),
      demoFor(`c${cur.index}`, sp.gesture, true, sp.color),
      sess.heard ? h("p", { class: "heard" }, `Я слышу: ${sess.heard}`) : null);
    controls.replaceChildren(h("button", { class: "btn good", onclick: () => finishCast(true) }, "Готово"));
  }
  const meter = (label, v) => h("div", { class: "meter" }, h("span", {}, label), h("div", { class: "bar" }, h("i", { style: { width: `${Math.round(v * 100)}%` } })));
  const matchedCount = (sp) => Math.round(matchSequence(sp.gesture, sess.observed) * sp.gesture.length);

  /* ---- sensors */
  async function initSensors() {
    if (cfg.useCamera) {
      try {
        cam = await startCamera(video);
        camOk = true;
        tracker = await createHandTracker(video, onHands).catch((e) => { notice.textContent = "Руки не отслеживаются: " + e.message; return null; });
      } catch (e) { notice.textContent = "Камера недоступна. Ведущий оценивает вручную. " + (e.message ?? ""); }
    } else notice.textContent = "Камера выключена, ведущий оценивает вручную.";
    if (!speechSupported() && cfg.useSpeech) notice.textContent += " Этот браузер не слышит речь: открой в Chrome.";
    else if (cfg.useSpeech) prepareSpeech((id, text) => { if (!/готово/.test(text)) notice.textContent = `Слух: ${text}`; else if (notice.textContent.startsWith("Слух:")) notice.textContent = ""; });
  }

  const ctx = overlay.getContext("2d");
  const handFx = new HandFx();
  const MOTION_SFX = { charge: "pop", spin: "whoosh", push: "whoosh", spread: "pop", crush: "pop", shake: "click" };
  function onHands(hands, now) {
    const w = (overlay.width = overlay.clientWidth), hh = (overlay.height = overlay.clientHeight);
    ctx.clearRect(0, 0, w, hh);
    const show = (p) => ({ x: (cfg.mirror ? p.x : 1 - p.x) * w, y: p.y * hh });
    ctx.fillStyle = "rgba(255,170,60,.9)";
    for (const hand of hands) for (const i of [0, 4, 8, 12, 16, 20]) { const q = show(hand[i]); ctx.beginPath(); ctx.arc(q.x, q.y, i === 8 ? 9 : 5, 0, 6.283); ctx.fill(); }
    if (phase !== "cast" || !sess) return;
    const sp = spellById(turn().spellId);
    const wantsSeal = sp.gesture.some((g) => SEALS.includes(g));
    if (sp.gesture.some((g) => MOTIONS.includes(g))) {
      const m = sess.motion.push(hands, now);
      for (const id of m.events) { sess.observed.push(id); audio.sfx(MOTION_SFX[id] ?? "pop"); }
      handFx.frame(ctx, { W: w, H: hh, now, color: sp.color, m, show });
    }
    if (wantsSeal) {
      const pose = classifyPose(hands);
      if (pose.id && pose.id === sess.holdId) sess.holdN++; else { sess.holdId = pose.id; sess.holdN = 1; }
      if (sess.holdN === 6 && pose.id && pose.id !== sess.lastSeal) { sess.observed.push(pose.id); sess.lastSeal = pose.id; }
      if (!pose.id && sess.holdN > 8) sess.lastSeal = null;
    } else if (sp.gesture.some((g) => WAND.includes(g)) && (hands[0] || cfg.wand)) {
      let tip = hands[0]?.[8];
      if (cfg.wand) {
        const f = findWandTip(video, cfg.wand, hands[0]?.[0]);
        if (f) tip = { x: 1 - f.tip.x, y: f.tip.y };
      }
      if (!tip) return;
      sess.buffer.push({ x: tip.x, y: tip.y, t: now });
      while (sess.buffer.length && now - sess.buffer[0].t > 1500) sess.buffer.shift();
      ctx.strokeStyle = "rgba(255,230,120,.95)"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.beginPath();
      sess.buffer.forEach((p, i) => { const q = show(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke();
      const c = classifyTrace(sess.buffer);
      if (c.id && c.confidence >= 0.55 && now - sess.lastTrace > 800) { sess.observed.push(c.id); sess.buffer.length = 0; sess.lastTrace = now; }
    }
  }

  /* ---- turn flow */
  function begin() {
    if (phase !== "ready") return;
    const sp = spellById(turn().spellId);
    resolving = turn().index;
    phase = "countdown";
    controls.replaceChildren();
    let n = 3;
    audio.hush(true); audio.sfx("tick", { n: 3 });
    hud.className = "hud count";
    hud.replaceChildren(h("div", { class: "bigcount" }, n));
    const tick = () => {
      n--;
      if (n > 0) audio.sfx("tick", { n });
      else audio.sfx("go");
      if (n > 0) { hud.firstChild.textContent = n; hud.firstChild.style.animation = "none"; void hud.firstChild.offsetWidth; hud.firstChild.style.animation = ""; setTimeout(tick, 800); }
      else startCast(sp);
    };
    setTimeout(tick, 800);
  }

  function startCast(sp) {
    phase = "cast";
    sess = { motion: new MotionTracker(), phraseSim: 0, observed: [], buffer: [], holdId: null, holdN: 0, lastSeal: null, lastTrace: 0, heard: "", remaining: 12 + 4 * (sp.gesture.length - 1), t0: performance.now() };
    if (cfg.useSpeech && speechSupported()) {
      mic = listen((text) => { const sc = matchScore(text, sp.phrase); if (sc >= sess.phraseSim || !sess.heard) { sess.phraseSim = Math.max(sess.phraseSim, sc); sess.heard = text; } }, { onError: (e) => { notice.textContent = "Микрофон не работает (" + e + "). Ведущий оценивает слово вручную."; sess.micDead = true; } });
    }
    paintCast();
    timer = setInterval(() => {
      sess.remaining = Math.max(0, 12 + 4 * (sp.gesture.length - 1) - (performance.now() - sess.t0) / 1000);
      const gOk = matchSequence(sp.gesture, sess.observed);
      if (sess.phraseSim >= 0.8 && gOk === 1) return finishCast(false);
      if (sess.remaining <= 0) return finishCast(false);
      paintCast();
    }, 120);
  }

  function stopSensors() { clearInterval(timer); mic?.stop(); mic = null; audio.hush(false); }

  async function finishCast() {
    if (phase !== "cast") return;
    stopSensors();
    const sp = spellById(t.queue[resolving].spellId);
    const sensorsMissing = !camOk || !tracker || (!speechSupported() && cfg.useSpeech) || sess.micDead || !cfg.useSpeech;
    const phraseSim = sess.phraseSim, gestureOk = matchSequence(sp.gesture, sess.observed);
    const r = scoreAttempt({ phraseSim, gestureOk, difficulty: sp.difficulty, lenient: cfg.lenient });
    showResult(r, { sensorsMissing, sp, manual: false });
  }

  async function showResult(r, { sensorsMissing, sp, manual }) {
    phase = "result";
    const cur = { ...t.queue[resolving], index: resolving };
    if (!sensorsMissing || manual) t = recordAttempt(t, { turn: cur.index, playerId: cur.playerId, spellId: sp.id, word: r.word, gesture: r.gesture, total: r.total, success: r.success, manual });
    state.current = t; await save("current");
    hud.className = `hud result ${r.success ? "win" : "lose"}`;
    hud.style.setProperty("--c", sp.color);
    const p = playerById(cur.playerId);
    const total = h("b", { class: "total" }, "0");
    hud.replaceChildren(h("h1", {}, sensorsMissing && !manual ? "Оцени заклинание" : r.success ? pick(CHEER) : pick(ENCOURAGE)),
      h("p", { class: "muted" }, `${p?.name}: ${sp.name}`),
      !sensorsMissing || manual ? h("div", { class: "score" }, "+", total, " баллов", h("small", {}, ` слово ${r.word} · жест ${r.gesture}`)) : h("p", { class: "muted" }, "Камера или микрофон не оценили выступление. Реши сам, ведущий!"));
    if (!sensorsMissing || manual) countUp(total, r.total);
    if (r.success && (!sensorsMissing || manual)) { castEffect(fx, sp.element, { power: sp.power, spell: sp }); setTimeout(() => audio.sfx("success"), 350); }
    else if (!sensorsMissing || manual) audio.sfx("fail");
    controls.replaceChildren(
      h("button", { class: "btn good", onclick: () => award(1, 1) }, "✨ Засчитать (1)"),
      h("button", { class: "btn", onclick: () => award(0.6, 0.6) }, "Почти (2)"),
      h("button", { class: "btn", onclick: retry }, "↻ Еще раз (R)"),
      h("button", { class: "btn primary", onclick: next }, "Дальше (Enter) →"));
    paintSides();
  }

  async function award(ph, ge) {
    if (phase !== "result") return;
    const q = t.queue[resolving];
    const sp = spellById(q.spellId);
    const r = scoreAttempt({ phraseSim: ph, gestureOk: ge, difficulty: sp.difficulty, lenient: true });
    t = recordAttempt(t, { turn: resolving, playerId: q.playerId, spellId: q.spellId, word: r.word, gesture: r.gesture, total: r.total, success: r.success, manual: true });
    state.current = t; await save("current");
    hud.className = `hud result ${r.success ? "win" : "lose"}`;
    hud.replaceChildren(h("h1", {}, r.success ? pick(CHEER) : pick(ENCOURAGE)), h("div", { class: "score" }, "+", h("b", { class: "total" }, r.total), " баллов"));
    audio.sfx("award");
    if (r.success) castEffect(fx, sp.element, { power: sp.power, spell: sp });
    else audio.sfx("fail");
    paintSides();
  }

  function retry() {
    if (phase !== "result") return;
    t = { ...t, cursor: resolving };
    phase = "ready"; state.current = t; paintReady(); paintSides();
  }

  function skip() { t = { ...t, cursor: turn().index + 1 }; state.current = t; save("current"); phase = "ready"; paintSides(); paintReady(); }
  function next() {
    if (phase !== "result") return;
    if (t.cursor <= resolving) t = { ...t, cursor: resolving + 1 };
    state.current = t; save("current");
    phase = "ready"; paintSides(); paintReady();
  }

  async function finish() {
    t = finishTournament(t);
    state.tournaments.push(t); state.current = null;
    await Promise.all([save("tournaments"), save("current")]);
    toast("Турнир завершен! Смотрим рейтинг 🏆");
    location.hash = "#/board";
  }

  paintSides();
  paintReady();
  const bar = h("div", { class: "settings" },
    toggle("Щадящая оценка", cfg.lenient, (v) => { cfg.lenient = v; setSetting("lenient", v); }),
    toggle("Слушать слова", cfg.useSpeech, (v) => { cfg.useSpeech = v; setSetting("useSpeech", v); }),
    h("a", { class: "btn ghost", href: "/asr-lab.html", target: "_blank", rel: "noopener", title: "Какие нейросети слушают заклинания" }, "🎙 Слух"),
    toggle("Зеркало", cfg.mirror, (v) => { cfg.mirror = v; setSetting("mirror", v); stageBox.classList.toggle("nomirror", !v); }),
    h("button", { class: "btn ghost", onclick: async () => { if (!confirm("Закончить этот турнир сейчас? Результаты сохранятся.")) return; t = finishTournament({ ...t, cursor: t.queue.length }); state.tournaments.push(t); state.current = null; await Promise.all([save("tournaments"), save("current")]); location.hash = "#/board"; } }, "Завершить турнир"));
  center.append(bar);
  initSensors();

  return {
    destroy() { removeEventListener("keydown", keyHandler); dropDemo(); stopSensors(); audio.hush(false); tracker?.stop(); cam?.stop(); },
  };
}
