// Procedural sound: rain and wind beds, fire crackle, inharmonic steel clangs, shield thuds,
// footsteps and blade whooshes, all through a stone-courtyard convolution reverb.
// Starts only after the viewer switches sound on.

export function createAudio() {
  let ctx = null;
  let master;
  let verbIn;
  let noise;
  let whooshes = [];
  let crackleAcc = 0;
  let enabled = false;

  function makeNoise() {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function makeIR(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.4) * (i < ctx.sampleRate * 0.012 ? 0.2 : 1);
      }
    }
    return ir;
  }

  function src(loop = true) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  function out(pan, wet = 0.35) {
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(master);
    const send = ctx.createGain();
    send.gain.value = wet;
    p.connect(send);
    send.connect(verbIn);
    return g;
  }

  function bed(type, freq, q, gain) {
    const s = src();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(f).connect(g).connect(master);
    s.start();
    return { f, g };
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const verb = ctx.createConvolver();
    verb.buffer = makeIR(2.8);
    verbIn = ctx.createGain();
    verbIn.connect(verb).connect(master);
    noise = makeNoise();
    bed('bandpass', 2600, 0.45, 0.16);
    bed('lowpass', 480, 0.7, 0.1);
    const wind = bed('lowpass', 380, 1.2, 0.08);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(wind.g.gain);
    lfo.start();
    whooshes = [0, 1].map(() => {
      const s = src();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(master);
      s.start();
      return { f, g };
    });
  }

  // Struck steel: inharmonic partials of a free bar plus a bright transient.
  function clang(power, pitch = 1, pan = 0, slow = 1) {
    const t = ctx.currentTime;
    const o = out(pan, 0.45);
    o.gain.value = 0.32 * Math.min(1.6, power);
    const f0 = (560 + Math.random() * 160) * pitch * (0.55 + 0.45 * slow);
    [1, 2.76, 5.4, 8.93, 13.34, 18.64].forEach((ratio, k) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.012);
      const amp = 0.5 / (1 + k * 0.7);
      const decay = (1.6 / (1 + k * 0.9)) * (0.7 + power * 0.4) / (0.35 + 0.65 * slow);
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(1e-4, t + decay);
      osc.connect(g).connect(o);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });
    const n = src(false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4800 * pitch;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9 * power, t);
    ng.gain.exponentialRampToValueAtTime(1e-4, t + 0.05 / slow);
    n.connect(bp).connect(ng).connect(o);
    n.start(t);
    n.stop(t + 0.1 / slow);
  }

  function thump(power, freq, pan, dur = 0.3) {
    const t = ctx.currentTime;
    const o = out(pan, 0.3);
    o.gain.value = 0.7 * power;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(g).connect(o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    const n = src(false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(1e-4, t + dur * 0.6);
    n.connect(lp).connect(ng).connect(o);
    n.start(t);
    n.stop(t + dur);
  }

  function burst(freq, q, gain, dur, pan, type = 'bandpass') {
    const t = ctx.currentTime;
    const o = out(pan, 0.2);
    o.gain.value = gain;
    const n = src(false);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    n.connect(f).connect(g).connect(o);
    n.start(t);
    n.stop(t + dur + 0.02);
  }

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      if (!ctx) init();
      enabled = !enabled;
      if (enabled) ctx.resume();
      else ctx.suspend();
      return enabled;
    },
    play(kind, power = 1, pan = 0, timeScale = 1) {
      if (!enabled || !ctx) return;
      const slow = Math.max(0.12, timeScale);
      if (kind === 'clash') clang(power, 1, pan, slow);
      else if (kind === 'helm') {
        clang(power, 0.62, pan, slow);
        thump(power * 0.8, 70, pan, 0.6 / slow);
      } else if (kind === 'shield') {
        thump(power, 120, pan, 0.28);
        clang(power * 0.35, 0.8, pan, slow);
      } else if (kind === 'tap') clang(power * 0.6, 1.25, pan, 1);
      else if (kind === 'bash') thump(power * 1.2, 95, pan, 0.4);
      else if (kind === 'scrape') burst(3800 + Math.random() * 1500, 3, 0.18 * power, 0.12, pan);
      else if (kind === 'step') {
        burst(1100, 0.9, 0.12 * power, 0.08, pan);
        burst(5200, 2, 0.03 * power, 0.06, pan, 'highpass');
      } else if (kind === 'clatter') {
        clang(0.45, 1.5, pan, 1);
        setTimeout(() => enabled && clang(0.25, 1.7, pan, 1), 140);
      } else if (kind === 'thunder') {
        const t = ctx.currentTime;
        const o = out(0, 0.6);
        const n = src(false);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 170;
        o.gain.setValueAtTime(0.0001, t);
        o.gain.exponentialRampToValueAtTime(1.2 * power, t + 0.35);
        o.gain.exponentialRampToValueAtTime(1e-4, t + 4.2);
        n.connect(lp).connect(o);
        n.start(t);
        n.stop(t + 4.3);
      } else if (kind === 'boom') thump(power, 55, 0, 1.6);
    },
    // Per-frame: blade whooshes follow tip speed; fire crackle is scattered randomly.
    update(dtReal, tipSpeeds, pans) {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      tipSpeeds.forEach((s, i) => {
        const w = whooshes[i];
        const k = Math.max(0, Math.min(1, (s - 4) / 14));
        w.g.gain.setTargetAtTime(k * k * 0.5, t, 0.03);
        w.f.frequency.setTargetAtTime(350 + s * 55, t, 0.03);
      });
      crackleAcc += dtReal * 9;
      while (crackleAcc > 1) {
        crackleAcc -= Math.random() * 2;
        burst(2200 + Math.random() * 3000, 1.5, 0.02 + Math.random() * 0.05, 0.012 + Math.random() * 0.025, pans[Math.floor(Math.random() * pans.length)] || 0, 'highpass');
      }
    },
  };
}
