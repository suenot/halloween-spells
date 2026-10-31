// Registry of speech recognizers and the shared listening session. Several engines can run at once; the game takes the best match.
import { openMic } from "./audio.js";

const ASSETS = "/vendor/asr/";
const HF = "https://huggingface.co/";
const GRAMMAR = null; // Vosk would drop made-up words not in its lexicon, so it decodes freely.

const sherpa = (dir, repo, mode, files) => ({ kind: "sherpa", dir, repo, mode, files });

export const ENGINES = [
  { id: "sherpa-zipformer", label: "Zipformer small", family: "sherpa-onnx", size: "29 МБ", streaming: true,
    note: "Потоковая, ответ за ~0.1 с, идет в браузере. Лучший баланс.",
    model: sherpa("zipformer-ru-small", "csukuangfj/sherpa-onnx-streaming-zipformer-small-ru-vosk-int8-2025-08-16", "online-transducer",
      { encoder: "encoder.int8.onnx", decoder: "decoder.onnx", joiner: "joiner.int8.onnx", tokens: "tokens.txt" }) },
  { id: "sherpa-tone", label: "T-One", family: "sherpa-onnx", size: "144 МБ", streaming: true,
    note: "Потоковая CTC (телефонная речь, 8 кГц). Тяжелее и в тестах слабее.",
    model: sherpa("t-one-ru", "csukuangfj/sherpa-onnx-streaming-t-one-russian-2025-09-08", "online-tone", { model: "model.onnx", tokens: "tokens.txt" }) },
  { id: "sherpa-gigaam", label: "GigaAM v3", family: "sherpa-onnx", size: "225 МБ", streaming: false,
    note: "Самая точная для русского, но решает по фразе: ответ через ~0.7 с тишины.",
    model: sherpa("gigaam-v3-ctc", "csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16", "offline-nemo-ctc", { model: "model.int8.onnx", tokens: "tokens.txt" }) },
  { id: "vosk-small", label: "Vosk small", family: "Vosk (Kaldi)", size: "46 МБ", streaming: true, localOnly: true,
    note: "Классика Kaldi, потоковая. Незнакомые слова теряет.",
    model: { kind: "vosk", file: "vosk/vosk-model-small-ru-0.22.tar.gz" } },
  { id: "whisper-tiny", label: "Whisper tiny", family: "transformers.js", size: "41 МБ", streaming: false,
    note: "Обрабатывает фразами, иногда выдумывает слова.",
    model: { kind: "whisper", id: "Xenova/whisper-tiny" } },
  { id: "webspeech", label: "Браузер (Web Speech)", family: "Chrome", size: "0", streaming: true, needsMic: false,
    note: "Только Chrome, нужен интернет, звук уходит в Google." },
];
export const DEFAULT_ENGINES = ["sherpa-zipformer"];
export const engineDef = (id) => ENGINES.find((e) => e.id === id);

/* ---- where do the files come from: this server first, then Hugging Face */
const probeCache = new Map();
async function exists(url) {
  try { return (await fetch(url, { method: "HEAD" })).ok; } catch { return false; }
}
async function sourceOf(def) {
  if (probeCache.has(def.id)) return probeCache.get(def.id);
  const m = def.model;
  let r = null;
  if (m?.kind === "sherpa") {
    const first = Object.values(m.files)[0];
    if (await exists(`${ASSETS}models/${m.dir}/${first}`)) r = "local";
    else if (await exists(`${HF}${m.repo}/resolve/main/${first}`)) r = "remote";
  } else if (m?.kind === "vosk") r = (await exists(`${ASSETS}${m.file}`)) ? "local" : null;
  else if (m?.kind === "whisper") r = (await exists(`${ASSETS}models/${m.id}/config.json`)) ? "local" : (await exists(`${HF}${m.id}/resolve/main/config.json`)) ? "remote" : null;
  else r = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition ? "builtin" : null;
  probeCache.set(def.id, r);
  return r;
}
export async function available() {
  const out = {};
  await Promise.all(ENGINES.map(async (e) => { out[e.id] = await sourceOf(e); }));
  return out;
}

/* ---- worker-based engines (sherpa-onnx, whisper) */
function workerEngine(def, workerFile) {
  let worker, ready, onText = () => {}, onStatus = () => {}, failed = null;
  const load = (status) => {
    onStatus = status ?? onStatus;
    ready ??= (async () => {
      const src = await sourceOf(def);
      if (!src) throw new Error("model-missing");
      worker = new Worker(new URL(workerFile, import.meta.url), { type: "module" });
      const m = def.model;
      const base = new URL(ASSETS, location.href).href;
      let model;
      if (m.kind === "sherpa") {
        const root = src === "local" ? `${base}models/${m.dir}/` : `${HF}${m.repo}/resolve/main/`;
        model = { mode: m.mode, files: Object.fromEntries(Object.entries(m.files).map(([k, f]) => [k, root + f])) };
      } else model = { id: m.id };
      return new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const d = e.data;
          if (d.type === "ready") { def.loadMs = d.loadMs; resolve(); }
          else if (d.type === "status") onStatus(d.text);
          else if (d.type === "text") onText(d.text, d.final);
          else if (d.type === "error") { failed = d.message; reject(new Error(d.message)); onStatus(`Ошибка: ${d.message}`); }
        };
        worker.onerror = (e) => { failed = e.message; reject(new Error(e.message)); };
        worker.postMessage({ type: "init", base, path: ASSETS, model, remote: src === "remote" });
      });
    })();
    ready.catch(() => { ready = null; });
    return ready;
  };
  return {
    load,
    start(cb) {
      onText = cb;
      worker?.postMessage({ type: "reset" });
      return {
        feed: (x) => worker?.postMessage({ type: "audio", samples: x }, [x.buffer]),
        stop() { onText = () => {}; worker?.postMessage({ type: "reset" }); },
      };
    },
    get failed() { return failed; },
  };
}

