// Whisper (transformers.js, ONNX/WASM or WebGPU) in a module worker. Not a streaming model: the energy gate cuts utterances
// and the rolling window is re-decoded for interim text.
// Protocol is the same as sherpa.worker.js.
import { UtteranceGate } from "./vad-gate.js";

let asr, gate, busy = false, last = "";

async function transcribe(samples) {
  const out = await asr(samples, { language: "russian", task: "transcribe", max_new_tokens: 32 });
  return String(out?.text ?? "").trim();
}

async function decode(samples, final) {
  if (busy && !final) return;
  busy = true;
  try {
    const text = await transcribe(samples);
    if (text && (final || text !== last)) self.postMessage({ type: "text", text, final });
    last = final ? "" : text;
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message ?? err) });
  } finally { busy = false; }
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const t0 = performance.now();
      self.postMessage({ type: "status", text: "Запуск движка" });
      const tf = await import(`${m.base}transformers/transformers.js`);
      tf.env.allowLocalModels = true;
      tf.env.allowRemoteModels = Boolean(m.remote);
      // must stay a plain path: transformers.js skips its local-file check for http(s) URLs
      tf.env.localModelPath = `${m.path}models/`;
      tf.env.backends.onnx.wasm.wasmPaths = `${m.base}transformers/`;
      tf.env.backends.onnx.wasm.numThreads = 1;
      tf.env.useBrowserCache = true;
      self.postMessage({ type: "status", text: "Загрузка модели" });
      asr = await tf.pipeline("automatic-speech-recognition", m.model.id, {
        dtype: "q8",
        device: m.model.device ?? "wasm",
        progress_callback: (p) => { if (p.status === "progress") self.postMessage({ type: "status", text: `Модель: ${Math.round(p.progress)}%` }); },
      });
      gate = new UtteranceGate({
        interimMs: 1500, silenceMs: 700,
        onTick: (x) => decode(x, false),
        onEnd: (x) => decode(x, true),
      });
      self.postMessage({ type: "ready", loadMs: Math.round(performance.now() - t0) });
    } else if (m.type === "audio") {
      gate?.push(m.samples);
    } else if (m.type === "reset") {
      last = "";
      gate?.reset();
    }
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message ?? err) });
  }
};
