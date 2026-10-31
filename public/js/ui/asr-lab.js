// Lab for the speech engines: choose which run in the game, test them on recordings or the microphone.
import { settings, setSetting } from "../store.js";
import { ENGINES, DEFAULT_ENGINES, available, startListening } from "../engine/asr/engines.js";
import { openFile } from "../engine/asr/audio.js";
import { matchScore } from "../core/fuzzy.js";

const $ = (id) => document.getElementById(id);
const SAMPLES = [
  ["patronus", "Экспекто Патронум"], ["levitate", "Вингардиум Левиоса"], ["expelli", "Экспеллиармус"], ["lumos", "Люмос"],
  ["katon", "Катон Гокакю но дзюцу"], ["raiton", "Чидори"], ["doton", "Дотон Дорюхеки"], ["youshall", "Ты не пройдешь"],
];

let chosen = new Set((settings().asr ?? DEFAULT_ENGINES));
let avail = {};
let session = null;
const rows = new Map();
const status = (t) => { $("status").textContent = t; };

function paintEngines() {
  $("engines").replaceChildren(...ENGINES.map((e) => {
    const src = avail[e.id];
    const el = document.createElement("div");
    el.className = `eng${chosen.has(e.id) ? " on" : ""}${src ? "" : " off"}`;
    el.innerHTML = `<input type="checkbox" ${chosen.has(e.id) ? "checked" : ""} ${src ? "" : "disabled"}><b>${e.label} <span class="tag">${e.family}</span></b><span class="tag">${e.size} · ${src === "local" ? "на сервере" : src === "remote" ? "с Hugging Face" : src === "builtin" ? "в браузере" : "нет файлов"}</span><small>${e.note}</small>`;
    el.onclick = () => {
      if (!src) return;
      if (chosen.has(e.id)) chosen.delete(e.id); else chosen.add(e.id);
      if (!chosen.size) chosen.add(DEFAULT_ENGINES[0]);
      setSetting("asr", [...chosen]);
      paintEngines();
    };
    return el;
  }));
}

function row(id) {
  if (rows.has(id)) return rows.get(id);
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><b>${ENGINES.find((e) => e.id === id).label}</b></td><td class="load">…</td><td class="txt">—</td><td class="score">—</td><td class="first">—</td><td class="fin">—</td>`;
  $("results").append(tr);
  const r = { tr, load: tr.querySelector(".load"), txt: tr.querySelector(".txt"), score: tr.querySelector(".score"), first: tr.querySelector(".first"), fin: tr.querySelector(".fin"), best: 0, t0: 0, got: false };
  rows.set(id, r);
  return r;
}

function paintScore(r, s) {
  r.score.textContent = `${Math.round(s * 100)}%`;
  r.score.className = `score ${s >= 0.8 ? "good" : s >= 0.5 ? "mid" : "bad"}`;
}

async function run() {
  stop();
  rows.clear(); $("results").replaceChildren();
  const ids = [...chosen];
  const phrase = $("spell").selectedOptions[0].dataset.phrase;
  const src = $("source").value;
  ids.forEach((id) => { const r = row(id); r.load.textContent = "загрузка"; });
  $("run").disabled = true; $("stop").disabled = false;
  let fileSrc = null;
  const mic = src === "mic" ? undefined : async (cb) => {
    rows.forEach((r) => { r.t0 = performance.now(); });
    fileSrc = await openFile(`/lab-samples/${src}.wav`, cb);
    status(`Играю запись (${fileSrc.seconds.toFixed(1)} с) и слушаю…`);
    fileSrc.done.then(() => setTimeout(() => { if (session) { status("Запись закончилась."); $("run").disabled = false; $("stop").disabled = true; } }, 1500));
    return fileSrc;
  };
  status("Загружаю модели…");
  session = startListening(ids, (text, final, id) => {
    const r = row(id);
    if (!r.got) { r.got = true; r.first.textContent = `${Math.round(performance.now() - r.t0)} мс`; }
    const sc = matchScore(text, phrase);
    r.txt.textContent = text;
    if (sc >= r.best) { r.best = sc; paintScore(r, sc); }
    if (final) r.fin.textContent = `${Math.round(performance.now() - r.t0)} мс`;
  }, {
    mic,
    onStatus: (id, t) => { const r = row(id); r.load.textContent = t; if (t === "готово") { r.load.textContent = `готово`; r.t0 = performance.now(); if (src === "mic") status("Говори заклинание в микрофон…"); } },
    onError: (e) => status(`Ошибка: ${e}`),
  });
}

function stop() {
  session?.stop(); session = null;
  $("run").disabled = false; $("stop").disabled = true;
}

(async () => {
  const spells = await (await fetch("/api/spells")).json();
  $("spell").innerHTML = spells.map((s) => `<option data-phrase="${s.phrase}" ${s.phrase === "Экспекто Патронум" ? "selected" : ""}>${s.phrase}</option>`).join("");
  $("source").innerHTML = `<option value="mic">🎤 Микрофон</option>` + SAMPLES.map(([id, p]) => `<option value="${id}">Запись: ${p}</option>`).join("");
  $("source").onchange = () => {
    const hit = SAMPLES.find(([id]) => id === $("source").value);
    if (hit) [...$("spell").options].forEach((o) => { if (o.dataset.phrase === hit[1]) o.selected = true; });
  };
  $("run").onclick = run;
  $("stop").onclick = stop;
  paintEngines();
  avail = await available();
  chosen = new Set([...chosen].filter((id) => avail[id]));
  if (!chosen.size) chosen.add(DEFAULT_ENGINES[0]);
  paintEngines();
})();
