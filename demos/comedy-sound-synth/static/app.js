/* RageRun Comedy Sound Synth - Sound Designer page (Rounds 1-9) and the shared bits the Library page uses (window.CSApp).
 * Sounds are made right here (synth.js + fx.js): instant preview, and what you hear is exactly what gets saved.
 * The local server only saves and opens files and keeps the settings. */
(() => {
  "use strict";
  const S = window.ComedySynth, X = window.ComedyFx;
  const E = () => window.CSExport;            // export.js (Round 8): formats, names, packs
  const $ = (id) => document.getElementById(id);
  const RATE = S.RATE;
  const TYPE_COLORS = ["#FFC93C", "#FF6FA8", "#7FD6FF", "#B9F27C", "#FF9F5A", "#C9A2FF", "#7EF0C9", "#FFE07A", "#FF7F7F", "#9FB7FF"];
  const LAYER_COLORS = ["#FFC93C", "#7FD6FF", "#B9F27C", "#C9A2FF"];
  const GROUP_ORDER = ["Hits & crashes", "Springs & wobbles", "Movement", "Squishy & body", "Voices", "Musical stings", "Magic & tech"];
  const SHAPE = ["pitch", "length", "squishiness", "bounce", "brightness", "randomness", "volume"];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r2 = (v) => Math.round(v * 100) / 100;
  const newSeed = () => 1 + Math.floor(Math.random() * 99998);
  // Round 9: the free web demo (dev\webdemo) sets window.CS_DEMO = { types: [...], buy, page }: other types are locked
  const DEMO = window.CS_DEMO || null;
  const demoOk = (key) => !DEMO || DEMO.types.includes(key);

  let cfg = { saveFolder: "", autoPlay: true };
  let page = "designer";
  let app = {};
  const st = {
    slots: { A: null, B: null }, active: "A", sel: 0,
    name: "", nameEdited: false, loop: false, keepRecipe: true,
    locks: {},                       // slider key -> true; "seed" too
    undo: [], redo: [], committed: "",
  };
  const rec = () => st.slots[st.active];
  const layer = () => rec().layers[st.sel];

  // ------------------------------------------------------------------ server
  async function api(path, body, raw) {
    const opt = body === undefined ? {} : {
      method: "POST", body: raw ? body : JSON.stringify(body),
      headers: { "Content-Type": raw ? "audio/wav" : "application/json" },
    };
    const r = await fetch(path, opt);
    let js = {};
    try { js = await r.json(); } catch (e) { /* not json */ }
    if (!r.ok || js.error) throw new Error(js.error || ("The app's server answered " + r.status));
    return js;
  }

  let rememberTimer = 0;
  function rememberSoon() {
    clearTimeout(rememberTimer);
    rememberTimer = setTimeout(() => {
      api("/api/config", { last: { v: 2, slots: st.slots, active: st.active, sel: st.sel, name: st.name, nameEdited: st.nameEdited,
        loop: st.loop, keepRecipe: st.keepRecipe, locks: st.locks } }).catch(() => {});
    }, 700);
  }

  // ------------------------------------------------------------------ messages
  let toastTimer = 0;
  function toast(msg, bad) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("bad", !!bad);
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), bad ? 5500 : 2600);
  }
  function status(msg) {               // Round 10: an empty message shows the version again (it used to vanish after the first message)
    const el = $("status"), ver = app && app.version ? "v" + app.version : "";
    el.textContent = msg || ver;
    el.classList.toggle("ver", !msg);
  }

  function modal(html, buttons, cls) {
    return new Promise((resolve) => {
      $("modal").querySelector(".box").className = "box" + (cls ? " " + cls : "");
      $("modalBody").innerHTML = html;
      const row = $("modalButtons");
      row.innerHTML = "";
      buttons.forEach((b, i) => {
        const el = document.createElement("button");
        el.textContent = b.label;
        if (b.primary) el.className = "primary";
        el.onclick = () => { close(); resolve(b.value !== undefined ? b.value : i); };
        row.appendChild(el);
      });
      const m = $("modal");
      m.classList.remove("hidden");
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); close(); resolve(null); }
        if (e.key === "Enter") { const p = buttons.find((b) => b.primary); if (p) { e.stopPropagation(); close(); resolve(p.value); } }
      };
      function close() { m.classList.add("hidden"); document.removeEventListener("keydown", onKey, true); }
      document.addEventListener("keydown", onKey, true);
      $("modalBody").querySelectorAll("a[data-url]").forEach((a) => a.onclick = () => api("/api/open", { url: a.dataset.url }));
      $("modalBody").querySelectorAll("a[data-reveal]").forEach((a) => a.onclick = () => api("/api/reveal", { what: "data" }).catch((e) => toast(e.message, true)));
    });
  }

  // ------------------------------------------------------------------ undo / redo (whole recipe of the slot you're on)
  const snap = () => JSON.stringify({ slot: st.active, sel: st.sel, r: rec() });
  /** Call after every finished change (slider let go, preset picked, effect switched ...). */
  function commit() {
    const now = snap();
    if (now === st.committed) return;
    if (st.committed) { st.undo.push(st.committed); if (st.undo.length > 200) st.undo.shift(); }
    st.redo = [];
    st.committed = now;
    histButtons();
    rememberSoon();
  }
  function restore(s) {
    const o = JSON.parse(s);
    st.active = o.slot;
    st.slots[o.slot] = X.cleanRecipe(o.r);
    st.sel = clamp(o.sel, 0, st.slots[o.slot].layers.length - 1);
    st.committed = s;
    refreshAll();
    histButtons();
    rememberSoon();
    if (cfg.autoPlay) playSoon();
  }
  function undo() { commit(); const s = st.undo.pop(); if (!s) return; st.redo.push(st.committed); restore(s); }
  function redo() { const s = st.redo.pop(); if (!s) return; st.undo.push(st.committed); restore(s); }
  function histButtons() { $("btnUndo").disabled = !st.undo.length; $("btnRedo").disabled = !st.redo.length; }

  // ------------------------------------------------------------------ rendering + playback
  let out = null, outKey = "", filesVersion = 0;

  // ------------------------------------------------------------------ your own sounds (Comedy-fy): decode, keep, load
  /** Reads a WAV (PCM 8/16/24/32-bit or 32-bit float). Returns { rate, chs: [Float32Array] } or null. */
  function parseWav(u8) {
    if (u8.length < 12) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const id = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (id(0) !== "RIFF" || id(8) !== "WAVE") return null;
    let o = 12, fmt = null;
    while (o + 8 <= u8.length) {
      const cid = id(o), size = dv.getUint32(o + 4, true), b = o + 8;
      if (cid === "fmt " && size >= 16) {
        fmt = { tag: dv.getUint16(b, true), ch: dv.getUint16(b + 2, true), rate: dv.getUint32(b + 4, true), bits: dv.getUint16(b + 14, true) };
        if (fmt.tag === 0xFFFE && size >= 26) fmt.tag = dv.getUint16(b + 24, true);      // extensible: the sub-format says PCM (1) or float (3)
      }
      if (cid === "data" && fmt) {
        if (fmt.tag !== 1 && fmt.tag !== 3) return null;
        const bps = fmt.bits >> 3, nc = Math.max(1, fmt.ch), n = Math.floor(Math.min(size, u8.length - b) / (bps * nc));
        if (!n || !bps) return null;
        const chs = Array.from({ length: nc }, () => new Float32Array(n));
        const isFloat = fmt.tag === 3;
        for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
          const q = b + (i * nc + c) * bps;
          let v;
          if (fmt.bits === 16) v = dv.getInt16(q, true) / 32768;
          else if (fmt.bits === 8) v = (u8[q] - 128) / 128;
          else if (fmt.bits === 24) { let x = u8[q] | (u8[q + 1] << 8) | (u8[q + 2] << 16); if (x & 0x800000) x |= ~0xFFFFFF; v = x / 8388608; }
          else if (fmt.bits === 32) v = isFloat ? dv.getFloat32(q, true) : dv.getInt32(q, true) / 2147483648;
          else return null;
          chs[c][i] = v;
        }
        return { rate: fmt.rate, chs };
      }
      o += 8 + size + (size & 1);
    }
    return null;
  }

  /** Any sound file (WAV, MP3, OGG, FLAC) -> { rate: 44100, chs } via our WAV reader or the browser's decoder. */
  async function decodeAny(bytes) {
    const w = parseWav(bytes);
    if (w && w.rate === RATE) return w;
    try {
      const ab = await audio().decodeAudioData(bytes.slice().buffer);
      return { rate: ab.sampleRate, chs: Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i)) };
    } catch (e) {
      if (w) return w;
      throw new Error("this file couldn't be read as a sound (WAV, MP3, OGG or FLAC)");
    }
  }

  /** Mono, 44.1 kHz, silent ends trimmed, at most 12 s, peak at -1 dB. */
  function prepareOwnSound(d) {
    const n0 = d.chs[0].length;
    let mono = new Float32Array(n0);
    for (const c of d.chs) for (let i = 0; i < n0; i++) mono[i] += c[i] / d.chs.length;
    if (d.rate !== RATE) {
      const k = d.rate / RATE, n = Math.max(1, Math.floor((n0 - 1) / k)), o = new Float32Array(n);
      for (let i = 0; i < n; i++) { const p = i * k, j = Math.floor(p), f = p - j; o[i] = mono[j] + ((mono[j + 1] || 0) - mono[j]) * f; }
      mono = o;
    }
    let pk = X.peakOf([mono]);
    if (pk < 1e-4) throw new Error("the sound is silent");
    const th = pk * 0.003;
    let a = 0, b = mono.length - 1;
    while (a < b && Math.abs(mono[a]) < th) a++;
    while (b > a && Math.abs(mono[b]) < th) b--;
    a = Math.max(0, a - Math.round(RATE * 0.005));
    const long = b - a + 1 > X.MAX_SECONDS * RATE;
    mono = mono.slice(a, Math.min(b + 1 + Math.round(RATE * 0.02), a + X.MAX_SECONDS * RATE));
    pk = X.peakOf([mono]);
    const g = 0.891 / pk;
    for (let i = 0; i < mono.length; i++) mono[i] *= g;
    return { mono, long };
  }

  /** Brings your own sound in: keeps a copy in the app's data folder and returns a file layer for it. */
  async function importOwnSound(bytes, fileName) {
    const d = await decodeAny(bytes);
    const { mono, long } = prepareOwnSound(d);
    const wav = S.encodeWav(mono);
    const r = await api("/api/import", wav, true);
    X.registerFile(r.id, parseWav(wav).chs[0]);
    filesVersion++;
    const name = (fileName || "Your sound").split(/[\\/]/).pop().replace(/\.(wav|mp3|ogg|flac)$/i, "") || "Your sound";
    if (long) toast("Only the first 12 seconds are used.");
    const l = X.defaultLayer(S.clean({ type: "Boing", volume: 0.9, seed: newSeed() }), null);
    l.file = { id: r.id, name: name.slice(0, 80), pitch: 0 };
    return l;
  }

  /** Loads the samples of every imported sound a recipe uses (from the app's data folder). */
  const missingFiles = new Set();
  async function ensureFiles(r) {
    const need = X.fileIds(r).filter((id) => !X.hasFile(id) && !missingFiles.has(id));
    if (!need.length) return;
    for (const id of need) {
      try {
        const res = await fetch("/api/imported?id=" + id);
        if (!res.ok) throw new Error("missing");
        const w = parseWav(new Uint8Array(await res.arrayBuffer()));
        if (!w) throw new Error("unreadable");
        X.registerFile(id, w.chs[0]);
      } catch (e) {
        missingFiles.add(id);
        toast("One of your own sounds in this recipe isn't on this PC any more, so its layer is silent.", true);
      }
    }
    filesVersion++;
    if (page === "designer") changed();
  }
  function rendered() {
    const key = JSON.stringify(rec()) + filesVersion;
    if (key !== outKey) { out = X.render(rec()); outKey = key; }
    return out;
  }

  let ctx = null, source = null, playStart = 0, playLen = 0, raf = 0;
  function audio() {
    if (!ctx) { try { ctx = new AudioContext({ sampleRate: RATE }); } catch (e) { ctx = new AudioContext(); } }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function stop() {
    if (source) { try { source.onended = null; source.stop(); } catch (e) { /* stopped */ } source = null; }
    cancelAnimationFrame(raf);
    setPlayButton(false);
    drawWave();
  }
  function play() {
    const o = rendered(), c = audio();
    stop();
    if (window.CSLibrary) window.CSLibrary.stop();
    const fin = o.final, ab = c.createBuffer(fin.length, fin[0].length, RATE);
    fin.forEach((ch, i) => ab.copyToChannel(ch, i));
    source = c.createBufferSource();
    source.buffer = ab;
    source.loop = st.loop;
    source.connect(c.destination);
    source.onended = () => { source = null; setPlayButton(false); cancelAnimationFrame(raf); drawWave(); };
    playStart = c.currentTime + 0.01;
    playLen = fin[0].length / RATE;
    source.start(playStart);
    setPlayButton(true);
    const tick = () => {
      let p = (c.currentTime - playStart) / playLen;
      if (st.loop) p = ((p % 1) + 1) % 1;
      drawWave(p);
      if (source) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function playSoon() { requestAnimationFrame(() => requestAnimationFrame(play)); }
  function togglePlay() { if (source) stop(); else play(); }
  function setPlayButton(on) {
    $("btnPlay").querySelector(".ico").innerHTML = on ? "&#9632;" : "&#9654;";
    $("btnPlay").querySelector(".lbl").textContent = on ? "Stop" : "Play";
  }

  // ------------------------------------------------------------------ waveform with trim + fade handles
  const W = { x0: 0, x1: 0, fi: 0, fo: 0, n: 1, w: 1, h: 1, dpr: 1 };
  function drawWave(pos) {
    const cv = $("wave"), dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, Math.round(cv.clientWidth * dpr)), h = Math.max(10, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext("2d");
    g.clearRect(0, 0, w, h);
    const o = rendered(), full = o.full, n = full[0].length, secs = n / RATE, r = rec();
    const top = 18 * dpr, mid = top + (h - top) / 2, amp = (h - top) * 0.46;
    // ruler
    const step = secs > 4 ? 1 : secs > 2 ? 0.5 : secs > 0.8 ? 0.25 : 0.1;
    g.font = (10 * dpr) + "px Segoe UI, sans-serif";
    for (let t = step; t < secs; t += step) {
      const x = Math.round((t / secs) * w) + 0.5;
      g.fillStyle = "rgba(149,155,196,.6)"; g.fillRect(x, 0, dpr, 6 * dpr);
      g.fillText((Math.round(t * 100) / 100) + " s", x + 3 * dpr, 13 * dpr);
      g.fillStyle = "rgba(42,48,98,.55)"; g.fillRect(x, top, 1, h - top);
    }
    g.fillStyle = "rgba(149,155,196,.25)";
    g.fillRect(0, Math.round(mid), w, 1);
    // layer starts
    if (r.layers.length > 1) r.layers.forEach((l, i) => {
      const x = Math.round((l.offset * RATE / n) * w);
      g.fillStyle = LAYER_COLORS[i]; g.globalAlpha = l.mute ? 0.3 : 0.9;
      g.beginPath(); g.moveTo(x, top); g.lineTo(x + 7 * dpr, top); g.lineTo(x, top + 7 * dpr); g.fill(); g.globalAlpha = 1;
    });
    // peaks (both channels together)
    const grad = g.createLinearGradient(0, mid - amp, 0, mid + amp);
    grad.addColorStop(0, "#FF6FA8"); grad.addColorStop(0.5, "#FFC93C"); grad.addColorStop(1, "#FF6FA8");
    g.fillStyle = grad;
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * n), b = Math.max(a + 1, Math.floor(((x + 1) / w) * n));
      let lo = 0, hi = 0;
      for (const ch of full) for (let i = a; i < b && i < n; i++) { const v = ch[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
    // trim: dim what's cut off
    const x0 = (o.start / n) * w, x1 = (o.end / n) * w;
    g.fillStyle = "rgba(9,11,26,.72)";
    g.fillRect(0, top, x0, h - top); g.fillRect(x1, top, w - x1, h - top);
    // fades
    const fi = Math.min(x1 - x0, (r.fade.in * RATE / n) * w), fo = Math.min(x1 - x0, (r.fade.out * RATE / n) * w);
    g.strokeStyle = fi > 0 || fo > 0 ? "#FF6FA8" : "rgba(255,111,168,.3)"; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(x0, h - 2 * dpr); g.lineTo(x0 + fi, top + 4 * dpr); g.lineTo(x1 - fo, top + 4 * dpr); g.lineTo(x1, h - 2 * dpr); g.stroke();
    for (const fx of [x0 + fi, x1 - fo]) { g.fillStyle = "#FF6FA8"; g.beginPath(); g.arc(fx, top + 4 * dpr, 5 * dpr, 0, Math.PI * 2); g.fill(); }
    // trim bars
    for (const tx of [x0, x1]) {
      g.fillStyle = "#FFC93C"; g.fillRect(Math.round(tx) - dpr, top, 2 * dpr, h - top);
      g.fillRect(Math.round(tx) - 5 * dpr, h - 14 * dpr, 10 * dpr, 14 * dpr);
    }
    if (pos !== undefined && pos >= 0 && pos <= 1) {
      g.fillStyle = "#ffffff";
      g.fillRect(Math.round(x0 + pos * (x1 - x0)), top, 2 * dpr, h - top);
    }
    Object.assign(W, { x0, x1, fi: x0 + fi, fo: x1 - fo, n, w, h, dpr, top });
    $("btnTrimReset").classList.toggle("hidden", !(r.trim.start > 0 || r.trim.end < 1 || r.fade.in > 0 || r.fade.out > 0));
  }

  function waveMouse() {
    const cv = $("wave");
    let drag = null, startX = 0, moved = false;
    const xAt = (e) => (e.clientX - cv.getBoundingClientRect().left) * W.dpr;
    const yAt = (e) => (e.clientY - cv.getBoundingClientRect().top) * W.dpr;
    const hit = (e) => {
      const x = xAt(e), y = yAt(e), tol = 8 * W.dpr;
      if (y < W.top + 14 * W.dpr) {
        if (Math.abs(x - W.fi) < tol) return "fadeIn";
        if (Math.abs(x - W.fo) < tol) return "fadeOut";
      }
      if (Math.abs(x - W.x0) < tol) return "start";
      if (Math.abs(x - W.x1) < tol) return "end";
      return null;
    };
    cv.addEventListener("mousemove", (e) => { if (!drag) cv.style.cursor = hit(e) ? "ew-resize" : "pointer"; });
    cv.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      drag = hit(e); startX = e.clientX; moved = false;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      if (Math.abs(e.clientX - startX) > 2) moved = true;
      if (!moved) return;
      const r = rec(), u = clamp(xAt(e) / W.w, 0, 1), secsFull = W.n / RATE, len = (r.trim.end - r.trim.start) * secsFull;
      if (drag === "start") r.trim.start = Math.min(u, r.trim.end - 0.01);
      else if (drag === "end") r.trim.end = Math.max(u, r.trim.start + 0.01);
      else if (drag === "fadeIn") r.fade.in = clamp((u - r.trim.start) * secsFull, 0, len - r.fade.out);
      else if (drag === "fadeOut") r.fade.out = clamp((r.trim.end - u) * secsFull, 0, len - r.fade.in);
      r.fade.in = Math.round(r.fade.in * 1000) / 1000; r.fade.out = Math.round(r.fade.out * 1000) / 1000;
      changed();
    });
    window.addEventListener("mouseup", () => {
      if (drag && moved) { commit(); if (cfg.autoPlay) play(); }
      drag = null;
    });
    cv.addEventListener("click", () => { if (!moved) { if (source) stop(); else play(); } });
  }

  function updateInfo() {
    const o = rendered(), fin = o.final;
    const pk = X.peakOf(fin), secs = fin[0].length / RATE;
    const db = pk > 0 ? (20 * Math.log10(pk)).toFixed(1) : "-inf";
    const l = layer(), t = S.TYPE_BY_KEY[l.sound.type];
    $("soundInfo").textContent = `${secs.toFixed(2)} s  ·  ${fin.length > 1 ? "stereo" : "mono"}  ·  peak ${db} dB`;
    $("soundTitle").textContent = st.name || l.preset || (l.file ? l.file.name : t.name);
    $("typeAbout").textContent = rec().layers.length > 1 ? rec().layers.map(layerName).join(" + ") :
      l.file ? "Your own sound: try the quick looks in Effects, or stack a Boing on top." : t.about;
    const ex = E();
    $("saveNote").textContent = ex ? `→ ${ex.fileName(baseName())}.${ex.ext()}` : "";
    $("saveFmt").textContent = ex ? ex.presetName() + ": " + ex.describe() : "";
    const wav = !ex || ex.ext() === "wav";
    $("keepRecipe").disabled = !wav;
    $("keepRecipe").parentElement.title = wav ? "Stores the recipe inside the WAV, so Open can bring the sound back for editing. Games and editors ignore it."
      : "OGG and MP3 files can't keep the recipe. Switch Format to WAV to open the sound for editing later.";
  }

  let drawQueued = false;
  /** Something changed: redraw soon (commit() separately when the change is finished). */
  function changed() {
    if (!drawQueued) {
      drawQueued = true;
      requestAnimationFrame(() => {
        drawQueued = false;
        if (source && !st.loop) stop();
        drawWave(); updateInfo();
      });
    }
    rememberSoon();
  }

  const layerName = (l) => (l.file ? "Your sound" : S.TYPE_BY_KEY[l.sound.type].name);

  // ------------------------------------------------------------------ left panel: types + presets (for the selected layer)
  const typeColor = (t) => TYPE_COLORS[t.id % TYPE_COLORS.length];
  const matches = (q, ...texts) => { const hay = texts.join(" ").toLowerCase(); return q.split(/\s+/).every((w) => !w || hay.includes(w)); };

  function drawTypes() {
    const q = $("typeSearch").value.trim().toLowerCase();
    const box = $("typeList");
    box.innerHTML = "";
    let shown = 0;
    const cur = layer().file ? null : layer().sound.type;
    for (const grp of GROUP_ORDER) {
      const types = S.TYPES.filter((t) => t.group === grp && (!q || matches(q, t.name, t.short, t.about, t.group) ||
        S.presetsFor(t.key).some((p) => matches(q, p.name, p.description))));
      if (!types.length) continue;
      const h = document.createElement("div");
      h.className = "type-group"; h.textContent = grp;
      box.appendChild(h);
      for (const t of types) {
        shown++;
        const el = document.createElement("div");
        const locked = !demoOk(t.key);
        el.className = "type" + (t.key === cur ? " on" : "") + (locked ? " locked" : "");
        el.title = locked ? t.about + " (in the full app)" : t.about;
        el.innerHTML = `<div class="dot" style="background:${typeColor(t)}">${esc(t.name[0])}</div>
          <div><div class="nm">${esc(t.name)}</div><div class="sub">${esc(t.short)}</div></div>${locked ? `<span class="lock-badge">Full app</span>` : ""}`;
        el.onclick = () => (locked ? upsell(t.name) : setType(t.key));
        box.appendChild(el);
      }
    }
    if (!shown) box.innerHTML = `<div class="empty">No sound type matches "${esc(q)}".</div>`;
    const on = box.querySelector(".type.on");
    if (on) on.scrollIntoView({ block: "nearest" });
    $("typeFor").textContent = rec().layers.length > 1 ? "for layer " + (st.sel + 1) : S.TYPES.length + " types";
  }

  function drawPresets() {
    const q = $("typeSearch").value.trim().toLowerCase();
    const box = $("presetList");
    box.innerHTML = "";
    const l = layer();
    if (l.file && !q) {
      box.innerHTML = `<div class="own"><div class="nm">&#127908; ${esc(l.file.name)}</div>
        <div class="ds">Your own sound. Shape it with Pitch and Volume, the Advanced drawer and Effects. Pick a type above to swap it for a synth sound.</div></div>`;
      return;
    }
    const list = q ? S.PRESETS.filter((p) => demoOk(p.settings.type) && matches(q, p.name, p.description, S.TYPE_BY_KEY[p.settings.type].name)) : S.presetsFor(l.sound.type);
    if (q && !list.length) { box.innerHTML = `<div class="empty">No preset matches "${esc(q)}".</div>`; return; }
    for (const p of list) {
      const el = document.createElement("div");
      el.className = "preset" + (p.name === l.preset && p.settings.type === l.sound.type ? " on" : "");
      el.title = "Load this preset and play it";
      const tag = q ? `<span class="tag">${esc(S.TYPE_BY_KEY[p.settings.type].name)}</span>` : "";
      el.innerHTML = `<div class="txt"><div class="nm">${esc(p.name)} ${tag}</div><div class="ds">${esc(p.description)}</div></div><span class="pl">&#9654;</span>`;
      el.onclick = () => loadPreset(p);
      box.appendChild(el);
    }
  }

  // ------------------------------------------------------------------ layers
  function drawLayers() {
    const r = rec(), box = $("layerTabs");
    box.innerHTML = "";
    r.layers.forEach((l, i) => {
      const el = document.createElement("div");
      el.className = "ltab" + (i === st.sel ? " on" : "") + (l.mute ? " muted" : "");
      el.innerHTML = `<span class="ldot" style="background:${LAYER_COLORS[i]}"></span><span class="lnm">${i + 1} ${esc(layerName(l))}<span class="lsub">${esc(l.file ? l.file.name : l.preset || "")}</span></span>
        <button class="lb-m${l.mute ? " on" : ""}" title="Mute this layer">M</button><button class="lb-s${l.solo ? " on" : ""}" title="Solo: hear only this layer">S</button>` +
        (r.layers.length > 1 ? `<button class="lb-x" title="Remove this layer">&times;</button>` : "");
      el.onclick = (e) => { if (e.target.tagName === "BUTTON") return; selectLayer(i); };
      el.querySelector(".lb-m").onclick = () => { l.mute = !l.mute; if (l.mute) l.solo = false; drawLayers(); changed(); commit(); if (cfg.autoPlay) play(); };
      el.querySelector(".lb-s").onclick = () => { l.solo = !l.solo; if (l.solo) l.mute = false; drawLayers(); changed(); commit(); if (cfg.autoPlay) play(); };
      const x = el.querySelector(".lb-x");
      if (x) x.onclick = () => removeLayer(i);
      box.appendChild(el);
    });
    $("btnAddLayer").disabled = r.layers.length >= 4;
    $("btnAddOwn").disabled = r.layers.length >= 4;
    drawLayerCtl();
  }

  function drawLayerCtl() {
    const box = $("layerCtl"), r = rec();
    if (r.layers.length < 2 && layer().offset === 0 && layer().pan === 0) {
      box.innerHTML = `<span class="muted small">Stack up to 4 sounds into one: a Boing + a Thud + a Squeak makes a perfect landing. Each layer gets its own type, sliders and Advanced. <b>+ Your sound</b> brings in a WAV, MP3 or OGG of your own.</span>`;
      return;
    }
    const l = layer();
    box.innerHTML = "";
    box.appendChild(miniSlider("Start", "When this layer starts", 0, 1.5, 0.005, l.offset, (v) => Math.round(v * 1000) + " ms",
      (v) => { l.offset = v; }, 0));
    box.appendChild(miniSlider("Pan", "Left or right (saves a stereo file)", -1, 1, 0.01, l.pan,
      (v) => (Math.abs(v) < 0.01 ? "centre" : (v < 0 ? "L " : "R ") + Math.round(Math.abs(v) * 100)), (v) => { l.pan = Math.abs(v) < 0.03 ? 0 : v; }, 0));
  }

  function miniSlider(label, title, min, max, step, value, fmt, set, def) {
    const el = document.createElement("div");
    el.className = "mini";
    el.title = title + " · double-click to reset";
    el.innerHTML = `<span class="lb">${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="val"></span>`;
    const r = el.querySelector("input"), v = el.querySelector(".val");
    const show = () => { v.textContent = fmt(+r.value); r.style.setProperty("--p", ((+r.value - min) / (max - min) * 100) + "%"); };
    r.value = value; show();
    r.addEventListener("input", () => { set(+r.value); show(); changed(); });
    r.addEventListener("change", () => { commit(); if (cfg.autoPlay) play(); });
    r.addEventListener("dblclick", () => { r.value = def; set(def); show(); changed(); commit(); if (cfg.autoPlay) play(); });
    return el;
  }

  function selectLayer(i) {
    st.sel = clamp(i, 0, rec().layers.length - 1);
    refreshAll();
    rememberSoon();
  }

  function addLayer() {
    const r = rec();
    if (r.layers.length >= 4) return;
    const used = new Set(r.layers.map((l) => l.sound.type));
    const pick = DEMO ? (DEMO.types.find((k) => !used.has(k)) || DEMO.types[0])
      : ["Thud", "Squeak", "Pop", "Whoosh", "Boing"].find((k) => !used.has(k)) || "Thud";
    const p = S.presetsFor(pick)[0];
    r.layers.push(X.defaultLayer(p.settings, p.name));
    st.sel = r.layers.length - 1;
    refreshAll(); changed(); commit();
    if (cfg.autoPlay) playSoon();
  }

  function removeLayer(i) {
    const r = rec();
    if (r.layers.length < 2) return;
    r.layers.splice(i, 1);
    st.sel = clamp(st.sel >= i ? st.sel - 1 : st.sel, 0, r.layers.length - 1);
    refreshAll(); changed(); commit();
    if (cfg.autoPlay) playSoon();
  }

  // ------------------------------------------------------------------ shape sliders (+ locks, seed)
  function presetBase(l) {
    const p = l.preset && S.PRESETS.find((x) => x.name === l.preset && x.settings.type === l.sound.type);
    return p ? S.clean(p.settings) : null;
  }

  function drawSliders() {
    const box = $("sliders");
    box.innerHTML = "";
    const l = layer();
    $("seedRow").classList.toggle("hidden", !!l.file);
    const say = !l.file && l.sound.type === "Babble";
    $("sayRow").classList.toggle("hidden", !say);
    if (say && document.activeElement !== $("sayText")) $("sayText").value = l.sound.text || "";
    if (l.file) { drawFileSliders(box, l); return; }
    for (const key of SHAPE) {
      const info = S.sliderInfo(key, l.sound.type);
      const el = document.createElement("div");
      el.className = "slider" + (key === "randomness" || key === "volume" ? " extra" : "");
      el.innerHTML = `<div class="row1"><span class="lb">${esc(info.label)}</span>
          <button class="lock" title="Lock: Randomize and Mutate leave this slider alone">&#128275;</button><span class="val"></span></div>
        <div class="ends"><span>${esc(info.from)}</span><input type="range" min="0" max="100" step="1" data-key="${key}"><span>${esc(info.to)}</span></div>
        <div class="hint">${esc(info.hint)}</div>`;
      const r = el.querySelector("input[type=range]");
      r.addEventListener("input", () => setSlider(key, r.value / 100));
      r.addEventListener("change", () => { commit(); if (cfg.autoPlay) play(); });
      r.addEventListener("dblclick", () => {
        const b = presetBase(layer());
        setSlider(key, b ? b[key] : key === "volume" ? 0.9 : key === "randomness" ? 0.2 : 0.5);
        commit(); if (cfg.autoPlay) play();
      });
      el.querySelector(".lock").onclick = () => { st.locks[key] = !st.locks[key]; syncSliders(); rememberSoon(); };
      box.appendChild(el);
    }
    syncSliders();
  }

  /** Your own sound: Pitch (tape-style, in semitones) and Volume. */
  function drawFileSliders(box, l) {
    const mk = (label, from, to, hint, min, max, get, set, fmt, def) => {
      const el = document.createElement("div");
      el.className = "slider own-slider";
      el.innerHTML = `<div class="row1"><span class="lb">${label}</span><span class="val"></span></div>
        <div class="ends"><span>${from}</span><input type="range" min="${min}" max="${max}" step="1"><span>${to}</span></div><div class="hint">${hint}</div>`;
      const r = el.querySelector("input"), v = el.querySelector(".val");
      const show = () => { v.textContent = fmt(+r.value); r.style.setProperty("--p", ((+r.value - min) / (max - min) * 100) + "%"); };
      r.value = get(); show();
      r.addEventListener("input", () => { set(+r.value); show(); changed(); });
      r.addEventListener("change", () => { commit(); if (cfg.autoPlay) play(); });
      r.addEventListener("dblclick", () => { r.value = def; set(def); show(); changed(); commit(); if (cfg.autoPlay) play(); });
      box.appendChild(el);
    };
    mk("Pitch", "Lower", "Higher", "Like a tape: higher plays faster, lower plays slower.", -12, 12,
      () => layer().file.pitch, (v) => { layer().file.pitch = v; }, (v) => (v > 0 ? "+" : "") + v + " st", 0);
    mk("Volume", "Quiet", "Loud", "How loud this layer is.", 0, 100,
      () => Math.round(layer().sound.volume * 100), (v) => { setSound({ volume: v / 100 }); }, (v) => v + "%", 90);
    $("shapeTitle").textContent = rec().layers.length > 1 ? `Shape layer ${st.sel + 1}: your sound` : "Shape your sound";
  }

  function syncSliders() {
    const l = layer();
    if (l.file) { drawSliders(); return; }
    if (!document.querySelector("#sliders input[data-key]")) { drawSliders(); return; }
    document.querySelectorAll("#sliders .slider").forEach((el) => {
      const r = el.querySelector("input[type=range]"), key = r.dataset.key, v = l.sound[key];
      r.value = Math.round(v * 100);
      r.style.setProperty("--p", Math.round(v * 100) + "%");
      el.querySelector(".val").textContent = Math.round(v * 100) + "%";
      const lk = el.querySelector(".lock");
      lk.classList.toggle("on", !!st.locks[key]);
      lk.innerHTML = st.locks[key] ? "&#128274;" : "&#128275;";
    });
    $("seed").value = l.sound.seed;
    $("seedLock").classList.toggle("on", !!st.locks.seed);
    $("seedLock").innerHTML = st.locks.seed ? "&#128274;" : "&#128275;";
    $("shapeTitle").textContent = rec().layers.length > 1 ? `Shape layer ${st.sel + 1}: ${S.TYPE_BY_KEY[l.sound.type].name}` : "Shape the sound";
  }

  function setSound(patch) {
    const l = layer();
    l.sound = S.clean(Object.assign({}, l.sound, patch));
  }

  function setSlider(key, v) {
    setSound({ [key]: clamp(v, 0, 1) });
    syncSliders();
    changed();
  }

  // ------------------------------------------------------------------ Advanced: pitch bend + volume shape curves, tone, grit
  function curveEditor(canvas, getPts, setPts, lo, hi, centre, color, label) {
    let drag = -1;
    const pad = 8;
    const geo = () => { const dpr = window.devicePixelRatio || 1; return { dpr, w: canvas.width, h: canvas.height, p: pad * dpr }; };
    const toXY = (pt, g) => [g.p + pt[0] * (g.w - 2 * g.p), g.p + (1 - (pt[1] - lo) / (hi - lo)) * (g.h - 2 * g.p)];
    const fromXY = (x, y, g) => [clamp((x - g.p) / (g.w - 2 * g.p), 0, 1), clamp(lo + (1 - (y - g.p) / (g.h - 2 * g.p)) * (hi - lo), lo, hi)];
    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(10, Math.round(canvas.clientWidth * dpr)), h = Math.max(10, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const g = canvas.getContext("2d"), G = geo(), pts = getPts();
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(149,155,196,.18)";
      for (const v of label.grid) { const y = toXY([0, v], G)[1]; g.fillRect(G.p, Math.round(y), w - 2 * G.p, 1); }
      g.fillStyle = "rgba(149,155,196,.45)";
      const cy = toXY([0, centre], G)[1];
      g.fillRect(G.p, Math.round(cy), w - 2 * G.p, 1);
      g.font = (9.5 * dpr) + "px Segoe UI, sans-serif"; g.fillStyle = "rgba(149,155,196,.7)";
      g.textAlign = "right";
      g.fillText(label.top, w - 4 * dpr, 11 * dpr); g.fillText(label.bottom, w - 4 * dpr, h - 4 * dpr);
      g.textAlign = "left";
      g.strokeStyle = color; g.lineWidth = 2 * dpr;
      g.beginPath();
      pts.forEach((pt, i) => { const [x, y] = toXY(pt, G); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      pts.forEach((pt, i) => { const [x, y] = toXY(pt, G); g.fillStyle = i === drag ? "#fff" : color; g.beginPath(); g.arc(x, y, 4.5 * dpr, 0, Math.PI * 2); g.fill(); });
    }
    const pos = (e) => { const b = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; return [(e.clientX - b.left) * dpr, (e.clientY - b.top) * dpr]; };
    const near = (e) => { const G = geo(), [x, y] = pos(e); return getPts().findIndex((pt) => { const [px, py] = toXY(pt, G); return Math.hypot(px - x, py - y) < 9 * G.dpr; }); };
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const pts = getPts().map((p) => p.slice());
      let i = near(e);
      if (i < 0) {
        if (pts.length >= 24) return;
        const [x, y] = pos(e), np = fromXY(x, y, geo());
        pts.push(np); pts.sort((a, b) => a[0] - b[0]);
        i = pts.indexOf(np);
        setPts(pts);
      }
      drag = i; draw(); changed();
    });
    window.addEventListener("mousemove", (e) => {
      if (drag < 0) return;
      const pts = getPts().map((p) => p.slice()), [x, y] = pos(e), np = fromXY(x, y, geo());
      const first = drag === 0, last = drag === pts.length - 1;
      np[0] = first ? 0 : last ? 1 : clamp(np[0], pts[drag - 1][0] + 0.005, pts[drag + 1][0] - 0.005);
      if (Math.abs(np[1] - centre) < (hi - lo) * 0.025) np[1] = centre;               // snaps to the middle line
      np[1] = Math.round(np[1] * 100) / 100;
      pts[drag] = np; setPts(pts); draw(); changed();
    });
    window.addEventListener("mouseup", () => { if (drag >= 0) { drag = -1; draw(); commit(); if (cfg.autoPlay) play(); } });
    const remove = (e) => {
      e.preventDefault();
      const i = near(e), pts = getPts();
      if (i > 0 && i < pts.length - 1) { setPts(pts.filter((_, k) => k !== i)); draw(); changed(); commit(); if (cfg.autoPlay) play(); }
    };
    canvas.addEventListener("dblclick", remove);
    canvas.addEventListener("contextmenu", remove);
    return { draw };
  }

  let bendEd = null, envEd = null;
  function drawAdvanced() {
    const l = layer();
    if (bendEd) bendEd.draw();
    if (envEd) envEd.draw();
    const box = $("advSliders");
    box.innerHTML = "";
    const mk = (key, label, from, to, hint) => {
      const el = document.createElement("div");
      el.className = "slider";
      el.innerHTML = `<div class="row1"><span class="lb">${label}</span><span class="val"></span></div>
        <div class="ends"><span>${from}</span><input type="range" min="0" max="100" step="1"><span>${to}</span></div><div class="hint">${hint}</div>`;
      const r = el.querySelector("input"), v = el.querySelector(".val");
      const show = () => { v.textContent = r.value + "%"; r.style.setProperty("--p", r.value + "%"); };
      r.value = Math.round(l.adv[key] * 100); show();
      r.addEventListener("input", () => { layer().adv[key] = r.value / 100; show(); changed(); });
      r.addEventListener("change", () => { commit(); if (cfg.autoPlay) play(); });
      r.addEventListener("dblclick", () => { layer().adv[key] = 0; r.value = 0; show(); changed(); commit(); if (cfg.autoPlay) play(); });
      box.appendChild(el);
    };
    mk("tone", "Tone", "As made", "Buzzy", "Pushes the sound into a buzzy, cartoon-radio edge.");
    mk("noise", "Grit", "Clean", "Gritty", "Adds noise that follows the sound: breathy, raspy, crunchy.");
    const a = l.adv, used = !X.isFlat(a.bend, 0) || !X.isFlat(a.env, 1) || a.tone > 0 || a.noise > 0;
    $("advanced").querySelector("summary").classList.toggle("used", used);
  }

  // ------------------------------------------------------------------ effects rack
  function fxToSlider(p, v) { return p.scale === "log" ? Math.log(v / p.min) / Math.log(p.max / p.min) * 1000 : (v - p.min) / (p.max - p.min) * 1000; }
  function sliderToFx(p, s) {
    let v = p.scale === "log" ? p.min * Math.pow(p.max / p.min, s / 1000) : p.min + (p.max - p.min) * s / 1000;
    v = Math.round(v / p.step) * p.step;
    return clamp(+v.toFixed(4), p.min, p.max);
  }

  function drawLooks() {
    const box = $("fxLooks");
    box.innerHTML = `<span class="lb">Quick looks</span>`;
    for (const lk of X.LOOKS) {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = lk.name; b.title = lk.about + " (switches the rack to just these effects)";
      b.onclick = () => { X.applyLook(rec(), lk); drawFx(); changed(); commit(); if (cfg.autoPlay) play(); toast(lk.name + ": " + lk.about); };
      box.appendChild(b);
    }
  }

  function drawFx() {
    const box = $("fxRack"), r = rec();
    box.innerHTML = "";
    for (const d of X.FX_DEFS) {
      const f = r.fx[d.key];
      const el = document.createElement("div");
      el.className = "fx" + (f.on ? " on" : "");
      el.innerHTML = `<div class="fx-head"><label class="toggle sm"><input type="checkbox" ${f.on ? "checked" : ""}><span></span></label>
        <span class="fx-nm">${esc(d.name)}</span><span class="fx-ab muted">${esc(d.about)}</span></div><div class="fx-params"></div>`;
      const cb = el.querySelector("input");
      cb.onchange = () => { f.on = cb.checked; el.classList.toggle("on", f.on); changed(); commit(); if (cfg.autoPlay) play(); };
      el.querySelector(".fx-nm").onclick = () => { cb.checked = !cb.checked; cb.onchange(); };
      const pbox = el.querySelector(".fx-params");
      for (const p of d.params) {
        if (p.options) {
          const row = document.createElement("div");
          row.className = "fx-opt";
          row.innerHTML = `<span class="lb">${esc(p.label)}</span>` + p.options.map(([v, n]) => `<button class="chip${f[p.k] === v ? " on" : ""}" data-v="${v}">${esc(n)}</button>`).join("");
          row.querySelectorAll("button").forEach((b) => b.onclick = () => {
            f[p.k] = b.dataset.v; f.on = true; drawFx(); changed(); commit(); if (cfg.autoPlay) play();
          });
          pbox.appendChild(row);
          continue;
        }
        const row = document.createElement("div");
        row.className = "mini";
        row.title = "Double-click to reset";
        row.innerHTML = `<span class="lb">${esc(p.label)}</span><input type="range" min="0" max="1000" step="1"><span class="val"></span>`;
        const rg = row.querySelector("input"), v = row.querySelector(".val");
        const show = () => { v.textContent = p.fmt(f[p.k]); rg.style.setProperty("--p", (rg.value / 10) + "%"); };
        rg.value = fxToSlider(p, f[p.k]); show();
        rg.addEventListener("input", () => { f[p.k] = sliderToFx(p, +rg.value); if (!f.on) { f.on = true; cb.checked = true; el.classList.add("on"); } show(); changed(); });
        rg.addEventListener("change", () => { commit(); if (cfg.autoPlay) play(); });
        rg.addEventListener("dblclick", () => { f[p.k] = p.def; rg.value = fxToSlider(p, p.def); show(); changed(); commit(); if (cfg.autoPlay) play(); });
        pbox.appendChild(row);
      }
      box.appendChild(el);
    }
  }

  // ------------------------------------------------------------------ actions
  function setName(n) { st.name = n; $("soundName").value = n; }

  function loadPreset(p) {
    const l = layer(), typeChanged = p.settings.type !== l.sound.type || !!l.file;
    const keepText = !l.file && l.sound.type === "Babble" && p.settings.type === "Babble" ? l.sound.text : null;
    l.sound = S.clean(keepText ? Object.assign({}, p.settings, { text: keepText }) : p.settings);
    l.preset = p.name;
    l.file = null;
    if (!st.nameEdited && rec().layers.length === 1) setName(p.name);
    if (typeChanged) { drawTypes(); drawSliders(); drawLayers(); } else { syncSliders(); drawLayers(); }
    drawPresets(); changed(); commit();
    if (cfg.autoPlay) playSoon();
  }

  function setType(key) {
    if (key === layer().sound.type && !layer().file) return;
    loadPreset(S.presetsFor(key)[0]);
  }

  function randomize() {
    if (layer().file) { layer().file.pitch = Math.round(Math.random() * 14 - 7); drawSliders(); afterSoundChange(); return; }
    const r = (a, b) => r2(a + (b - a) * Math.random());
    const ranges = { pitch: [0.1, 0.9], length: [0.1, 0.85], squishiness: [0, 1], bounce: [0, 1], brightness: [0.15, 0.9], randomness: [0.1, 0.5] };
    const patch = {};
    for (const [k, [a, b]] of Object.entries(ranges)) if (!st.locks[k]) patch[k] = r(a, b);
    if (!st.locks.seed) patch.seed = newSeed();
    setSound(patch);
    layer().preset = null;
    if (!st.nameEdited && rec().layers.length === 1) setName(S.TYPE_BY_KEY[layer().sound.type].name + " " + layer().sound.seed);
    afterSoundChange();
  }

  function mutate() {
    if (layer().file) { const f = layer().file; f.pitch = clamp(f.pitch + (Math.random() < 0.5 ? -1 : 1), -12, 12); drawSliders(); afterSoundChange(); return; }
    const patch = {};
    for (const k of ["pitch", "length", "squishiness", "bounce", "brightness", "randomness"]) {
      if (st.locks[k]) continue;
      patch[k] = clamp(r2(layer().sound[k] + (Math.random() * 2 - 1) * 0.09), 0, 1);
    }
    if (!st.locks.seed) patch.seed = newSeed();
    setSound(patch);
    layer().preset = null;
    afterSoundChange();
  }

  /** A new take: new seeds for every layer (the sliders stay). */
  function variationOf(r) {
    const v = X.cleanRecipe(JSON.parse(JSON.stringify(r)));
    for (const l of v.layers) { l.sound.seed = newSeed(); if (l.sound.randomness < 0.15) l.sound.randomness = 0.25; l.sound = S.clean(l.sound); }
    return v;
  }
  function variation() {
    st.slots[st.active] = variationOf(rec());
    afterSoundChange();
  }

  function afterSoundChange() {
    syncSliders(); drawPresets(); drawLayers(); changed(); commit();
    if (cfg.autoPlay) playSoon();
  }

  function setSlot(s) {
    if (s === st.active) return;
    commit();
    if (!st.slots[s]) {
      st.slots[s] = X.cleanRecipe(JSON.parse(JSON.stringify(rec())));
      toast("B is a copy of A. Change it, then flip between A and B (X).");
    }
    st.active = s;
    st.sel = clamp(st.sel, 0, rec().layers.length - 1);
    st.committed = snap();
    refreshAll(); rememberSoon();
    play();
  }

  function refreshAll() {
    $("slotA").classList.toggle("on", st.active === "A");
    $("slotB").classList.toggle("on", st.active === "B");
    $("slotB").classList.toggle("empty", !st.slots.B);
    drawTypes(); drawPresets(); drawLayers(); drawSliders(); drawAdvanced(); drawFx();
    changed();
    ensureFiles(rec());
  }

  // ------------------------------------------------------------------ saving + opening
  const folder = () => ($("saveFolder").value || "").trim();
  const baseName = () => ($("soundName").value || "").trim() || layer().preset || S.TYPE_BY_KEY[layer().sound.type].name;

  /** Saves a recipe as <file>.<ext> with the export settings (format, rate, loudness). file: the finished file name. */
  async function saveOne(file, recipe, replace, keep) {
    const o = X.render(recipe);
    const e = await E().encode(o.final, RATE, { recipe: (keep === undefined ? st.keepRecipe : keep) ? recipe : null });
    const url = `/api/save?folder=${encodeURIComponent(folder())}&name=${encodeURIComponent(file)}&ext=${e.ext}${replace ? "&replace=1" : ""}`;
    return api(url, e.bytes, true);
  }

  async function save() {
    const name = E().fileName(baseName()) + "." + E().ext();
    try {
      let r = await saveOne(name, rec(), false);
      if (r.exists) {
        const ok = await modal(`<h2>Replace it?</h2><p><b>${esc(name)}</b> is already in this folder.</p>
          <p class="muted small">Anything that uses it (a game, a video project) gets the new sound.</p>`,
          [{ label: "Cancel", value: false }, { label: "Replace", value: true, primary: true }]);
        if (!ok) return;
        r = await saveOne(name, rec(), true);
      }
      showSaved(r.path, name);
      toast("Saved " + name);
      afterSave();
    } catch (e) { toast("Couldn't save: " + e.message, true); }
  }

  async function saveVariations(n) {
    const base = baseName();
    const names = Array.from({ length: n }, (_, i) => E().fileName(base, i + 1));
    const span = `${names[0]} to ${names[n - 1]}`;
    try {
      const ex = (await api("/api/exists", { folder: folder(), names, ext: E().ext() })).exists;
      if (ex.length) {
        const ok = await modal(`<h2>Replace them?</h2><p>${ex.length} of the ${n} files (${esc(span)}) are already in this folder.</p>`,
          [{ label: "Cancel", value: false }, { label: "Replace", value: true, primary: true }]);
        if (!ok) return;
      }
      let last = null;
      for (let i = 0; i < n; i++) {
        status(`Saving take ${i + 1} of ${n}...`);
        await new Promise((r) => setTimeout(r, 0));
        last = await saveOne(names[i], i === 0 ? rec() : variationOf(rec()), true);
      }
      showSaved(last.path, span + "." + E().ext());
      toast(`Saved ${n} takes: ${span}`);
      afterSave();
    } catch (e) { toast("Couldn't save: " + e.message, true); status(""); }
  }

  function afterSave() {
    st.nameEdited = false;           // the next preset names itself again
    if (folder() !== cfg.saveFolder) { cfg.saveFolder = folder(); api("/api/config", { saveFolder: cfg.saveFolder }).catch(() => {}); }
    rememberSoon();
  }

  function showSaved(path, label) {
    const box = $("lastSaved");
    box.innerHTML = `<span>&#10003; Saved</span><span class="p" title="${esc(path)}">${esc(label)} <span class="muted">in ${esc(path.replace(/[\\/][^\\/]*$/, ""))}</span></span>`;
    const b = document.createElement("button");
    b.textContent = "Show in folder";
    b.onclick = () => api("/api/reveal", { path }).catch((e) => toast(e.message, true));
    if (!DEMO) box.appendChild(b);
    box.classList.remove("hidden");
    status("Saved " + label);
  }

  function openRecipe(bytes, fileName) {
    const r = X.readRecipe(bytes);
    if (!r) {
      const g = X.readGag(bytes);
      if (g && window.CSGag) { window.CSGag.open(g, (fileName || "").split(/[\\/]/).pop().replace(/\.wav$/i, "")); return; }
      comedify(bytes, fileName, "new"); return;
    }
    commit();
    st.slots[st.active] = r;
    st.sel = 0;
    setName((fileName || "").replace(/\.wav$/i, "").split(/[\\/]/).pop() || st.name);
    st.nameEdited = true;
    refreshAll(); commit();
    toast("Opened " + (fileName || "the sound").split(/[\\/]/).pop());
    if (cfg.autoPlay) playSoon();
  }

  async function openDialog() {
    if (DEMO) { upsell("Opening saved sounds"); return; }
    try {
      const r = await api("/api/pick-wav", { start: folder() });
      if (!r.path) return;
      const res = await fetch("/api/wav?path=" + encodeURIComponent(r.path));
      if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch (e) { /* */ } throw new Error(m || "couldn't read it"); }
      openRecipe(new Uint8Array(await res.arrayBuffer()), r.path);
    } catch (e) { toast("Couldn't open: " + e.message, true); }
  }

  function dropSupport() {
    let depth = 0;
    const hint = $("dropHint");
    window.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; hint.classList.remove("hidden"); });
    window.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; hint.classList.add("hidden"); } });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault(); depth = 0; hint.classList.add("hidden");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (!/\.(wav|mp3|ogg|flac)$/i.test(f.name)) { toast("Drop a sound file: WAV, MP3, OGG or FLAC.", true); return; }
      f.arrayBuffer().then((b) => {
        const u8 = new Uint8Array(b);
        if (/\.wav$/i.test(f.name) && (X.readRecipe(u8) || X.readGag(u8))) openRecipe(u8, f.name);
        else comedify(u8, f.name, page === "designer" && rec().layers.length < 4 && e.shiftKey ? "layer" : "new");
      });
    });
  }

  /** Your own sound into the Designer: "new" = a new sound made of it, "layer" = stacked on the current sound. */
  async function comedify(bytes, fileName, mode) {
    try {
      status("Reading " + (fileName || "the sound").split(/[\\/]/).pop() + "...");
      const l = await importOwnSound(bytes, fileName);
      showPage("designer");
      commit();
      if (mode === "layer" && rec().layers.length < 4) {
        rec().layers.push(l);
        st.sel = rec().layers.length - 1;
      } else {
        const r = X.defaultRecipe(null, null);
        r.layers = [l];
        st.slots[st.active] = X.cleanRecipe(r);
        st.sel = 0;
        setName(l.file.name + " (comedy)");
        st.nameEdited = true;
      }
      refreshAll(); commit();
      status("");
      toast("Comedy-fy: try the quick looks in Effects, change the Pitch, or add a layer on top.");
      if (cfg.autoPlay) playSoon();
    } catch (e) { status(""); toast("Couldn't bring that sound in: " + e.message, true); }
  }

  async function pickOwnSound(mode) {
    if (DEMO) { upsell("Comedy-fy (your own sounds)"); return; }
    try {
      const r = await api("/api/pick-wav", { start: folder(), anyAudio: true });
      if (!r.path) return;
      const res = await fetch("/api/audio?path=" + encodeURIComponent(r.path));
      if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch (e) { /* */ } throw new Error(m || "couldn't read it"); }
      await comedify(new Uint8Array(await res.arrayBuffer()), r.path, mode);
    } catch (e) { toast("Couldn't open: " + e.message, true); }
  }

  /** A whole recipe into the Designer (from the Library or My sounds). */
  function openRecipeObj(recipe, name) {
    showPage("designer");
    commit();
    st.slots[st.active] = X.cleanRecipe(JSON.parse(JSON.stringify(recipe)));
    st.sel = 0;
    setName(name || st.name);
    st.nameEdited = true;
    refreshAll(); commit();
    if (cfg.autoPlay) playSoon();
  }

  /** The layers of a recipe stacked onto the current sound (up to 4 layers in all). */
  function addLayersFrom(recipe, name) {
    const r = rec(), room = 4 - r.layers.length;
    if (room <= 0) { toast("This sound already has 4 layers. Remove one first.", true); return false; }
    const src = X.cleanRecipe(JSON.parse(JSON.stringify(recipe)));
    commit();
    const add = src.layers.slice(0, room);
    for (const l of add) { l.solo = false; if (src.layers.length === 1) l.offset = 0; r.layers.push(l); }
    st.sel = r.layers.length - add.length;
    refreshAll(); commit();
    const fxOn = X.FX_DEFS.some((d) => src.fx[d.key].on);
    toast(`Added ${name || "the sound"} as layer ${st.sel + 1}` + (add.length < src.layers.length ? ` (only ${add.length} of its layers fit)` : "") +
      (fxOn ? ". Its effects aren't copied: effects work on the whole sound." : "."));
    return true;
  }

  /** Saves finished audio (a gag, a Soundboard take) in the save folder with the export settings, named <name>
   *  through the name style (asks before replacing). meta: { gag } is kept inside WAV files. Returns the path or null. */
  async function saveAudio(name, chs, meta) {
    try {
      const e = await E().encode(chs, RATE, meta || null);
      const file = E().fileName(name) + "." + e.ext;
      const url = (rep) => `/api/save?folder=${encodeURIComponent(folder())}&name=${encodeURIComponent(file)}&ext=${e.ext}${rep ? "&replace=1" : ""}`;
      let r = await api(url(false), e.bytes, true);
      if (r.exists) {
        const ok = await modal(`<h2>Replace it?</h2><p><b>${esc(file)}</b> is already in your save folder.</p>`,
          [{ label: "Cancel", value: false }, { label: "Replace", value: true, primary: true }]);
        if (!ok) return null;
        r = await api(url(true), e.bytes, true);
      }
      toast("Saved " + file + " in " + folder());
      return r.path;
    } catch (e) { toast("Couldn't save: " + e.message, true); return null; }
  }

  /** Picks a sound file of your own and returns it as a recipe ({ name, recipe }) without touching the Designer. */
  async function pickOwnRecipe() {
    try {
      const r = await api("/api/pick-wav", { start: folder(), anyAudio: true });
      if (!r.path) return null;
      const res = await fetch("/api/audio?path=" + encodeURIComponent(r.path));
      if (!res.ok) throw new Error("couldn't read it");
      const bytes = new Uint8Array(await res.arrayBuffer());
      const own = /\.wav$/i.test(r.path) && X.readRecipe(bytes);
      const name = r.path.split(/[\\/]/).pop().replace(/\.(wav|mp3|ogg|flac)$/i, "");
      if (own) { await ensureFiles(own); return { name, recipe: own }; }
      const l = await importOwnSound(bytes, r.path);
      const rc = X.defaultRecipe(null, null);
      rc.layers = [l];
      return { name, recipe: X.cleanRecipe(rc) };
    } catch (e) { toast("Couldn't open: " + e.message, true); return null; }
  }

  /** Saves any recipe in the save folder with the export settings (asks before replacing). */
  async function saveRecipeAs(name, recipe) {
    try {
      await ensureFiles(recipe);
      const file = E().fileName(name) + "." + E().ext();
      let r = await saveOne(file, recipe, false);
      if (r.exists) {
        const ok = await modal(`<h2>Replace it?</h2><p><b>${esc(file)}</b> is already in your save folder.</p>`,
          [{ label: "Cancel", value: false }, { label: "Replace", value: true, primary: true }]);
        if (!ok) return null;
        r = await saveOne(file, recipe, true);
      }
      toast("Saved " + file + " in " + folder());
      return r.path;
    } catch (e) { toast("Couldn't save: " + e.message, true); return null; }
  }

  function showPage(p) {
    if (p === page) return;
    if (DEMO && p !== "designer") { upsell({ library: "The Library", gag: "The Gag Builder", board: "The Soundboard" }[p] || "That"); return; }
    page = p;
    document.body.dataset.page = p;
    document.querySelectorAll("nav.pages .page").forEach((b) => b.classList.toggle("on", b.dataset.page === p));
    $("main").classList.toggle("hidden", p !== "designer");
    $("libPage").classList.toggle("hidden", p !== "library");
    $("gagPage").classList.toggle("hidden", p !== "gag");
    $("boardPage").classList.toggle("hidden", p !== "board");
    stop();
    if (window.CSLibrary) window.CSLibrary.stop();
    if (window.CSGag) window.CSGag.stop();
    if (window.CSBoard) window.CSBoard.leave();
    if (p === "library" && window.CSLibrary) window.CSLibrary.show();
    else if (p === "gag" && window.CSGag) window.CSGag.show();
    else if (p === "board" && window.CSBoard) window.CSBoard.show();
    else if (p === "designer") requestAnimationFrame(() => { drawWave(); drawAdvanced(); });
  }

  async function pickFolder() {
    try {
      const r = await api("/api/pick", { start: folder(), title: "Save sounds in" });
      if (r.path) { $("saveFolder").value = r.path; cfg.saveFolder = r.path; api("/api/config", { saveFolder: r.path }).catch(() => {}); }
    } catch (e) { toast(e.message, true); }
  }

  /** Round 9: the EULA or the third-party notices in a scroll box. */
  async function showDoc(name, title) {
    try {
      const r = await api("/api/doc?name=" + name);
      await modal(`<h2>${esc(title)}</h2><div class="doc-text">${esc(r.text)}</div>`, [{ label: "Close", primary: true }], "doc-box");
    } catch (e) { toast("Couldn't show it: " + e.message, true); }
  }

  function about() {
    const a = app || {};
    if (DEMO) return demoAbout();
    const done = modal(`<h2>Comedy Sound Synth</h2>
      <p class="muted">Cartoon sound effects you design yourself. Offline, yours forever.</p>
      <div class="kv"><span>Version</span><span>${esc(a.version || "?")}</span>
        <span>Your sounds</span><span>Royalty-free, commercial use OK, no credit needed.</span>
        <span>Website</span><span><a data-url="${esc(a.page || "https://ragerungames.com")}">${esc((a.page || "ragerungames.com").replace(/^https:\/\//, ""))}</a></span>
        <span>Support</span><span><a data-url="mailto:${esc(a.email || "")}">${esc(a.email || "")}</a> · <a data-url="${esc(a.discord || "")}">Discord</a></span>
        <span>Settings</span><span><a data-reveal="1">Open the settings folder</a></span>
        <span>Licence</span><span><a data-act="eula">Licence agreement (EULA)</a> · <a data-act="notices">Third-party notices</a></span></div>
      <div class="help-row"><button data-act="tour">&#127891; Take the tour</button><button data-act="selftest" title="Renders every sound to check the app works on this PC (about 15 seconds)">&#129514; Run the self-test</button></div>
      <div class="keys-cols">
        <div class="keys"><span class="ksect">Sound Designer</span><kbd>Space</kbd><span>Play / stop</span><kbd>L</kbd><span>Loop</span>
          <kbd>R</kbd><span>Randomize</span><kbd>M</kbd><span>Mutate (a bit different)</span><kbd>V</kbd><span>Variation (new take)</span>
          <kbd>X</kbd><span>Flip A / B</span><span><kbd>1</kbd> &ndash; <kbd>4</kbd></span><span>Pick a layer</span>
          <kbd>Ctrl+Z</kbd><span>Undo</span><kbd>Ctrl+Y</kbd><span>Redo</span><kbd>Ctrl+S</kbd><span>Save the sound</span>
          <kbd>Ctrl+O</kbd><span>Open a saved sound</span>
          <span class="ksect">Projects</span><kbd>Ctrl+Shift+S</kbd><span>Save the project</span><kbd>Ctrl+Shift+O</kbd><span>Open a project</span></div>
        <div class="keys"><span class="ksect">Library</span><kbd>Space</kbd><span>Play / stop the picked sound</span><kbd>Arrows</kbd><span>Next sound (plays it)</span>
          <kbd>F</kbd><span>Favourite</span><kbd>Enter</kbd><span>Edit in the Sound Designer</span><kbd>/</kbd><span>Search</span>
          <span class="ksect">Gag Builder</span><kbd>Space</kbd><span>Play / stop</span><kbd>A</kbd><span>Add a sound at the playhead</span>
          <kbd>Q</kbd><span>Drop the last sound again</span><kbd>Arrows</kbd><span>Nudge (Shift = more)</span><kbd>M</kbd><span>Mute the sound</span>
          <kbd>Ctrl+D</kbd><span>Duplicate</span><kbd>Delete</kbd><span>Remove</span>
          <span class="ksect">Soundboard</span><span><kbd>1</kbd> <kbd>Q</kbd> <kbd>A</kbd> <kbd>Z</kbd> ...</span><span>Play the pads</span>
          <kbd>Space</kbd><span>Record / stop</span><kbd>Esc</kbd><span>Stop everything</span></div>
      </div>
      <p class="muted small" style="margin-top:12px">(c) RageRun Games</p>`, [{ label: "Close", primary: true }], "wide about-box");
    wireHelp(done);
  }
  function wireHelp(done) {
    $("modalBody").querySelectorAll("[data-act]").forEach((el) => el.onclick = () => {
      const act = el.dataset.act;
      $("modalButtons").querySelector("button").click();          // close the box first
      done.then(() => {
        if (act === "tour" && window.CSTour) window.CSTour.start();
        else if (act === "selftest" && window.CSSelfTest) window.CSSelfTest.open(false);
        else if (act === "eula") showDoc("eula", "Licence agreement");
        else if (act === "notices") showDoc("notices", "Third-party notices");
      });
    });
  }
  function demoAbout() {
    const d = DEMO;
    const done = modal(`<h2>Comedy Sound Synth</h2>
      <p class="muted">Free web demo · ${d.types.length} of 42 sound types. Cartoon sound effects you design yourself.</p>
      <div class="kv"><span>Your sounds</span><span>Royalty-free, commercial use OK, no credit needed. Save downloads a WAV.</span>
        <span>Full app</span><span><a data-url="${esc(d.buy)}">${esc(d.buy.replace(/^https:\/\//, ""))}</a> (Windows)</span>
        <span>Support</span><span><a data-url="mailto:support@ragerungames.com">support@ragerungames.com</a> · <a data-url="https://discord.gg/kj8D8kwttZ">Discord</a></span></div>
      <div class="keys"><kbd>Space</kbd><span>Play / stop</span><kbd>R</kbd><span>Randomize</span><kbd>M</kbd><span>Mutate (a bit different)</span>
        <kbd>V</kbd><span>Variation (new take)</span><kbd>X</kbd><span>Flip A / B</span><kbd>Ctrl+Z</kbd><span>Undo</span><kbd>Ctrl+S</kbd><span>Save WAV</span></div>
      <div class="help-row"><button data-act="tour">&#127891; Take the tour</button></div>
      <p class="muted small" style="margin-top:12px">(c) RageRun Games</p>`, [{ label: "Close", primary: true }]);
    wireHelp(done);
  }

  // ------------------------------------------------------------------ keys
  document.addEventListener("keydown", (e) => {
    if (!$("modal").classList.contains("hidden")) return;
    if (page !== "designer") return;              // the Library page has its own keys (library-page.js)
    const t = e.target, typing = (t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type)) || t.tagName === "TEXTAREA";
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === "s" && !e.shiftKey) { e.preventDefault(); save(); return; }
    if (ctrl && k === "o" && !e.shiftKey) { e.preventDefault(); openDialog(); return; }
    if (typing) return;
    if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (ctrl || e.altKey) return;
    if (k === " ") { e.preventDefault(); togglePlay(); }
    else if (k === "r") randomize();
    else if (k === "m") mutate();
    else if (k === "v") variation();
    else if (k === "l") toggleLoop();
    else if (k === "x") setSlot(st.active === "A" ? "B" : "A");
    else if (/^[1-4]$/.test(k) && +k <= rec().layers.length) selectLayer(+k - 1);
  });

  function toggleLoop() {
    st.loop = !st.loop;
    $("btnLoop").classList.toggle("on", st.loop);
    if (source) { source.loop = st.loop; if (!st.loop) { /* let it finish */ } }
    rememberSoon();
  }

  // ------------------------------------------------------------------ projects (Round 8): the Designer's part of a project file
  const designerState = () => ({ v: 2, slots: st.slots, active: st.active, sel: st.sel, name: st.name, nameEdited: st.nameEdited,
    loop: st.loop, keepRecipe: st.keepRecipe, locks: st.locks });
  /** Puts a saved Designer state back (null = a fresh start: the first preset). Clears undo. */
  async function setDesignerState(last) {
    stop();
    st.slots = { A: null, B: null }; st.active = "A"; st.sel = 0; st.locks = {}; st.loop = false; st.keepRecipe = true;
    st.name = ""; st.nameEdited = false;
    fromLast(last);
    await Promise.all([st.slots.A, st.slots.B].filter(Boolean).map((r) => ensureFiles(r)));
    st.undo = []; st.redo = []; st.committed = snap();
    $("soundName").value = st.name;
    $("keepRecipe").checked = st.keepRecipe;
    $("btnLoop").classList.toggle("on", st.loop);
    refreshAll(); histButtons(); rememberSoon();
  }

  // ------------------------------------------------------------------ start
  function fromLast(last) {
    if (last && last.v === 2 && last.slots && last.slots.A) {
      st.slots.A = X.cleanRecipe(last.slots.A);
      st.slots.B = last.slots.B ? X.cleanRecipe(last.slots.B) : null;
      st.active = last.active === "B" && st.slots.B ? "B" : "A";
      st.sel = clamp(last.sel | 0, 0, rec().layers.length - 1);
      st.loop = !!last.loop; st.keepRecipe = last.keepRecipe !== false; st.locks = last.locks || {};
      st.name = last.name || ""; st.nameEdited = !!last.nameEdited;
      return;
    }
    if (last && last.settings && S.TYPE_BY_KEY[last.settings.type]) {          // Round 1 settings
      st.slots.A = X.cleanRecipe(X.defaultRecipe(last.settings, last.preset));
      st.name = last.name || last.preset || ""; st.nameEdited = !!last.nameEdited;
      return;
    }
    const p = S.PRESETS[0];
    st.slots.A = X.cleanRecipe(X.defaultRecipe(p.settings, p.name));
    st.name = p.name;
  }
  /** Web demo: anything saved earlier with a locked type goes back to the first preset. */
  function demoGuard() {
    if (!DEMO) return;
    for (const k of ["A", "B"]) {
      const r = st.slots[k];
      if (r && r.layers.some((l) => l.file || !demoOk(l.sound.type))) {
        if (k === "B") { st.slots.B = null; continue; }
        const p = S.PRESETS[0];
        st.slots.A = X.cleanRecipe(X.defaultRecipe(p.settings, p.name)); st.name = p.name; st.nameEdited = false;
      }
    }
    if (!st.slots.B) st.active = "A";
    st.sel = clamp(st.sel, 0, rec().layers.length - 1);
  }

  /** Web demo: what a locked part does, and where to get the full app. */
  function upsell(what) {
    const d = DEMO || {};
    return modal(`<h2>${esc(what)} is in the full app</h2>
      <p>This free demo has ${d.types ? d.types.length : 4} of the 42 sound types. <b>RageRun Comedy Sound Synth</b> for Windows has:</p>
      <ul class="up-list"><li>42 sound types and 168 presets</li><li>A Library of 294 finished sounds, favourites and collections</li>
      <li>Gag Builder: sounds on a timeline, bounced into one gag</li><li>Soundboard: play sounds from the keyboard and record a take</li>
      <li>Comedy-fy your own sounds, packs for Unity, Godot, Unreal, GameMaker and web games, project files</li>
      <li>Offline, yours forever, royalty-free</li></ul>`,
      [{ label: "Keep playing", value: false }, { label: d.buyLabel || "Get the full app", primary: true, value: true }])
      .then((go) => { if (go) window.open(d.buy || "https://ragerungames.com/comedy-sound-synth/", "_blank", "noopener"); });
  }

  async function start() {
    let last = null;
    try {
      const c = await api("/api/config");
      app = c.app || {}; cfg = c; last = c.last;
    } catch (e) { toast("Couldn't load your settings: " + e.message, true); }
    E().init(cfg);
    E().onChange(() => { cfg.export = E().settings(); updateInfo(); });
    fromLast(last);
    demoGuard();
    st.committed = snap();
    $("autoPlay").checked = cfg.autoPlay !== false;
    $("saveFolder").value = cfg.saveFolder || "";
    $("soundName").value = st.name;
    $("keepRecipe").checked = st.keepRecipe;
    $("btnLoop").classList.toggle("on", st.loop);
    $("autoPlay").onchange = () => { cfg.autoPlay = $("autoPlay").checked; api("/api/config", { autoPlay: cfg.autoPlay }).catch(() => {}); };
    $("keepRecipe").onchange = () => { st.keepRecipe = $("keepRecipe").checked; rememberSoon(); };
    $("soundName").oninput = () => { st.name = $("soundName").value; st.nameEdited = st.name.trim() !== ""; updateInfo(); rememberSoon(); };
    $("saveFolder").onchange = () => { cfg.saveFolder = folder(); api("/api/config", { saveFolder: cfg.saveFolder }).catch(() => {}); };
    $("typeSearch").oninput = () => { drawTypes(); drawPresets(); };
    $("btnPlay").onclick = togglePlay;
    $("btnLoop").onclick = toggleLoop;
    $("btnRandom").onclick = randomize;
    $("btnMutate").onclick = mutate;
    $("btnVariation").onclick = variation;
    $("btnUndo").onclick = undo;
    $("btnRedo").onclick = redo;
    $("slotA").onclick = () => setSlot("A");
    $("slotB").onclick = () => setSlot("B");
    $("btnTrimReset").onclick = () => { rec().trim = { start: 0, end: 1 }; rec().fade = { in: 0, out: 0 }; changed(); commit(); if (cfg.autoPlay) play(); };
    $("btnAddLayer").onclick = addLayer;
    $("btnAddOwn").onclick = () => pickOwnSound("layer");
    let sayT = 0;
    $("sayText").oninput = () => {
      clearTimeout(sayT);
      sayT = setTimeout(() => { setSound({ text: $("sayText").value }); layer().preset = null; changed(); }, 250);
    };
    $("sayText").onchange = () => { clearTimeout(sayT); setSound({ text: $("sayText").value }); changed(); commit(); if (cfg.autoPlay) play(); };
    document.querySelectorAll("nav.pages .page").forEach((b) => b.onclick = () => showPage(b.dataset.page));
    drawLooks();
    $("seed").onchange = () => { const v = clamp(parseInt($("seed").value, 10) || 1, 1, 99999); setSound({ seed: v }); layer().preset = null; afterSoundChange(); };
    $("seedLock").onclick = () => { st.locks.seed = !st.locks.seed; syncSliders(); rememberSoon(); };
    $("seedNew").onclick = () => { setSound({ seed: newSeed() }); afterSoundChange(); };
    $("advReset").onclick = () => { layer().adv = X.defaultAdv(); drawAdvanced(); changed(); commit(); if (cfg.autoPlay) play(); };
    $("advanced").addEventListener("toggle", () => drawAdvanced());
    $("fxClear").onclick = () => { for (const d of X.FX_DEFS) rec().fx[d.key].on = false; drawFx(); changed(); commit(); if (cfg.autoPlay) play(); };
    $("btnSave").onclick = save;
    $("btnSaveTop").onclick = save;
    document.querySelectorAll(".var").forEach((b) => b.onclick = () => saveVariations(+b.dataset.n));
    $("btnPickFolder").onclick = pickFolder;
    $("btnFormat").onclick = () => E().openSettings();
    $("btnOpenFolder").onclick = () => api("/api/reveal", { path: folder(), open: true, makeFolder: true }).catch((e) => toast(e.message, true));
    $("btnOpen").onclick = openDialog;
    $("btnAbout").onclick = about;
    bendEd = curveEditor($("bendCurve"), () => layer().adv.bend, (p) => { layer().adv.bend = p; }, -12, 12, 0, "#7FD6FF",
      { top: "+12", bottom: "-12", grid: [-7, 7, -12, 12] });
    envEd = curveEditor($("envCurve"), () => layer().adv.env, (p) => { layer().adv.env = p; }, 0, 1, 1, "#B9F27C",
      { top: "100%", bottom: "0", grid: [0.25, 0.5, 0.75] });
    waveMouse();
    if (!DEMO) dropSupport();
    if (DEMO) document.body.classList.add("demo");
    window.addEventListener("resize", () => { drawWave(); drawAdvanced(); });
    refreshAll();
    histButtons();
    status("");
    window.CSAppReady = true;
    window.dispatchEvent(new Event("csapp:ready"));           // project.js starts here (needs the settings)
    if (!DEMO && !/[?&]selftest=/.test(location.search)) setInterval(pendingProjects, 1500);
  }

  /** Round 9: a .csynth double-clicked in Explorer (now or while the app was already open) opens here. */
  let pendingBusy = false;
  async function pendingProjects() {
    if (pendingBusy || !window.CSProject) return;
    pendingBusy = true;
    try {
      const r = await api("/api/pending");
      for (const path of r.open || []) { showPage("designer"); await window.CSProject.open(path); }
    } catch (e) { /* the server is busy or gone: try again next time */ }
    pendingBusy = false;
  }
  window.CSApp = {
    api, toast, modal, status, esc, audio, parseWav, decodeAny, ensureFiles, comedify, pickOwnSound, openRecipeObj,
    addLayersFrom, saveRecipeAs, saveAudio, pickOwnRecipe, variationOf, designerState, setDesignerState, updateInfo: () => updateInfo(), showPage, currentRecipe: () => rec(), currentName: () => baseName(), get page() { return page; }, stopDesigner: stop, get cfg() { return cfg; }, get saveFolder() { return folder(); },
    typeColor: (key) => typeColor(S.TYPE_BY_KEY[key] || S.TYPES[0]),
    upsell, showDoc, demo: DEMO,
  };
  start();
})();
