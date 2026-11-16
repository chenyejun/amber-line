// Every sound is synthesised with WebAudio: no audio files, no network. The context is
// created on the first user gesture (pointer lock), so a page load stays silent; in the
// deterministic ?shot= captures the mixer is never started at all.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, filterType, freq, gain, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // weapon: 0 pistol, 1 smg, 2 rifle, 3 dmr. Louder crack up close, duller at distance.
  function shot(weapon, distance = 0) {
    if (!ensure()) return;
    const att = Math.max(0.25, 1 - distance / 90);
    const crack = [0.09, 0.07, 0.11, 0.16][weapon] ?? 0.1;
    const low = [900, 1400, 1100, 700][weapon] ?? 1000;
    noise(crack, 'lowpass', low, 0.9 * att);
    noise(0.05, 'highpass', 3200, 0.5 * att);
    tone([190, 220, 160, 120][weapon] ?? 180, 0.09, 'sine', 0.55 * att, 55);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') void ctx.resume(); },
    shot,
    dryClick() { if (!ensure()) return; tone(1400, 0.03, 'square', 0.12); },
    reload() {
      if (!ensure()) return;
      tone(900, 0.03, 'square', 0.1);
      tone(650, 0.03, 'square', 0.1, 0, 0.16);
      tone(1100, 0.04, 'square', 0.12, 0, 0.5);
    },
    step(run) {
      if (!ensure()) return;
      noise(0.05, 'bandpass', run ? 500 : 300, run ? 0.16 : 0.08);
    },
    hit(kill) {
      if (!ensure()) return;
      tone(kill ? 1320 : 1050, 0.06, 'sine', 0.25);
      if (kill) tone(1760, 0.1, 'sine', 0.2, 0, 0.05);
    },
    hurt() { if (!ensure()) return; tone(140, 0.16, 'sawtooth', 0.25, 70); noise(0.12, 'lowpass', 500, 0.2); },
    explosion() {
      if (!ensure()) return;
      noise(0.9, 'lowpass', 420, 1.0);
      tone(70, 0.7, 'sine', 0.8, 30);
      noise(0.25, 'highpass', 2000, 0.3);
    },
    grenadePin() { if (!ensure()) return; tone(1800, 0.03, 'square', 0.12); },
    plantBeep(done) {
      if (!ensure()) return;
      tone(done ? 1560 : 980, done ? 0.25 : 0.07, 'sine', 0.22);
    },
    buy() { if (!ensure()) return; tone(880, 0.07, 'sine', 0.2); tone(1320, 0.09, 'sine', 0.2, 0, 0.07); },
    deny() { if (!ensure()) return; tone(220, 0.12, 'square', 0.15, 160); },
    roundWin() {
      if (!ensure()) return;
      [523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, 0, i * 0.11));
    },
    roundLose() {
      if (!ensure()) return;
      [392, 330, 262].forEach((f, i) => tone(f, 0.26, 'triangle', 0.22, 0, i * 0.13));
    },
  };
}