/* ---- Vosk (own worker inside vosk-browser) */
function voskEngine(def) {
  let model, ready;
  const load = (status) => {
    ready ??= (async () => {
      if (!globalThis.Vosk) {
        status?.("Запуск движка");
        await new Promise((ok, bad) => { const s = document.createElement("script"); s.src = `${ASSETS}vosk/vosk.js`; s.onload = ok; s.onerror = () => bad(new Error("vosk.js")); document.head.append(s); });
      }
      status?.("Загрузка модели (разбор архива)");
      model = await globalThis.Vosk.createModel(`${ASSETS}${def.model.file}`);
    })();
    ready.catch(() => { ready = null; });
    return ready;
  };
  return {
    load,
    start(cb) {
      const rec = new model.KaldiRecognizer(16000, GRAMMAR);
      rec.on("result", (m) => { if (m.result?.text) cb(m.result.text, true); });
      rec.on("partialresult", (m) => { if (m.result?.partial) cb(m.result.partial, false); });
      return { feed: (x) => rec.acceptWaveformFloat(x, 16000), stop() { try { rec.remove(); } catch { /* gone */ } } };
    },
  };
}

/* ---- Chrome Web Speech: owns its microphone */
function webSpeechEngine() {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  return {
    own: true,
    load: async () => { if (!SR) throw new Error("unsupported"); },
    start(cb, onError) {
      const rec = new SR();
      rec.lang = "ru-RU"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
      let on = true;
      rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) for (let a = 0; a < e.results[i].length; a++) cb(e.results[i][a].transcript, e.results[i].isFinal); };
      rec.onend = () => { if (on) { try { rec.start(); } catch { /* already started */ } } };
      rec.onerror = (e) => { if (["not-allowed", "service-not-allowed", "network"].includes(e.error)) { on = false; onError?.(e.error); } };
      try { rec.start(); } catch (e) { onError?.(String(e)); }
      return { feed() {}, stop() { on = false; try { rec.stop(); } catch { /* noop */ } } };
    },
  };
}

const instances = new Map();
function instance(id) {
  if (instances.has(id)) return instances.get(id);
  const def = engineDef(id);
  const e = !def ? null : def.id === "webspeech" ? webSpeechEngine()
    : def.model.kind === "vosk" ? voskEngine(def)
    : workerEngine(def, def.model.kind === "whisper" ? "./whisper.worker.js" : "./sherpa.worker.js");
  instances.set(id, e);
  return e;
}

/** Loads the chosen engines ahead of time. Resolves with the ids that are ready. */
export async function warmup(ids, onStatus) {
  const ok = [];
  await Promise.all(ids.map(async (id) => {
    const e = instance(id);
    if (!e) return;
    try { await e.load((t) => onStatus?.(id, t)); ok.push(id); onStatus?.(id, "готово"); } catch (err) { onStatus?.(id, `не загрузилась (${err.message})`); }
  }));
  return ok;
}

/**
 * Starts listening with every ready engine at once. onText(text, final, engineId).
 * Returns {stop()}. onError("mic" | "not-allowed" | "no-engine") when nothing can listen.
 */
export function startListening(ids, onText, { onError, onStatus, mic = openMic } = {}) {
  const sessions = [];
  let stopped = false, source = null;
  (async () => {
    const live = (await warmup(ids, onStatus)).filter((id) => !stopped);
    if (!live.length) { onError?.("no-engine"); return; }
    for (const id of live) {
      const e = instance(id);
      sessions.push({ id, own: e.own, s: e.start((t, f) => onText(t, f, id), (err) => onStatus?.(id, `ошибка: ${err}`)) });
    }
    if (stopped) return;
    if (sessions.some((x) => !x.own)) {
      try {
        source = await mic((chunk) => {
          const audible = sessions.filter((x) => !x.own);
          audible.forEach((x, i) => x.s.feed(i === audible.length - 1 ? chunk : chunk.slice()));
        });
        if (stopped) source.close();
      } catch (err) { onError?.(err?.name === "NotAllowedError" ? "not-allowed" : "mic"); }
    }
  })();
  return { stop() { stopped = true; source?.close(); sessions.forEach((x) => x.s.stop()); } };
}

/** The lab needs raw access to feed recordings. */
export const _internal = { instance };
