// Audio sources for the recognizers: microphone or a sound file, both delivered as 16 kHz mono Float32 chunks.
const TARGET = 16000;

const WORKLET = `class Cap extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
}
registerProcessor("cap", Cap);`;

// Streaming linear resampler: keeps the fractional read position between chunks.
function resampler(from, to) {
  if (from === to) return (x) => x;
  const step = from / to;
  let pos = 0, tail = 0;
  return (x) => {
    const out = [];
    for (; pos < x.length; pos += step) {
      const i = Math.floor(pos), f = pos - i;
      const a = i < 0 ? tail : x[i];
      const b = i + 1 < x.length ? x[i + 1] : x[x.length - 1];
      out.push(a + (b - a) * f);
    }
    pos -= x.length;
    tail = x[x.length - 1];
    return Float32Array.from(out);
  };
}

export async function openMic(onChunk) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-mic-api");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ac = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  try { await ac.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  const src = ac.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ac, "cap");
  const mute = ac.createGain();
  mute.gain.value = 0;
  const rs = resampler(ac.sampleRate, TARGET);
  node.port.onmessage = (e) => onChunk(rs(e.data));
  src.connect(node).connect(mute).connect(ac.destination);
  if (ac.state === "suspended") await ac.resume().catch(() => {});
  return {
    close() {
      node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      ac.close().catch(() => {});
    },
  };
}

// Plays a recording into the recognizers at real speed (for tests and the lab), then a second of silence.
export async function openFile(url, onChunk, { speed = 1 } = {}) {
  const buf = await (await fetch(url)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, TARGET).decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const chunk = 1600;
  let at = 0, closed = false, timer;
  const done = new Promise((resolve) => {
    timer = setInterval(() => {
      if (closed) return resolve();
      const end = Math.min(at + chunk, data.length + TARGET);
      const part = new Float32Array(end - at);
      part.set(data.subarray(Math.min(at, data.length), Math.min(end, data.length)));
      onChunk(part);
      at = end;
      if (at >= data.length + TARGET) { clearInterval(timer); resolve(); }
    }, 100 / speed);
  });
  return { done, seconds: data.length / TARGET, close() { closed = true; clearInterval(timer); } };
}
