// Web Audio API Retro Sound Effects Engine (No copyrighted music)
class RetroAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
      }
    } catch (e) {
      console.warn('Web Audio not supported', e);
    }
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // Mario-style coin chime (high B5 -> E6 square wave)
  playCoin() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.08); // E6

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.setValueAtTime(0.2, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Clock tick for countdown (last 10s has higher pitch)
  playTick(isUrgent = false) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const freq = isUrgent ? 880 : 440;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq / 2, t + 0.06);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Answer locked / click sound
  playLock() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(523.25, t); // C5
    osc.frequency.setValueAtTime(659.25, t + 0.05); // E5

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Correct answer fanfare (cheerful 8-bit arpeggio)
  playCorrect() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [
      { f: 523.25, d: 0.08 }, // C5
      { f: 659.25, d: 0.08 }, // E5
      { f: 783.99, d: 0.08 }, // G5
      { f: 1046.50, d: 0.25 } // C6
    ];

    let offset = 0;
    notes.forEach((note) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note.f, t + offset);

      gain.gain.setValueAtTime(0.2, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + note.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + offset);
      osc.stop(t + offset + note.d);
      offset += note.d * 0.9;
    });
  }

  // Wrong answer buzz (descending saw/triangle)
  playWrong() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(110, t + 0.35);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Glorious 8-bit podium victory fanfare!
  playFanfare() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Classic retro triumph sequence: G4, C5, E5, G5, E5, G5...
    const melody = [
      { f: 392.00, start: 0.00, dur: 0.12 }, // G4
      { f: 523.25, start: 0.14, dur: 0.12 }, // C5
      { f: 659.25, start: 0.28, dur: 0.12 }, // E5
      { f: 783.99, start: 0.42, dur: 0.20 }, // G5
      { f: 659.25, start: 0.64, dur: 0.12 }, // E5
      { f: 783.99, start: 0.78, dur: 0.50 }  // G5 long
    ];

    melody.forEach((n) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(n.f, t + n.start);

      gain.gain.setValueAtTime(0.22, t + n.start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.start + n.dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + n.start);
      osc.stop(t + n.start + n.dur);
    });
  }

  // 1-up / Stage transition chime
  playStageClear() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [330, 392, 659, 523, 587, 784];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.07);

      gain.gain.setValueAtTime(0.2, t + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + idx * 0.07);
      osc.stop(t + idx * 0.07 + 0.12);
    });
  }
}

window.retroAudio = new RetroAudioEngine();
