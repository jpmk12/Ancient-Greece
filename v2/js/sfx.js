// ============================================================================
//  Aegis of Athens v2 — tiny WebAudio SFX. Synthesised tones, no assets.
//  Must be initialised from a user gesture (browsers block autoplay audio).
// ============================================================================

let ac = null;
const last = {};

export function initAudio() {
  if (ac) return;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { ac = null; }
}

const VOICES = {
  coin:   { freq: 880, dur: 0.08, type: 'square',   gain: 0.06 },
  hit:    { freq: 150, dur: 0.12, type: 'sawtooth', gain: 0.08 },
  horn:   { freq: 196, dur: 0.55, type: 'sawtooth', gain: 0.09 },
  gather: { freq: 520, dur: 0.05, type: 'triangle', gain: 0.05 },
};

export function play(name) {
  if (!ac) return;
  const v = VOICES[name];
  if (!v) return;
  const now = ac.currentTime;
  if (last[name] && now - last[name] < 0.06) return; // throttle repeats
  last[name] = now;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = v.type;
  o.frequency.setValueAtTime(v.freq, now);
  if (name === 'horn') o.frequency.exponentialRampToValueAtTime(v.freq * 0.7, now + v.dur);
  g.gain.setValueAtTime(v.gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + v.dur);
  o.start(now); o.stop(now + v.dur);
}
