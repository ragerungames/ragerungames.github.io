/* RageRun Comedy Sound Synth - export (Round 8). window.CSExport
 * One place that turns a sound into a file: format (WAV 16 / 24-bit / 32-bit float, OGG, MP3), sample rate
 * (44.1 / 48 / 22.05 kHz), channels, normalise (peak or even loudness), file names (style, prefix, numbers) and
 * ready-made settings for game engines and video. Every save in the app goes through encode() + fileName().
 * Pack export: a set of sounds (a Library shelf or collection) as a folder or ZIP with manifest.json / .csv and,
 * for web games, one audio sprite + JSON.
 * OGG and MP3 are encoded right here with WebAssembly (static/vendor: LAME and Vorbis, see licenses\).
 * With the default settings (WAV 16-bit 44.1 kHz, as made) the bytes are exactly the ones the app always wrote. */
(() => {
  "use strict";
  const S = window.ComedySynth, X = window.ComedyFx;
  const RATE = S.RATE;
  const A = () => window.CSApp;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------------------------------------------ settings
  const DEFAULTS = { preset: "unity", format: "wav", bits: 16, rate: 44100, channels: "auto", norm: "off", peakDb: -1, lufs: -16,
    oggQ: 5, mp3Q: 2, style: "typed", prefix: "", pad: false, sprite: false };
  const PRESETS = [
    { key: "unity", name: "Unity", about: "WAV 16-bit, 44.1 kHz, names as you typed them. Drop the files into your Assets folder.",
      set: { format: "wav", bits: 16, rate: 44100, channels: "auto", norm: "off", style: "typed", prefix: "", pad: false, sprite: false } },
    { key: "godot", name: "Godot", about: "WAV 16-bit, 44.1 kHz, snake_case names (spring_boing_01.wav).",
      set: { format: "wav", bits: 16, rate: 44100, channels: "auto", norm: "off", style: "snake", prefix: "", pad: true, sprite: false } },
    { key: "unreal", name: "Unreal Engine", about: "WAV 16-bit, 48 kHz, A_ names in PascalCase (A_SpringBoing_01.wav).",
      set: { format: "wav", bits: 16, rate: 48000, channels: "auto", norm: "off", style: "pascal", prefix: "A_", pad: true, sprite: false } },
    { key: "gamemaker", name: "GameMaker", about: "OGG, 44.1 kHz, snd_ names (snd_spring_boing_01.ogg).",
      set: { format: "ogg", oggQ: 5, rate: 44100, channels: "auto", norm: "off", style: "snake", prefix: "snd_", pad: true, sprite: false } },
    { key: "web", name: "Web game (audio sprite)", about: "MP3, 44.1 kHz, even loudness, kebab-case names. A pack also gets one audio sprite file + JSON (Howler.js style).",
      set: { format: "mp3", mp3Q: 2, rate: 44100, channels: "auto", norm: "lufs", lufs: -16, style: "kebab", prefix: "", pad: true, sprite: true } },
    { key: "video", name: "Video editing (48 kHz)", about: "WAV 24-bit, 48 kHz stereo, peak at -1 dB. Drops straight onto a video timeline.",
      set: { format: "wav", bits: 24, rate: 48000, channels: "stereo", norm: "peak", peakDb: -1, style: "typed", prefix: "", pad: false, sprite: false } },
  ];
  const QUALITY = { ogg: { small: 3, good: 5, best: 8 }, mp3: { small: 5, good: 2, best: 0 } };

  function clean(s) {
    s = Object.assign({}, DEFAULTS, s && typeof s === "object" ? s : {});
    const one = (v, list, d) => (list.includes(v) ? v : d);
    s.format = one(s.format, ["wav", "ogg", "mp3"], "wav");
    s.bits = one(+s.bits, [16, 24, 32], 16);
    s.rate = one(+s.rate, [44100, 48000, 22050], 44100);
    s.channels = one(s.channels, ["auto", "mono", "stereo"], "auto");
    s.norm = one(s.norm, ["off", "peak", "lufs"], "off");
    s.peakDb = Math.max(-12, Math.min(0, +s.peakDb || -1));
    s.lufs = Math.max(-30, Math.min(-6, +s.lufs || -16));
    s.oggQ = Math.max(0, Math.min(10, +s.oggQ)); if (!isFinite(s.oggQ)) s.oggQ = 5;
    s.mp3Q = Math.max(0, Math.min(9, +s.mp3Q)); if (!isFinite(s.mp3Q)) s.mp3Q = 2;
    s.style = one(s.style, ["typed", "snake", "kebab", "pascal", "lower"], "typed");
    s.prefix = String(s.prefix || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 20);
    s.pad = !!s.pad; s.sprite = !!s.sprite;
    s.preset = matchPreset(s);
    return s;
  }
  function matchPreset(s) {
    for (const p of PRESETS) if (Object.entries(p.set).every(([k, v]) => s[k] === v)) return p.key;
    return "custom";
  }

  let cur = clean(null);
  const listeners = [];
  function settings() { return Object.assign({}, cur); }
  /** New settings (from the settings box or a project). save=false: don't write config.json (project open does it once). */
  function set(s, save) {
    cur = clean(s);
    if (save !== false) A().api("/api/config", { export: cur }).catch(() => {});
    paint();
    for (const f of listeners) try { f(cur); } catch (e) { /* */ }
  }
  /** The little "WAV 16-bit, 44.1 kHz" lines next to the Gag Builder and Soundboard save buttons. */
  function paint() {
    for (const el of document.querySelectorAll(".fmt-desc")) el.textContent = presetName() + ": " + describe();
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest(".fmt-btn"); if (b) openSettings(); });
  const ext = (s) => (s || cur).format;
  const isDefault = (s) => { s = s || cur; return s.format === "wav" && s.bits === 16 && s.rate === RATE && s.channels === "auto" && s.norm === "off"; };

  function describe(s) {
    s = s || cur;
    const kHz = (s.rate / 1000).toFixed(s.rate % 1000 ? (s.rate === 22050 ? 2 : 1) : 0) + " kHz";
    const fmt = s.format === "wav" ? "WAV " + (s.bits === 32 ? "32-bit float" : s.bits + "-bit") : s.format.toUpperCase() + " " + qualityWord(s);
    const ch = s.channels === "auto" ? "" : s.channels === "mono" ? ", mono" : ", stereo";
    const nm = s.norm === "peak" ? `, peak ${s.peakDb} dB` : s.norm === "lufs" ? `, ${s.lufs} LUFS` : "";
    return `${fmt}, ${kHz}${ch}${nm}`;
  }
  function qualityWord(s) {
    const q = QUALITY[s.format], v = s.format === "ogg" ? s.oggQ : s.mp3Q;
    return (Object.keys(q).find((k) => q[k] === v) || "custom") + " quality";
  }
  const presetName = (s) => { const p = PRESETS.find((x) => x.key === (s || cur).preset); return p ? p.name : "Custom"; };

  // ------------------------------------------------------------------ file names
  const words = (t) => (String(t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[A-Za-z0-9]+/g) || []);
  /** The file name (without extension) for a sound called <base>; n = take number (1, 2 ...) or null. */
  function fileName(base, n, s) {
    s = s || cur;
    base = String(base || "").trim() || "Sound";
    const num = n == null ? "" : s.pad ? String(n).padStart(2, "0") : String(n);
    let out;
    if (s.style === "typed") out = base + (num ? " " + num : "");
    else {
      const w = words(base);
      if (!w.length) w.push("sound");
      if (s.style === "pascal") out = w.map((x) => x[0].toUpperCase() + x.slice(1)).join("") + (num ? "_" + num : "");
      else {
        const lw = w.map((x) => x.toLowerCase()).concat(num ? [num] : []);
        out = lw.join(s.style === "snake" ? "_" : s.style === "kebab" ? "-" : " ");
      }
    }
    return (s.prefix + out).replace(/[<>:"/\\|?*\x00-\x1f]+/g, "").replace(/[. ]+$/, "").slice(0, 120) || "Sound";
  }

  // ------------------------------------------------------------------ processing
  function toChannels(chs, mode) {
    if (mode === "mono" && chs.length > 1) {
      const n = chs[0].length, m = new Float32Array(n);
      for (const c of chs) for (let i = 0; i < n; i++) m[i] += c[i] / chs.length;
      return [m];
    }
    if (mode === "stereo" && chs.length === 1) return [chs[0], chs[0].slice()];
    return chs;
  }

  /** Windowed-sinc resampler (Blackman, 24 taps a side, low-pass at the lower Nyquist). */
  function resample(c, from, to) {
    if (from === to) return c;
    const ratio = to / from, n = Math.max(1, Math.round(c.length * ratio)), out = new Float32Array(n);
    const cut = Math.min(1, ratio) * 0.96, HALF = Math.ceil(24 / Math.min(1, ratio)), step = 1 / ratio, len = c.length;
    for (let i = 0; i < n; i++) {
      const p = i * step, j = Math.floor(p);
      let acc = 0;
      const a = Math.max(0, j - HALF + 1), b = Math.min(len - 1, j + HALF);
      for (let k = a; k <= b; k++) {
        const x = p - k, sx = x * cut;
        const sinc = sx === 0 ? 1 : Math.sin(Math.PI * sx) / (Math.PI * sx);
        const w = 0.42 + 0.5 * Math.cos(Math.PI * x / HALF) + 0.08 * Math.cos(2 * Math.PI * x / HALF);
        acc += c[k] * sinc * w;
      }
      out[i] = acc * cut;
    }
    return out;
  }

  /** K-weighting filters (ITU-R BS.1770) for any sample rate (the libebur128 way: a shelf and a high-pass). */
  function kFilters(fs) {
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan(Math.PI * f0 / fs);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const sh = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    f0 = 38.13547087602444; Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / fs);
    a0 = 1 + K / Q + K * K;
    const hp = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    return [sh, hp];
  }
  function biquad(x, f) {
    const a0 = f.a[0], b0 = f.b[0] / a0, b1 = f.b[1] / a0, b2 = f.b[2] / a0, a1 = f.a[1] / a0, a2 = f.a[2] / a0;
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  /** Integrated loudness in LUFS (gated, 400 ms blocks; sounds shorter than 400 ms are measured as one block). */
  function loudness(chs, rate) {
    const fl = kFilters(rate);
    const ys = chs.map((c) => biquad(biquad(c, fl[0]), fl[1]));
    const n = ys[0].length, B = Math.round(0.4 * rate), H = Math.round(0.1 * rate);
    const blocks = [];
    const ms = (a, b) => { let t = 0; for (const y of ys) { let s = 0; for (let i = a; i < b; i++) s += y[i] * y[i]; t += s / Math.max(1, b - a); } return t; };
    if (n <= B) blocks.push(ms(0, n));
    else for (let a = 0; a + B <= n; a += H) blocks.push(ms(a, a + B));
    const L = (z) => -0.691 + 10 * Math.log10(z);
    let g = blocks.filter((z) => z > 0 && L(z) > -70);
    if (!g.length) return -Infinity;
    const rel = L(g.reduce((s, z) => s + z, 0) / g.length) - 10;
    g = g.filter((z) => L(z) > rel);
    return g.length ? L(g.reduce((s, z) => s + z, 0) / g.length) : -Infinity;
  }
  const peakDb = (chs) => { const p = X.peakOf(chs); return p > 0 ? 20 * Math.log10(p) : -Infinity; };

  function normalise(chs, rate, s) {
    if (s.norm === "off") return chs;
    const pk = X.peakOf(chs);
    if (pk < 1e-6) return chs;
    let g;
    if (s.norm === "peak") g = Math.pow(10, s.peakDb / 20) / pk;
    else {
      const l = loudness(chs, rate);
      if (!isFinite(l)) return chs;
      g = Math.pow(10, (s.lufs - l) / 20);
      g = Math.min(g, Math.pow(10, -1 / 20) / pk);           // never over -1 dB
    }
    return chs.map((c) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * g; return o; });
  }

  /** Channels, loudness, sample rate: the audio exactly as it goes into the file. */
  function process(chs, rate, s) {
    let c = toChannels(chs, s.channels);
    c = normalise(c, rate, s);
    if (rate !== s.rate) c = c.map((x) => resample(x, rate, s.rate));
    return c;
  }

  // ------------------------------------------------------------------ writing files
  function chunkBytes(meta) {
    if (!meta || (!meta.recipe && !meta.gag)) return null;
    const js = JSON.stringify(Object.assign({ app: "RageRun Comedy Sound Synth", v: 1 }, meta.recipe ? { recipe: meta.recipe } : {}, meta.gag ? { gag: meta.gag } : {}));
    return new TextEncoder().encode(js);
  }
  /** WAV at any rate: 16-bit (same dither as always), 24-bit or 32-bit float, with our recipe chunk when given. */
  function encodeWav(chs, rate, bits, meta) {
    const nc = chs.length, n = chs[0].length, bps = bits / 8, dataBytes = n * nc * bps, padData = dataBytes & 1;    // chunks start on even bytes
    const extra = chunkBytes(meta);
    const extraBytes = padData + (extra ? 8 + extra.length + (extra.length & 1) : 0);
    const out = new Uint8Array(44 + dataBytes + extraBytes);
    const dv = new DataView(out.buffer);
    const str = (o, t) => { for (let i = 0; i < 4; i++) out[o + i] = t.charCodeAt(i); };
    str(0, "RIFF"); dv.setUint32(4, 36 + dataBytes + extraBytes, true); str(8, "WAVE"); str(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, bits === 32 ? 3 : 1, true); dv.setUint16(22, nc, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * bps * nc, true);
    dv.setUint16(32, bps * nc, true); dv.setUint16(34, bits, true); str(36, "data"); dv.setUint32(40, dataBytes, true);
    let o = 44;
    if (bits === 16) {
      const F = Math.fround, re = S._internal.roundEven;
      let d = 22222;
      for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
        d = (Math.imul(d, 1664525) + 1013904223) >>> 0; const r1 = F((d >>> 8) / 16777216);
        d = (Math.imul(d, 1664525) + 1013904223) >>> 0; const r2 = F((d >>> 8) / 16777216);
        let v = F(F(chs[c][i] * F(32767)) + F(r1 - r2));
        if (v > 32767) v = 32767; if (v < -32768) v = -32768;
        dv.setInt16(o, re(v), true); o += 2;
      }
    } else if (bits === 24) {
      for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
        let v = Math.round(chs[c][i] * 8388607);
        if (v > 8388607) v = 8388607; if (v < -8388608) v = -8388608;
        out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; o += 3;
      }
    } else {
      for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { dv.setFloat32(o, chs[c][i], true); o += 4; }
    }
    if (extra) { o += padData; str(o, "rrcs"); dv.setUint32(o + 4, extra.length, true); out.set(extra, o + 8); }
    return out;
  }

  // OGG / MP3: the WebAssembly encoders load the first time they're needed.
  let libPromise = null;
  const encoders = {};
  function loadLib() {
    if (window.WasmMediaEncoder) return Promise.resolve(window.WasmMediaEncoder);
    if (!libPromise) {
      libPromise = new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = (window.CS_STATIC || "/static/") + "vendor/WasmMediaEncoder.min.js";
        sc.onload = () => (window.WasmMediaEncoder ? res(window.WasmMediaEncoder) : rej(new Error("the OGG / MP3 encoder didn't load")));
        sc.onerror = () => { libPromise = null; rej(new Error("the OGG / MP3 encoder is missing. Reinstall the app.")); };
        document.head.appendChild(sc);
      });
    }
    return libPromise;
  }
  async function encoderFor(fmt) {
    if (!encoders[fmt]) {
      const W = await loadLib();
      encoders[fmt] = W.createEncoder(fmt === "mp3" ? "audio/mpeg" : "audio/ogg", (window.CS_STATIC || "/static/") + "vendor/" + fmt + ".wasm")
        .catch((e) => { delete encoders[fmt]; throw e; });
    }
    return encoders[fmt];
  }
  let encQueue = Promise.resolve();          // one encoder per format, so encodes take turns
  function encodeCompressed(chs, rate, s) {
    const job = encQueue.then(async () => {
      const enc = await encoderFor(s.format);
      const opts = { sampleRate: rate, channels: chs.length, vbrQuality: s.format === "mp3" ? Math.min(9.99, s.mp3Q) : s.oggQ };
      if (s.format === "ogg") opts.oggSerialNo = 0x52524353;       // fixed serial: the same sound gives the same file
      enc.configure(opts);
      const parts = [];
      let total = 0;
      const pcm = chs.map((c) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] > 1 ? 1 : c[i] < -1 ? -1 : c[i]; return o; });
      const CH = 1 << 16;
      for (let i = 0; i < pcm[0].length; i += CH) {
        const b = enc.encode(pcm.map((c) => c.subarray(i, i + CH)));
        if (b.length) { parts.push(b.slice()); total += b.length; }
      }
      const f = enc.finalize();
      if (f.length) { parts.push(f.slice()); total += f.length; }
      const out = new Uint8Array(total);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    });
    encQueue = job.catch(() => {});
    return job;
  }

  /** chs at <rate> -> { bytes, ext, rate, channels, seconds, peakDb, lufs, pcm }. meta: { recipe, gag } (WAV only). */
  async function encode(chs, rate, meta, s) {
    s = s || cur;
    rate = rate || RATE;
    if (isDefault(s) && rate === RATE) {
      const bytes = X.encodeWav(chs, meta && meta.recipe || null, meta && meta.gag || null);
      return { bytes, ext: "wav", rate, channels: chs.length, seconds: chs[0].length / rate, peakDb: peakDb(chs), pcm: chs };
    }
    const pcm = process(chs, rate, s);
    const bytes = s.format === "wav" ? encodeWav(pcm, s.rate, s.bits, meta) : await encodeCompressed(pcm, s.rate, s);
    return { bytes, ext: s.format, rate: s.rate, channels: pcm.length, seconds: pcm[0].length / s.rate, peakDb: peakDb(pcm), pcm };
  }

  // ------------------------------------------------------------------ settings box
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}"${String(k) === String(v) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;

  function form(s, opt) {
    opt = opt || {};
    return `<div class="xform">
      <label>Ready-made</label><div>${sel("xPreset", PRESETS.map((p) => [p.key, p.name]).concat([["custom", "Custom"]]), s.preset)}
        <div id="xAbout" class="muted small"></div></div>
      <label>Format</label><div class="xrow">${sel("xFormat", [["wav", "WAV"], ["ogg", "OGG Vorbis"], ["mp3", "MP3"]], s.format)}
        <span id="xBitsBox">${sel("xBits", [[16, "16-bit"], [24, "24-bit"], [32, "32-bit float"]], s.bits)}</span>
        <span id="xQBox">${sel("xQ", [["small", "Small files"], ["good", "Good quality"], ["best", "Best quality"]], "good")}</span></div>
      <label>Sample rate</label><div class="xrow">${sel("xRate", [[44100, "44.1 kHz"], [48000, "48 kHz"], [22050, "22.05 kHz (retro, small)"]], s.rate)}
        ${sel("xCh", [["auto", "Mono or stereo, as made"], ["mono", "Always mono"], ["stereo", "Always stereo"]], s.channels)}</div>
      <label>Loudness</label><div class="xrow">${sel("xNorm", [["off", "As made"], ["peak", "Peak at"], ["lufs", "Even loudness"]], s.norm)}
        <span id="xPeakBox">${sel("xPeak", [[-0.1, "-0.1 dB"], [-1, "-1 dB"], [-3, "-3 dB"], [-6, "-6 dB"]], s.peakDb)}</span>
        <span id="xLufsBox">${sel("xLufs", [[-20, "Quiet (-20 LUFS)"], [-16, "Normal (-16 LUFS)"], [-12, "Loud (-12 LUFS)"]], s.lufs)}</span></div>
      <label>File names</label><div class="xrow">${sel("xStyle", [["typed", "As typed"], ["snake", "snake_case"], ["kebab", "kebab-case"], ["pascal", "PascalCase"], ["lower", "lower case"]], s.style)}
        <input id="xPrefix" placeholder="prefix (sfx_)" maxlength="20" spellcheck="false" value="${esc(s.prefix)}" title="Put in front of every name, e.g. sfx_ or snd_">
        <label class="check" title="Takes and variations get 01, 02 ... instead of 1, 2 ..."><input type="checkbox" id="xPad"${s.pad ? " checked" : ""}> 01, 02</label></div>
      <span></span><div id="xPreview" class="muted small mono"></div>
      ${opt.noSprite ? "" : `<label>Packs</label><div><label class="check" title="One file with every sound in it, plus a JSON list of where each sound starts (works with Howler.js and most web audio code)"><input type="checkbox" id="xSprite"${s.sprite ? " checked" : ""}> Also make one audio sprite (web games)</label></div>`}
      <span></span><div id="xNote" class="muted small"></div>
    </div>`;
  }
  function readForm(prev) {
    const v = (id) => ($(id) ? $(id).value : null);
    const s = Object.assign({}, prev);
    s.format = v("xFormat"); s.bits = +v("xBits"); s.rate = +v("xRate"); s.channels = v("xCh");
    s.norm = v("xNorm"); s.peakDb = +v("xPeak"); s.lufs = +v("xLufs");
    if (s.format !== "wav") { const q = QUALITY[s.format][v("xQ")]; if (q !== undefined) { if (s.format === "ogg") s.oggQ = q; else s.mp3Q = q; } }
    s.style = v("xStyle"); s.prefix = v("xPrefix") || ""; s.pad = !!($("xPad") && $("xPad").checked);
    if ($("xSprite")) s.sprite = $("xSprite").checked;
    return clean(s);
  }
  function wireForm(start, onChange) {
    let s = clean(start);
    const refresh = () => {
      $("xBitsBox").classList.toggle("hidden", s.format !== "wav");
      $("xQBox").classList.toggle("hidden", s.format === "wav");
      if (s.format !== "wav") $("xQ").value = (Object.keys(QUALITY[s.format]).find((k) => QUALITY[s.format][k] === (s.format === "ogg" ? s.oggQ : s.mp3Q)) || "good");
      $("xPeakBox").classList.toggle("hidden", s.norm !== "peak");
      $("xLufsBox").classList.toggle("hidden", s.norm !== "lufs");
      $("xPreset").value = s.preset;
      const p = PRESETS.find((x) => x.key === s.preset);
      $("xAbout").textContent = p ? p.about : "Your own settings.";
      const nm = (A().currentName && A().currentName()) || "Spring Boing";
      $("xPreview").textContent = `${fileName(nm, null, s)}.${s.format}   ·   takes: ${fileName(nm, 1, s)}.${s.format}, ${fileName(nm, 2, s)}.${s.format} ...`;
      const notes = [];
      if (s.format !== "wav") notes.push("OGG and MP3 files can't keep the recipe, so they can't be opened for editing again. Keep a WAV too if you might change the sound later.");
      if (s.format === "mp3") notes.push("MP3 adds a tiny silent gap at the start; for game sounds that must hit on time, WAV or OGG is better.");
      if (s.norm === "lufs") notes.push("Even loudness makes a set of sounds sound equally loud. It never goes over -1 dB.");
      if (s.rate === 22050) notes.push("22.05 kHz loses the top end: good for a retro feel and small files.");
      $("xNote").textContent = notes.join(" ");
      if (onChange) onChange(s);
    };
    const all = ["xFormat", "xBits", "xQ", "xRate", "xCh", "xNorm", "xPeak", "xLufs", "xStyle", "xPrefix", "xPad", "xSprite"];
    for (const id of all) if ($(id)) $(id).addEventListener(id === "xPrefix" ? "input" : "change", () => { s = readForm(s); refresh(); });
    $("xPreset").onchange = () => {
      const p = PRESETS.find((x) => x.key === $("xPreset").value);
      if (!p) { refresh(); return; }
      s = clean(Object.assign({}, s, p.set));
      for (const [id, k] of [["xFormat", "format"], ["xBits", "bits"], ["xRate", "rate"], ["xCh", "channels"], ["xNorm", "norm"], ["xPeak", "peakDb"], ["xLufs", "lufs"], ["xStyle", "style"]]) $(id).value = String(s[k]);
      $("xPrefix").value = s.prefix; $("xPad").checked = s.pad; if ($("xSprite")) $("xSprite").checked = s.sprite;
      refresh();
    };
    refresh();
    return () => s;
  }

  /** The export settings box (header menu, Save card, Gag Builder, Soundboard). */
  async function openSettings() {
    const p = A().modal(`<h2>Export settings</h2><p class="muted small">How every sound is saved: the Save buttons, variations, gags, Soundboard takes and packs.</p>${form(cur)}`,
      [{ label: "Cancel", value: false }, { label: "Use these", value: true, primary: true }]);
    $("modal").querySelector(".box").classList.add("wide");
    const get = wireForm(cur);
    const ok = await p;
    $("modal").querySelector(".box").classList.remove("wide");
    if (!ok) return false;
    set(get());
    A().toast("Saving as " + describe());
    return true;
  }

  // ------------------------------------------------------------------ packs
  /** entries: [{ name, type, group, tags, source ("built-in" | "file"), audio: async () => ({ chs, rate, recipe }) }] */
  async function exportPack(entries, title) {
    const api = A().api;
    if (!entries.length) { A().toast("There are no sounds here to export.", true); return; }
    const recipes = entries.filter((e) => e.source === "built-in" || e.editable).length;
    const folder0 = A().saveFolder || A().cfg.saveFolder || "";
    const p = A().modal(`<h2>Export a pack</h2>
      <p class="muted small">${entries.length} sound${entries.length === 1 ? "" : "s"} from <b>${esc(title)}</b>, as files ready for your game or video.</p>
      <div class="xform">
        <label>Pack name</label><div><input id="pkName" maxlength="80" spellcheck="false" value="${esc(title)}"></div>
        <label>Folder</label><div class="xrow"><input id="pkFolder" spellcheck="false" value="${esc(folder0)}" style="flex:1"><button id="pkPick">Choose...</button></div>
        <label>As</label><div class="xrow">${sel("pkZip", [["0", "A folder of files"], ["1", "One ZIP file"]], "0")}
          <span title="${recipes ? "Several takes of every built-in or editable sound (new seeds), so a game can pick one at random" : "Only built-in and editable sounds can have extra takes"}">${sel("pkTakes", [[1, "1 take each"], [3, "3 takes each"], [5, "5 takes each"]], 1)}</span></div>
        <span></span><div class="xcol">
          <label class="check"><input type="checkbox" id="pkGroup"> Subfolders by sound group (Hits, Voices ...)</label>
          <label class="check" title="manifest.json and manifest.csv: every file with its name, type, tags, length and loudness"><input type="checkbox" id="pkMan" checked> A list of the sounds (manifest.json + .csv)</label>
          <label class="check" title="WAV files only: lets you open a sound from the pack in the Sound Designer again. Games ignore it."><input type="checkbox" id="pkRecipe"> Keep the recipes in WAV files</label></div>
      </div>
      <details class="xdet" open><summary>Format: <span id="pkFmt"></span></summary>${form(cur)}</details>`,
      [{ label: "Cancel", value: false }, { label: "Export", value: true, primary: true }]);
    const box = $("modal").querySelector(".box");
    box.classList.add("wide");
    const get = wireForm(cur, (s) => { $("pkFmt").textContent = presetName(s) + " · " + describe(s); });
    $("pkPick").onclick = async () => {
      try { const r = await api("/api/pick", { start: $("pkFolder").value, title: "Export the pack to" }); if (r.path) $("pkFolder").value = r.path; } catch (e) { A().toast(e.message, true); }
    };
    const ok = await p;
    box.classList.remove("wide");
    if (!ok) return;
    const s = get();
    if (s.preset !== cur.preset || JSON.stringify(s) !== JSON.stringify(cur)) set(s);
    const opt = { name: ($("pkName").value || "").trim() || title, folder: ($("pkFolder").value || "").trim(), zip: $("pkZip").value === "1",
      takes: +$("pkTakes").value, byGroup: $("pkGroup").checked, manifest: $("pkMan").checked, keepRecipe: $("pkRecipe").checked };
    try {
      let b = await api("/api/pack/begin", { folder: opt.folder, name: opt.name, zip: opt.zip });
      if (b.exists) {
        const rep = await A().modal(`<h2>${opt.zip ? "Replace it?" : "Add to that folder?"}</h2><p><b>${esc(b.target.split(/[\\/]/).pop())}</b> is already there.</p>
          <p class="muted small">${opt.zip ? "The ZIP file is replaced." : "Files with the same names are replaced; nothing else in the folder is touched."}</p>`,
          [{ label: "Cancel", value: false }, { label: opt.zip ? "Replace" : "Go ahead", value: true, primary: true }]);
        if (!rep) return;
        b = await api("/api/pack/begin", { folder: opt.folder, name: opt.name, zip: opt.zip, replace: true });
      }
      await runPack(b.id, b.target, entries, opt, s);
    } catch (e) { A().toast("Couldn't export the pack: " + e.message, true); A().status(""); }
  }

  async function runPack(id, target, entries, opt, s) {
    const api = A().api;
    let stopped = false, done = false;
    const prog = A().modal(`<h2>Exporting the pack</h2><p id="pkProg" class="muted">Getting ready...</p><div class="xbar"><i id="pkBar"></i></div>`,
      [{ label: "Stop", value: "stop" }]);
    prog.then(() => { if (!done) stopped = true; });
    const closeProg = () => { done = true; const b = $("modalButtons").querySelector("button"); if (b && !$("modal").classList.contains("hidden")) b.click(); };
    const used = new Set(), rows = [], spriteParts = [];
    const total = entries.length * 1;
    const send = async (rel, bytes) => {
      const r = await fetch(`/api/pack/file?id=${id}&path=${encodeURIComponent(rel)}`, { method: "POST", body: bytes, headers: { "Content-Type": "application/octet-stream" } });
      let js = {}; try { js = await r.json(); } catch (e) { /* */ }
      if (!r.ok || js.error) throw new Error(js.error || "the app's server answered " + r.status);
    };
    const unique = (rel) => {
      let k = rel, i = 2;
      const dot = rel.lastIndexOf(".");
      while (used.has(k.toLowerCase())) k = rel.slice(0, dot) + (s.style === "typed" || s.style === "lower" ? " " : s.style === "kebab" ? "-" : "_") + (i++) + rel.slice(dot);
      used.add(k.toLowerCase());
      return k;
    };
    const subOf = (e) => (opt.byGroup ? fileName(e.group || "Other", null, Object.assign({}, s, { prefix: "" })).replace(/[\\/]/g, "") + "/" : "");
    try {
      for (let i = 0; i < entries.length && !stopped; i++) {
        const e = entries[i];
        if ($("pkProg")) $("pkProg").textContent = `${i + 1} of ${total}: ${e.name}`;
        if ($("pkBar")) $("pkBar").style.width = (i / total * 100).toFixed(1) + "%";
        await new Promise((r) => setTimeout(r, 0));
        let a;
        try { a = await e.audio(); } catch (err) { rows.push({ file: "", name: e.name, error: err.message }); continue; }
        const takes = a.recipe ? opt.takes : 1;
        for (let t = 0; t < takes && !stopped; t++) {
          const recipe = a.recipe ? (t === 0 ? a.recipe : A().variationOf(a.recipe)) : null;
          const chs = t === 0 ? a.chs : X.render(recipe).final;
          const enc = await encode(chs, t === 0 ? a.rate || RATE : RATE, { recipe: opt.keepRecipe && s.format === "wav" ? recipe : null }, s);
          const base = fileName(e.name, takes > 1 ? t + 1 : null, s);
          const rel = unique(subOf(e) + base + "." + enc.ext);
          await send(rel, enc.bytes);
          const lufs = loudness(enc.pcm, enc.rate);
          rows.push({ file: rel, name: e.name, take: takes > 1 ? t + 1 : 1, type: e.type || "", group: e.group || "", tags: e.tags || [],
            seconds: +enc.seconds.toFixed(3), channels: enc.channels, sample_rate: enc.rate,
            peak_db: isFinite(enc.peakDb) ? +enc.peakDb.toFixed(2) : null, loudness_lufs: isFinite(lufs) ? +lufs.toFixed(1) : null, source: e.source });
          if (s.sprite) spriteParts.push({ key: rel.replace(/\.[^.]+$/, ""), pcm: enc.pcm, rate: enc.rate });
        }
      }
      if (stopped) { await api("/api/pack/end", { id, cancel: true }); A().toast("Pack export stopped. Nothing was written."); return; }
      if ($("pkProg")) $("pkProg").textContent = "Writing the list and finishing...";
      const packBase = fileName(opt.name, null, Object.assign({}, s, { prefix: "" }));
      if (s.sprite && spriteParts.length) await sendSprite(send, packBase, spriteParts, s);
      const ok = rows.filter((r) => r.file);
      if (opt.manifest) {
        const info = A().cfg.app || {};
        const man = { pack: opt.name, made_with: `RageRun Comedy Sound Synth ${info.version || ""}`.trim(), created: new Date().toISOString(),
          format: { type: s.format, bits: s.format === "wav" ? s.bits : null, quality: s.format === "wav" ? null : qualityWord(s), sample_rate: s.rate,
            channels: s.channels, loudness: s.norm === "off" ? "as made" : s.norm === "peak" ? `peak ${s.peakDb} dB` : `${s.lufs} LUFS`, names: s.style, preset: presetName(s) },
          license: "Sounds made with RageRun Comedy Sound Synth are royalty-free: use them in commercial projects, no credit needed. Sounds from your own files keep their own licence.",
          sounds: ok };
        if (s.sprite && spriteParts.length) man.sprite = { audio: packBase + "-sprite." + s.format, json: packBase + "-sprite.json" };
        await send("manifest.json", new TextEncoder().encode(JSON.stringify(man, null, 2)));
        const q = (v) => { const t = Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        const cols = ["file", "name", "take", "type", "group", "tags", "seconds", "channels", "sample_rate", "peak_db", "loudness_lufs", "source"];
        const csv = [cols.join(",")].concat(ok.map((r) => cols.map((c) => q(r[c])).join(","))).join("\r\n") + "\r\n";
        await send("manifest.csv", new TextEncoder().encode("﻿" + csv));
      }
      const end = await api("/api/pack/end", { id });
      closeProg();
      const failed = rows.filter((r) => !r.file);
      const res = await A().modal(`<h2>Pack ready</h2><p><b>${ok.length}</b> sound file${ok.length === 1 ? "" : "s"}${s.sprite && spriteParts.length ? " + an audio sprite" : ""}${opt.manifest ? " + the list" : ""} in
        <b>${esc(end.path.split(/[\\/]/).pop())}</b>.</p><p class="muted small">${esc(describe(s))}</p>
        ${failed.length ? `<p class="small" style="color:var(--bad)">Skipped ${failed.length}: ${esc(failed.slice(0, 4).map((f) => f.name + " (" + f.error + ")").join(", "))}${failed.length > 4 ? " ..." : ""}</p>` : ""}`,
        [{ label: "Close", value: false }, { label: "Show in folder", value: true, primary: true }]);
      if (res) api("/api/reveal", { path: end.path }).catch((err) => A().toast(err.message, true));
      A().status("Exported " + opt.name);
    } catch (e) {
      closeProg();
      api("/api/pack/end", { id, cancel: true }).catch(() => {});
      throw e;
    }
  }

  /** One file with every sound one after the other (0.1 s lead-in, 0.25 s gaps) + a Howler.js-style JSON. */
  async function sendSprite(send, base, parts, s) {
    const rate = s.rate, nc = Math.max(...parts.map((p) => p.pcm.length));
    const lead = Math.round(0.1 * rate), gap = Math.round(0.25 * rate);
    let n = lead;
    for (const p of parts) n += p.pcm[0].length + gap;
    const chs = Array.from({ length: nc }, () => new Float32Array(n));
    const sprite = {};
    let o = lead;
    for (const p of parts) {
      const len = p.pcm[0].length;
      for (let c = 0; c < nc; c++) chs[c].set(p.pcm[Math.min(c, p.pcm.length - 1)], o);
      sprite[p.key] = [Math.round(o / rate * 1000), Math.round(len / rate * 1000)];
      o += len + gap;
    }
    const raw = Object.assign({}, s, { norm: "off", channels: "auto" });     // already processed: only encode
    const bytes = s.format === "wav" ? encodeWav(chs, rate, s.bits, null) : await encodeCompressed(chs, rate, raw);
    await send(base + "-sprite." + s.format, bytes);
    await send(base + "-sprite.json", new TextEncoder().encode(JSON.stringify({ src: [base + "-sprite." + s.format], sprite }, null, 2)));
  }

  function init(cfg) { cur = clean(cfg && cfg.export); paint(); }

  window.CSExport = { DEFAULTS, PRESETS, init, settings, set, clean, ext, describe, presetName, fileName, encode, encodeWav, loudness,
    resample, openSettings, exportPack, onChange: (f) => listeners.push(f), isDefault };
})();
