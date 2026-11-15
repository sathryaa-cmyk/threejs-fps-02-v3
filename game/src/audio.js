// audio.js — procedural WebAudio effects. No audio files, no network.
// Everything is guarded: a suspended or missing AudioContext just silences us.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try { void this.ctx.resume(); } catch { /* ignore */ }
      }
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  _noise(dur, filterFreq, gain) {
    if (!this.ctx || !this.enabled) return;
    try {
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
    } catch { /* ignore */ }
  }

  _tone(freq, dur, type, gain, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    try {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch { /* ignore */ }
  }

  shot(id, dist = 0) {
    this.ensure();
    const vol = Math.max(0.08, 1 - dist / 60);
    if (id === 'sniper') { this._noise(0.25, 900, 0.9 * vol); this._tone(140, 0.18, 'sawtooth', 0.25 * vol, 50); }
    else if (id === 'rifle') { this._noise(0.09, 1800, 0.55 * vol); this._tone(220, 0.07, 'square', 0.12 * vol, 90); }
    else if (id === 'smg') { this._noise(0.06, 2400, 0.4 * vol); }
    else { this._noise(0.08, 1500, 0.5 * vol); }
  }

  hit() { this._tone(1200, 0.05, 'sine', 0.2); }
  kill() { this._tone(880, 0.09, 'sine', 0.25); this._tone(1320, 0.12, 'sine', 0.2); }
  plant() { this._tone(520, 0.15, 'sine', 0.3, 780); }
  beep() { this._tone(980, 0.08, 'square', 0.15); }
  defuse() { this._tone(660, 0.1, 'sine', 0.25, 990); }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'sine', 0.25), i * 120)); }
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'sine', 0.2), i * 120)); }
  click() { this._tone(700, 0.04, 'sine', 0.15); }
  explosion() { this._noise(0.9, 300, 1.0); this._tone(70, 0.7, 'sine', 0.5, 30); }
}
