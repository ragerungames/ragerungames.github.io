/* RageRun Comedy Sound Synth - recipes: layers, Advanced shaping, the effects rack, trim / fades, and WAV files
 * that carry their own recipe.
 *
 * A recipe is everything needed to make a sound again:
 *   { v, layers: [{ sound, offset, pan, mute, solo, adv, file? }], fx: { <effect>: { on, ...params } }, trim, fade }
 * A layer with "file" plays your own sound (Comedy-fy, Round 6) instead of a synth voice: { id, name, pitch }. The page
 * registers its samples with registerFile(id, Float32Array) (the app keeps a 16-bit WAV copy in its data folder).
 * Rendering is deterministic: the same recipe always gives the same samples, so what you hear is what you save.
 * A plain recipe (one layer, no Advanced, no effects, no trim) gives exactly ComedySynth.render(sound).
 * Works in the page (window.ComedyFx) and in Node (require("./fx.js")).
 */
(function (root) {
  "use strict";
  const S = root.ComedySynth || (typeof require === "function" ? require("./synth.js") : null);
  const RATE = S.RATE, TWO_PI = Math.PI * 2;
  const { SynthRandom, Biquad } = S._internal;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
  const expLerp = (a, b, t) => a * Math.pow(b / a, clamp(t, 0, 1));
  const MAX_SECONDS = 12;

  // ------------------------------------------------------------------ the effects rack (also drives the UI)
  // Processed top to bottom. Params: k, label, min, max, step, def, unit / fmt, scale "log" for frequencies.
  const FX_DEFS = [
    { key: "speed", name: "Speed", about: "Faster and higher, or slower and lower, like a tape.",
      params: [{ k: "amount", label: "Speed", min: 0.5, max: 2, step: 0.01, def: 1.4, fmt: (v) => v.toFixed(2) + "x" }] },
    { key: "reverse", name: "Reverse", about: "Plays the sound backwards.", params: [] },
    { key: "pitch", name: "Pitch shift", about: "Higher or lower, same length.",
      params: [{ k: "semis", label: "Semitones", min: -12, max: 12, step: 1, def: 5, fmt: (v) => (v > 0 ? "+" : "") + v }] },
    { key: "vibrato", name: "Vibrato", about: "A wavy, wobbling pitch.",
      params: [{ k: "rate", label: "Speed", min: 2, max: 14, step: 0.1, def: 7, fmt: (v) => v.toFixed(1) + " Hz" },
               { k: "depth", label: "Depth", min: 0, max: 1, step: 0.01, def: 0.4, fmt: pct }] },
    { key: "warble", name: "Warble", about: "Wobbly old-tape wow and flutter.",
      params: [{ k: "amount", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.5, fmt: pct }] },
    { key: "crunch", name: "Crunch", about: "Distortion: from warm to smashed.",
      params: [{ k: "drive", label: "Drive", min: 0, max: 1, step: 0.01, def: 0.5, fmt: pct },
               { k: "tone", label: "Tone", min: 0, max: 1, step: 0.01, def: 0.6, fmt: pct }] },
    { key: "retro", name: "Retro", about: "Bit crusher: an old game console.",
      params: [{ k: "bits", label: "Crush", min: 0, max: 1, step: 0.01, def: 0.5, fmt: pct },
               { k: "rate", label: "Lo-fi", min: 0, max: 1, step: 0.01, def: 0.4, fmt: pct }] },
    { key: "lowcut", name: "Low cut", about: "Takes away the low end (thinner, like a phone).",
      params: [{ k: "hz", label: "Below", min: 20, max: 2000, step: 1, def: 300, scale: "log", fmt: hz }] },
    { key: "highcut", name: "High cut", about: "Takes away the top (muffled, behind a wall).",
      params: [{ k: "hz", label: "Above", min: 400, max: 18000, step: 1, def: 3000, scale: "log", fmt: hz }] },
    { key: "echo", name: "Echo", about: "Repeats that fade away.",
      params: [{ k: "time", label: "Time", min: 0.04, max: 1, step: 0.01, def: 0.25, fmt: (v) => Math.round(v * 1000) + " ms" },
               { k: "feedback", label: "Repeats", min: 0, max: 0.9, step: 0.01, def: 0.4, fmt: pct },
               { k: "mix", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.4, fmt: pct }] },
    { key: "reverb", name: "Reverb", about: "A room, a big hall, or a boingy spring.",
      params: [{ k: "kind", label: "Space", options: [["room", "Room"], ["hall", "Hall"], ["spring", "Spring"]], def: "room" },
               { k: "size", label: "Size", min: 0, max: 1, step: 0.01, def: 0.5, fmt: pct },
               { k: "mix", label: "Amount", min: 0, max: 1, step: 0.01, def: 0.3, fmt: pct }] },
    { key: "width", name: "Stereo width", about: "Spreads the sound out left and right (saves a stereo file).",
      params: [{ k: "amount", label: "Width", min: 0, max: 1, step: 0.01, def: 0.6, fmt: pct }] },
  ];
  function pct(v) { return Math.round(v * 100) + "%"; }
  function hz(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + " kHz" : Math.round(v) + " Hz"; }

  /** One-click looks for the effects rack (they switch the rack to just these effects). */
  const LOOKS = [
    { name: "Chipmunk", about: "Fast and squeaky.", fx: { speed: { amount: 1.6 } } },
    { name: "Giant", about: "Slow, huge and booming.", fx: { speed: { amount: 0.6 }, reverb: { kind: "hall", size: 0.7, mix: 0.3 } } },
    { name: "Robot", about: "Crunchy old-game robot.", fx: { retro: { bits: 0.6, rate: 0.5 }, vibrato: { rate: 9, depth: 0.25 } } },
    { name: "Old Radio", about: "Thin, crackly speaker.", fx: { lowcut: { hz: 450 }, highcut: { hz: 3200 }, crunch: { drive: 0.4, tone: 0.6 } } },
    { name: "Underwater", about: "Muffled and wobbly.", fx: { highcut: { hz: 900 }, warble: { amount: 0.6 } } },
    { name: "Haunted", about: "Low and echoing.", fx: { pitch: { semis: -5 }, reverb: { kind: "hall", size: 0.8, mix: 0.4 } } },
    { name: "Canyon", about: "Echo, echo, echo.", fx: { echo: { time: 0.32, feedback: 0.45, mix: 0.45 } } },
    { name: "Boingy", about: "Spring reverb and a wobble.", fx: { reverb: { kind: "spring", size: 0.6, mix: 0.45 }, vibrato: { rate: 6, depth: 0.3 } } },
    { name: "Old Tape", about: "Warbly, lo-fi tape.", fx: { warble: { amount: 0.7 }, highcut: { hz: 5000 }, retro: { bits: 0.2, rate: 0.25 } } },
    { name: "Backwards", about: "Played in reverse, with a room.", fx: { reverse: {}, reverb: { kind: "room", size: 0.5, mix: 0.25 } } },
  ];
  function applyLook(recipe, look) {
    const fx = defaultFx();
    for (const [k, v] of Object.entries(look.fx)) Object.assign(fx[k], v, { on: true });
    recipe.fx = fx;
  }

  function defaultFx() {
    const fx = {};
    for (const d of FX_DEFS) { fx[d.key] = { on: false }; for (const p of d.params) fx[d.key][p.k] = p.def; }
    return fx;
  }

  const FLAT_BEND = [[0, 0], [1, 0]], FLAT_ENV = [[0, 1], [1, 1]];
  const defaultAdv = () => ({ bend: FLAT_BEND.map((p) => p.slice()), env: FLAT_ENV.map((p) => p.slice()), tone: 0, noise: 0 });
  const defaultLayer = (sound, preset) => ({ sound: S.clean(sound || S.PRESETS[0].settings), preset: preset || null, offset: 0, pan: 0, mute: false, solo: false, adv: defaultAdv() });
  const defaultRecipe = (sound, preset) => ({ v: 1, layers: [defaultLayer(sound, preset)], fx: defaultFx(), trim: { start: 0, end: 1 }, fade: { in: 0, out: 0 } });

  function cleanPoints(pts, lo, hi, flat) {
    if (!Array.isArray(pts) || pts.length < 2) return flat.map((p) => p.slice());
    const out = pts.filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
      .map((p) => [clamp(+p[0], 0, 1), clamp(+p[1], lo, hi)]).sort((a, b) => a[0] - b[0]).slice(0, 24);
    if (out.length < 2) return flat.map((p) => p.slice());
    out[0][0] = 0; out[out.length - 1][0] = 1;
    return out;
  }

  /** Fills in anything missing and keeps every value in range (for recipes from files and old settings). */
  function cleanRecipe(r) {
    r = r && typeof r === "object" ? r : {};
    const num = (x, d, a, b) => clamp(typeof x === "number" && isFinite(x) ? x : d, a, b);
    const layers = (Array.isArray(r.layers) && r.layers.length ? r.layers : [{ sound: r.sound }]).slice(0, 4).map((l) => {
      const a = l.adv || {};
      const f = l.file && typeof l.file === "object" && /^[0-9a-f]{16}$/.test(l.file.id) ? l.file : null;
      return {
        sound: S.clean(l.sound), preset: typeof l.preset === "string" ? l.preset.slice(0, 80) : null, offset: num(l.offset, 0, 0, 3), pan: num(l.pan, 0, -1, 1), mute: !!l.mute, solo: !!l.solo,
        file: f ? { id: f.id, name: String(f.name || "Your sound").slice(0, 80), pitch: Math.round(num(f.pitch, 0, -12, 12)) } : null,
        adv: { bend: cleanPoints(a.bend, -12, 12, FLAT_BEND), env: cleanPoints(a.env, 0, 1, FLAT_ENV), tone: num(a.tone, 0, 0, 1), noise: num(a.noise, 0, 0, 1) },
      };
    });
    const fx = defaultFx();
    const rf = r.fx || {};
    for (const d of FX_DEFS) {
      const src = rf[d.key] || {};
      fx[d.key].on = !!src.on;
      for (const p of d.params) {
        if (p.options) fx[d.key][p.k] = p.options.some((o) => o[0] === src[p.k]) ? src[p.k] : p.def;
        else fx[d.key][p.k] = num(src[p.k], p.def, p.min, p.max);
      }
    }
    const t = r.trim || {}, f = r.fade || {};
    let start = num(t.start, 0, 0, 1), end = num(t.end, 1, 0, 1);
    if (end - start < 0.01) { start = 0; end = 1; }
    return { v: 1, layers, fx, trim: { start, end }, fade: { in: num(f.in, 0, 0, 5), out: num(f.out, 0, 0, 5) } };
  }

  // ------------------------------------------------------------------ helpers
  function interp(buf, pos) {
    if (pos < 0 || pos > buf.length - 1) return 0;
    const i = Math.floor(pos), f = pos - i;
    return i + 1 < buf.length ? buf[i] + (buf[i + 1] - buf[i]) * f : buf[i];
  }
  function peakOf(chs) { let p = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; } return p; }
  function scale(c, g) { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * g; return o; }
  function curveAt(pts, u) {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (u <= pts[i][0]) { const a = pts[i - 1], b = pts[i], w = b[0] - a[0]; return w <= 0 ? b[1] : a[1] + (b[1] - a[1]) * (u - a[0]) / w; }
    }
    return pts[pts.length - 1][1];
  }
  const isFlat = (pts, v) => pts.every((p) => Math.abs(p[1] - v) < 1e-9);

  // ------------------------------------------------------------------ Advanced (per layer, after the voice)
  function applyAdvanced(buf, adv, seed) {
    const bendOn = !isFlat(adv.bend, 0), envOn = !isFlat(adv.env, 1);
    if (!bendOn && !envOn && adv.tone <= 0 && adv.noise <= 0) return buf;
    const peak0 = S.peak(buf) || 1;
    let x = buf;
    if (bendOn) {                       // draw-your-own pitch: plays faster (higher) or slower (lower) through the sound
      const len = x.length, out = [];
      let pos = 0;
      while (pos < len - 1 && out.length < MAX_SECONDS * RATE) {
        out.push(interp(x, pos));
        pos += Math.pow(2, curveAt(adv.bend, pos / len) / 12);
      }
      x = Float32Array.from(out.length ? out : [0]);
    } else x = Float32Array.from(x);
    if (envOn) for (let i = 0; i < x.length; i++) x[i] *= curveAt(adv.env, i / x.length);
    if (adv.tone > 0) {                 // tone: smooth -> buzzy (waveshaper), level kept
      const k = 1 + adv.tone * 10, tk = Math.tanh(k), mix = Math.min(1, adv.tone * 1.6), p = S.peak(x) || 1;
      for (let i = 0; i < x.length; i++) {
        const v = x[i] / p, sh = Math.tanh(k * v) / tk;
        x[i] = (v + (sh - v) * mix) * p;
      }
    }
    if (adv.noise > 0) {                // grit: noise that follows the sound's own loudness
      const r = new SynthRandom((seed | 0) * 13 + 977), hp = Biquad.highPass(900, 0.7);
      const att = Math.exp(-1 / (0.001 * RATE)), rel = Math.exp(-1 / (0.03 * RATE));
      let e = 0;
      for (let i = 0; i < x.length; i++) {
        const a = Math.abs(x[i]);
        e = a > e ? a + (e - a) * att : a + (e - a) * rel;
        x[i] += hp.process(r.signed()) * e * adv.noise * 2.2;
      }
    }
    const p = S.peak(x);
    if (p > 1e-6) for (let i = 0; i < x.length; i++) x[i] *= peak0 / p;
    return x;
  }

  // ------------------------------------------------------------------ effects (each returns new arrays)
  const FX = {
    speed(chs, p) {
      const a = p.amount;
      return chs.map((c) => { const n = Math.max(1, Math.floor((c.length - 1) / a) + 1), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = interp(c, i * a); return o; });
    },
    reverse(chs) { return chs.map((c) => Float32Array.from(c).reverse()); },
    pitch(chs, p) {
      if (!p.semis) return chs;
      const ratio = Math.pow(2, p.semis / 12), W = 2048, hop = 512, half = W / 2;
      const win = new Float32Array(W);
      for (let j = 0; j < W; j++) win[j] = 0.5 - 0.5 * Math.cos(TWO_PI * j / W);
      return chs.map((c) => {
        const n = c.length, o = new Float32Array(n), ws = new Float32Array(n);
        for (let st = -half; st < n; st += hop) {
          const centre = st + half;
          for (let j = 0; j < W; j++) {
            const oi = st + j;
            if (oi < 0 || oi >= n) continue;
            o[oi] += interp(c, centre + (j - half) * ratio) * win[j];
            ws[oi] += win[j];
          }
        }
        for (let i = 0; i < n; i++) if (ws[i] > 1e-3) o[i] /= ws[i];
        return o;
      });
    },
    vibrato(chs, p) {
      const D = p.depth * 0.0035 * RATE, extra = Math.ceil(D) + 1;
      return chs.map((c) => { const o = new Float32Array(c.length + extra); for (let i = 0; i < o.length; i++) o[i] = interp(c, i - D * 0.5 * (1 - Math.cos(TWO_PI * p.rate * i / RATE))); return o; });
    },
    warble(chs, p, seed) {
      const r = new SynthRandom((seed | 0) * 7 + 4242), ph = [r.value(), r.value(), r.value()].map((v) => v * TWO_PI);
      const D = p.amount * 0.008 * RATE, extra = Math.ceil(D) + 1;
      return chs.map((c) => {
        const o = new Float32Array(c.length + extra);
        for (let i = 0; i < o.length; i++) {
          const t = i / RATE;
          const m = 0.5 * Math.sin(TWO_PI * 0.8 * t + ph[0]) + 0.3 * Math.sin(TWO_PI * 1.7 * t + ph[1]) + 0.2 * Math.sin(TWO_PI * 7.5 * t + ph[2]);
          o[i] = interp(c, i - D * 0.5 * (1 + m));
        }
        return o;
      });
    },
    crunch(chs, p) {
      const g = 1 + p.drive * 24, tg = Math.tanh(g), p0 = peakOf(chs) || 1;
      const out = chs.map((c) => {
        const lp = Biquad.lowPass(expLerp(1500, 14000, p.tone), 0.7), o = new Float32Array(c.length);
        for (let i = 0; i < c.length; i++) o[i] = lp.process(Math.tanh(g * c[i] / p0) / tg);
        return o;
      });
      const p1 = peakOf(out) || 1;
      return out.map((c) => scale(c, p0 / p1));
    },
    retro(chs, p) {
      const bits = Math.round(lerp(10, 2, p.bits)), hold = Math.max(1, Math.round(Math.exp(lerp(0, Math.log(24), p.rate))));
      const lv = Math.pow(2, bits - 1);
      return chs.map((c) => { const o = new Float32Array(c.length); let h = 0; for (let i = 0; i < c.length; i++) { if (i % hold === 0) h = Math.round(c[i] * lv) / lv; o[i] = h; } return o; });
    },
    lowcut(chs, p) {
      return chs.map((c) => { const a = Biquad.highPass(p.hz, 0.707), b = Biquad.highPass(p.hz, 0.707), o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = b.process(a.process(c[i])); return o; });
    },
    highcut(chs, p) {
      return chs.map((c) => { const a = Biquad.lowPass(p.hz, 0.707), b = Biquad.lowPass(p.hz, 0.707), o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = b.process(a.process(c[i])); return o; });
    },
    echo(chs, p) {
      const D = Math.max(1, Math.round(p.time * RATE));
      const repeats = p.feedback > 0.001 ? Math.ceil(Math.log(0.002) / Math.log(p.feedback)) : 1;
      const tail = Math.min(5 * RATE, D * Math.max(1, repeats));
      return chs.map((c) => {
        const n = c.length + tail, d = new Float32Array(n), o = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          if (i >= D) d[i] = (i - D < c.length ? c[i - D] : 0) + p.feedback * d[i - D];
          o[i] = (i < c.length ? c[i] : 0) + p.mix * d[i];
        }
        return o;
      });
    },
    reverb(chs, p) {
      const mono = chs.length === 1 ? chs[0] : null;
      const L = mono || chs[0], R = mono || chs[1];
      if (p.kind === "spring") return spring(L, R, p);
      const hall = p.kind === "hall";
      const sc = hall ? lerp(1.0, 1.6, p.size) : lerp(0.45, 0.9, p.size);
      const fb = hall ? lerp(0.86, 0.93, p.size) : lerp(0.7, 0.84, p.size);
      const damp = hall ? 0.22 : 0.32;
      const tail = Math.round((hall ? 2.5 + 2 * p.size : 0.8 + p.size) * RATE);
      return [freeverb(L, sc, fb, damp, 0, tail, p.mix), freeverb(R, sc, fb, damp, 23, tail, p.mix)];
    },
    width(chs, p) {
      const decor = (c) => { // a few allpasses: same spectrum, scrambled phase
        let x = c;
        for (const len of [142, 107, 379, 277]) x = allpass(x, len, 0.6);
        return x;
      };
      if (chs.length === 1) {
        const c = chs[0], s = decor(c), L = new Float32Array(c.length), R = new Float32Array(c.length);
        for (let i = 0; i < c.length; i++) { const d = s[i] * p.amount * 0.7; L[i] = c[i] + d; R[i] = c[i] - d; }
        return [L, R];
      }
      const n = Math.max(chs[0].length, chs[1].length), M = new Float32Array(n), Sd = new Float32Array(n);
      for (let i = 0; i < n; i++) { const l = chs[0][i] || 0, r = chs[1][i] || 0; M[i] = (l + r) / 2; Sd[i] = (l - r) / 2; }
      const dm = decor(M), L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i++) { const s = Sd[i] * (1 + p.amount) + dm[i] * p.amount * 0.4; L[i] = M[i] + s; R[i] = M[i] - s; }
      return [L, R];
    },
  };

  function allpass(c, len, g) {
    const o = new Float32Array(c.length), buf = new Float32Array(len);
    let idx = 0;
    for (let i = 0; i < c.length; i++) { const b = buf[idx], y = -g * c[i] + b; buf[idx] = c[i] + g * y; o[i] = y; idx = (idx + 1) % len; }
    return o;
  }

  const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], ALLPASSES = [556, 441, 341, 225];
  function freeverb(c, sc, fb, damp, spread, tail, mix) {
    const n = c.length + tail;
    const combs = COMBS.map((l) => ({ buf: new Float32Array(Math.max(8, Math.round((l + spread) * sc))), idx: 0, store: 0 }));
    const aps = ALLPASSES.map((l) => ({ buf: new Float32Array(Math.max(4, Math.round((l + spread) * sc))), idx: 0 }));
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dry = i < c.length ? c[i] : 0, inp = dry * 0.015;
      let wet = 0;
      for (const cb of combs) {
        const out = cb.buf[cb.idx];
        cb.store = out * (1 - damp) + cb.store * damp;
        cb.buf[cb.idx] = inp + cb.store * fb;
        cb.idx = (cb.idx + 1) % cb.buf.length;
        wet += out;
      }
      for (const ap of aps) {
        const b = ap.buf[ap.idx];
        ap.buf[ap.idx] = wet + b * 0.5;
        wet = b - wet;
        ap.idx = (ap.idx + 1) % ap.buf.length;
      }
      o[i] = dry * (1 - mix * 0.35) + wet * mix * 3;
    }
    return o;
  }

  function spring(L, R, p) {
    const make = (c, delayS) => {
      const tail = Math.round((1.5 + 2 * p.size) * RATE), n = c.length + tail;
      const D = Math.round(delayS * lerp(0.7, 1.4, p.size) * RATE), line = new Float32Array(D);
      const fb = lerp(0.55, 0.8, p.size), lp = Biquad.lowPass(4200, 0.7), hp = Biquad.highPass(160, 0.7);
      const STAGES = 24, a = 0.62, xs = new Float64Array(STAGES), ys = new Float64Array(STAGES);
      const o = new Float32Array(n);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const dry = i < c.length ? c[i] : 0;
        let v = dry * 0.5 + fb * lp.process(line[idx]);
        for (let s = 0; s < STAGES; s++) { const y = a * v + xs[s] - a * ys[s]; xs[s] = v; ys[s] = y; v = y; } // dispersion: the "boing" chirp
        line[idx] = v;
        idx = (idx + 1) % D;
        o[i] = dry * (1 - p.mix * 0.35) + hp.process(v) * p.mix * 1.6;
      }
      return o;
    };
    return [make(L, 0.037), make(R, 0.043)];
  }

  // ------------------------------------------------------------------ rendering a recipe
  const FILES = new Map();                 // id -> Float32Array (44.1 kHz mono) of sounds brought in with Comedy-fy
  function registerFile(id, samples) { FILES.set(id, samples); }
  const hasFile = (id) => FILES.has(id);
  const fileIds = (r) => [...new Set(r.layers.filter((l) => l.file).map((l) => l.file.id))];

  /** Your own sound for a file layer: pitch is tape-style (higher = faster), Volume scales it (0.9 = as it came in). */
  function fileVoice(l) {
    const src = FILES.get(l.file.id);
    if (!src) return new Float32Array(Math.round(RATE * 0.25));
    const rate = Math.pow(2, l.file.pitch / 12), g = l.sound.volume / 0.9;
    const n = Math.max(1, Math.min(MAX_SECONDS * RATE, Math.floor((src.length - 1) / rate) + 1)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = interp(src, i * rate) * g;
    return out;
  }

  const layerCache = new Map();
  function renderLayer(l) {
    const key = JSON.stringify([l.sound, l.adv, l.file, l.file && FILES.has(l.file.id)]);
    let b = layerCache.get(key);
    if (!b) {
      b = applyAdvanced(l.file ? fileVoice(l) : S.render(l.sound), l.adv, l.sound.seed);
      layerCache.set(key, b);
      if (layerCache.size > 48) layerCache.delete(layerCache.keys().next().value);
    }
    return b;
  }

  const activeLayers = (r) => { const solo = r.layers.some((l) => l.solo); return r.layers.filter((l) => (solo ? l.solo : !l.mute)); };

  function mix(r) {
    const act = activeLayers(r);
    if (!act.length) return [new Float32Array(Math.round(RATE * 0.25))];
    if (act.length === 1 && act[0].offset === 0 && act[0].pan === 0) return [renderLayer(act[0])];
    const bufs = act.map(renderLayer);
    const stereo = act.some((l) => l.pan !== 0);
    let n = 0;
    act.forEach((l, i) => { n = Math.max(n, Math.round(l.offset * RATE) + bufs[i].length); });
    n = Math.min(n, MAX_SECONDS * RATE);
    const L = new Float32Array(n), R = stereo ? new Float32Array(n) : null;
    act.forEach((l, k) => {
      const b = bufs[k], st = Math.round(l.offset * RATE);
      const a = (l.pan + 1) * Math.PI / 4, gl = stereo ? Math.cos(a) * Math.SQRT2 : 1, gr = Math.sin(a) * Math.SQRT2;
      for (let i = 0; i < b.length && st + i < n; i++) { L[st + i] += b[i] * gl; if (R) R[st + i] += b[i] * gr; }
    });
    return R ? [L, R] : [L];
  }

  /** Renders a recipe. Returns { full: [channels] before trim, final: [channels] to play and save, start, end }
   *  (start / end: the trimmed part in samples of full). Mono = one channel, stereo = two. */
  function render(recipe) {
    const r = recipe;
    let chs = mix(r);
    for (const d of FX_DEFS) {
      const p = r.fx[d.key];
      if (p && p.on) chs = FX[d.key](chs, p, r.layers[0].sound.seed);
    }
    if (chs[0].length > MAX_SECONDS * RATE) chs = chs.map((c) => c.slice(0, MAX_SECONDS * RATE));
    const pk = peakOf(chs);
    if (pk > 0.98) chs = chs.map((c) => scale(c, 0.891 / pk));       // layers or effects went over: bring it back to -1 dB
    const full = chs, n = full[0].length;
    const start = Math.min(n - 1, Math.round(r.trim.start * n)), end = Math.max(start + 1, Math.round(r.trim.end * n));
    if (start === 0 && end === n && r.fade.in <= 0 && r.fade.out <= 0) return { full, final: full, start, end };
    const len = end - start, fi = Math.min(len, Math.round(r.fade.in * RATE)), fo = Math.min(len, Math.round(r.fade.out * RATE));
    const final = full.map((c) => {
      const o = c.slice(start, end);
      for (let i = 0; i < fi; i++) o[i] *= Math.sin((i / fi) * Math.PI / 2);
      for (let i = 0; i < fo; i++) o[len - 1 - i] *= Math.sin((i / fo) * Math.PI / 2);
      return o;
    });
    return { full, final, start, end };
  }

  // ------------------------------------------------------------------ WAV files with the recipe inside
  const CHUNK = "rrcs";       // RageRun Comedy Synth: our own RIFF chunk, after the audio; other programs skip it

  /** 16-bit PCM WAV, mono or stereo, with the same dither as the Unity asset (mono files without a recipe are
   *  byte-identical to it). recipe: stored in the file so the app can open it again (null = leave it out). */
  function encodeWav(chs, recipe, gag) {
    const nc = chs.length, n = chs[0].length, dataBytes = n * nc * 2;
    let extra = null;
    if (recipe || gag) {
      const js = JSON.stringify(Object.assign({ app: "RageRun Comedy Sound Synth", v: 1 }, recipe ? { recipe } : {}, gag ? { gag } : {}));
      extra = new TextEncoder().encode(js);
    }
    const extraBytes = extra ? 8 + extra.length + (extra.length & 1) : 0;
    const out = new Uint8Array(44 + dataBytes + extraBytes);
    const dv = new DataView(out.buffer);
    const str = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
    str(0, "RIFF"); dv.setUint32(4, 36 + dataBytes + extraBytes, true); str(8, "WAVE"); str(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true);
    dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2 * nc, true);
    dv.setUint16(32, 2 * nc, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, dataBytes, true);
    const F = Math.fround, re = S._internal.roundEven;
    let d = 22222, o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nc; c++) {
        d = (Math.imul(d, 1664525) + 1013904223) >>> 0;
        const r1 = F((d >>> 8) / 16777216);
        d = (Math.imul(d, 1664525) + 1013904223) >>> 0;
        const r2 = F((d >>> 8) / 16777216);
        let v = F(F(chs[c][i] * F(32767)) + F(r1 - r2));
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        dv.setInt16(o, re(v), true);
        o += 2;
      }
    }
    if (extra) { str(o, CHUNK); dv.setUint32(o + 4, extra.length, true); out.set(extra, o + 8); }
    return out;
  }

  /** The gag (Gag Builder project) stored in a WAV bounced by this app, or null. */
  function readGag(bytes) {
    const js = readChunk(bytes);
    return js && js.gag && Array.isArray(js.gag.clips) ? js.gag : null;
  }

  function readChunk(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 12) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const id = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (id(0) !== "RIFF" || id(8) !== "WAVE") return null;
    let o = 12;
    while (o + 8 <= u8.length) {
      const cid = id(o), size = dv.getUint32(o + 4, true);
      if (cid === CHUNK) {
        try { return JSON.parse(new TextDecoder().decode(u8.subarray(o + 8, Math.min(u8.length, o + 8 + size)))); } catch (e) { return null; }
      }
      o += 8 + size + (size & 1);
    }
    return null;
  }

  /** The recipe stored in a WAV made by this app, or null. bytes: Uint8Array / ArrayBuffer. */
  function readRecipe(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 12) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const id = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (id(0) !== "RIFF" || id(8) !== "WAVE") return null;
    let o = 12;
    while (o + 8 <= u8.length) {
      const cid = id(o), size = dv.getUint32(o + 4, true);
      if (cid === CHUNK) {
        try {
          const js = JSON.parse(new TextDecoder().decode(u8.subarray(o + 8, Math.min(u8.length, o + 8 + size))));
          return js && js.recipe ? cleanRecipe(js.recipe) : null;
        } catch (e) { return null; }
      }
      o += 8 + size + (size & 1);
    }
    return null;
  }

  const api = { LOOKS, applyLook, registerFile, hasFile, fileIds, FX_DEFS, defaultFx, defaultAdv, defaultLayer, defaultRecipe, cleanRecipe, render, encodeWav, readRecipe, readGag, curveAt, isFlat, peakOf, MAX_SECONDS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComedyFx = api;
})(typeof self !== "undefined" ? self : this);
