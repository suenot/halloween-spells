// Energy gate that cuts a continuous 16 kHz stream into utterances, for recognizers that only decode finished audio.
const RATE = 16000;

export class UtteranceGate {
  // onTick(samples) is called about every `interimMs` while speech goes on; onEnd(samples) when it stops.
  constructor({ onTick, onEnd, interimMs = 1200, silenceMs = 600, maxMs = 8000, preMs = 300 }) {
    Object.assign(this, { onTick, onEnd, interimMs, silenceMs, maxMs, preMs });
    this.floor = 0.004;
    this.reset();
  }

  reset() {
    this.pre = [];
    this.parts = [];
    this.active = false;
    this.quiet = 0;
    this.sinceTick = 0;
    this.len = 0;
  }

  static rms(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, x.length));
  }

  samples() {
    const out = new Float32Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }

  push(x) {
    const ms = (x.length / RATE) * 1000;
    const level = UtteranceGate.rms(x);
    const loud = level > Math.max(0.012, this.floor * 3);
    if (!loud && !this.active) this.floor = this.floor * 0.95 + level * 0.05;
    if (!this.active) {
      if (!loud) {
        this.pre.push(x);
        while (this.pre.length * ms > this.preMs) this.pre.shift();
        return;
      }
      this.active = true;
      this.parts = [...this.pre];
      this.len = this.parts.reduce((n, p) => n + p.length, 0);
      this.pre = [];
      this.quiet = 0;
      this.sinceTick = 0;
    }
    this.parts.push(x);
    this.len += x.length;
    this.quiet = loud ? 0 : this.quiet + ms;
    this.sinceTick += ms;
    const tooLong = (this.len / RATE) * 1000 >= this.maxMs;
    if (this.quiet >= this.silenceMs || tooLong) {
      const all = this.samples();
      this.reset();
      this.onEnd(all);
    } else if (this.sinceTick >= this.interimMs) {
      this.sinceTick = 0;
      this.onTick(this.samples());
    }
  }
}
