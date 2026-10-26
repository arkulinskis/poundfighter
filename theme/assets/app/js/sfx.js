// Synthesized sound effects (no audio files) and haptics.

let ctx = null;
let enabled = true;
let vibrateOn = true;
let onPlay = () => {};

export function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function configureSfx({ sound, vibrate, onPlaySound } = {}) {
  if (sound !== undefined) enabled = sound;
  if (vibrate !== undefined) vibrateOn = vibrate;
  if (onPlaySound) onPlay = onPlaySound;
}

function buzz(pattern) {
  if (vibrateOn && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ }
  }
}

function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', gain = 0.25, delay = 0 }) {
  const c = getAudioContext();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.12, gain = 0.3, freq = 1200, delay = 0 }) {
  const c = getAudioContext();
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t);
}

function play(ms, fn) {
  if (!enabled) return;
  onPlay(ms);
  try { fn(); } catch (e) { /* audio blocked */ }
}

export const sfx = {
  hit(combo = 1) {
    buzz(30);
    play(180, () => {
      noise({ dur: 0.09, gain: 0.35, freq: 900 });
      tone({ freq: 160 + Math.min(combo, 20) * 12, to: 60, dur: 0.12, type: 'triangle', gain: 0.35 });
    });
  },
  tick() {
    play(120, () => tone({ freq: 880, dur: 0.08, type: 'square', gain: 0.08 }));
  },
  go() {
    buzz([40, 40, 40]);
    play(300, () => {
      tone({ freq: 523, dur: 0.12, type: 'square', gain: 0.12 });
      tone({ freq: 784, dur: 0.22, type: 'square', gain: 0.12, delay: 0.1 });
    });
  },
  capture(rarity = 'common') {
    buzz([60, 40, 120]);
    const notes = { common: [523, 659, 784], rare: [523, 659, 784, 1046], epic: [440, 554, 659, 880, 1108], legendary: [392, 523, 659, 784, 1046, 1318] }[rarity];
    play(notes.length * 110 + 400, () => {
      notes.forEach((n, i) => tone({ freq: n, dur: 0.22, type: 'triangle', gain: 0.22, delay: i * 0.1 }));
      tone({ freq: notes[notes.length - 1] * 2, dur: 0.5, type: 'sine', gain: 0.1, delay: notes.length * 0.1 });
    });
  },
  escape() {
    play(500, () => tone({ freq: 400, to: 120, dur: 0.45, type: 'sawtooth', gain: 0.1 }));
  },
  coin() {
    play(250, () => {
      tone({ freq: 988, dur: 0.08, type: 'square', gain: 0.08 });
      tone({ freq: 1319, dur: 0.18, type: 'square', gain: 0.08, delay: 0.07 });
    });
  },
  levelUp() {
    buzz([80, 50, 80, 50, 160]);
    play(900, () => [392, 494, 587, 784, 988].forEach((n, i) => tone({ freq: n, dur: 0.18, type: 'square', gain: 0.1, delay: i * 0.09 })));
  },
};
