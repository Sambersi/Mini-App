let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function isSoundEnabled() { return localStorage.getItem('fbot_sound_enabled') !== '0'; }
export function setSoundEnabled(v) { localStorage.setItem('fbot_sound_enabled', v ? '1' : '0'); }
export function getSoundType() { return localStorage.getItem('fbot_sound_type') || 'classic'; }
export function setSoundType(t) { localStorage.setItem('fbot_sound_type', t); }

function tone(freq, start, dur, type, gain) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

export function playTick() {
  if (!isSoundEnabled()) return;
  if (getSoundType() === 'soft') tone(520, 0, 0.08, 'sine', 0.08);
  else tone(880, 0, 0.06, 'square', 0.06);
}

export function playWin() {
  if (!isSoundEnabled()) return;
  if (getSoundType() === 'soft') {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.25, 'sine', 0.1));
  } else {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.18, 'square', 0.07));
  }
}