// Microphone rep detector.
//
// It keeps a running estimate of the room's background noise level (the
// baseline). A rep is counted when the loudness jumps `sensitivity` dB above
// that baseline. After a rep it waits until the sound falls back down
// (re-arm) and a minimum gap has passed, so one grunt only counts once.

import { getAudioContext } from './sfx.js';

const FLOOR_DB = -90;
const MIN_TRIGGER_DB = -62; // never trigger on near-silence, even in a very quiet room

export class RepDetector {
  constructor({ onRep, onLevel } = {}) {
    this.onRep = onRep || (() => {});
    this.onLevel = onLevel || (() => {});
    this.sensitivity = 14; // dB above baseline
    this.minGap = 450; // ms between reps
    this.listening = false; // only count reps while true
    this.running = false;
    this.baseline = -60;
    this.level = FLOOR_DB;
    this.armed = true;
    this.lastRep = 0;
    this.suppressUntil = 0;
    this.calibrating = false;
    this._calib = [];
    this._raf = 0;
    this._timer = 0;
    this._lastTick = 0;
  }

  get supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async start() {
    if (this.running) return true;
    if (!this.supported) throw new Error('Microphone not supported in this browser');
    const ctx = getAudioContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false, // suppression can eat claps and grunts
        autoGainControl: false, // auto gain would keep moving the baseline
      },
    });
    if (ctx.state === 'suspended') await ctx.resume();
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser); // not connected to speakers
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.recalibrate();
    this._lastTick = performance.now();
    const loop = () => {
      if (!this.running) return;
      this._tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    // Backup ticker in case animation frames are throttled
    this._timer = setInterval(() => {
      if (performance.now() - this._lastTick > 80) this._tick();
    }, 50);
    return true;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    clearInterval(this._timer);
    try { this.source && this.source.disconnect(); } catch (e) { /* already gone */ }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // Measure the room for ~0.8s and use the median as the new baseline.
  recalibrate() {
    this.calibrating = true;
    this._calib = [];
    this._calibUntil = performance.now() + 800;
  }

  // Ignore input for a moment (e.g. while our own sound effect plays).
  suppress(ms) {
    this.suppressUntil = Math.max(this.suppressUntil, performance.now() + ms);
  }

  get threshold() {
    return Math.max(this.baseline + this.sensitivity, MIN_TRIGGER_DB);
  }

  _measure() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    return Math.max(FLOOR_DB, 20 * Math.log10(rms + 1e-9));
  }

  _tick() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this._lastTick) / 1000);
    this._lastTick = now;
    const db = this._measure();
    this.level = db;

    if (this.calibrating) {
      this._calib.push(db);
      if (now >= this._calibUntil && this._calib.length >= 5) {
        const sorted = [...this._calib].sort((a, b) => a - b);
        this.baseline = sorted[Math.floor(sorted.length / 2)];
        this.calibrating = false;
        this.armed = true;
      }
      this.onLevel(this._snapshot());
      return;
    }

    const thr = this.threshold;
    const release = this.baseline + this.sensitivity * 0.45;

    // Rep detection with hysteresis
    if (this.armed && db >= thr && now - this.lastRep >= this.minGap && now >= this.suppressUntil) {
      this.armed = false;
      this.lastRep = now;
      if (this.listening) this.onRep({ db, baseline: this.baseline });
    } else if (!this.armed && db < release) {
      this.armed = true;
    }

    // Adapt baseline: drop fast to quieter levels, rise slowly for steady
    // noise (a fan switching on), barely move during a loud peak.
    let tau;
    if (db < this.baseline) tau = 0.4;
    else if (db < thr) tau = 2.5;
    else tau = 25;
    const alpha = 1 - Math.exp(-dt / tau);
    this.baseline += (db - this.baseline) * alpha;
    this.baseline = Math.max(this.baseline, FLOOR_DB + 5);

    this.onLevel(this._snapshot());
  }

  _snapshot() {
    return {
      level: this.level,
      baseline: this.baseline,
      threshold: this.threshold,
      calibrating: this.calibrating,
      armed: this.armed,
    };
  }
}

// Map dB to a 0..1 meter position
export const dbToMeter = (db) => Math.min(1, Math.max(0, (db + 80) / 70));
