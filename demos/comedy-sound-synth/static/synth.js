/* RageRun Comedy Sound Synth - sound engine (JavaScript port of the C# ComedySynth / SynthDsp / ComedyPresets).
 *
 * Same maths, same seeds -> the same sound as the Unity asset. Float maths is mirrored with Math.fround
 * where the C# code works in 32-bit floats, and the random generator and WAV dither are bit-exact.
 * dev\portcheck renders all presets in C# and JS and compares them.
 *
 * Works in the page (window.ComedySynth) and in Node (require("./synth.js")).
 */
(function (root) {
  "use strict";
  const F = Math.fround;
  const RATE = 44100;
  const TWO_PI = Math.PI * 2.0;

  // ------------------------------------------------------------------ helpers (SynthDsp)
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const lerp = (a, b, t) => { a = F(a); b = F(b); return F(a + F(F(b - a) * clamp01(t))); };
  const expLerp = (a, b, t) => { a = F(a); b = F(b); return F(a * Math.pow(F(b / a), clamp01(t))); };
  const smooth = (t) => { t = clamp01(t); return F(F(t * t) * F(3 - F(2 * t))); };
  const samples = (sec) => Math.max(1, Math.trunc(F(sec * RATE)));
  /** C# Math.Round: halves go to the even number. */
  function roundEven(x) {
    const fl = Math.floor(x), d = x - fl;
    if (d > 0.5) return fl + 1;
    if (d < 0.5) return fl;
    return fl % 2 === 0 ? fl : fl + 1;
  }

  function saw(phase, harmonics, hz) {
    harmonics = Math.max(1, Math.min(harmonics, Math.trunc(RATE * 0.42 / Math.max(1.0, hz))));
    let s = 0;
    for (let k = 1; k <= harmonics; k++) s += Math.sin(phase * k) / k;
    return F(s * 0.55);
  }

  /** Small deterministic random generator (xorshift32), bit-exact with the C# SynthRandom. */
  class SynthRandom {
    constructor(seed) {
      this.s = (Math.imul(seed | 0, 2654435761 | 0) + 0x9E3779B9) >>> 0;
      if (this.s === 0) this.s = 1;
    }
    value() {
      let s = this.s;
      s = (s ^ (s << 13)) >>> 0;
      s = (s ^ (s >>> 17)) >>> 0;
      s = (s ^ (s << 5)) >>> 0;
      this.s = s;
      return (s & 0xFFFFFF) / 16777216;
    }
    signed() { return F(F(this.value() * 2) - 1); }
    range(min, max) { min = F(min); max = F(max); return F(min + F(F(max - min) * this.value())); }
  }

  /** Biquad filter (RBJ cookbook), doubles like the C# version. */
  class Biquad {
    constructor() { this.b0 = this.b1 = this.b2 = this.a1 = this.a2 = this.z1 = this.z2 = 0; }
    static lowPass(hz, q = 0.707) { const f = new Biquad(); f.setLowPass(hz, q); return f; }
    static highPass(hz, q = 0.707) { const f = new Biquad(); f.setHighPass(hz, q); return f; }
    static bandPass(hz, q = 1.0) { const f = new Biquad(); f.setBandPass(hz, q); return f; }
    _pre(hz, q) {
      hz = Math.max(10.0, Math.min(hz, RATE * 0.45));
      const w = 2.0 * Math.PI * hz / RATE;
      return [Math.cos(w), Math.sin(w) / (2.0 * Math.max(0.05, q))];
    }
    setLowPass(hz, q = 0.707) {
      const [cw, al] = this._pre(hz, q), a0 = 1 + al;
      this.b0 = (1 - cw) / 2 / a0; this.b1 = (1 - cw) / a0; this.b2 = this.b0;
      this.a1 = -2 * cw / a0; this.a2 = (1 - al) / a0;
    }
    setHighPass(hz, q = 0.707) {
      const [cw, al] = this._pre(hz, q), a0 = 1 + al;
      this.b0 = (1 + cw) / 2 / a0; this.b1 = -(1 + cw) / a0; this.b2 = this.b0;
      this.a1 = -2 * cw / a0; this.a2 = (1 - al) / a0;
    }
    setBandPass(hz, q = 1.0) {
      const [cw, al] = this._pre(hz, q), a0 = 1 + al;
      this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0;
      this.a1 = -2 * cw / a0; this.a2 = (1 - al) / a0;
    }
    process(x) {
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      if (!isFinite(y)) { this.z1 = this.z2 = 0; return 0; }
      return F(y);
    }
  }

  function addThump(buf, start, fromHz, toHz, sweepTime, decay, amp) {
    fromHz = F(fromHz); toHz = F(toHz); sweepTime = F(sweepTime); decay = F(decay); amp = F(amp);
    let phase = 0;
    const n = Math.min(buf.length - start, samples(F(decay * 7)));
    const sw = Math.max(F(0.001), sweepTime), dHz = F(fromHz - toHz), ramp = F(RATE * F(0.0015));
    for (let i = 0; i < n; i++) {
      if (start + i < 0) continue;
      const t = F(i / RATE);
      const f = toHz + dHz * Math.exp(F(-t / sw));
      phase += TWO_PI * f / RATE;
      const env = F(F(Math.exp(F(-t / decay))) * Math.min(1, F(i / ramp)));
      buf[start + i] += F(F(F(Math.sin(phase)) * env) * amp);
    }
  }

  function addNoiseBurst(buf, start, rng, attack, decay, amp, filter) {
    attack = F(attack); decay = F(decay); amp = F(amp);
    const n = Math.min(buf.length - start, samples(F(attack + F(decay * 7))));
    const am = Math.max(F(1e-4), attack);
    for (let i = 0; i < n; i++) {
      if (start + i < 0) continue;
      const t = F(i / RATE);
      const env = t < attack ? F(t / am) : F(Math.exp(F(F(-F(t - attack)) / decay)));
      buf[start + i] += F(F(filter.process(rng.signed()) * env) * amp);
    }
  }

  function addBubble(buf, start, hz, decay, rise, amp) {
    hz = F(hz); decay = F(decay); rise = F(rise); amp = F(amp);
    let phase = 0;
    const n = Math.min(buf.length - start, samples(F(decay * 7)));
    const ramp = F(RATE * F(0.0008));
    for (let i = 0; i < n; i++) {
      if (start + i < 0) continue;
      const t = F(i / RATE);
      const e = Math.exp(F(-t / decay));
      const f = Math.min(RATE * 0.4, hz * (1.0 + rise * (1.0 - e)));
      phase += TWO_PI * f / RATE;
      const env = F(F(e) * Math.min(1, F(i / ramp)));
      buf[start + i] += F(F(F(Math.sin(phase)) * env) * amp);
    }
  }

  function removeDc(buf) {
    let x1 = 0, y1 = 0;
    const r = F(0.9972);
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const y = F(F(x - x1) + F(r * y1));
      x1 = x; y1 = y; buf[i] = y;
    }
  }

  function fades(buf, fadeIn, fadeOut) {
    const fi = Math.min(buf.length >> 1, samples(F(fadeIn)));
    const fo = Math.min(buf.length >> 1, samples(F(fadeOut)));
    for (let i = 0; i < fi; i++) buf[i] = F(buf[i] * F(i / fi));
    for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] = F(buf[buf.length - 1 - i] * F(i / fo));
  }

  function peak(buf) {
    let p = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
    return p;
  }

  function normalize(buf, pk) {
    const p = peak(buf);
    if (p < F(1e-6)) return;
    const g = F(F(pk) / p);
    for (let i = 0; i < buf.length; i++) buf[i] = F(buf[i] * g);
  }

  function trimTail(buf, threshold, keepSeconds) {
    const p = peak(buf);
    if (p <= 0) return buf;
    const th = F(p * F(threshold));
    let last = buf.length - 1;
    while (last > 0 && Math.abs(buf[last]) < th) last--;
    const len = Math.min(buf.length, last + 1 + samples(F(keepSeconds)));
    if (len >= buf.length) return buf;
    return buf.slice(0, len);
  }

  // ------------------------------------------------------------------ the sound types (ComedySynth)
  const jit = (s, r, amount) => F(F(r.signed() * F(amount)) * s.randomness);
  const one = (x) => F(1 + x);

  function boing(s, r) {
    const f0 = F(expLerp(70, 520, s.pitch) * one(jit(s, r, 0.15)));
    const dur = F(lerp(0.25, 1.4, s.length) * one(jit(s, r, 0.15)));
    const vibDepth = F(lerp(0.03, 0.38, s.bounce) * one(jit(s, r, 0.3)));
    const vibRate = lerp(7, 16, F(F(F(s.bounce * F(0.6)) + F(F(r.value() * F(0.4)) * s.randomness)) + F(0.2)));
    const vibFade = F(dur * lerp(0.35, 0.9, s.bounce));
    const glide = F(lerp(0.0, 0.6, s.squishiness) + jit(s, r, 0.15));
    const drive = lerp(1.0, 4.5, s.squishiness);
    const lp = Biquad.lowPass(expLerp(700, 9000, s.brightness), 1.1);
    const n = samples(dur);
    const buf = new Float32Array(n);
    let ph = 0, ph2 = 0;
    const envT = F(dur * F(0.33)), twDecay = lerp(3, 9, F(1 - s.brightness));
    const bodyMix = lerp(1, 0.6, s.brightness), twMix = lerp(0, 1.1, s.brightness), tanhD = F(Math.tanh(drive));
    for (let i = 0; i < n; i++) {
      const t = F(i / RATE);
      const vib = F(F(vibDepth * F(Math.exp(F(-t / vibFade)))) * F(Math.sin(TWO_PI * vibRate * t)));
      const f = f0 * (1.0 + glide * Math.exp(-t * 18.0)) * (1.0 + vib);
      ph += TWO_PI * f / RATE;
      ph2 += TWO_PI * f * 2.003 / RATE;
      const env = F(Math.min(1, F(t / F(0.004))) * F(Math.exp(F(-t / envT))));
      const tone = F(F(Math.sin(ph)) + F(F(F(0.35) * F(Math.sin(ph2))) * F(Math.exp(-t * 6.0))));
      let x = F(F(Math.tanh(F(tone * drive))) / tanhD);
      const twang = F(saw(ph, 14, f) * F(Math.exp(F(-t * twDecay))));
      x = F(F(x * bodyMix) + F(twang * twMix));
      buf[i] = F(lp.process(x) * env);
    }
    addNoiseBurst(buf, 0, r, 0.0005, 0.006, F(F(F(0.25) * s.brightness) + F(0.05)), Biquad.bandPass(F(f0 * 6), 1.5));
    return buf;
  }

  function thud(s, r) {
    const f0 = F(expLerp(55, 260, s.pitch) * one(jit(s, r, 0.15)));
    const decay = F(lerp(0.03, 0.13, s.length) * lerp(0.85, 1.4, s.squishiness));
    const rebounds = roundEven(F(s.bounce * 4));
    const gap = lerp(0.12, 0.28, s.length);
    const total = F(F(F(decay * 7) + (rebounds > 0 ? F(gap * F(2.2)) : 0)) + F(0.05));
    const buf = new Float32Array(samples(total));
    let amp = 1, t0 = 0, g = gap;
    for (let k = 0; k <= rebounds; k++) {
      const st = samples(t0);
      const sweep = lerp(0.012, 0.04, s.squishiness);
      addThump(buf, st, F(f0 * lerp(3.2, 1.8, s.squishiness)), f0, sweep, decay, amp);
      const knockHz = expLerp(500, 6000, s.brightness);
      const attack = lerp(0.0005, 0.006, s.squishiness);
      addNoiseBurst(buf, st, r, attack, lerp(0.008, 0.035, s.squishiness),
        F(amp * lerp(0.25, 0.6, s.brightness)), Biquad.lowPass(knockHz, 0.9));
      addThump(buf, st, F(f0 * F(3.5)), F(f0 * F(2.4)), 0.008, F(decay * F(0.45)), F(amp * F(0.35)));
      if (s.brightness > F(0.4))
        addThump(buf, st, F(f0 * F(4.2)), F(f0 * F(3.6)), 0.01, F(decay * F(0.35)), F(F(amp * F(s.brightness - F(0.4))) * F(0.5)));
      t0 = F(t0 + F(g * one(jit(s, r, 0.25))));
      g = F(g * F(0.62));
      amp = F(amp * lerp(0.35, 0.62, s.bounce));
    }
    return buf;
  }

  function whoosh(s, r) {
    const dur = F(lerp(0.18, 1.5, s.length) * one(jit(s, r, 0.15)));
    const centre = F(expLerp(250, 2600, s.pitch) * one(jit(s, r, 0.2)));
    const sweep = lerp(1.4, 2.6, s.brightness);
    const q = lerp(4.5, 0.6, s.squishiness);
    const peakAt = F(lerp(0.55, 0.35, s.bounce) + jit(s, r, 0.1));
    const tremRate = lerp(0, 14, s.bounce);
    const tremDepth = s.bounce < F(0.15) ? 0 : lerp(0, 0.85, F(F(s.bounce - F(0.15)) / F(0.85)));
    const n = samples(dur);
    const buf = new Float32Array(n);
    const bp = new Biquad(), bp2 = new Biquad(), hp = Biquad.highPass(120);
    const drift = jit(s, r, 0.3);
    const mix2 = lerp(0.05, 0.6, s.brightness), tail = F(1 - peakAt);
    for (let i = 0; i < n; i++) {
      const u = F(i / n);
      if ((i & 31) === 0) {
        const shape = F(Math.exp(-Math.pow(F(u - peakAt) / 0.32, 2)));
        const f = centre * Math.pow(sweep, shape - 0.5 + drift * (u - 0.5));
        bp.setBandPass(f, q);
        bp2.setBandPass(f * 2.1, q * 0.7);
      }
      const env = u < peakAt ? F(Math.pow(F(u / peakAt), 1.8)) : F(Math.pow(F(1 - F(F(u - peakAt) / tail)), 1.4));
      const trem = F(1 - F(tremDepth * F(F(0.5) + F(F(0.5) * F(Math.cos(TWO_PI * tremRate * u * dur))))));
      const x = r.signed();
      const y = F(bp.process(x) + F(bp2.process(x) * mix2));
      buf[i] = F(F(hp.process(y) * env) * trem);
    }
    return buf;
  }

  function squeak(s, r) {
    const count = 1 + roundEven(F(s.bounce * 3));
    const each = F(lerp(0.07, 0.45, s.length) / F(1 + F((count - 1) * F(0.35))));
    const gap = F(each * F(0.35));
    const f0 = expLerp(450, 2600, s.pitch);
    const total = F(F(count * F(each + gap)) + F(0.05));
    const buf = new Float32Array(samples(total));
    const lp = Biquad.lowPass(expLerp(2500, 12000, s.brightness), 0.9);
    const harm = 2 + Math.trunc(F(s.brightness * 8));
    const rasp = lerp(0, 0.9, s.squishiness);
    const sawMix = lerp(0.1, 1.1, s.brightness), sinMix = lerp(0.9, 0.25, s.brightness), raspHalf = F(rasp * F(0.5));
    let t0 = 0;
    for (let k = 0; k < count; k++) {
      const d = F(each * one(jit(s, r, 0.3)));
      const fk = F(F(f0 * one(jit(s, r, 0.12))) * (k % 2 === 1 ? F(0.9) : 1));
      const arch = F(lerp(0.15, 0.55, s.squishiness) + jit(s, r, 0.15));
      const st = samples(t0), n = samples(d);
      let ph = 0, roughPh = 0;
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const u = F(i / n), t = F(i / RATE);
        let f = fk * (1.0 + arch * Math.sin(Math.PI * Math.min(1.0, u * 1.15)) - 0.15 * u);
        f *= 1.0 + 0.012 * Math.sin(TWO_PI * 32 * t);
        ph += TWO_PI * f / RATE;
        roughPh = F(roughPh + F(TWO_PI * (70 + 40 * r.value()) / RATE));
        const am = F(1 - F(raspHalf * F(1 + F(Math.sin(roughPh)))));
        const env = F(F(Math.sin(Math.PI * Math.pow(u, 0.6))) * am);
        let tone = F(F(saw(ph, harm, f) * sawMix) + F(F(Math.sin(ph)) * sinMix));
        tone = F(tone + F(F(r.signed() * F(0.06)) * rasp));
        buf[st + i] += F(lp.process(tone) * env);
      }
      t0 = F(t0 + F(d + F(gap * one(jit(s, r, 0.4)))));
    }
    return buf;
  }

  function yelp(s, r) {
    const syll = 1 + roundEven(F(s.bounce * 2));
    const dur = F(lerp(0.14, 0.9, s.length) * one(jit(s, r, 0.15)));
    const f0 = F(expLerp(130, 720, s.pitch) * one(jit(s, r, 0.12)));
    const b = s.brightness;
    const voice = lerp(0.85, 1.35, s.pitch);
    const f1 = F(lerp(340, 720, b) * voice);
    const f2 = F(expLerp(850, 2000, b) * voice);
    const f3 = F(2700 * voice);
    const fa = new Biquad(), fb = new Biquad(), fc = Biquad.bandPass(f3, 6);
    const air = Biquad.bandPass(F(f2 * F(1.4)), 1.2);
    const wobble = lerp(0, 0.09, s.squishiness);
    const breath = lerp(0.02, 0.25, s.squishiness);
    const n = samples(dur);
    const buf = new Float32Array(n);
    let ph = 0;
    const flick = F(F(0.45) + jit(s, r, 0.2));
    const fcMix = lerp(0.1, 0.7, b);
    for (let i = 0; i < n; i++) {
      const u = F(i / n), t = F(i / RATE);
      const su = F(F(u * syll) % 1);
      const contour = su < F(0.18) ? smooth(F(su / F(0.18))) : F(1 - F(smooth(F(F(su - F(0.18)) / F(0.82))) * F(0.75)));
      const f = f0 * (0.75 + F(flick * contour)) * (1.0 + wobble * Math.sin(TWO_PI * 7.5 * t));
      ph += TWO_PI * f / RATE;
      if ((i & 31) === 0) {
        const open = F(F(0.85) + F(F(0.3) * contour));
        fa.setBandPass(F(f1 * open), 5);
        fb.setBandPass(F(f2 * open), 7);
      }
      const src = F(saw(ph, 24, f) + F(r.signed() * breath));
      const a1 = F(fa.process(src) * F(1.6)), a2 = F(fb.process(src) * F(1.1)), a3 = F(fc.process(src) * fcMix);
      const v = F(F(F(a1 + a2) + a3) + F(air.process(r.signed()) * breath));
      const sylEnv = F(Math.sin(Math.PI * Math.min(1, F(su * F(1.05)))));
      const env = F(F(Math.min(1, F(t / F(0.012))) * F(1 - smooth(F(F(u - F(0.8)) / F(0.2))))) *
        (syll > 1 ? F(F(0.35) + F(F(0.65) * sylEnv)) : 1));
      buf[i] = F(v * env);
    }
    return buf;
  }

  function pop(s, r) {
    const count = 1 + roundEven(F(s.bounce * 4));
    const decay = lerp(0.006, 0.05, s.length);
    const spread = lerp(0.05, 0.18, s.length);
    const f0 = expLerp(250, 2200, s.pitch);
    const rise = lerp(0.1, 1.6, s.squishiness);
    const total = F(F(F(count * spread) + F(decay * 8)) + F(0.04));
    const buf = new Float32Array(samples(total));
    let t0 = 0;
    for (let k = 0; k < count; k++) {
      const amp = k === 0 ? 1 : lerp(0.4, 0.85, r.value());
      const fa = F(f0 * one(jit(s, r, 0.25)));
      const f = F(fa * (k === 0 ? 1 : lerp(0.8, 1.35, r.value())));
      const st = samples(t0);
      addBubble(buf, st, f, F(decay * one(jit(s, r, 0.3))), rise, amp);
      addNoiseBurst(buf, st, r, 0.0002, lerp(0.0008, 0.004, s.brightness),
        F(amp * lerp(0.05, 1.2, s.brightness)), Biquad.highPass(expLerp(800, 4000, s.brightness)));
      t0 = F(t0 + F(spread * lerp(0.5, 1.3, r.value())));
    }
    return buf;
  }

  function splat(s, r) {
    const f0 = F(expLerp(60, 240, s.pitch) * one(jit(s, r, 0.15)));
    const body = lerp(0.06, 0.3, s.length);
    const drips = roundEven(F(s.bounce * 4));
    const total = F(F(F(body * 5) + F(0.1)) + (drips > 0 ? F(lerp(0.25, 0.7, s.length) + F(0.15)) : 0));
    const buf = new Float32Array(samples(total));
    addThump(buf, 0, F(f0 * F(2.2)), f0, 0.02, F(body * F(0.5)), 0.8);
    const wet = new Biquad();
    const n = Math.min(buf.length, samples(F(body * F(2.5))));
    const open = expLerp(900, 6500, s.brightness);
    const bodyD = body * 0.6, envT = F(body * F(0.45));
    for (let i = 0; i < n; i++) {
      const t = F(i / RATE);
      if ((i & 15) === 0) wet.setLowPass(Math.max(250.0, open * Math.exp(-t / bodyD)), 2.2);
      const env = F(Math.min(1, F(t / F(0.002))) * F(Math.exp(F(-t / envT))));
      buf[i] += F(F(wet.process(r.signed()) * env) * F(1.1));
    }
    const bubbles = 3 + Math.trunc(F(s.squishiness * 28));
    for (let k = 0; k < bubbles; k++) {
      const at = F(F(F(Math.pow(r.value(), 1.6)) * body) * F(2.2));
      const hz = expLerp(250, 1600, F(F(s.pitch * F(0.6)) + F(r.value() * F(0.4))));
      const st = samples(at);
      const dec = F(r.range(0.006, 0.02) * lerp(1, 2, s.squishiness));
      const rise = lerp(0.3, 1.4, s.squishiness);
      const amp = F(r.range(0.15, 0.45) * lerp(0.4, 1, s.squishiness));
      addBubble(buf, st, hz, dec, rise, amp);
    }
    let dt = F(body * F(1.8));
    for (let k = 0; k < drips; k++) {
      dt = F(dt + F(lerp(0.08, 0.22, s.length) * r.range(0.6, 1.4)));
      addBubble(buf, samples(dt), F(r.range(900, 1800) * lerp(0.8, 1.2, s.pitch)), 0.012, 0.9, 0.35);
    }
    return buf;
  }

  function slideWhistle(s, r) {
    const dur = F(lerp(0.25, 1.6, s.length) * one(jit(s, r, 0.1)));
    const centre = expLerp(380, 1500, s.pitch);
    const d = F(F(s.squishiness * 2) - 1);
    const span = F(F(0.85) + jit(s, r, 0.2));
    const vibDepth = lerp(0, 0.07, s.bounce);
    const vibRate = lerp(5, 9, s.bounce);
    const breath = lerp(0.02, 0.3, s.brightness);
    const air = Biquad.bandPass(F(centre * F(1.5)), 1.2);
    const n = samples(dur);
    const buf = new Float32Array(n);
    let ph = 0;
    const toneMix = F(1 - F(breath * F(0.6)));
    for (let i = 0; i < n; i++) {
      const u = F(i / n), t = F(i / RATE);
      const c = d * (2.0 * u - 1.0) + (1.0 - Math.abs(d)) * (2.0 * Math.sin(Math.PI * u) - 1.0);
      const f = centre * Math.pow(2.0, span * c) * (1.0 + vibDepth * Math.sin(TWO_PI * vibRate * t));
      ph += TWO_PI * f / RATE;
      const tone = F(F(Math.sin(ph)) + F(F(F(0.12) * F(Math.sin(ph * 2.0))) * s.brightness));
      const env = F(Math.min(1, F(t / F(0.02))) * Math.min(1, F(F(F(1 - u) * dur) / F(0.06))));
      buf[i] = F(F(F(tone * toneMix) + F(F(air.process(r.signed()) * breath) * F(1.5))) * env);
    }
    return buf;
  }

  function punch(s, r) {
    const f0 = F(expLerp(70, 230, s.pitch) * one(jit(s, r, 0.12)));
    const decay = lerp(0.04, 0.16, s.length);
    const hits = 1 + roundEven(F(s.bounce * 2));
    const ring = F(Math.max(0, F(F(s.brightness - F(0.55)) / F(0.45))) * F(1 - s.squishiness));
    const ringDecay = lerp(0.15, 0.8, s.length);
    const total = F(F(F(F(decay * 7) + F(hits * F(0.12))) + F(F(ring * ringDecay) * 5)) + F(0.05));
    const buf = new Float32Array(samples(total));
    const ratios = [1, 2.76, 5.4, 8.93].map(F), gains = [1, 0.6, 0.35, 0.2].map(F);
    let t0 = 0;
    for (let k = 0; k < hits; k++) {
      const st = samples(t0);
      const amp = k === hits - 1 ? 1 : F(0.75);
      addThump(buf, st, F(f0 * 3), f0, 0.015, decay, amp);
      const snapHz = expLerp(5500, 900, s.squishiness);
      addNoiseBurst(buf, st, r, lerp(0.0003, 0.004, s.squishiness), lerp(0.008, 0.03, s.squishiness),
        F(amp * lerp(0.5, 1.3, s.brightness)), s.squishiness > F(0.5) ? Biquad.lowPass(snapHz, 0.8) : Biquad.bandPass(snapHz, 0.9));
      if (ring > F(0.01)) {
        const rf = F(expLerp(280, 900, s.pitch) * one(jit(s, r, 0.05)));
        for (let p = 0; p < ratios.length; p++)
          addThump(buf, st, F(F(rf * ratios[p]) * F(1.01)), F(rf * ratios[p]), 0.005,
            F(ringDecay / F(1 + F(p * F(0.6)))), F(F(F(amp * ring) * gains[p]) * F(0.7)));
      }
      t0 = F(t0 + lerp(0.07, 0.12, r.value()));
    }
    return buf;
  }

  function jingle(s, r) {
    const notes = 1 + roundEven(F(s.bounce * 5));
    const noteLen = lerp(0.05, 0.28, s.length);
    const sad = s.squishiness > F(0.6);
    const root = F(48 + F(s.pitch * 40));
    const happy = [0, 4, 7, 12, 16, 19, 24];
    const sadSteps = [0, -1, -2, -3, -4, -5, -6];
    const total = F(F(F(noteLen * (notes - 1)) + F(noteLen * (sad ? 5 : F(3.5)))) + F(0.1));
    const buf = new Float32Array(samples(total));
    const square = s.brightness;
    for (let k = 0; k < notes; k++) {
      const last = k === notes - 1;
      const midi = sad ? F(F(root - 3) + sadSteps[k]) : F(root + happy[k]);
      const hz = 440.0 * Math.pow(2.0, (midi - 69.0) / 12.0) * (1.0 + jit(s, r, 0.004));
      const len = last ? F(noteLen * (sad ? F(4.5) : 3)) : noteLen;
      const st = samples(F(k * noteLen));
      const n = Math.min(buf.length - st, samples(F(len * (square > F(0.5) ? 1 : F(2.5)))));
      let ph = 0;
      const envT = F(len * F(0.45));
      for (let i = 0; i < n; i++) {
        const t = F(i / RATE);
        let f = hz;
        if (sad && last) f *= 1.0 + 0.025 * Math.sin(TWO_PI * 6.0 * t) * Math.min(1.0, t / 0.15);
        ph += TWO_PI * f / RATE;
        const bell = F(Math.sin(ph) + 0.4 * Math.sin(ph * 2.76) * Math.exp(-t * 9) + 0.25 * Math.sin(ph * 5.4) * Math.exp(-t * 18));
        const sq = F(saw(ph, 15, f) - saw(ph + Math.PI * 0.6, 15, f));
        const tone = F(F(bell * F(1 - square)) + F(F(sq * square) * F(0.9)));
        let env = square > F(0.5)
          ? F(F(Math.min(1, F(t / F(0.003))) * Math.min(1, F(F(len - t) / F(0.02)))) * F(Math.exp(F(-t * 2))))
          : F(Math.min(1, F(t / F(0.002))) * F(Math.exp(F(-t / envT))));
        if (env < 0) env = 0;
        buf[st + i] += F(F(tone * env) * F(0.6));
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------ new types (Round 3, batch 1). Not in the Unity
  // asset, so these use plain double maths; still fully deterministic (same settings + seed = same sound).
  const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  /** A short plucked note (fast-dying harmonics), added into buf. */
  function addPluck(buf, start, hz, decay, amp, harmonics) {
    const n = Math.min(buf.length - start, samples(decay * 7));
    let ph = 0;
    for (let i = 0; i < n; i++) {
      if (start + i < 0) continue;
      const t = i / RATE;
      ph += TWO_PI * hz / RATE;
      let x = 0;
      for (let h = 1; h <= harmonics && hz * h < RATE * 0.45; h++) x += Math.sin(ph * h) / h * Math.exp(-t * (6 + h * 14));
      buf[start + i] += x * Math.min(1, t / 0.0008) * Math.exp(-t / decay) * amp;
    }
  }

  /** A decaying sine mode via a rotating phasor (no sin/exp per sample): fast for metal with many modes. */
  function addMode(buf, start, hz, decay, amp) {
    const n = Math.min(buf.length - start, samples(decay * 7));
    if (n <= 0 || hz >= RATE * 0.45) return;
    const w = TWO_PI * hz / RATE, g = Math.exp(-1 / (decay * RATE));
    const cr = g * Math.cos(w), ci = g * Math.sin(w), ramp = RATE * 0.0015;
    let re = 1, im = 0;
    for (let i = 0; i < n; i++) {
      if (start + i >= 0) buf[start + i] += im * amp * (i < ramp ? i / ramp : 1);
      const nr = re * cr - im * ci;
      im = re * ci + im * cr;
      re = nr;
    }
  }

  function bonk(s, r) {
    const hits = 1 + Math.round(s.bounce * 3);
    const f0 = expLerp(140, 900, s.pitch) * (1 + jit(s, r, 0.12));
    const decay = lerp(0.025, 0.2, s.length);
    const drop = lerp(1.25, 2.6, s.squishiness);
    const sweep = lerp(0.004, 0.03, s.squishiness);
    let gap = lerp(0.15, 0.26, s.length);
    const buf = new Float32Array(samples(decay * 7 + gap * 2.6 + 0.05));
    let t0 = 0, amp = 1;
    for (let k = 0; k < hits; k++) {
      const st = samples(t0);
      addThump(buf, st, f0 * drop, f0, sweep, decay, amp);
      addThump(buf, st, f0 * 2.7 * Math.sqrt(drop), f0 * 2.7, sweep * 0.6, decay * lerp(0.5, 0.22, s.squishiness),
        amp * lerp(0.45, 0.12, s.squishiness) * (0.4 + 0.6 * s.brightness));
      addNoiseBurst(buf, st, r, 0.0003, lerp(0.002, 0.008, s.squishiness), amp * lerp(0.12, 0.85, s.brightness),
        Biquad.bandPass(Math.min(f0 * 4, 9000), 1.2));
      t0 += gap * (1 + jit(s, r, 0.2));
      gap *= 0.6;
      amp *= 0.45;
    }
    return buf;
  }

  function clang(s, r) {
    const f0 = expLerp(180, 1100, s.pitch) * (1 + jit(s, r, 0.08));
    const ring = lerp(0.2, 2.2, s.length) * lerp(1, 0.22, s.squishiness);
    const hits = 1 + Math.round(s.bounce * 4);
    const ratios = [1, 1.593, 2.135, 2.295, 2.653, 2.917, 3.155, 3.5, 4.06, 4.6];
    const modes = 3 + Math.round(s.brightness * 7);
    let gap = lerp(0.16, 0.3, s.length);
    const total = Math.min(5, ring * 4 + (hits > 1 ? gap * 2.8 : 0) + 0.05);
    const buf = new Float32Array(samples(total));
    const tilt = lerp(0.9, 0.25, s.brightness);
    const freqs = [], gains = [];
    for (let i = 0; i < modes; i++) { freqs.push(f0 * ratios[i] * (1 + r.signed() * 0.004)); gains.push(1 / (1 + i * tilt)); }
    let t0 = 0, amp = 1;
    for (let k = 0; k < hits; k++) {
      const st = samples(t0), last = k === hits - 1;
      for (let i = 0; i < modes; i++) {
        const f = freqs[i], d = ring / (1 + i * 0.35) * (last ? 1 : 0.45);
        addMode(buf, st, f, d, amp * gains[i] * 0.5);
        addMode(buf, st, f * 1.003, d * 0.8, amp * gains[i] * 0.22);
      }
      addNoiseBurst(buf, st, r, 0.0002, 0.004, amp * lerp(0.15, 0.8, s.brightness), Biquad.highPass(2500));
      t0 += gap * (1 + jit(s, r, 0.15));
      gap *= lerp(0.75, 0.55, s.bounce);
      amp *= 0.72;
    }
    return buf;
  }

  function crash(s, r) {
    const size = s.pitch;
    const dur = lerp(0.35, 2.2, s.length) * (1 + jit(s, r, 0.1));
    const n = Math.round(lerp(10, 42, s.length) * (0.7 + 0.6 * s.bounce));
    const buf = new Float32Array(samples(dur + 0.6));
    const fLow = expLerp(70, 300, size);
    addThump(buf, 0, fLow * 2.5, fLow, 0.02, 0.09, 1);
    addNoiseBurst(buf, 0, r, 0.001, lerp(0.045, 0.015, size), 0.9,
      Biquad.lowPass(expLerp(1500, 7000, s.brightness * 0.7 + size * 0.3), 0.7));
    const metal = lerp(0.55, 0.12, s.squishiness);
    for (let k = 0; k < n; k++) {
      const at = dur * Math.pow(r.value(), lerp(2.2, 1.2, s.bounce));
      const amp = lerp(0.15, 0.6, r.value()) * (1 - 0.6 * at / dur);
      const kind = r.value();
      const st = samples(at);
      if (kind < metal) {
        const f = expLerp(300, 2600, size * 0.7 + r.value() * 0.3);
        const d = lerp(0.04, 0.25, r.value()) * lerp(1, 0.3, s.squishiness);
        addMode(buf, st, f, d, amp * 0.4);
        addMode(buf, st, f * 2.74, d * 0.6, amp * (0.05 + 0.25 * s.brightness));
        addMode(buf, st, f * 5.37, d * 0.35, amp * 0.15 * s.brightness);
      } else if (kind < 0.8) {
        const f = expLerp(120, 700, size * 0.6 + r.value() * 0.4);
        addThump(buf, st, f * 1.8, f, 0.006, lerp(0.02, 0.06, r.value()), amp * 0.7);
        addNoiseBurst(buf, st, r, 0.0005, 0.006, amp * 0.4, Biquad.bandPass(f * 3, 1));
      } else {
        addNoiseBurst(buf, st, r, 0.0003, lerp(0.003, 0.02, r.value()), amp * 0.6,
          Biquad.bandPass(expLerp(800, 6000, r.value() * 0.5 + s.brightness * 0.5), 1.5));
      }
    }
    return buf;
  }

  function woodKnock(s, r) {
    const knocks = 1 + Math.round(s.bounce * 4);
    const f0 = expLerp(180, 1400, s.pitch) * (1 + jit(s, r, 0.08));
    const decay = lerp(0.012, 0.09, s.length);
    const gap = lerp(0.12, 0.2, s.length);
    const hard = 1 - s.squishiness;
    const buf = new Float32Array(samples(knocks * gap * 1.3 + decay * 7 + 0.05));
    let t0 = 0;
    for (let k = 0; k < knocks; k++) {
      const st = samples(t0);
      const amp = k === knocks - 1 ? 1 : lerp(0.75, 0.95, r.value());
      const fk = f0 * (1 + jit(s, r, 0.05)) * (k % 2 ? 0.97 : 1);
      addThump(buf, st, fk * lerp(1.15, 1.6, s.squishiness), fk, 0.003, decay, amp);
      addThump(buf, st, fk * 2.57, fk * 2.57, 0.001, decay * 0.45, amp * lerp(0.15, 0.5, hard) * (0.5 + s.brightness * 0.5));
      addThump(buf, st, fk * 4.2, fk * 4.2, 0.001, decay * 0.25, amp * 0.25 * s.brightness * hard);
      addNoiseBurst(buf, st, r, 0.0002, lerp(0.0015, 0.006, s.squishiness), amp * lerp(0.1, 0.7, s.brightness) * lerp(0.4, 1, hard),
        Biquad.bandPass(fk * 1.8, 1.4));
      t0 += gap * (1 + jit(s, r, 0.15));
    }
    return buf;
  }

  function twang(s, r) {
    const f0 = expLerp(55, 420, s.pitch) * (1 + jit(s, r, 0.1));
    const dur = lerp(0.3, 2.2, s.length) * (1 + jit(s, r, 0.1));
    const glide = lerp(0.3, -0.3, s.squishiness);
    const wobDepth = lerp(0, 0.06, s.squishiness), wobRate = 4 + 5 * r.value();
    const H = 4 + Math.round(s.brightness * 10), roll = lerp(1.6, 0.9, s.brightness), hiDecay = lerp(7, 2, s.brightness);
    const buzz = s.bounce, thr = lerp(1.2, 0.3, buzz);
    const n = samples(dur);
    const buf = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const settle = 1 - Math.exp(-t / (dur * 0.25));
      const f = f0 * (1 + glide * 0.25 * settle) * (1 + wobDepth * Math.sin(TWO_PI * wobRate * t) * Math.exp(-t / dur));
      ph += TWO_PI * f / RATE;
      let x = 0;
      for (let k = 1; k <= H && f * k < RATE * 0.45; k++) x += Math.sin(ph * k) / Math.pow(k, roll) * Math.exp(-t * (k - 1) * hiDecay / dur);
      const env = Math.min(1, t / 0.002) * Math.exp(-t / (dur * 0.3));
      let y = x * env;
      if (buzz > 0.01 && y > thr * env + 0.0001) {           // slaps against the desk: a rattling buzz on every swing
        y = thr * env - (y - thr * env) * 0.6 + r.signed() * 0.04 * buzz * env;
      }
      buf[i] = y;
    }
    addNoiseBurst(buf, 0, r, 0.0003, 0.004, 0.2 + 0.5 * s.brightness, Biquad.bandPass(Math.min(9000, f0 * 8), 1.2));
    return buf;
  }

  function jellyWobble(s, r) {
    const f0 = expLerp(50, 320, s.pitch) * (1 + jit(s, r, 0.1));
    const dur = lerp(0.35, 2.4, s.length) * (1 + jit(s, r, 0.1));
    const rate0 = lerp(4, 14, s.bounce) * (1 + jit(s, r, 0.15));
    const depth = lerp(0.12, 0.45, s.squishiness);
    const cut = expLerp(250, 3500, s.brightness);
    const lp = new Biquad();
    const n = samples(dur);
    const buf = new Float32Array(n + samples(0.15));
    let ph = 0, wobPh = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, u = i / n;
      wobPh += TWO_PI * rate0 * (1 - 0.35 * u) / RATE;
      const wob = Math.sin(wobPh), damp = Math.exp(-t / (dur * 0.45));
      const f = f0 * (1 + depth * 0.35 * wob * damp);
      ph += TWO_PI * f / RATE;
      const src = saw(ph, 8, f) * 0.7 + Math.sin(ph) * 0.6;
      if ((i & 15) === 0) lp.setLowPass(cut * (1 + 0.8 * wob * damp * (0.3 + 0.7 * s.squishiness)), 3.5);
      const am = 1 - 0.55 * damp * (0.5 + 0.5 * wob) * (0.3 + 0.7 * s.bounce);
      const env = Math.min(1, t / 0.01) * Math.pow(1 - u, 1.2);
      buf[i] = lp.process(src) * am * env;
    }
    const bubbles = Math.round(s.squishiness * 8);
    for (let k = 0; k < bubbles; k++)
      addBubble(buf, samples(r.value() * dur * 0.8), expLerp(300, 1200, r.value()), r.range(0.008, 0.02), 0.8, r.range(0.1, 0.25));
    return buf;
  }

  function zip(s, r) {
    const dur = lerp(0.12, 0.9, s.length) * (1 + jit(s, r, 0.1));
    const zips = 1 + Math.round(s.bounce * 2);
    const each = dur / zips;
    const f0 = expLerp(300, 2400, s.pitch);
    const tonal = s.squishiness;
    const buf = new Float32Array(samples(dur * 1.2 + 0.1));
    for (let k = 0; k < zips; k++) {
      const st = samples(k * each * 1.15), up = k % 2 === 0;
      const len = each * (1 + jit(s, r, 0.15)), n = samples(len);
      if (tonal > 0.02) {
        let ph = 0;
        const span = lerp(1, 2, s.brightness);
        for (let i = 0; i < n && st + i < buf.length; i++) {
          const u = i / n;
          const f = f0 * Math.pow(2, (up ? u * 2 - 0.5 : 1.5 - u * 2) * span * 0.5);
          ph += TWO_PI * f / RATE;
          const env = Math.sin(Math.PI * Math.pow(u, 0.5));
          buf[st + i] += (Math.sin(ph) * 0.8 + saw(ph, 6, f) * 0.3 * s.brightness) * env * tonal;
        }
      }
      if (tonal < 0.98) {
        const fab = Biquad.bandPass(f0 * 1.2, 0.8);
        for (let i = 0; i < n && st + i < buf.length; i++) buf[st + i] += fab.process(r.signed()) * 0.035 * (1 - tonal) * Math.sin(Math.PI * i / n);
        let tt = 0;
        while (tt < len) {
          const u = tt / len;
          const rate = lerp(40, 220, s.pitch) * (0.6 + 0.8 * Math.sin(Math.PI * u)) * (up ? 1 : 0.85);
          addNoiseBurst(buf, st + samples(tt), r, 0.0001, 0.0012, (1 - tonal) * lerp(0.4, 0.9, r.value()) * Math.sin(Math.PI * Math.min(1, u * 1.1)),
            Biquad.bandPass(f0 * lerp(1.5, 3, s.brightness) * (0.9 + 0.2 * r.value()), 2));
          tt += 1 / rate;
        }
      }
    }
    return buf;
  }

  function propeller(s, r) {
    const dur = lerp(0.5, 3, s.length) * (1 + jit(s, r, 0.1));
    const d = s.squishiness * 2 - 1;
    const rateMax = expLerp(8, 45, s.pitch) * (1 + jit(s, r, 0.1));
    const chop = lerp(0.2, 0.95, s.bounce), sharp = lerp(1, 6, chop);
    const bp = Biquad.bandPass(expLerp(300, 2500, s.brightness), 1.8);
    const n = samples(dur);
    const buf = new Float32Array(n);
    let bladePh = 0, motorPh = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, u = i / n;
      const steady = 1, upC = 0.15 + 0.85 * smooth01(u), downC = 1 - 0.85 * smooth01(u);
      const sp = d >= 0 ? steady + (upC - steady) * d : steady + (downC - steady) * -d;
      bladePh += TWO_PI * rateMax * sp / RATE;
      const pulse = Math.pow(0.5 + 0.5 * Math.cos(bladePh), sharp);
      const am = 1 - chop + chop * pulse;
      const mf = 60 + rateMax * sp * 4;
      motorPh += TWO_PI * mf / RATE;
      const x = bp.process(r.signed()) * 0.55 + saw(motorPh, 8, mf) * 0.45 * (0.5 + 0.5 * s.brightness) + Math.sin(motorPh * 0.5) * 0.25;
      let env = Math.min(1, t / 0.05) * Math.min(1, (1 - u) * dur / 0.15);
      if (Math.abs(d) < 0.5) env *= 1 - (1 - Math.abs(d) * 2) * 0.65 * (1 - Math.sin(Math.PI * u));
      buf[i] = x * am * env;
    }
    return buf;
  }

  function tiptoe(s, r) {
    const steps = 2 + Math.round(s.bounce * 6);
    const gap = lerp(0.12, 0.42, s.length);
    const f0 = expLerp(180, 900, s.pitch);
    const pattern = [0, 3, 0, 5, 0, 3, 7, 5];
    const pluck = s.brightness, soft = s.squishiness;
    const buf = new Float32Array(samples(steps * gap * 1.3 + 0.4));
    let t0 = 0;
    for (let k = 0; k < steps; k++) {
      const st = samples(t0);
      const amp = (k % 2 ? 0.8 : 1) * (1 + jit(s, r, 0.15));
      const f = f0 * Math.pow(2, pattern[k % 8] / 12);
      addThump(buf, st, f * 0.9, f * 0.5, 0.004, lerp(0.01, 0.03, soft), amp * 0.6 * (1 - pluck * 0.5));
      addNoiseBurst(buf, st, r, lerp(0.0002, 0.002, soft), lerp(0.002, 0.01, soft), amp * lerp(0.5, 0.12, soft) * (1 - pluck * 0.5),
        Biquad.bandPass(lerp(3000, 900, soft), 1.2));
      if (pluck > 0.02) addPluck(buf, st, f, lerp(0.05, 0.15, s.length), amp * pluck * 0.6, 6);
      t0 += gap * (1 + jit(s, r, 0.2));
    }
    return buf;
  }

  function scurry(s, r) {
    const dur = lerp(0.4, 2.0, s.length) * (1 + jit(s, r, 0.1));
    const rate = lerp(9, 26, s.bounce);
    const f0 = expLerp(150, 700, s.pitch);
    const soft = s.squishiness;
    const buf = new Float32Array(samples(dur + 0.2));
    let t = 0, k = 0;
    while (t < dur) {
      const u = t / dur, st = samples(t);
      const amp = (0.6 + 0.4 * r.value()) * Math.min(1, u * 6 + 0.3) * (1 - 0.7 * u);
      const f = f0 * (1 + 0.25 * u) * (k % 2 ? 1.12 : 1);
      addThump(buf, st, f * 2, f, 0.003, lerp(0.006, 0.018, soft), amp * 0.7);
      addNoiseBurst(buf, st, r, 0.0002, lerp(0.0015, 0.006, soft), amp * lerp(0.6, 0.15, soft) * (0.4 + 0.6 * s.brightness),
        Biquad.bandPass(expLerp(1500, 6000, s.brightness), 1.5));
      t += (1 / (rate * (1 + 0.6 * u))) * (1 + jit(s, r, 0.25));
      k++;
    }
    return buf;
  }

  // ------------------------------------------------------------------ new types (Round 4, batch 2): Squishy & body,
  // Voices, Musical stings. Plain double maths like batch 1; fully deterministic.
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const scaleStep = (deg) => 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7];

  /** A brass note: saw through a filter that opens on the attack (the "blat"). Optional plunger wah, vibrato, droop. */
  function addBrass(buf, start, hz, len, amp, bright, o) {
    o = o || {};
    const rel = o.release || 0.07;
    const n = Math.min(buf.length - start, samples(len + rel));
    const lp = new Biquad();
    const base = expLerp(700, 5000, bright);
    const scoop = o.scoop === undefined ? 0.04 : o.scoop;
    const harm = Math.max(6, Math.min(30, Math.ceil(base * 1.6 / hz)));   // nothing above the filter is worth computing
    let ph = o.phase || 0;
    for (let i = 0; i < n; i++) {
      if (start + i < 0) continue;
      const t = i / RATE, u = Math.min(1, t / len);
      const vib = (o.vib || 0) * Math.sin(TWO_PI * (o.vibRate || 5.5) * t) * smooth01(t / 0.3);
      const f = hz * (1 + vib) * Math.pow(2, -((o.droop || 0) * u * u * u) / 12) * (1 - scoop * Math.exp(-t / 0.03));
      ph += TWO_PI * f / RATE;
      const env = Math.min(1, t / 0.025) * (t < len ? 1 - 0.2 * u : Math.max(0, 1 - (t - len) / rel) * 0.8);
      if ((i & 15) === 0) {
        let open = 0.3 + 0.7 * env + 0.8 * Math.exp(-t / 0.05);
        if (o.wah) {
          let w = smooth01(t / (o.wahOpen || 0.12));                      // plunger: closed -> open = "wah"
          if (o.wahRate) w *= 0.55 + 0.45 * Math.cos(TWO_PI * o.wahRate * Math.max(0, t - 0.25));
          open *= 1 - o.wah * 0.8 * (1 - w);
        }
        lp.setLowPass(Math.max(150, base * open), 1.4 + (o.wah || 0) * 2);
      }
      buf[start + i] += lp.process(saw(ph, harm, f)) * env * amp;
    }
  }

  /** A plucked string (Karplus-Strong), added into buf. */
  function addString(buf, start, hz, decay, amp, bright, r) {
    const p = Math.max(2, Math.round(RATE / hz));
    const line = new Float32Array(p);
    const lp = Biquad.lowPass(expLerp(1500, 12000, bright), 0.7);
    for (let i = 0; i < p; i++) line[i] = lp.process(r.signed());
    const n = Math.min(buf.length - start, samples(decay * 4));
    const g = Math.pow(0.001, 1 / (hz * decay)), a = lerp(0.5, 0.85, bright);
    let idx = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      line[idx] = g * (a * cur + (1 - a) * prev);
      prev = cur;
      if (++idx >= p) idx = 0;
      if (start + i >= 0) buf[start + i] += cur * amp * Math.min(1, i / 30);
    }
  }

  function addSnare(buf, st, r, hz, amp, loose, bright) {
    addThump(buf, st, hz * 1.6, hz, 0.008, lerp(0.03, 0.07, loose), amp * 0.8);
    addThump(buf, st, hz * 2.3, hz * 2.2, 0.004, 0.025, amp * 0.3);
    addNoiseBurst(buf, st, r, 0.0005, lerp(0.035, 0.12, loose), amp * 0.75, Biquad.bandPass(expLerp(2000, 6000, bright), 0.7));
  }

  function addCymbal(buf, st, r, ring, amp, bright) {
    const base = expLerp(330, 650, bright);
    for (let i = 0; i < 28; i++)                                         // a dense spread of quiet modes = shimmer, not a bell
      addMode(buf, st, base * Math.pow(2, r.value() * 4.2), ring * (0.3 + 0.7 * r.value()), amp * 0.018);
    addNoiseBurst(buf, st, r, 0.001, ring * 0.33, amp * 0.75, Biquad.highPass(expLerp(3500, 8000, bright)));
    addNoiseBurst(buf, st, r, 0.0005, ring * 0.1, amp * 0.45, Biquad.bandPass(expLerp(3000, 7000, bright), 0.8));
  }

  function squelch(s, r) {
    const count = 1 + Math.round(s.bounce * 3);
    const each = lerp(0.12, 0.6, s.length) * (1 + jit(s, r, 0.15));
    const gap = each * 1.15 + 0.05;
    const f0 = expLerp(150, 700, s.pitch) * (1 + jit(s, r, 0.12));
    const wet = s.squishiness;
    const buf = new Float32Array(samples(count * gap + each + 0.25));
    for (let k = 0; k < count; k++) {
      const st = samples(k * gap * (1 + jit(s, r, 0.1)));
      const len = each * (k % 2 ? 0.85 : 1), n = samples(len);
      const bp = new Biquad(), lp = Biquad.lowPass(expLerp(1200, 7000, s.brightness), 0.8);
      const fk = f0 * (k % 2 ? 1.15 : 1);
      let ph = 0, crackle = 1, hold = 0;
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const u = i / n;
        const fr = fk * Math.pow(2, 1.6 * Math.pow(u, 0.8)) * (1 + 0.12 * Math.sin(TWO_PI * 17 * u * len + k));
        ph += TWO_PI * fr * 0.5 / RATE;
        if (--hold <= 0) { crackle = 0.25 + 0.75 * r.value(); hold = samples(lerp(0.006, 0.0025, wet) * (0.5 + r.value())); }
        if ((i & 15) === 0) bp.setBandPass(fr, lerp(9, 3.5, wet));
        const src = r.signed() * crackle * lerp(0.6, 1, wet) + saw(ph, 6, fr * 0.5) * lerp(0.45, 0.15, wet);
        const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8);
        buf[st + i] += lp.process(bp.process(src)) * env * 1.4;
      }
      const bubbles = Math.round(wet * 10);
      for (let b = 0; b < bubbles; b++)
        addBubble(buf, st + samples(r.value() * len), expLerp(250, 1100, s.pitch * 0.5 + r.value() * 0.5), r.range(0.008, 0.025), 1.2,
          r.range(0.1, 0.3));
    }
    return buf;
  }

  function bloop(s, r) {
    const count = 1 + Math.round(s.bounce * 4);
    const decay = lerp(0.03, 0.16, s.length);
    const gap = lerp(0.08, 0.2, s.length);
    const f0 = expLerp(150, 1100, s.pitch) * (1 + jit(s, r, 0.12));
    const rise = lerp(0.5, 3.2, s.squishiness);
    const h = s.brightness;
    const steps = [0, 4, 7, 2, 9];
    const buf = new Float32Array(samples(count * gap * 1.3 + decay * 7 + 0.05));
    let t0 = 0;
    for (let k = 0; k < count; k++) {
      const st = samples(t0);
      const f = f0 * Math.pow(2, (k ? steps[k] + r.signed() * 1.5 * s.randomness : 0) / 12);
      const n = Math.min(buf.length - st, samples(decay * 7));
      const amp = k === 0 ? 1 : 0.8;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const fi = f * (1 + rise * (1 - Math.exp(-t / (decay * 0.35))));
        ph += TWO_PI * Math.min(RATE * 0.4, fi) / RATE;
        const x = Math.sin(ph) + h * 0.35 * Math.sin(ph * 2) + h * h * 0.15 * Math.sin(ph * 3);
        buf[st + i] += x * Math.min(1, t / 0.002) * Math.exp(-t / decay) * amp;
      }
      t0 += gap * (1 + jit(s, r, 0.2));
    }
    return buf;
  }

  function raspberry(s, r) {
    const dur = lerp(0.25, 2.0, s.length) * (1 + jit(s, r, 0.1));
    const f0 = expLerp(35, 170, s.pitch) * (1 + jit(s, r, 0.1));
    const wet = s.squishiness, stutter = s.bounce;
    const n = samples(dur);
    const buf = new Float32Array(n + samples(0.05));
    const lp = Biquad.lowPass(expLerp(500, 3500, s.brightness), 1.5);
    const form = Biquad.bandPass(expLerp(350, 900, s.brightness) * lerp(0.8, 1.3, s.pitch), 2.5);
    const wobRate = 3 + 4 * r.value(), gateRate = lerp(5, 13, stutter);
    let ph = 0, drift = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, u = i / n;
      if ((i & 255) === 0) drift += (r.signed() * 0.3 - drift * 0.3) * (0.3 + wet);   // lips flapping unevenly
      const f = f0 * (1.15 - 0.45 * u * u) * (1 + 0.12 * drift) * (1 + 0.05 * Math.sin(TWO_PI * wobRate * t));
      ph += TWO_PI * f / RATE;
      const cyc = (ph / TWO_PI) % 1;
      const x = Math.exp(-cyc * lerp(18, 6, wet)) + r.signed() * wet * 0.6 * Math.exp(-cyc * 10);
      const gate = 1 - stutter * 0.9 * (0.5 - 0.5 * Math.cos(TWO_PI * gateRate * t));
      const env = Math.min(1, t / 0.012) * Math.min(1, (1 - u) * dur / 0.06) * (0.8 + 0.2 * Math.sin(Math.PI * u)) * gate;
      buf[i] = (form.process(x) * 0.9 + lp.process(x) * 0.6) * env;
    }
    return buf;
  }

  function gulp(s, r) {
    const count = 1 + Math.round(s.bounce * 3);
    const len = lerp(0.08, 0.28, s.length) * (1 + jit(s, r, 0.1));
    const gap = len + lerp(0.12, 0.3, s.length);
    const f0 = expLerp(70, 260, s.pitch);
    const wet = s.squishiness;
    const buf = new Float32Array(samples(count * gap * 1.2 + len + 0.3));
    let t0 = 0;
    for (let k = 0; k < count; k++) {
      const st = samples(t0), fk = f0 * (1 + jit(s, r, 0.08));
      const fa = new Biquad(), n = samples(len);
      let ph = 0;
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const u = i / n;
        const f = fk * (1.3 - 0.5 * u);
        ph += TWO_PI * f / RATE;
        if ((i & 15) === 0) fa.setBandPass(expLerp(900, 300, u) * lerp(0.8, 1.4, s.pitch) * lerp(0.75, 1.5, s.brightness), 3);
        const src = saw(ph, 12, f) + r.signed() * 0.15 * wet;
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.7);
        buf[st + i] += (fa.process(src) * 1.2 + Math.sin(ph) * 0.35) * env;
      }
      const sp = st + samples(len * 0.85);
      addBubble(buf, sp, expLerp(250, 700, s.pitch) * (1 + jit(s, r, 0.1)), lerp(0.01, 0.03, wet), lerp(0.4, 1.8, wet), 0.7);
      addThump(buf, sp, fk * 1.5, fk * 0.7, 0.01, 0.04, 0.6);
      addNoiseBurst(buf, sp, r, 0.0002, 0.003, 0.15 + 0.35 * s.brightness, Biquad.bandPass(expLerp(1200, 3500, s.brightness), 1.5));
      t0 += gap * (1 + jit(s, r, 0.15));
    }
    return buf;
  }

  function snore(s, r) {
    const count = 1 + Math.round(s.bounce * 2);
    const inhale = lerp(0.6, 1.6, s.length) * (count > 1 ? 0.75 : 1) * (1 + jit(s, r, 0.1));
    const exhale = inhale * 0.8, pause = lerp(0.1, 0.35, s.length);
    const cycle = inhale + pause + exhale + pause;
    const flapHz = expLerp(22, 70, s.pitch) * (1 + jit(s, r, 0.1));
    const rattle = 1 - s.squishiness;
    const buf = new Float32Array(samples(count * cycle + 0.1));
    for (let k = 0; k < count; k++) {
      const st = samples(k * cycle);
      const f1 = Biquad.bandPass(expLerp(300, 700, s.pitch), 2), f2 = Biquad.bandPass(expLerp(900, 1600, s.pitch), 3);
      const n = samples(inhale);
      let fph = r.value() * TWO_PI;
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const t = i / RATE, u = i / n;
        const fh = flapHz * (0.85 + 0.3 * u) * (1 + 0.05 * Math.sin(TWO_PI * 0.7 * t));
        fph += TWO_PI * fh / RATE;
        const flap = Math.pow(0.5 + 0.5 * Math.cos(fph), lerp(1, 8, rattle));
        const x = r.signed() * (0.25 + 0.75 * flap * rattle + 0.35 * (1 - rattle)) + (flap - 0.3) * rattle * 0.8;
        const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.5);
        buf[st + i] += (f1.process(x) * 1.2 + f2.process(x) * 0.6) * env;
      }
      const st2 = st + samples(inhale + pause), n2 = samples(exhale);
      const air = Biquad.bandPass(expLerp(1200, 3500, s.brightness), 1.2);
      const whistle = Math.max(0, (s.brightness - 0.35) / 0.65), wf = expLerp(900, 2200, s.pitch) * (1 + jit(s, r, 0.1));
      let wph = 0;
      for (let i = 0; i < n2 && st2 + i < buf.length; i++) {
        const t = i / RATE, u = i / n2;
        wph += TWO_PI * wf * (1 - 0.15 * u) * (1 + 0.012 * Math.sin(TWO_PI * 5 * t)) / RATE;
        const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.5)), 2);
        buf[st2 + i] += (air.process(r.signed()) * (1 - 0.5 * whistle) + Math.sin(wph) * 0.3 * whistle) * env * 0.5;
      }
    }
    return buf;
  }

  /** Vowel formants (F1, F2): ah, eh, ee, oh, oo, a (cat). Our own gibberish syllable engine. */
  const VOWELS = [[800, 1200], [500, 1850], [320, 2300], [500, 900], [340, 800], [650, 1650]];

  /** Babble from text (Round 7): the gibberish follows your words: one syllable per vowel group, the consonant in
   *  front picks the start (p/t/k pop, s/f/h hiss, m/n/l soft), the vowel picks the mouth shape, spaces and punctuation
   *  make pauses, "?" rises at the end of its sentence, "!" and CAPITALS get excited. No real words come out. */
  const PLOSIVE = "pbtdkgcqxj", FRICATIVE = "szfvh", SOFT = "mnlrwy";
  function textSyllables(text, s, r, rate, excite) {
    const syl = [], sentences = [];
    const gapWord = lerp(0.04, 0.16, s.length), gapComma = lerp(0.12, 0.4, s.length), gapStop = lerp(0.25, 0.7, s.length);
    let t = 0, sent = { start: 0, q: false, bang: false, first: 0 };
    const endSentence = (kind) => {
      if (syl.length > sent.first) { sent.end = t; sent.q = kind === "?"; sent.bang = kind === "!"; sentences.push(sent); for (let k = sent.first; k < syl.length; k++) syl[k].sent = sentences.length - 1; }
      sent = { start: t, q: false, bang: false, first: syl.length };
    };
    const words = String(text).slice(0, 240).match(/[A-Za-z\u00C0-\u024F']+|[0-9]+|[,;:\-]|[.!?]+/g) || [];
    for (const w of words) {
      if (/^[,;:\-]$/.test(w)) { t += gapComma; continue; }
      if (/^[.!?]+$/.test(w)) { t += gapStop; endSentence(w.includes("?") ? "?" : w.includes("!") ? "!" : "."); continue; }
      const shout = w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);
      const lw = w.toLowerCase().replace(/[0-9]/g, "a").normalize("NFD").replace(/[\u0300-\u036f']/g, "");
      const parts = lw.match(/[^aeiouy]*[aeiouy]+/g) || [lw || "m"];
      parts.forEach((part, k) => {
        const vow = (part.match(/[aeiouy]+/) || ["u"])[0], onset = part.slice(0, part.length - vow.length);
        const c = onset.slice(-1) || (k === 0 && !onset ? "" : "");
        const cons = !c ? 0.9 : PLOSIVE.includes(c) ? 0.2 : FRICATIVE.includes(c) ? 0.55 : SOFT.includes(c) ? 0.75 : 0.9;
        const vi = vow.startsWith("ai") || vow.startsWith("ae") ? 5 : "aeiyou".indexOf(vow[0]);
        const v = VOWELS[[0, 1, 2, 2, 3, 4][Math.max(0, vi)] ?? 0] || VOWELS[0];
        const last = k === parts.length - 1;
        const len = (1 / rate) * (0.75 + 0.35 * r.value()) * (vow.length > 1 ? 1.2 : 1) * (last && parts.length > 1 ? 1.2 : 1);
        syl.push({ t, len, f1: v[0], f2: v[1], cons, sent: 0,
          pmul: (1 + r.signed() * lerp(0.05, 0.25, excite)) * (shout ? 1.22 : 1) * (k === 0 && parts.length > 1 ? 1.05 : 1),
          consLen: cons < 0.45 ? 0.022 : cons < 0.7 ? lerp(0.05, 0.035, s.bounce) : 0 });
        t += len;
      });
      t += gapWord;
      if (t > 11) break;
    }
    endSentence(".");
    return { syl, sentences, phrase: Math.max(0.2, t) };
  }

  function babble(s, r) {
    const dur = lerp(0.4, 3.0, s.length) * (1 + jit(s, r, 0.1));
    const rate = lerp(4, 11, s.bounce);
    const excite = s.squishiness;
    const f0 = expLerp(85, 420, s.pitch) * (1 + jit(s, r, 0.1));
    const voice = lerp(0.85, 1.35, s.pitch);
    if (s.text && /[A-Za-z0-9\u00C0-\u024F]/.test(s.text)) return babbleText(s, r, rate, excite, f0, voice);
    const syl = [];
    let t = 0;
    while (t < dur - 0.05 || !syl.length) {
      const len = (1 / rate) * (0.6 + 0.8 * r.value());
      const v = VOWELS[Math.min(VOWELS.length - 1, Math.floor(r.value() * VOWELS.length))];
      const cons = r.value();
      syl.push({ t, len, f1: v[0], f2: v[1], cons, pmul: 1 + r.signed() * lerp(0.06, 0.35, excite),
        consLen: cons < 0.45 ? 0.022 : cons < 0.7 ? lerp(0.05, 0.035, s.bounce) : 0 });
      t += len * (r.value() < 0.12 ? 1.8 : 1);
    }
    const phrase = t, rises = r.value() < 0.35;
    const n = samples(phrase + 0.12);
    const buf = new Float32Array(n);
    const fa = new Biquad(), fb = new Biquad(), fc = Biquad.bandPass(2800 * voice, 5);
    const plos = Biquad.bandPass(2200 * voice, 1.2), fric = Biquad.highPass(4500);
    const muffle = Biquad.lowPass(expLerp(1500, 9000, s.brightness), 0.7);
    const glide = 1 - Math.exp(-1 / (0.025 * RATE));
    let ph = 0, idx = 0, cf1 = syl[0].f1, cf2 = syl[0].f2, cp = syl[0].pmul;
    for (let i = 0; i < n; i++) {
      const tt = i / RATE;
      while (idx < syl.length - 1 && tt >= syl[idx + 1].t) idx++;
      const sy = syl[idx], lt = tt - sy.t, su = lt / sy.len;
      cf1 += (sy.f1 - cf1) * glide; cf2 += (sy.f2 - cf2) * glide; cp += (sy.pmul - cp) * glide * 0.6;
      const pu = Math.min(1, tt / phrase);
      const tune = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, pu * 1.3)) + (rises ? 0.25 : -0.18) * smooth01((pu - 0.8) / 0.2);
      const f = f0 * cp * tune * (1 + lerp(0.005, 0.03, excite) * Math.sin(TWO_PI * 6 * tt));
      ph += TWO_PI * f / RATE;
      if ((i & 31) === 0) { fa.setBandPass(cf1 * voice, 5); fb.setBandPass(cf2 * voice, 8); }
      const vStart = sy.consLen / sy.len;
      let venv = su < vStart ? 0 : Math.min(1, (su - vStart) / 0.12) * Math.max(0, Math.min(1, (1 - su) / 0.2));
      if (sy.cons >= 0.7 && sy.cons < 0.85) venv *= 0.45 + 0.55 * Math.min(1, su / 0.3);     // soft "m / n / l" start
      const src = saw(ph, 24, f) + r.signed() * 0.04;
      let v = (fa.process(src) * 1.6 + fb.process(src) + fc.process(src) * lerp(0.1, 0.5, s.brightness)) * venv;
      const nz = r.signed(), pz = plos.process(nz), fz = fric.process(nz);
      if (lt < sy.consLen) {
        const cu = lt / sy.consLen;
        v += sy.cons < 0.45 ? pz * Math.exp(-cu * 6) * 0.9 : fz * Math.sin(Math.PI * cu) * 0.35;
      }
      buf[i] = muffle.process(v);
    }
    return buf;
  }

  function babbleText(s, r, rate, excite, f0, voice) {
    const { syl, sentences, phrase } = textSyllables(s.text, s, r, rate, excite);
    if (!syl.length) return new Float32Array(samples(0.2));
    const n = samples(Math.min(12, phrase + 0.12));
    const buf = new Float32Array(n);
    const fa = new Biquad(), fb = new Biquad(), fc = Biquad.bandPass(2800 * voice, 5);
    const plos = Biquad.bandPass(2200 * voice, 1.2), fric = Biquad.highPass(4500);
    const muffle = Biquad.lowPass(expLerp(1500, 9000, s.brightness), 0.7);
    const glide = 1 - Math.exp(-1 / (0.025 * RATE));
    let ph = 0, idx = 0, cf1 = syl[0].f1, cf2 = syl[0].f2, cp = syl[0].pmul;
    for (let i = 0; i < n; i++) {
      const tt = i / RATE;
      while (idx < syl.length - 1 && tt >= syl[idx + 1].t) idx++;
      const sy = syl[idx], lt = tt - sy.t, su = lt / sy.len;
      const se = sentences[sy.sent] || { start: 0, end: phrase };
      cf1 += (sy.f1 - cf1) * glide; cf2 += (sy.f2 - cf2) * glide; cp += (sy.pmul - cp) * glide * 0.6;
      const pu = Math.min(1, Math.max(0, (tt - se.start) / Math.max(0.1, se.end - se.start)));
      const tune = (se.bang ? 1.12 : 1) + 0.12 * Math.sin(Math.PI * Math.min(1, pu * 1.3)) + (se.q ? 0.3 : -0.16) * smooth01((pu - 0.75) / 0.25);
      const f = f0 * cp * tune * (1 + lerp(0.005, 0.03, se.bang ? Math.max(excite, 0.7) : excite) * Math.sin(TWO_PI * 6 * tt));
      ph += TWO_PI * f / RATE;
      if ((i & 31) === 0) { fa.setBandPass(cf1 * voice, 5); fb.setBandPass(cf2 * voice, 8); }
      const vStart = sy.consLen / sy.len;
      let venv = su < vStart ? 0 : Math.min(1, (su - vStart) / 0.12) * Math.max(0, Math.min(1, (1 - su) / 0.2));
      if (sy.cons >= 0.7 && sy.cons < 0.85) venv *= 0.45 + 0.55 * Math.min(1, su / 0.3);
      const src = saw(ph, 24, f) + r.signed() * 0.04;
      let v = (fa.process(src) * 1.6 + fb.process(src) + fc.process(src) * lerp(0.1, 0.5, s.brightness)) * venv;
      const nz = r.signed(), pz = plos.process(nz), fz = fric.process(nz);
      if (lt < sy.consLen) {
        const cu = lt / sy.consLen;
        v += sy.cons < 0.45 ? pz * Math.exp(-cu * 6) * 0.9 : fz * Math.sin(Math.PI * cu) * 0.35;
      }
      buf[i] = muffle.process(v);
    }
    return buf;
  }

  function sadTrombone(s, r) {
    const root = 40 + s.pitch * 22;
    const noteLen = lerp(0.22, 0.6, s.length) * (1 + jit(s, r, 0.08));
    const lastLen = noteLen * lerp(2.2, 3.5, s.length);
    const wah = s.squishiness, wob = s.bounce;
    const buf = new Float32Array(samples(noteLen * 3 + lastLen + 0.3));
    for (let k = 0; k < 4; k++) {
      const last = k === 3;
      addBrass(buf, samples(k * noteLen), midiHz(root - k) * (1 + jit(s, r, 0.006)), last ? lastLen : noteLen * 0.9,
        last ? 1 : 0.85, s.brightness, {
          wah, wahOpen: Math.min(0.15, noteLen * 0.4),
          vib: last ? lerp(0.004, 0.03, wob) : 0.003, vibRate: last ? lerp(4.5, 6.5, wob) : 5,
          wahRate: last ? lerp(0, 6, wob) : 0, droop: last ? lerp(0.3, 1.6, wob) : 0,
        });
    }
    return buf;
  }

  const KAZOO_TUNE = [0, 4, 7, 4, 9, 7, 5, 12];

  function kazoo(s, r) {
    const notes = 1 + Math.round(s.bounce * 7);
    const noteLen = lerp(0.12, 0.5, s.length) * (1 + jit(s, r, 0.08));
    const lastLen = notes > 1 ? noteLen * 1.8 : noteLen * 1.5;
    const root = 55 + s.pitch * 22, scoop = s.squishiness, buzz = s.brightness;
    const midi = [];
    for (let k = 0; k < notes; k++) midi.push(root + KAZOO_TUNE[k % 8] + r.signed() * 0.3 * s.randomness);
    const total = (notes - 1) * noteLen + lastLen;
    const n = samples(total + 0.05);
    const buf = new Float32Array(n);
    const b1 = Biquad.bandPass(550, 4), b2 = Biquad.bandPass(1500, 5), b3 = Biquad.bandPass(2900, 6);
    const port = 1 - Math.exp(-1 / (lerp(0.005, 0.06, scoop) * RATE));
    let ph = 0, cur = midi[0] - 2 * scoop;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const k = Math.min(notes - 1, Math.floor(t / noteLen));
      const lt = t - k * noteLen, len = k === notes - 1 ? lastLen : noteLen;
      const target = midi[k] - lerp(0, 2.5, scoop) * Math.exp(-lt / 0.05);
      cur += (target - cur) * port;
      const f = midiHz(cur) * (1 + 0.012 * Math.sin(TWO_PI * 5.5 * t) * smooth01(lt / 0.2));
      ph += TWO_PI * f / RATE;
      const src = saw(ph, 30, f);
      const mem = Math.tanh(src * lerp(1.5, 6, buzz));
      const rasp = r.signed() * (0.5 + 0.5 * Math.sin(ph)) * lerp(0.05, 0.35, buzz);
      const x = mem + rasp;
      const y = b1.process(x) * 1.3 + b2.process(x) * 1.0 + b3.process(x) * lerp(0.3, 0.9, buzz) + x * 0.08;
      const art = Math.min(1, lt / 0.015) * (lt > len ? Math.max(0, 1 - (lt - len) / 0.03) : 1) * (k < notes - 1 && lt > len - 0.02 ? 0.4 + 0.6 * (len - lt) / 0.02 : 1);
      buf[i] = y * art;
    }
    return buf;
  }

  function honk(s, r) {
    const count = 1 + Math.round(s.bounce * 3);
    const len = lerp(0.1, 0.5, s.length) * (1 + jit(s, r, 0.1));
    const gap = len * 1.25 + 0.04;
    const f0 = expLerp(180, 700, s.pitch) * (1 + jit(s, r, 0.08));
    const squish = s.squishiness;
    const hornF = expLerp(900, 2600, s.brightness);
    const buf = new Float32Array(samples(count * gap * 1.2 + len * 1.3 + 0.15));
    let t0 = 0;
    for (let k = 0; k < count; k++) {
      const st = samples(t0), last = k === count - 1;
      const fk = f0 * (count > 1 && k % 2 ? 0.94 : 1);
      const lk = len * (last ? 1.2 : 1), n = samples(lk);
      const horn = Biquad.bandPass(hornF, 2), lp = Biquad.lowPass(expLerp(2000, 9000, s.brightness), 0.7);
      const rasp = Biquad.bandPass(hornF * 1.5, 3);
      const duty = lerp(0.3, 0.12, s.brightness);
      let ph = 0;
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const t = i / RATE, u = i / n;
        const sag = squish * 4 * smooth01((u - 0.55) / 0.45);
        const f = fk * (0.85 + 0.15 * smooth01(t / 0.03)) * Math.pow(2, -sag / 12) * (1 + 0.015 * squish * Math.sin(TWO_PI * 11 * t));
        ph += TWO_PI * f / RATE;
        const reed = saw(ph, 25, f) - saw(ph + TWO_PI * duty, 25, f);
        const x = reed + rasp.process(r.signed()) * squish * 0.3;
        const env = Math.min(1, t / 0.01) * Math.min(1, (1 - u) * lk / 0.03) * (0.85 + 0.15 * Math.sin(Math.PI * u)) * (1 - 0.35 * squish * u);
        buf[st + i] += lp.process(horn.process(x) * 1.5 + x * 0.35) * env;
      }
      t0 += gap * (1 + jit(s, r, 0.12));
    }
    return buf;
  }

  function rimshot(s, r) {
    const drums = 1 + Math.round(s.bounce * 2);
    const gap = lerp(0.1, 0.32, s.length) * (1 + jit(s, r, 0.05));
    const ring = lerp(0.4, 2.2, s.length);
    const tune = expLerp(110, 320, s.pitch) * (1 + jit(s, r, 0.05));
    const loose = s.squishiness, bright = s.brightness;
    const buf = new Float32Array(samples(drums * gap + ring * 2.6 + 0.15));
    const hits = drums === 1 ? ["tom"] : drums === 2 ? ["snare", "tom"] : ["snare", "hiTom", "tom"];
    let t0 = 0;
    for (let k = 0; k < hits.length; k++) {
      const st = samples(t0), h = hits[k];
      if (h === "snare") addSnare(buf, st, r, tune, 0.7, loose, bright);
      else addThump(buf, st, tune * (h === "hiTom" ? 1.1 : 0.75) * 1.5, tune * (h === "hiTom" ? 1.1 : 0.75), 0.02,
        lerp(0.08, 0.18, loose), 0.9);
      t0 += gap * (k < hits.length - 1 ? 0.6 : 1) * (1 + jit(s, r, 0.08));
    }
    const st = samples(t0);
    addThump(buf, st, 150, 55, 0.03, 0.12, 0.9);
    addSnare(buf, st, r, tune, 0.9, loose, bright);
    addCymbal(buf, st, r, ring, 1, bright);
    return buf;
  }

  function xylophoneRun(s, r) {
    const notes = 4 + Math.round(s.bounce * 12);
    const gap = lerp(0.03, 0.14, s.length) * (1 + jit(s, r, 0.05));
    const d = s.squishiness * 2 - 1;
    const root = Math.round(64 + s.pitch * 20);
    const hard = s.brightness;
    const buf = new Float32Array(samples(notes * gap * 1.2 + 1.6));
    const span = notes - 1;
    let t0 = 0;
    for (let k = 0; k < notes; k++) {
      const u = span ? k / span : 0;
      const c = d * (2 * u - 1) + (1 - Math.abs(d)) * (2 * Math.sin(Math.PI * u) - 1);
      const hz = midiHz(root + scaleStep(Math.round(c * Math.min(7, span / 2))));
      const st = samples(t0), last = k === notes - 1;
      const amp = (last ? 1 : 0.7) * (1 + jit(s, r, 0.15));
      const dec = lerp(0.6, 0.22, hard) * (last ? 1.6 : 1);
      addMode(buf, st, hz, dec, amp * 0.6);
      addMode(buf, st, hz * lerp(4, 3, hard), dec * 0.3, amp * lerp(0.15, 0.35, hard));
      addMode(buf, st, hz * lerp(10, 6.1, hard), dec * 0.12, amp * 0.18 * hard);
      addNoiseBurst(buf, st, r, 0.0002, 0.002, amp * lerp(0.05, 0.4, hard), Biquad.bandPass(Math.min(9000, hz * 4), 1.5));
      t0 += gap * (1 + jit(s, r, 0.12));
    }
    return buf;
  }

  function harpGlide(s, r) {
    const notes = 6 + Math.round(s.bounce * 18);
    const dur = lerp(0.3, 1.8, s.length) * (1 + jit(s, r, 0.08));
    const d = s.squishiness * 2 - 1;
    const root = Math.round(48 + s.pitch * 24);
    const buf = new Float32Array(samples(dur * 1.1 + 4.2));
    const span = notes - 1, half = span / 2;
    for (let k = 0; k < notes; k++) {
      const u = k / span;
      const c = d * (2 * u - 1) + (1 - Math.abs(d)) * (2 * Math.sin(Math.PI * u) - 1);
      const deg = Math.round((c + 1) * half);
      const hz = midiHz(root + scaleStep(deg));
      const at = dur * u * (1 + jit(s, r, 0.05) * (k ? 1 : 0));
      const decay = Math.min(1.6, lerp(1.6, 0.6, Math.min(1, (hz - 100) / 1500)));
      addString(buf, samples(at), hz, decay, (k === span ? 0.75 : 0.5) * (1 + jit(s, r, 0.15)), s.brightness, r);
    }
    return buf;
  }

  function fanfare(s, r) {
    const pick = Math.round(s.bounce * 4);
    const noteLen = lerp(0.08, 0.22, s.length) * (1 + jit(s, r, 0.05));
    const hold = lerp(0.6, 2.0, s.length);
    const root = Math.round(55 + s.pitch * 17);
    const silly = s.squishiness, bright = s.brightness;
    const buf = new Float32Array(samples(pick * noteLen + hold + 0.5));
    for (let k = 0; k < pick; k++) {
      const st = samples(k * noteLen);
      for (const iv of [0, 7])
        addBrass(buf, st, midiHz(root - 5 + iv) * (1 + r.signed() * 0.002), noteLen * 0.6, 0.45, bright, { scoop: 0.02 });
    }
    const st = samples(pick * noteLen);
    const voices = [0, 4, 7, 12];
    voices.forEach((iv, v) => {
      const det = 1 + r.signed() * lerp(0.002, 0.03, silly);
      const wonky = v === 2 ? silly * 1.2 : 0;                          // one horn goes flat when it gets silly
      addBrass(buf, st, midiHz(root + iv) * det, hold, 0.42, bright, {
        vib: lerp(0.004, 0.03, silly), vibRate: 5.5 + v * 0.3, droop: wonky, scoop: lerp(0.03, 0.12, silly), release: 0.3,
      });
    });
    addThump(buf, st, midiHz(root - 24) * 1.6, midiHz(root - 24), 0.03, 0.35, 0.5);
    return buf;
  }

  function drumRoll(s, r) {
    const dur = lerp(0.6, 3.5, s.length) * (1 + jit(s, r, 0.05));
    const rate = 18 * (1 + jit(s, r, 0.15));
    const tune = expLerp(150, 330, s.pitch);
    const loose = s.squishiness, bright = s.brightness;
    const endHit = s.bounce > 0.3, endCrash = s.bounce > 0.7;
    const buf = new Float32Array(samples(dur + 0.15 + (endCrash ? 4 : endHit ? 0.6 : 0.25)));
    const snareBp = expLerp(2000, 6000, bright);
    let t = 0, k = 0;
    while (t < dur) {
      const u = t / dur, st = samples(t);
      const amp = lerp(0.25, 0.8, Math.pow(u, 1.5)) * (k % 2 ? 0.85 : 1) * (0.9 + 0.2 * r.value());
      addThump(buf, st, tune * 1.4, tune, 0.005, 0.025, amp * 0.35);
      addNoiseBurst(buf, st, r, 0.0003, lerp(0.02, 0.05, loose), amp * 0.6, Biquad.bandPass(snareBp * (0.9 + 0.2 * r.value()), 0.8));
      t += (1 / (rate * (1 + 0.2 * u))) * (1 + jit(s, r, 0.1));
      k++;
    }
    const bed = Biquad.bandPass(snareBp, 0.6), nb = samples(dur);
    for (let i = 0; i < nb; i++) {
      const u = i / nb;
      buf[i] += bed.process(r.signed()) * lerp(0.03, 0.2, u * u) * lerp(0.3, 1, loose) * Math.min(1, i / 2000);
    }
    if (endHit) {
      const st = samples(dur + 0.06);
      addThump(buf, st, 150, 55, 0.03, 0.12, 0.9);
      addSnare(buf, st, r, tune, 1.1, loose, bright);
      if (endCrash) addCymbal(buf, st, r, 1.5, 1, bright);
    }
    return buf;
  }

  function birdies(s, r) {
    const dur = lerp(0.8, 3.5, s.length) * (1 + jit(s, r, 0.08));
    const birds = 1 + Math.round(s.bounce * 3);
    const f0 = expLerp(1800, 4500, s.pitch);
    const trill = s.squishiness, stars = s.brightness;
    const buf = new Float32Array(samples(dur + 0.5));
    for (let b = 0; b < birds; b++) {
      const fb = f0 * (1 + 0.18 * b * (b % 2 ? 1 : -0.7)) * (1 + jit(s, r, 0.05));
      const orbit = 0.6 + r.value() * 0.5, orbPh = r.value() * TWO_PI, trillHz = lerp(30, 60, r.value());
      let t = r.value() * 0.15;
      while (t < dur - 0.08) {
        const c = lerp(0.04, 0.09, r.value()), up = r.value() < 0.5;
        const st = samples(t), n = samples(c);
        let ph = 0;
        for (let i = 0; i < n && st + i < buf.length; i++) {
          const u = i / n, tt = t + i / RATE;
          const shape = up ? 0.75 + 0.5 * u : 1 - 0.35 * Math.sin(Math.PI * u) + 0.2 * u;
          const f = fb * shape * (1 + trill * 0.08 * Math.sin(TWO_PI * trillHz * tt));
          ph += TWO_PI * f / RATE;
          const amp = 0.6 * (0.55 + 0.45 * Math.sin(TWO_PI * orbit * tt + orbPh));
          buf[st + i] += (Math.sin(ph) + 0.12 * Math.sin(ph * 2)) * Math.pow(Math.sin(Math.PI * u), 1.5) * amp;
        }
        t += c + (r.value() < 0.15 ? 0.25 : lerp(0.03, 0.15, r.value()));
      }
    }
    const twinkles = Math.round(stars * dur * 6), penta = [0, 2, 4, 7, 9];
    for (let k = 0; k < twinkles; k++) {
      const hz = midiHz(96 + penta[Math.floor(r.value() * 5) % 5] + (r.value() < 0.3 ? 12 : 0));
      const st = samples(r.value() * dur);
      addMode(buf, st, hz, 0.15, 0.22);
      addMode(buf, st, hz * 2.76, 0.05, 0.08);
    }
    return buf;
  }

  // ------------------------------------------------------------------ new types (Round 5, batch 3): Magic & tech.
  // Plain double maths like batches 1 and 2; fully deterministic.

  /** A small bell: a few inharmonic modes (fast, via addMode). */
  function addBell(buf, st, hz, ring, amp, bright) {
    const parts = [[1, 1], [2.0, 0.5], [2.76, 0.42], [5.4, 0.28], [8.93, 0.16]];
    for (let k = 0; k < parts.length; k++)
      addMode(buf, st, hz * parts[k][0], ring * (k ? lerp(0.25, 0.6, bright) / Math.sqrt(k) : 1), amp * parts[k][1] * (k > 2 ? bright : 1));
  }

  function sparkle(s, r) {
    const dur = lerp(0.35, 2.2, s.length) * (1 + jit(s, r, 0.08));
    const f0 = expLerp(900, 3200, s.pitch);
    const glitter = s.squishiness;
    const count = Math.round(lerp(6, 34, s.bounce) * (0.5 + dur / 2.2));
    const ring = lerp(0.08, 0.45, s.length);
    const buf = new Float32Array(samples(dur + ring * 5 + 0.1));
    const penta = [0, 2, 4, 7, 9];
    for (let k = 0; k < count; k++) {
      const u = count > 1 ? k / (count - 1) : 0;
      const deg = Math.floor(u * 9 + r.value() * 3 * s.randomness * 3);
      const semis = 12 * Math.floor(deg / 5) + penta[deg % 5];
      const hz = Math.min(RATE * 0.2, f0 * Math.pow(2, semis / 12));
      const t = dur * Math.pow(u, 0.85) * (1 + jit(s, r, 0.25));
      addBell(buf, samples(Math.max(0, t)), hz, ring * (0.6 + 0.6 * r.value()), (0.35 + 0.3 * r.value()) * (1 - 0.45 * glitter) * (1 - 0.3 * u), s.brightness);
    }
    if (glitter > 0.02) {
      const hp = Biquad.highPass(expLerp(3000, 8000, s.brightness)), bp = Biquad.bandPass(expLerp(5000, 11000, s.pitch), 0.7);
      const n = samples(dur + ring);
      for (let i = 0; i < n && i < buf.length; i++) {
        const u = i / n, env = Math.sin(Math.PI * Math.pow(u, 0.6)) * (0.6 + 0.4 * Math.sin(TWO_PI * 13 * i / RATE));
        const x = r.signed();
        buf[i] += (hp.process(x) * 0.25 + bp.process(x) * 0.5) * env * glitter * (r.value() < 0.35 ? 1.6 : 0.5);
      }
    }
    return buf;
  }

  function poof(s, r) {
    const puffs = 1 + Math.round(s.bounce * 2);
    const len = lerp(0.12, 1.1, s.length) * (1 + jit(s, r, 0.1));
    const hard = 1 - s.squishiness;
    const top = expLerp(1500, 9000, s.brightness), low = expLerp(160, 700, s.pitch);
    const gap = lerp(0.12, 0.28, s.length);
    const buf = new Float32Array(samples(len * 1.4 + gap * (puffs - 1) + 0.15));
    for (let k = 0; k < puffs; k++) {
      const st = samples(k * gap * (1 + jit(s, r, 0.25))), lk = len * (k ? 0.65 : 1), n = samples(lk);
      const amp = k ? 0.6 : 1;
      const lp = new Biquad(), bp = Biquad.bandPass(low * 2.2, 0.9);
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const t = i / RATE, u = i / n;
        if ((i & 15) === 0) lp.setLowPass(expLerp(top, low * 1.5, Math.pow(u, 0.6)), 0.8);
        const att = Math.min(1, t / lerp(0.002, 0.03, s.squishiness));
        const env = att * Math.pow(1 - u, lerp(1.2, 2.8, hard));
        const x = r.signed();
        buf[st + i] += (lp.process(x) * 0.9 + bp.process(x) * 0.6) * env * amp;
      }
      addThump(buf, st, low * 3, low, 0.01, lerp(0.02, 0.05, s.length), amp * lerp(0.15, 0.9, hard));
      addNoiseBurst(buf, st, r, 0.0003, 0.004, amp * 0.5 * hard, Biquad.highPass(2500));
    }
    return buf;
  }

  function zap(s, r) {
    const zaps = 1 + Math.round(s.bounce * 3);
    const len = lerp(0.06, 0.6, s.length) * (1 + jit(s, r, 0.1));
    const f0 = expLerp(500, 3500, s.pitch);
    const crackle = s.squishiness;
    const gap = len * 0.8 + 0.03;
    const buf = new Float32Array(samples(gap * zaps + len + 0.1));
    for (let k = 0; k < zaps; k++) {
      const st = samples(k * gap * (1 + jit(s, r, 0.2))), n = samples(len);
      const fk = f0 * (1 + jit(s, r, 0.15)) * (k % 2 ? 1.12 : 1);
      const lp = Biquad.lowPass(expLerp(2500, 14000, s.brightness), 0.9), cr = Biquad.bandPass(expLerp(1500, 5000, s.brightness), 1.5);
      let ph = 0, ph2 = 0, hold = 0;
      for (let i = 0; i < n && st + i < buf.length; i++) {
        const t = i / RATE, u = i / n;
        const f = fk * Math.pow(0.12, Math.pow(u, 0.7));
        ph += TWO_PI * f / RATE; ph2 += TWO_PI * f * 1.51 / RATE;
        const tone = saw(ph, 20, f) * 0.7 + Math.sin(ph2) * 0.35;
        if (r.value() < 0.02 + 0.06 * crackle) hold = r.signed();
        const ring = tone * (crackle > 0 ? 1 - crackle * 0.5 + crackle * 0.5 * Math.sign(Math.sin(TWO_PI * 60 * t)) : 1);
        const env = Math.min(1, t / 0.002) * Math.pow(1 - u, 1.4);
        buf[st + i] += (lp.process(ring) * (1 - 0.4 * crackle) + cr.process(hold + r.signed() * 0.3) * crackle * 0.9) * env;
      }
    }
    return buf;
  }

  function powerUp(s, r) {
    const dur = lerp(0.2, 1.4, s.length) * (1 + jit(s, r, 0.06));
    const d = s.squishiness * 2 - 1;                 // -1 powers down, +1 powers up, middle: up then down
    const f0 = expLerp(180, 900, s.pitch);
    const steps = s.bounce < 0.05 ? 0 : Math.round(lerp(4, 16, s.bounce));
    const square = s.brightness;
    const span = 24;
    const buf = new Float32Array(samples(dur + 0.12));
    const n = samples(dur);
    const lp = Biquad.lowPass(expLerp(2500, 12000, square), 0.7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, u = i / n;
      let shape = Math.abs(d) > 0.35 ? (d > 0 ? u : 1 - u) : Math.sin(Math.PI * u);
      if (Math.abs(d) <= 0.35 && Math.abs(d) > 0) shape = lerp(Math.sin(Math.PI * u), d > 0 ? u : 1 - u, Math.abs(d) / 0.35);
      if (steps) shape = Math.floor(shape * steps) / steps;
      const semis = shape * span + 0.25 * Math.sin(TWO_PI * 18 * t) * (steps ? 0 : 1);
      const f = f0 * Math.pow(2, semis / 12) * (1 + jit(s, r, 0.002));
      ph += TWO_PI * f / RATE;
      const sq = saw(ph, 24, f) - saw(ph + Math.PI, 24, f);
      const x = Math.sin(ph) * (1 - square) + sq * 0.7 * square;
      const env = Math.min(1, t / 0.005) * Math.min(1, (n - i) / (RATE * 0.04)) * (steps ? 0.75 + 0.25 * ((u * steps) % 1 < 0.6 ? 1 : 0.4) : 1);
      buf[i] += lp.process(x) * env;
    }
    return buf;
  }

  function ratchet(s, r) {
    const dur = lerp(0.2, 2, s.length) * (1 + jit(s, r, 0.08));
    const rate = lerp(8, 45, s.bounce);
    const f0 = expLerp(900, 4500, s.pitch);
    const soft = s.squishiness;
    const buf = new Float32Array(samples(dur + 0.15));
    let t = 0, k = 0;
    while (t < dur) {
      const st = samples(t), acc = k % 2 ? 0.75 : 1;
      addNoiseBurst(buf, st, r, 0.0001, lerp(0.0015, 0.006, soft), acc * lerp(0.9, 0.5, soft),
        Biquad.bandPass(f0 * (0.9 + 0.2 * r.value()), lerp(6, 1.5, soft)));
      addMode(buf, st, f0 * lerp(0.5, 0.3, soft), lerp(0.006, 0.02, soft) * lerp(0.6, 1.4, s.brightness), acc * 0.35);
      addMode(buf, st, f0 * 1.73, 0.004 * lerp(0.6, 1.4, s.brightness), acc * 0.25 * s.brightness * (1 - soft));
      t += (1 / rate) * (1 + jit(s, r, 0.25));
      k++;
    }
    return buf;
  }

  function kaChing(s, r) {
    const dings = 1 + Math.round(s.bounce * 2);
    const ring = lerp(0.2, 1.0, s.length);
    const f0 = expLerp(1100, 3000, s.pitch) * (1 + jit(s, r, 0.04));
    const coins = s.squishiness;
    const buf = new Float32Array(samples(0.2 + dings * 0.11 + ring * 3 + 0.6 * coins));
    // the drawer: a short mechanical slide and clunk
    const slide = samples(0.12);
    const bp = Biquad.bandPass(expLerp(900, 2500, s.brightness), 1.2);
    for (let i = 0; i < slide; i++) buf[i] += bp.process(r.signed()) * 0.35 * Math.sin(Math.PI * i / slide) * (0.6 + 0.4 * Math.sin(TWO_PI * 90 * i / RATE));
    addThump(buf, slide, 260, 140, 0.01, 0.03, 0.6);
    addNoiseBurst(buf, slide, r, 0.0002, 0.01, 0.4, Biquad.bandPass(1800, 1.5));
    for (let k = 0; k < dings; k++) {
      const st = slide + samples(0.02 + k * 0.11);
      addBell(buf, st, f0 * (k % 2 ? 1.26 : 1), ring, 0.9 * (k ? 0.75 : 1), s.brightness);
    }
    const nc = Math.round(coins * 10);
    for (let c = 0; c < nc; c++) {
      const st = slide + samples(0.05 + r.value() * (0.25 + 0.4 * coins));
      const hz = expLerp(3500, 7000, r.value());
      addMode(buf, st, hz, 0.06 + 0.12 * r.value(), 0.18);
      addMode(buf, st, hz * 2.4, 0.04, 0.08 * s.brightness);
    }
    return buf;
  }

  function alarmRing(s, r) {
    const bursts = 1 + Math.round(s.bounce * 3);
    const len = lerp(0.3, 1.5, s.length) * (1 + jit(s, r, 0.08));
    const gap = s.bounce > 0.02 ? lerp(0.2, 0.45, s.length) : 0;
    const f0 = expLerp(1200, 3200, s.pitch);
    const tinny = s.squishiness;
    const hits = lerp(16, 26, s.pitch);
    const buf = new Float32Array(samples(bursts * (len + gap) + 0.6));
    for (let b = 0; b < bursts; b++) {
      const t0 = b * (len + gap);
      let t = 0, k = 0;
      while (t < len) {
        const st = samples(t0 + t), side = k % 2;
        const hz = f0 * (side ? 1.07 : 1) * (1 + jit(s, r, 0.01));
        const fade = Math.min(1, t / 0.02) * (t > len - 0.05 ? (len - t) / 0.05 : 1);
        addBell(buf, st, hz, lerp(0.25, 0.08, tinny), 0.5 * fade, s.brightness);
        if (tinny > 0.02) addNoiseBurst(buf, st, r, 0.0001, 0.003, tinny * 0.6 * fade, Biquad.bandPass(hz * 2.3, 3));
        t += (1 / hits) * (1 + jit(s, r, 0.1));
        k++;
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------ types, sliders, presets
  const TYPES = [
    { id: 0, key: "Boing", name: "Boing", group: "Springs & wobbles", short: "springs", about: "Springs, jumps and bouncy landings.", fn: boing },
    { id: 1, key: "Thud", name: "Thud", group: "Hits & crashes", short: "hits & falls", about: "Bodies, boxes and things hitting the floor.", fn: thud },
    { id: 2, key: "Whoosh", name: "Whoosh", group: "Movement", short: "swings & throws", about: "Swings, throws, dashes and fast fly-bys.", fn: whoosh },
    { id: 3, key: "Squeak", name: "Squeak", group: "Squishy & body", short: "rubber toys", about: "Rubber toys, squeaky shoes and silly squeezes.", fn: squeak },
    { id: 4, key: "Yelp", name: "Yelp", group: "Voices", short: "cartoon voices", about: "Cartoon voices: ouch, wahoo and panic.", fn: yelp },
    { id: 5, key: "Pop", name: "Pop", group: "Squishy & body", short: "bubbles & corks", about: "Bubbles, corks, balloons and plucks.", fn: pop },
    { id: 6, key: "Splat", name: "Splat", group: "Squishy & body", short: "pies & goo", about: "Pies, goo, mud and belly flops.", fn: splat },
    { id: 7, key: "SlideWhistle", name: "Slide Whistle", group: "Musical stings", short: "falls & jumps", about: "Cartoon falls, jumps and wobbles.", fn: slideWhistle },
    { id: 8, key: "Punch", name: "Punch", group: "Hits & crashes", short: "hits & bonks", about: "Punches, bonks, slaps and frying pans.", fn: punch },
    { id: 9, key: "Jingle", name: "Jingle", group: "Musical stings", short: "coins & ta-da", about: "Coins, dings, ta-da and sad trombones.", fn: jingle },
    { id: 10, key: "Bonk", name: "Bonk", group: "Hits & crashes", short: "heads & coconuts", about: "Hollow bonks: heads, coconuts and mallets.", fn: bonk },
    { id: 11, key: "Clang", name: "Clang", group: "Hits & crashes", short: "metal & lids", about: "Metal pipes, bin lids and anvils.", fn: clang },
    { id: 12, key: "Crash", name: "Crash", group: "Hits & crashes", short: "junk piles", about: "A pile of junk, tin cans or boxes tumbling down.", fn: crash },
    { id: 13, key: "WoodKnock", name: "Wood Knock", group: "Hits & crashes", short: "doors & blocks", about: "Door knocks, wood blocks and hollow logs.", fn: woodKnock },
    { id: 14, key: "Twang", name: "Twang", group: "Springs & wobbles", short: "rulers & bands", about: "A ruler on a desk, rubber bands and diving boards.", fn: twang },
    { id: 15, key: "JellyWobble", name: "Jelly Wobble", group: "Springs & wobbles", short: "jelly & jiggles", about: "Wobbling jelly, jiggling bellies and blobs.", fn: jellyWobble },
    { id: 16, key: "Zip", name: "Zip", group: "Movement", short: "zippers & zip-aways", about: "Zippers and quick cartoon zip-aways.", fn: zip },
    { id: 17, key: "Propeller", name: "Propeller", group: "Movement", short: "props & spins", about: "Propeller hats, little planes, spin-ups and wind-downs.", fn: propeller },
    { id: 18, key: "Tiptoe", name: "Tiptoe", group: "Movement", short: "sneaky steps", about: "Sneaking on tiptoe: soft taps and plucked steps.", fn: tiptoe },
    { id: 19, key: "Scurry", name: "Scurry", group: "Movement", short: "running feet", about: "Little feet scurrying and running away.", fn: scurry },
    { id: 20, key: "Squelch", name: "Squelch", group: "Squishy & body", short: "mud & goo", about: "Boots in mud, wet socks and sticky goo.", fn: squelch },
    { id: 21, key: "Bloop", name: "Bloop", group: "Squishy & body", short: "bubbles & blips", about: "Round underwater bloops and bubbly blips.", fn: bloop },
    { id: 22, key: "Raspberry", name: "Raspberry", group: "Squishy & body", short: "whoopee & toots", about: "Whoopee cushions, blown raspberries and toots.", fn: raspberry },
    { id: 23, key: "Gulp", name: "Gulp", group: "Squishy & body", short: "swallows & glugs", about: "Nervous gulps, swallows and glug-glugs.", fn: gulp },
    { id: 24, key: "Snore", name: "Snore", group: "Squishy & body", short: "sleepy snores", about: "Rattly snores, little snores and whistling breaths out.", fn: snore },
    { id: 25, key: "Babble", name: "Babble", group: "Voices", short: "gibberish chatter", about: "Made-up gibberish chatter: grumbles, jabber and tiny voices.", fn: babble },
    { id: 26, key: "SadTrombone", name: "Sad Trombone", group: "Musical stings", short: "fail stings", about: "Wah, wah, wah, waaah: the brass fail sting.", fn: sadTrombone },
    { id: 27, key: "Kazoo", name: "Kazoo", group: "Musical stings", short: "buzzy tunes", about: "A buzzy kazoo playing a little tune.", fn: kazoo },
    { id: 28, key: "Honk", name: "Honk", group: "Musical stings", short: "clown & bike horns", about: "Clown horns, bike horns and squashy honks.", fn: honk },
    { id: 29, key: "Rimshot", name: "Rimshot", group: "Musical stings", short: "punchlines", about: "Ba-dum-tss: drums and a cymbal after the joke.", fn: rimshot },
    { id: 30, key: "XylophoneRun", name: "Xylophone Run", group: "Musical stings", short: "xylo & marimba runs", about: "Quick runs up and down a xylophone or marimba.", fn: xylophoneRun },
    { id: 31, key: "HarpGlide", name: "Harp Glide", group: "Musical stings", short: "dreamy glides", about: "Harp glides for dreams, flashbacks and magic moments.", fn: harpGlide },
    { id: 32, key: "Fanfare", name: "Fanfare", group: "Musical stings", short: "ta-da & victory", about: "Brass ta-das and victory fanfares, grand or wonky.", fn: fanfare },
    { id: 33, key: "DrumRoll", name: "Drum Roll", group: "Musical stings", short: "rolls & reveals", about: "Snare rolls building up to the big reveal.", fn: drumRoll },
    { id: 34, key: "Birdies", name: "Birdies", group: "Musical stings", short: "dizzy birds", about: "Little birds tweeting round a dizzy head, with stars.", fn: birdies },
    { id: 35, key: "Sparkle", name: "Sparkle", group: "Magic & tech", short: "magic twinkles", about: "Magic twinkles, fairy dust and shimmering chimes.", fn: sparkle },
    { id: 36, key: "Poof", name: "Poof", group: "Magic & tech", short: "puffs of smoke", about: "Puffs of smoke: vanish, appear and quick disguises.", fn: poof },
    { id: 37, key: "Zap", name: "Zap", group: "Magic & tech", short: "zaps & lasers", about: "Electric zaps, toy ray guns and shocks.", fn: zap },
    { id: 38, key: "PowerUp", name: "Power Up / Down", group: "Magic & tech", short: "level ups", about: "Rising power-ups and falling power-downs, smooth or stepped.", fn: powerUp, level: 0.7 },
    { id: 39, key: "Ratchet", name: "Ratchet", group: "Magic & tech", short: "wind-up clicks", about: "Wind-up keys, ratchets and clicking gears.", fn: ratchet },
    { id: 40, key: "KaChing", name: "Ka-ching", group: "Magic & tech", short: "cash & coins", about: "A till drawer, a bell and a spill of coins.", fn: kaChing },
    { id: 41, key: "AlarmRing", name: "Alarm Ring", group: "Magic & tech", short: "bells & alarms", about: "Wind-up alarm clocks and ringing bells.", fn: alarmRing, level: 0.85 },
  ];
  const TYPE_BY_KEY = Object.fromEntries(TYPES.map((t) => [t.key, t]));

  /** Slider labels, end words and a tip per type (same words as the Unity Sound Designer). */
  const HINTS = {
    pitch: { Boing: "How high the spring sings.", Thud: "Big and heavy, or small and light.", Whoosh: "Low rush or high whistle.", Squeak: "How high the squeak is.", Yelp: "Deep voice or a tiny one.", Pop: "Big pop or a tiny one.", Splat: "Big heavy splat or a small one.", SlideWhistle: "The middle note of the slide.", Punch: "Heavy hit or a light tap.", Jingle: "The first note.", Bonk: "Big hollow head or a small coconut.", Clang: "Big heavy metal or a small bell-like clink.", Crash: "Big heavy junk or small tin cans.", WoodKnock: "Low door or a high wood block.", Twang: "How low the ruler or band sings.", JellyWobble: "Big jelly or a small wobble.", Zip: "Low zip or a high zip.", Propeller: "How fast the blades spin.", Tiptoe: "The note of the steps.", Scurry: "Big feet or tiny paws.", Squelch: "Deep mud or a small squish.", Bloop: "Deep bloop or a tiny blip.", Raspberry: "Deep, rumbly toot or a high little one.", Gulp: "Big throat or a small one.", Snore: "Deep rumble or a little nose snore.", Babble: "Deep voice or a tiny one.", SadTrombone: "The key of the sad notes.", Kazoo: "The key of the tune.", Honk: "Big horn or a small squeaky one.", Rimshot: "How the drums are tuned.", XylophoneRun: "Where the run sits: low marimba or high xylophone.", HarpGlide: "Low strings or high sparkly ones.", Fanfare: "The key of the fanfare.", DrumRoll: "How the snare is tuned.", Birdies: "How high the birds tweet." , Sparkle: "Low chimes or high glitter.", Poof: "Deep puff or a small one.", Zap: "Where the zap starts: low buzz or high laser.", PowerUp: "The starting note.", Ratchet: "Big gears or a tiny wind-up key.", KaChing: "How high the bell rings.", AlarmRing: "Big bell or a small, shrill one."},
    length: { Boing: "How long it keeps wobbling.", Thud: "How long the body rings.", Whoosh: "Quick swipe or a long fly-by.", Squeak: "Quick squeak or a long squeeze.", Yelp: "Short yip or a long cry.", Pop: "Dry click or a ringing bubble.", Splat: "Quick slap or a long squelch.", SlideWhistle: "How long the slide takes.", Punch: "Snappy, or a long ring (frying pans).", Jingle: "How long each note is.", Bonk: "Dry bonk or a ringing one.", Clang: "How long the metal rings.", Crash: "How long the pile keeps falling.", WoodKnock: "How long each knock rings.", Twang: "How long it keeps vibrating.", JellyWobble: "How long it keeps wobbling.", Zip: "Quick zip or a long one.", Propeller: "How long it spins.", Tiptoe: "Time between steps.", Scurry: "How long they keep running.", Squelch: "Quick squish or a long, slow suck.", Bloop: "Quick blip or a ringing bloop.", Raspberry: "Quick toot or a long deflate.", Gulp: "Quick gulp or a slow swallow.", Snore: "Length of each breath.", Babble: "How long they keep talking.", SadTrombone: "How slowly the notes fall.", Kazoo: "How long each note is.", Honk: "Quick toot or a long honk.", Rimshot: "Tempo, and how long the cymbal rings.", XylophoneRun: "Quick run or a slow one.", HarpGlide: "How long the glide takes.", Fanfare: "Tempo, and how long the big chord holds.", DrumRoll: "How long the roll lasts.", Birdies: "How long the birds keep circling." , Sparkle: "Quick twinkle or a long shimmer.", Poof: "Quick puff or smoke that hangs around.", Zap: "Quick zap or a long, falling beam.", PowerUp: "How long the climb takes.", Ratchet: "How long you keep winding.", KaChing: "How long the bell rings.", AlarmRing: "How long each ring lasts."},
    squishiness: { Boing: "Rubbery pitch drop at the start and a fatter tone.", Thud: "Hard knock, or soft cushion.", Whoosh: "Sharp whistle, or soft and airy.", Squeak: "Clean toy, or raspy rubber chicken.", Yelp: "Steady, or wobbly and breathy.", Pop: "How much the pitch rises (wet bubble).", Splat: "How gooey: more bubbles and squelch.", Punch: "Bare hand, or a padded glove.", Bonk: "Hollow and woody, or a soft rubber mallet.", Clang: "Free ringing, or a hand muffling it.", Crash: "Hard metal junk, or soft boxes and cardboard.", WoodKnock: "Hard knuckles, or soft and padded.", Twang: "Stiff ruler, or a saggy rubber band.", JellyWobble: "Firm, or wet and squelchy.", Zip: "Clicky zipper teeth, or a smooth cartoon zip.", Tiptoe: "Hard heels, or soft socks.", Scurry: "Hard shoes, or soft paws.", Squelch: "Thick and sticky, or very wet and bubbly.", Bloop: "How far the pitch rises (rounder, wetter bloop).", Raspberry: "Dry buzz, or wet and splattery.", Gulp: "Dry gulp, or wet and gurgly.", Snore: "Rattly snore, or soft and airy.", Honk: "Sharp toot, or a squashy rubber bulb that sags.", Rimshot: "Tight drums, or loose and boomy.", DrumRoll: "Tight snare, or loose and rattly.", Birdies: "Clean whistles, or warbly trills." , Poof: "Sharp pop of smoke, or a soft, slow puff.", Ratchet: "Hard metal clicks, or soft plastic ones.", AlarmRing: "Clean bell, or tinny and rattly."},
    bounce: { Boing: "How much the pitch wobbles.", Thud: "Number of rebounds, like a ball bouncing to a stop.", Whoosh: "Spinning pulses.", Squeak: "Number of squeaks (1 to 4).", Yelp: "Number of syllables (1 to 3).", Pop: "Number of pops (1 to 5), like bubble wrap.", Splat: "Drips falling afterwards (0 to 4).", SlideWhistle: "Wobble in the note.", Punch: "Number of hits (1 to 3).", Jingle: "Number of notes (1 to 6).", Bonk: "Bounces after the hit (1 to 4 bonks).", Clang: "Bounces, like a lid rattling down (1 to 5 hits).", Crash: "How many bits keep falling and rolling.", WoodKnock: "Number of knocks (1 to 5).", Twang: "Rattle against the desk.", JellyWobble: "Wobble speed.", Zip: "Number of zips (1 to 3).", Propeller: "How choppy the blades sound.", Tiptoe: "Number of steps (2 to 8).", Scurry: "How fast the feet go.", Squelch: "Number of squelches (1 to 4), like steps in mud.", Bloop: "Number of bloops (1 to 5), a bubbly little tune.", Raspberry: "Smooth, or breaks into sputtery puffs.", Gulp: "Number of gulps (1 to 4).", Snore: "Number of snores (1 to 3).", Babble: "Talking speed.", SadTrombone: "Wobble on the last note.", Kazoo: "Number of notes (1 to 8).", Honk: "Number of honks (1 to 4).", Rimshot: "Drum hits before the cymbal: dum-tss, ba-dum-tss, ba-da-dum-tss.", XylophoneRun: "Number of notes (4 to 16).", HarpGlide: "Number of strings (6 to 24).", Fanfare: "Pick-up notes before the big chord (0 to 4).", DrumRoll: "Ending: just the roll, a final hit, or a hit and a crash.", Birdies: "Number of birds (1 to 4)." , Sparkle: "How many twinkles.", Poof: "Number of puffs (1 to 3).", Zap: "Number of zaps (1 to 4).", PowerUp: "Smooth slide, or steps like a level-up.", Ratchet: "How fast the clicks go.", KaChing: "Number of dings (1 to 3).", AlarmRing: "Number of rings (1 to 4)."},
    brightness: { Boing: "Adds a metallic twang.", Thud: "Dull and muffled, or a crisp knock.", Whoosh: "How far the pitch rises and how much hiss.", Squeak: "Smooth whistle, or reedy and buzzy.", Yelp: "Vowel: 'oo' to 'ah' to 'eh'.", Pop: "How much click is in the pop.", Splat: "Muffled, or wet and sizzly.", SlideWhistle: "Pure, or breathy.", Punch: "Dull thump, or a sharp slap. Hard and bright hits ring like metal.", Jingle: "Soft bell, or retro game beeps.", Bonk: "Dull thunk, or a sharp click.", Clang: "Dark gong, or bright and shimmery.", Crash: "Muffled, or crisp and rattly.", WoodKnock: "Soft, or a sharp crack.", Twang: "Dull, or buzzy and bright.", JellyWobble: "Muffled, or bright and wah-like.", Zip: "Pure, or buzzy.", Propeller: "Low hum, or a high whirr.", Tiptoe: "Taps, or plucked notes (pizzicato).", Scurry: "Dull, or crisp and clicky.", Squelch: "Muffled, or wet and sizzly.", Bloop: "Pure, or a fuller, buzzier bloop.", Raspberry: "Dull, or buzzy and bright.", Gulp: "Deep throat, or a clicky gulp.", Snore: "Plain breath out, or a whistle on the way out.", Babble: "Muffled through a wall, or clear and bright.", SadTrombone: "Mellow, or brassy and bright.", Kazoo: "Soft hum, or very buzzy.", Honk: "Mellow, or loud and blaring.", Rimshot: "Dark cymbal, or bright and splashy.", XylophoneRun: "Soft marimba, or hard bright xylophone.", HarpGlide: "Soft, or bright and sparkly.", Fanfare: "Mellow horns, or blaring trumpets.", DrumRoll: "Dark, or crisp and bright.", Birdies: "Just tweets, or tweets with twinkly stars." , Sparkle: "Soft chimes, or bright and glassy.", Poof: "Muffled, or hissy.", Zap: "Dark buzz, or bright and fizzy.", PowerUp: "Soft and round, or buzzy like an old game.", Ratchet: "Dull, or crisp and ringing.", KaChing: "Soft bell, or bright and shiny.", AlarmRing: "Dull bell, or bright and piercing."},
  };
  const SLIDERS = ["pitch", "length", "squishiness", "bounce", "brightness", "randomness", "volume"];

  function sliderInfo(key, typeKey) {
    switch (key) {
      case "pitch": return { label: "Pitch", from: "Low", to: "High", hint: HINTS.pitch[typeKey] || "" };
      case "length": return { label: "Length", from: "Short", to: "Long", hint: HINTS.length[typeKey] || "" };
      case "squishiness":
        if (typeKey === "SlideWhistle") return { label: "Direction", from: "Falls", to: "Rises", hint: "Slides down, up then down, or up." };
        if (typeKey === "Jingle") return { label: "Mood", from: "Happy", to: "Sad", hint: "Rising happy notes, or a falling, wobbly sad ending." };
        if (typeKey === "Propeller") return { label: "Direction", from: "Winds down", to: "Spins up", hint: "Winds down, steady fly-by in the middle, or spins up." };
        if (typeKey === "Babble") return { label: "Mood", from: "Calm", to: "Excited", hint: "Flat, calm chatter or wild, excited jabber." };
        if (typeKey === "SadTrombone") return { label: "Wah", from: "Open", to: "Plunger", hint: "Plain brass notes, or a plunger mute going wah on every note." };
        if (typeKey === "Kazoo") return { label: "Slides", from: "Clean", to: "Scoopy", hint: "Clean notes, or scooping and sliding between them." };
        if (typeKey === "XylophoneRun") return { label: "Direction", from: "Falls", to: "Rises", hint: "Runs down, up then down, or up." };
        if (typeKey === "HarpGlide") return { label: "Direction", from: "Falls", to: "Rises", hint: "Glides down, up then down, or up." };
        if (typeKey === "Sparkle") return { label: "Glitter", from: "Chimes", to: "Glittery", hint: "Clean little chimes, or a wash of glittery shimmer." };
        if (typeKey === "Zap") return { label: "Crackle", from: "Clean", to: "Crackly", hint: "A clean toy laser, or a crackling electric shock." };
        if (typeKey === "PowerUp") return { label: "Direction", from: "Powers down", to: "Powers up", hint: "Falls (power down), up then down in the middle, or rises (power up)." };
        if (typeKey === "KaChing") return { label: "Coins", from: "Just the bell", to: "Lots of coins", hint: "Only the till bell, or a big spill of coins after it." };
        if (typeKey === "Fanfare") return { label: "Silliness", from: "Grand", to: "Wonky", hint: "A proud, in-tune fanfare, or wobbly horns with one going flat." };
        return { label: "Squishiness", from: "Tight", to: "Squishy", hint: HINTS.squishiness[typeKey] || "" };
      case "bounce": return { label: "Bounce", from: "Still", to: "Bouncy", hint: HINTS.bounce[typeKey] || "" };
      case "brightness": return { label: "Brightness", from: "Dark", to: "Bright", hint: HINTS.brightness[typeKey] || "" };
      case "randomness": return { label: "Randomness", from: "Steady", to: "Wild", hint: "How much each take varies. Use Variation to roll a new take." };
      default: return { label: "Volume", from: "Quiet", to: "Loud", hint: "How loud the saved file is. Full volume peaks just under the maximum." };
    }
  }

  //  name, description, type, pitch, length, squish, bounce, bright, random, seed
  const PRESET_ROWS = [
    ["Spring Boing", "The classic cartoon spring.", "Boing", 0.45, 0.55, 0.35, 0.65, 0.55, 0.15, 11],
    ["Big Boing", "A huge, slow trampoline bounce.", "Boing", 0.12, 0.85, 0.55, 0.8, 0.35, 0.15, 12],
    ["Tiny Boing", "A small hop or a button press.", "Boing", 0.85, 0.2, 0.2, 0.45, 0.7, 0.1, 13],
    ["Door Stop", "A stiff spring flicked hard.", "Boing", 0.3, 0.6, 0.1, 0.95, 0.8, 0.1, 14],
    ["Body Fall", "A character landing flat on the floor.", "Thud", 0.2, 0.5, 0.6, 0.1, 0.3, 0.2, 21],
    ["Soft Thud", "A cushion, a sack or a gentle bump.", "Thud", 0.35, 0.35, 0.9, 0, 0.15, 0.15, 22],
    ["Wood Box", "A crate knocked over.", "Thud", 0.55, 0.3, 0.15, 0.15, 0.8, 0.2, 23],
    ["Bouncy Ball", "A rubber ball bouncing to a stop.", "Thud", 0.6, 0.4, 0.35, 0.9, 0.5, 0.2, 24],
    ["Fast Swing", "A quick swipe through the air.", "Whoosh", 0.55, 0.2, 0.4, 0.1, 0.6, 0.2, 31],
    ["Big Throw", "Something heavy flying past.", "Whoosh", 0.3, 0.6, 0.6, 0, 0.45, 0.2, 32],
    ["Spin", "A spinning, pulsing whoosh.", "Whoosh", 0.5, 0.7, 0.5, 0.75, 0.5, 0.15, 33],
    ["Dash", "A sharp, whistling dash.", "Whoosh", 0.8, 0.25, 0.1, 0, 0.8, 0.15, 34],
    ["Rubber Chicken", "Squeeze the rubber chicken.", "Squeak", 0.45, 0.6, 0.85, 0, 0.55, 0.2, 41],
    ["Toy Squeak", "A clean squeaky toy.", "Squeak", 0.65, 0.3, 0.25, 0, 0.6, 0.15, 42],
    ["Double Squeak", "Squeak-squeak.", "Squeak", 0.6, 0.45, 0.4, 0.35, 0.55, 0.2, 43],
    ["Shoe Squeak", "Trainers on a shiny floor.", "Squeak", 0.8, 0.2, 0.55, 0, 0.85, 0.25, 44],
    ["Ouch", "A short, surprised yelp.", "Yelp", 0.45, 0.25, 0.2, 0, 0.55, 0.2, 51],
    ["Wahoo", "A happy jump.", "Yelp", 0.55, 0.6, 0.3, 0.5, 0.7, 0.15, 52],
    ["Panic", "A wobbly, high-pitched panic.", "Yelp", 0.8, 0.8, 0.9, 0.3, 0.85, 0.2, 53],
    ["Oof", "Winded after a hard hit.", "Yelp", 0.2, 0.3, 0.6, 0, 0.2, 0.15, 54],
    ["Bubble", "A single bubble popping.", "Pop", 0.5, 0.35, 0.75, 0, 0.3, 0.15, 61],
    ["Cork", "A cork pulled out of a bottle.", "Pop", 0.3, 0.45, 0.4, 0, 0.7, 0.15, 62],
    ["Pluck", "A tight little pluck or click.", "Pop", 0.75, 0.15, 0.15, 0, 0.85, 0.1, 63],
    ["Pop Cluster", "A handful of pops, like bubble wrap.", "Pop", 0.55, 0.3, 0.5, 0.9, 0.6, 0.4, 64],
    ["Pie Splat", "A custard pie in the face.", "Splat", 0.45, 0.4, 0.55, 0, 0.55, 0.2, 71],
    ["Goo", "Thick slime, very bubbly.", "Splat", 0.3, 0.6, 0.95, 0.25, 0.3, 0.2, 72],
    ["Belly Flop", "A big wet landing.", "Splat", 0.15, 0.7, 0.4, 0.5, 0.6, 0.2, 73],
    ["Squish", "A small squelch underfoot.", "Splat", 0.65, 0.15, 0.7, 0, 0.35, 0.2, 74],
    ["Slide Up", "Whistling up for a jump.", "SlideWhistle", 0.5, 0.35, 1, 0, 0.2, 0.1, 81],
    ["Slide Down", "The long cartoon fall.", "SlideWhistle", 0.5, 0.75, 0, 0.1, 0.2, 0.1, 82],
    ["Up and Down", "Up, then back down.", "SlideWhistle", 0.55, 0.5, 0.5, 0, 0.25, 0.1, 83],
    ["Wobbly Fall", "A dizzy, wobbling fall.", "SlideWhistle", 0.45, 0.9, 0.1, 0.9, 0.3, 0.1, 84],
    ["Punch", "A solid cartoon punch.", "Punch", 0.35, 0.4, 0.35, 0, 0.45, 0.2, 91],
    ["Bonk", "A hollow bonk on the head.", "Punch", 0.65, 0.3, 0.6, 0, 0.3, 0.2, 92],
    ["Frying Pan", "Clang!", "Punch", 0.45, 0.7, 0.05, 0, 1, 0.15, 93],
    ["Double Hit", "One-two!", "Punch", 0.4, 0.35, 0.3, 0.5, 0.55, 0.25, 94],
    ["Coin", "Pick up a coin.", "Jingle", 0.75, 0.2, 0, 0.2, 0.85, 0, 101],
    ["Ta-Da", "Ta-da! You did it.", "Jingle", 0.45, 0.5, 0.1, 0.4, 0.55, 0, 102],
    ["Sad Trombone", "Wah, wah, wah, waaah.", "Jingle", 0.25, 0.7, 0.9, 0.6, 0.6, 0, 103],
    ["Ding", "A single bell.", "Jingle", 0.7, 0.5, 0, 0, 0, 0, 104],
    ["Head Bonk", "A hollow bonk on the noggin.", "Bonk", 0.45, 0.35, 0.4, 0.25, 0.5, 0.15, 111],
    ["Coconut", "Two coconut halves knocked together.", "Bonk", 0.6, 0.3, 0.15, 0, 0.7, 0.1, 112],
    ["Bonk Bonk Bonk", "Bonks and bounces off.", "Bonk", 0.5, 0.35, 0.35, 0.9, 0.55, 0.2, 113],
    ["Rubber Mallet", "A soft, rubbery whack.", "Bonk", 0.3, 0.4, 0.85, 0.1, 0.3, 0.15, 114],
    ["Bin Lid", "A metal lid dropped and rattling down.", "Clang", 0.45, 0.6, 0.1, 0.8, 0.7, 0.15, 121],
    ["Pipe Clang", "A metal pipe, ringing.", "Clang", 0.6, 0.75, 0.05, 0, 0.85, 0.1, 122],
    ["Anvil", "Heavy and solid.", "Clang", 0.25, 0.5, 0.25, 0, 0.6, 0.1, 123],
    ["Muffled Clank", "Metal hit with a hand on it.", "Clang", 0.4, 0.4, 0.8, 0.2, 0.4, 0.15, 124],
    ["Junk Pile", "A cupboard of junk falling out.", "Crash", 0.35, 0.6, 0.3, 0.6, 0.6, 0.3, 131],
    ["Tin Cans", "A stack of cans going over.", "Crash", 0.8, 0.45, 0.15, 0.7, 0.75, 0.3, 132],
    ["Big Avalanche", "Everything falls down. Everything.", "Crash", 0.25, 0.85, 0.35, 0.85, 0.55, 0.35, 133],
    ["Box Tumble", "Cardboard boxes tumbling.", "Crash", 0.4, 0.35, 0.85, 0.3, 0.4, 0.3, 134],
    ["Knock Knock", "Two knocks on a door.", "WoodKnock", 0.45, 0.35, 0.35, 0.25, 0.5, 0.15, 141],
    ["Wood Block", "A bright, clean wood block.", "WoodKnock", 0.7, 0.25, 0.05, 0, 0.7, 0.1, 142],
    ["Impatient Knock", "Knock-knock-knock-knock-knock!", "WoodKnock", 0.4, 0.3, 0.4, 1, 0.5, 0.2, 143],
    ["Hollow Log", "A deep, hollow knock.", "WoodKnock", 0.2, 0.6, 0.2, 0, 0.4, 0.1, 144],
    ["Desk Ruler", "A ruler twanged on the edge of a desk.", "Twang", 0.35, 0.55, 0.05, 0.75, 0.6, 0.15, 151],
    ["Rubber Band", "A stretched band, let go.", "Twang", 0.55, 0.35, 0.85, 0.2, 0.45, 0.15, 152],
    ["Jaw Harp", "A buzzy, boingy twang.", "Twang", 0.25, 0.7, 0.3, 0.4, 0.85, 0.1, 153],
    ["Diving Board", "A big, slow springy board.", "Twang", 0.15, 0.8, 0.5, 0.55, 0.4, 0.15, 154],
    ["Jelly", "A plate of jelly, wobbling.", "JellyWobble", 0.4, 0.6, 0.6, 0.5, 0.45, 0.15, 161],
    ["Belly Jiggle", "A big belly, jiggling.", "JellyWobble", 0.15, 0.5, 0.4, 0.35, 0.3, 0.15, 162],
    ["Wobbly Blob", "A slow, squelchy blob.", "JellyWobble", 0.3, 0.85, 0.9, 0.25, 0.4, 0.2, 163],
    ["Wiggle", "A quick, bright wiggle.", "JellyWobble", 0.65, 0.35, 0.3, 0.85, 0.6, 0.15, 164],
    ["Zipper Up", "Doing up a zipper.", "Zip", 0.5, 0.4, 0.1, 0, 0.6, 0.15, 171],
    ["Zip Away", "Gone in a flash.", "Zip", 0.6, 0.2, 0.95, 0, 0.5, 0.1, 172],
    ["Zip-Zip", "Zipping here and there.", "Zip", 0.55, 0.45, 0.85, 0.5, 0.6, 0.15, 173],
    ["Coat Zipper", "A big zipper, up and down.", "Zip", 0.35, 0.6, 0, 0.5, 0.4, 0.2, 174],
    ["Propeller Hat", "A little propeller on a hat.", "Propeller", 0.7, 0.5, 0.5, 0.6, 0.5, 0.15, 181],
    ["Spin Up", "Winding up for take-off.", "Propeller", 0.5, 0.6, 1, 0.7, 0.5, 0.1, 182],
    ["Wind Down", "Spinning down to a stop.", "Propeller", 0.5, 0.7, 0, 0.7, 0.45, 0.1, 183],
    ["Little Plane", "A toy plane buzzing past.", "Propeller", 0.35, 0.8, 0.5, 0.35, 0.65, 0.15, 184],
    ["Sneaky Steps", "Tiptoeing past the guard.", "Tiptoe", 0.5, 0.45, 0.4, 0.5, 0.75, 0.1, 191],
    ["Soft Socks", "Quiet steps in socks.", "Tiptoe", 0.4, 0.4, 0.85, 0.5, 0.1, 0.15, 192],
    ["Tippy Tap", "Quick little taps.", "Tiptoe", 0.65, 0.25, 0.25, 0.85, 0.4, 0.15, 193],
    ["Pizzicato Creep", "Plucked notes for creeping.", "Tiptoe", 0.4, 0.55, 0.3, 0.7, 1, 0.1, 194],
    ["Mouse Scurry", "Tiny paws, very fast.", "Scurry", 0.75, 0.45, 0.4, 0.75, 0.6, 0.25, 201],
    ["Run Away", "Legs spinning, off they go.", "Scurry", 0.45, 0.7, 0.3, 0.6, 0.5, 0.25, 202],
    ["Clatter Feet", "Hard shoes on a hard floor.", "Scurry", 0.4, 0.5, 0.05, 0.55, 0.75, 0.25, 203],
    ["Pitter Patter", "Soft little feet.", "Scurry", 0.6, 0.35, 0.7, 0.4, 0.4, 0.2, 204],
    ["Muddy Boot", "A boot pulled out of thick mud.", "Squelch", 0.35, 0.55, 0.4, 0, 0.4, 0.15, 211],
    ["Wet Sock", "Stepping in a puddle with socks on.", "Squelch", 0.6, 0.3, 0.8, 0, 0.5, 0.15, 212],
    ["Slime Steps", "Squelching along through goo.", "Squelch", 0.45, 0.35, 0.7, 0.85, 0.45, 0.25, 213],
    ["Plunger", "A sink plunger pulled free.", "Squelch", 0.25, 0.7, 0.3, 0, 0.3, 0.1, 214],
    ["Bloop", "A round cartoon bloop.", "Bloop", 0.4, 0.4, 0.5, 0, 0.3, 0.1, 221],
    ["Underwater Blip", "A small blip under the water.", "Bloop", 0.7, 0.2, 0.3, 0, 0.15, 0.1, 222],
    ["Bubble Tune", "A bubbly little tune.", "Bloop", 0.5, 0.3, 0.6, 1, 0.35, 0.15, 223],
    ["Fish Kiss", "A wet little kiss.", "Bloop", 0.6, 0.15, 0.9, 0.25, 0.5, 0.15, 224],
    ["Whoopee Cushion", "Someone sat on it.", "Raspberry", 0.3, 0.5, 0.5, 0.2, 0.45, 0.2, 231],
    ["Blow a Raspberry", "Pfffbbbt!", "Raspberry", 0.55, 0.45, 0.8, 0.1, 0.6, 0.2, 232],
    ["Tiny Toot", "A short, polite little toot.", "Raspberry", 0.7, 0.12, 0.3, 0, 0.4, 0.15, 233],
    ["Sputter", "Breaking up into puffs.", "Raspberry", 0.35, 0.7, 0.6, 0.8, 0.5, 0.25, 234],
    ["Nervous Gulp", "Uh-oh. Gulp.", "Gulp", 0.5, 0.4, 0.3, 0, 0.45, 0.15, 241],
    ["Glug Glug", "Drinking it all down.", "Gulp", 0.4, 0.25, 0.6, 0.85, 0.45, 0.2, 242],
    ["Swallow", "A soft, quiet swallow.", "Gulp", 0.6, 0.3, 0.15, 0, 0.25, 0.1, 243],
    ["Deep Gulp", "A big, wet, slow gulp.", "Gulp", 0.15, 0.7, 0.7, 0, 0.35, 0.15, 244],
    ["Big Snore", "A deep, rattly snore.", "Snore", 0.2, 0.6, 0.15, 0, 0.2, 0.15, 251],
    ["Little Snore", "A small nose snore.", "Snore", 0.7, 0.3, 0.5, 0, 0.3, 0.15, 252],
    ["Whistle Snore", "Snore in, whistle out.", "Snore", 0.4, 0.5, 0.3, 0, 0.9, 0.15, 253],
    ["Snore Cycle", "Fast asleep, snore after snore.", "Snore", 0.3, 0.45, 0.25, 1, 0.6, 0.2, 254],
    ["Chatter", "Friendly gibberish chatter.", "Babble", 0.45, 0.45, 0.4, 0.5, 0.55, 0.2, 261],
    ["Excited Jabber", "Talking fast about something amazing.", "Babble", 0.55, 0.55, 0.95, 0.85, 0.65, 0.25, 262],
    ["Grumble", "A low, grumpy mutter.", "Babble", 0.12, 0.5, 0.15, 0.35, 0.3, 0.2, 263],
    ["Tiny Chatter", "Little creatures chattering.", "Babble", 0.95, 0.4, 0.6, 1, 0.7, 0.25, 264],
    ["Wah Wah Waah", "The classic fail sting.", "SadTrombone", 0.4, 0.5, 0.75, 0.6, 0.5, 0.05, 271],
    ["Big Fail", "Slow, low and very sad.", "SadTrombone", 0.15, 0.85, 0.85, 0.9, 0.45, 0.05, 272],
    ["Tiny Fail", "A quick little letdown.", "SadTrombone", 0.75, 0.2, 0.6, 0.3, 0.6, 0.05, 273],
    ["Muted Fail", "Plain brass, no wah.", "SadTrombone", 0.4, 0.5, 0.05, 0.5, 0.3, 0.05, 274],
    ["Kazoo Ditty", "A buzzy little tune.", "Kazoo", 0.45, 0.3, 0.3, 0.85, 0.6, 0.1, 281],
    ["Kazoo Toot", "One proud kazoo note.", "Kazoo", 0.5, 0.5, 0.4, 0, 0.6, 0.1, 282],
    ["Wobbly Kazoo", "Sliding all over the place.", "Kazoo", 0.4, 0.4, 0.95, 0.5, 0.75, 0.2, 283],
    ["Kazoo Fanfare", "Ta-da, on a kazoo.", "Kazoo", 0.55, 0.25, 0.15, 0.3, 0.9, 0.05, 284],
    ["Clown Horn", "Squeeze the clown's horn.", "Honk", 0.45, 0.35, 0.5, 0, 0.6, 0.1, 291],
    ["Bike Horn", "A small bicycle horn.", "Honk", 0.75, 0.25, 0.3, 0, 0.7, 0.1, 292],
    ["Honk Honk", "Honk, honk!", "Honk", 0.5, 0.25, 0.4, 0.4, 0.65, 0.15, 293],
    ["Squashed Horn", "A horn running out of air.", "Honk", 0.35, 0.6, 1, 0, 0.45, 0.15, 294],
    ["Ba-Dum-Tss", "After the joke.", "Rimshot", 0.5, 0.4, 0.3, 0.5, 0.55, 0.05, 301],
    ["Dum-Tss", "A quick one-two.", "Rimshot", 0.5, 0.3, 0.3, 0, 0.6, 0.05, 302],
    ["Big Punchline", "Slow, loose and splashy.", "Rimshot", 0.35, 0.8, 0.6, 1, 0.75, 0.05, 303],
    ["Quick Joke", "Tight and snappy.", "Rimshot", 0.65, 0.1, 0.1, 0.5, 0.45, 0.05, 304],
    ["Xylo Up", "A bright run up.", "XylophoneRun", 0.45, 0.3, 1, 0.5, 0.8, 0.05, 311],
    ["Xylo Down", "A bright run down.", "XylophoneRun", 0.55, 0.3, 0, 0.5, 0.8, 0.05, 312],
    ["Up and Over", "Up the bars and back down.", "XylophoneRun", 0.5, 0.25, 0.5, 0.9, 0.7, 0.05, 313],
    ["Marimba Roll", "A soft, slow marimba run.", "XylophoneRun", 0.15, 0.6, 1, 0.3, 0.15, 0.05, 314],
    ["Harp Up", "A dreamy glide up.", "HarpGlide", 0.4, 0.5, 1, 0.6, 0.5, 0.05, 321],
    ["Harp Down", "A glide back down.", "HarpGlide", 0.4, 0.5, 0, 0.6, 0.5, 0.05, 322],
    ["Flashback", "Up and down: going back in time.", "HarpGlide", 0.35, 0.85, 0.5, 1, 0.45, 0.05, 323],
    ["Quick Strum", "A short, bright sweep.", "HarpGlide", 0.55, 0.15, 1, 0.2, 0.75, 0.05, 324],
    ["Ta-Da!", "One pick-up and the big chord.", "Fanfare", 0.45, 0.35, 0.1, 0.25, 0.65, 0.05, 331],
    ["Royal Fanfare", "Ta-ta-ta-daaa!", "Fanfare", 0.4, 0.6, 0.05, 0.75, 0.8, 0.05, 332],
    ["Wonky Fanfare", "Proud, but not quite in tune.", "Fanfare", 0.45, 0.5, 0.9, 0.75, 0.6, 0.1, 333],
    ["Victory", "A long, warm win.", "Fanfare", 0.3, 0.85, 0.2, 0.5, 0.45, 0.05, 334],
    ["Drum Roll", "A roll with a final hit.", "DrumRoll", 0.5, 0.45, 0.4, 0.5, 0.55, 0.1, 341],
    ["Big Reveal", "A long build to a hit and a crash.", "DrumRoll", 0.45, 0.75, 0.45, 1, 0.65, 0.1, 342],
    ["Long Roll", "Just the roll, building up.", "DrumRoll", 0.5, 0.9, 0.3, 0, 0.5, 0.1, 343],
    ["Nervous Roll", "A short, tight roll.", "DrumRoll", 0.7, 0.2, 0.1, 0.5, 0.7, 0.1, 344],
    ["Seeing Stars", "Birds and twinkly stars after a bonk.", "Birdies", 0.5, 0.5, 0.3, 0.35, 0.75, 0.2, 351],
    ["Dizzy Birds", "A flock circling a dizzy head.", "Birdies", 0.55, 0.65, 0.4, 0.9, 0.3, 0.2, 352],
    ["One Little Bird", "A single bird tweeting.", "Birdies", 0.6, 0.4, 0.15, 0, 0, 0.15, 353],
    ["Warbly Birds", "Trilling and warbling.", "Birdies", 0.45, 0.6, 0.9, 0.6, 0.2, 0.2, 354],
    ["Fairy Dust", "A sprinkle of magic.", "Sparkle", 0.6, 0.45, 0.4, 0.5, 0.7, 0.2, 361],
    ["Twinkle", "A quick little twinkle.", "Sparkle", 0.75, 0.15, 0.1, 0.2, 0.6, 0.15, 362],
    ["Magic Shimmer", "A long, glittery shimmer.", "Sparkle", 0.5, 0.85, 0.85, 0.75, 0.75, 0.2, 363],
    ["Wish Granted", "Soft chimes, full of wonder.", "Sparkle", 0.35, 0.6, 0.2, 0.6, 0.35, 0.15, 364],
    ["Vanish", "Gone in a puff of smoke.", "Poof", 0.4, 0.4, 0.3, 0, 0.55, 0.15, 371],
    ["Smoke Bomb", "A big, slow cloud.", "Poof", 0.2, 0.85, 0.7, 0, 0.4, 0.15, 372],
    ["Quick Change", "Poof-poof: a new outfit.", "Poof", 0.55, 0.25, 0.25, 0.6, 0.65, 0.2, 373],
    ["Soft Puff", "A gentle little puff.", "Poof", 0.6, 0.3, 0.95, 0, 0.25, 0.1, 374],
    ["Ray Gun", "A toy ray gun.", "Zap", 0.6, 0.3, 0.1, 0, 0.6, 0.1, 381],
    ["Static Shock", "Touched the door handle.", "Zap", 0.75, 0.1, 0.85, 0, 0.8, 0.2, 382],
    ["Pew Pew", "Two quick laser shots.", "Zap", 0.7, 0.15, 0.2, 0.35, 0.7, 0.1, 383],
    ["Big Zap", "A long, crackling shock.", "Zap", 0.35, 0.75, 0.7, 0, 0.5, 0.2, 384],
    ["Power Up", "A smooth rise: stronger!", "PowerUp", 0.4, 0.45, 1, 0, 0.35, 0.05, 391],
    ["Power Down", "Running out of steam.", "PowerUp", 0.5, 0.55, 0, 0, 0.35, 0.05, 392],
    ["Level Up", "A stepped climb, old-game style.", "PowerUp", 0.45, 0.4, 1, 0.55, 0.8, 0.05, 393],
    ["Bounce Back", "Up, then back down.", "PowerUp", 0.4, 0.35, 0.5, 0.3, 0.55, 0.05, 394],
    ["Wind-Up Key", "Winding up a toy.", "Ratchet", 0.5, 0.5, 0.3, 0.35, 0.55, 0.2, 401],
    ["Fast Crank", "Cranking as fast as you can.", "Ratchet", 0.4, 0.6, 0.15, 0.9, 0.6, 0.2, 402],
    ["Plastic Clicks", "A cheap plastic dial.", "Ratchet", 0.7, 0.3, 0.85, 0.5, 0.5, 0.2, 403],
    ["Big Gears", "Slow, heavy clicks.", "Ratchet", 0.15, 0.7, 0.2, 0.15, 0.4, 0.15, 404],
    ["Ka-ching!", "The till opens. Money!", "KaChing", 0.5, 0.5, 0.35, 0, 0.6, 0.1, 411],
    ["Jackpot", "Bells and a pile of coins.", "KaChing", 0.55, 0.7, 1, 1, 0.75, 0.15, 412],
    ["Just the Bell", "A plain till bell.", "KaChing", 0.45, 0.4, 0, 0, 0.5, 0.05, 413],
    ["Double Ding", "Ding-ding, coins in.", "KaChing", 0.6, 0.35, 0.5, 0.5, 0.65, 0.1, 414],
    ["Wake Up!", "The old alarm clock.", "AlarmRing", 0.5, 0.55, 0.3, 0, 0.6, 0.1, 421],
    ["School Bell", "A long ring down the hall.", "AlarmRing", 0.3, 0.9, 0.1, 0, 0.45, 0.05, 422],
    ["Rattly Clock", "A cheap, tinny alarm.", "AlarmRing", 0.65, 0.4, 0.85, 0.35, 0.7, 0.15, 423],
    ["Snooze Again", "Ring, stop, ring, stop.", "AlarmRing", 0.5, 0.3, 0.3, 1, 0.55, 0.1, 424],
  ];
  const PRESETS = PRESET_ROWS.map(([name, description, type, pitch, length, squishiness, bounce, brightness, randomness, seed]) => ({
    name, description,
    settings: { type, pitch, length, squishiness, bounce, brightness, randomness, volume: 0.9, seed },
  }));

  const presetsFor = (typeKey) => PRESETS.filter((p) => p.settings.type === typeKey);

  /** Settings with every slider rounded to a 32-bit float, as the C# SoundSettings holds them. */
  function clean(s) {
    s = s || {};
    const t = TYPE_BY_KEY[s.type] || TYPES[0];
    const v = (x, d) => F(typeof x === "number" && isFinite(x) ? x : d);
    return {
      type: t.key, typeId: t.id,
      pitch: v(s.pitch, 0.5), length: v(s.length, 0.5), squishiness: v(s.squishiness, 0.5), bounce: v(s.bounce, 0.5),
      brightness: v(s.brightness, 0.5), randomness: v(s.randomness, 0.2), volume: v(s.volume, 0.9),
      seed: Number.isInteger(s.seed) ? s.seed | 0 : 1,
      ...(t.key === "Babble" && typeof s.text === "string" && s.text.trim() ? { text: s.text.slice(0, 240) } : {}),
    };
  }

  /** Renders a sound to mono 44.1 kHz samples (Float32Array). Never empty. */
  function render(settings) {
    const s = clean(settings);
    const t = TYPE_BY_KEY[s.type];
    const rng = new SynthRandom((Math.imul(s.seed, 31) + s.typeId * 7919) | 0);
    let buf = t.fn(s, rng);
    for (let i = 0; i < buf.length; i++) if (!isFinite(buf[i])) buf[i] = 0;
    removeDc(buf);
    buf = trimTail(buf, 0.004, 0.03);
    fades(buf, 0.0015, 0.02);
    normalize(buf, t.level ? F(F(F(0.891) * clamp01(s.volume)) * F(t.level)) : F(F(0.891) * clamp01(s.volume)));
    return buf;
  }

  /** 16-bit mono PCM WAV with the same light dither as the C# WavEncoder (bit-exact). Returns a Uint8Array. */
  function encodeWav(samplesArr, sampleRate = RATE) {
    const n = samplesArr.length, dataBytes = n * 2;
    const out = new Uint8Array(44 + dataBytes);
    const dv = new DataView(out.buffer);
    const str = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
    str(0, "RIFF"); dv.setInt32(4, 36 + dataBytes, true); str(8, "WAVE"); str(12, "fmt ");
    dv.setInt32(16, 16, true); dv.setInt16(20, 1, true); dv.setInt16(22, 1, true);
    dv.setInt32(24, sampleRate, true); dv.setInt32(28, sampleRate * 2, true);
    dv.setInt16(32, 2, true); dv.setInt16(34, 16, true); str(36, "data"); dv.setInt32(40, dataBytes, true);
    let d = 22222;
    for (let i = 0; i < n; i++) {
      d = (Math.imul(d, 1664525) + 1013904223) >>> 0;
      const r1 = F((d >>> 8) / 16777216);
      d = (Math.imul(d, 1664525) + 1013904223) >>> 0;
      const r2 = F((d >>> 8) / 16777216);
      let v = F(F(samplesArr[i] * F(32767)) + F(r1 - r2));
      if (v > 32767) v = 32767;
      if (v < -32768) v = -32768;
      dv.setInt16(44 + i * 2, roundEven(v), true);
    }
    return out;
  }

  const api = {
    RATE, TYPES, TYPE_BY_KEY, SLIDERS, PRESETS, presetsFor, sliderInfo, clean, render, encodeWav, peak,
    _internal: { SynthRandom, Biquad, roundEven },
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComedySynth = api;
})(typeof self !== "undefined" ? self : this);
