// sherpa-onnx (WASM) recognizer in a module worker so decoding never blocks the camera and the UI.
// Protocol in: {type:"init", base, model} | {type:"audio", samples} | {type:"reset"}
// Protocol out: {type:"status", text} | {type:"ready", loadMs} | {type:"text", text, final} | {type:"error", message}
import { UtteranceGate } from "./vad-gate.js";

let M, asr, rec, stream, mode, gate, last = "", busy = false;

async function download(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const out = new Uint8Array(total);
  const reader = res.body.getReader();
  let got = 0, shown = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, got);
    got += value.length;
    if (got - shown > total / 50) { shown = got; self.postMessage({ type: "status", text: `${label}: ${Math.round((got / total) * 100)}%` }); }
  }
  return out;
}

// The Emscripten glue is a Node build: outside Node it still calls require("path") for its virtual file system.
const posix = {
  isAbsolute: (p) => p.startsWith("/"),
  normalize(p) {
    const abs = p.startsWith("/"), tail = p.endsWith("/");
    const out = [];
    for (const seg of p.split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === ".." && out.length && out.at(-1) !== "..") out.pop(); else if (seg !== ".." || !abs) out.push(seg);
    }
    const r = (abs ? "/" : "") + out.join("/");
    return (r || (abs ? "/" : ".")) + (tail && out.length ? "/" : "");
  },
  dirname(p) { const i = p.replace(/\/+$/, "").lastIndexOf("/"); return i < 0 ? "." : i === 0 ? "/" : p.slice(0, i); },
  basename(p, ext) { const b = p.replace(/\/+$/, "").split("/").pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
  join: (...a) => posix.normalize(a.filter(Boolean).join("/")),
  resolve(...a) {
    let path = "";
    for (let i = a.length - 1; i >= 0 && !path.startsWith("/"); i--) if (a[i]) path = `${a[i]}/${path}`;
    if (!path.startsWith("/")) path = `/${path}`;
    return posix.normalize(path).replace(/(.)\/$/, "$1");
  },
  extname(p) { const b = posix.basename(p), i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
  sep: "/",
};
posix.posix = posix;
const nodeRequire = (name) => { if (name === "path") return posix; throw new Error(`require(${name}) outside Node`); };

async function boot(base) {
  const [glue, api] = await Promise.all([fetch(`${base}sherpa/sherpa-onnx-wasm-nodejs.js`).then((r) => r.text()), fetch(`${base}sherpa/sherpa-onnx-asr.js`).then((r) => r.text())]);
  // The npm build forces the Node-only raw file system; outside Node keep Emscripten's in-memory one.
  const patched = glue
    .replace('if(!ENVIRONMENT_IS_NODE){throw new Error("NODERAWFS is currently only supported on Node.js environment.")}', "")
    .replace("for(var _key in NODERAWFS){", "if(ENVIRONMENT_IS_NODE)for(var _key in NODERAWFS){");
  if (patched === glue) throw new Error("sherpa glue layout changed");
  const make = new Function("require", `${patched}\n;return Module;`)(nodeRequire);
  M = await make({ locateFile: (f) => `${base}sherpa/${f}`, print() {}, printErr() {} });
  const mod = { exports: {} };
  new Function("module", "exports", "process", api)(mod, mod.exports, { versions: { node: "0" } }); // the API file only exports itself "under Node"
  asr = mod.exports;
}

const FEAT = { sampleRate: 16000, featureDim: 80 };

async function stage(files, label) {
  const paths = {};
  for (const [key, url] of Object.entries(files)) {
    const bytes = await download(url, `${label} ${key}`);
    const p = `/${label}-${key}`;
    M.FS.writeFile(p, bytes);
    paths[key] = p;
  }
  return paths;
}

function makeOnline(model, f) {
  const base = { transducer: { encoder: "", decoder: "", joiner: "" }, paraformer: { encoder: "", decoder: "" }, zipformer2Ctc: { model: "" }, nemoCtc: { model: "" }, toneCtc: { model: "" } };
  if (model.mode === "online-transducer") base.transducer = { encoder: f.encoder, decoder: f.decoder, joiner: f.joiner };
  else base.toneCtc = { model: f.model };
  return asr.createOnlineRecognizer(M, {
    featConfig: FEAT,
    modelConfig: { ...base, tokens: f.tokens, numThreads: 1, provider: "cpu", debug: 0, modelType: "", modelingUnit: "cjkchar", bpeVocab: "" },
    decodingMethod: "greedy_search", maxActivePaths: 4, enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4, rule2MinTrailingSilence: 0.7, rule3MinUtteranceLength: 20,
    hotwordsFile: "", hotwordsScore: 1.5, ctcFstDecoderConfig: { graph: "", maxActive: 3000 }, ruleFsts: "", ruleFars: "",
  });
}

function makeOffline(f) {
  return new asr.OfflineRecognizer({
    featConfig: FEAT,
    modelConfig: { nemoCtc: { model: f.model }, tokens: f.tokens, numThreads: 1, provider: "cpu", debug: 0, modelType: "" },
    decodingMethod: "greedy_search",
  }, M);
}

function decodeOffline(samples) {
  const s = rec.createStream();
  s.acceptWaveform(16000, samples);
  rec.decode(s);
  const text = String(rec.getResult(s).text ?? "").trim();
  s.free();
  return text;
}

function emit(text, final) {
  if (text === last && !final) return;
  last = final ? "" : text;
  if (text || final) self.postMessage({ type: "text", text, final });
}

function feedOnline(x) {
  stream.acceptWaveform(16000, x);
  while (rec.isReady(stream)) rec.decode(stream);
  const text = String(rec.getResult(stream).text ?? "").trim();
  if (rec.isEndpoint(stream)) { if (text) emit(text, true); rec.reset(stream); last = ""; } else emit(text, false);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const t0 = performance.now();
      mode = m.model.mode;
      self.postMessage({ type: "status", text: "Запуск движка" });
      await boot(m.base);
      const f = await stage(m.model.files, "m");
      self.postMessage({ type: "status", text: "Загрузка модели в память" });
      if (mode === "offline-nemo-ctc") {
        rec = makeOffline(f);
        gate = new UtteranceGate({
          onTick: (x) => { if (busy) return; busy = true; try { emit(decodeOffline(x), false); } finally { busy = false; } },
          onEnd: (x) => { busy = true; try { emit(decodeOffline(x), true); } finally { busy = false; } },
        });
      } else {
        rec = makeOnline(m.model, f);
        stream = rec.createStream();
      }
      for (const p of Object.values(f)) { try { M.FS.unlink(p); } catch { /* already gone */ } }
      self.postMessage({ type: "ready", loadMs: Math.round(performance.now() - t0) });
    } else if (m.type === "audio") {
      if (!rec) return;
      if (mode === "offline-nemo-ctc") gate.push(m.samples); else feedOnline(m.samples);
    } else if (m.type === "reset") {
      last = "";
      if (mode === "offline-nemo-ctc") gate?.reset(); else if (rec && stream) { stream.free(); stream = rec.createStream(); }
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message ?? err) });
  }
};
