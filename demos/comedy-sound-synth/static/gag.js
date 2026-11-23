/* RageRun Comedy Sound Synth - Gag Builder page (Round 7, Video Sync Round 11) and the shared sound picker (window.CSPicker).
 * Video Sync: gag.video = { path, name, dur, vol } puts a video above the timeline; it plays with the sounds, the timeline
 * gets as long as the video (up to 3 minutes) and the saved sound is padded to the video's length (starts at 0). A / Q add
 * sounds at the playhead while you watch.
 * A gag is a few sounds placed on a timeline and bounced into one file:
 *   { v: 1, name, clips: [{ id, name, recipe, start (s), vol (0-1.5), pan (-1..1), mute }] }
 * Every clip is a full recipe (layers, effects, your own sounds), so the gag can be reopened from its WAV. */
(() => {
  "use strict";
  const S = window.ComedySynth, X = window.ComedyFx, L = window.ComedyLibrary, A = window.CSApp;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc, RATE = S.RATE, MAX_GAG = 30, MAX_VIDEO = 180;
  /** The timeline's length limit: 30 s, or the video's length (up to 3 minutes). */
  const limitOf = (g) => (g && g.video && g.video.dur > 0 ? Math.min(MAX_VIDEO, Math.max(MAX_GAG, g.video.dur)) : MAX_GAG);
  const lim = () => limitOf(gag);
  const CLIP_COLORS = ["#FFC93C", "#FF6FA8", "#7FD6FF", "#B9F27C", "#C9A2FF", "#FF9F5A", "#7EF0C9", "#FF7F7F"];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ------------------------------------------------------------------ rendering (cached per recipe)
  const renderCache = new Map();
  function renderRecipe(recipe) {
    const key = JSON.stringify(recipe);
    let o = renderCache.get(key);
    if (!o) {
      o = X.render(recipe).final;
      renderCache.set(key, o);
      if (renderCache.size > 120) renderCache.delete(renderCache.keys().next().value);
    }
    return o;
  }
  const clipLen = (c) => renderRecipe(c.recipe)[0].length / RATE;

  /** Mixes a gag into one sound. Returns channels (mono unless something is panned or stereo). */
  function mixGag(gag) {
    const act = gag.clips.filter((c) => !c.mute);
    const vidN = gag.video && gag.video.dur > 0 ? Math.round(Math.min(MAX_VIDEO, gag.video.dur) * RATE) : 0;
    if (!act.length) return [new Float32Array(Math.max(vidN, Math.round(RATE * 0.25)))];
    const bufs = act.map((c) => renderRecipe(c.recipe));
    const stereo = act.some((c, i) => c.pan !== 0 || bufs[i].length > 1);
    let n = 0;
    act.forEach((c, i) => { n = Math.max(n, Math.round(c.start * RATE) + bufs[i][0].length); });
    n = Math.min(Math.max(n, vidN), Math.round(limitOf(gag) * RATE));
    const Lc = new Float32Array(n), Rc = stereo ? new Float32Array(n) : null;
    act.forEach((c, k) => {
      const b = bufs[k], st = Math.round(c.start * RATE);
      let gl = c.vol, gr = c.vol;
      if (b.length === 1) { const a = (c.pan + 1) * Math.PI / 4; if (stereo) { gl *= Math.cos(a) * Math.SQRT2; gr *= Math.sin(a) * Math.SQRT2; } }
      else { gl *= Math.min(1, 1 - c.pan); gr *= Math.min(1, 1 + c.pan); }
      const bl = b[0], br = b[b.length - 1];
      for (let i = 0; i < bl.length && st + i < n; i++) { Lc[st + i] += bl[i] * gl; if (Rc) Rc[st + i] += br[i] * gr; }
    });
    const chs = Rc ? [Lc, Rc] : [Lc];
    const pk = X.peakOf(chs);
    if (pk > 0.98) for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= 0.891 / pk;
    return chs;
  }

  function cleanGag(g) {
    g = g && typeof g === "object" ? g : {};
    const num = (x, d, a, b) => clamp(typeof x === "number" && isFinite(x) ? x : d, a, b);
    const v = g.video && typeof g.video === "object" && typeof g.video.path === "string" && g.video.path ? {
      path: g.video.path, name: String(g.video.name || g.video.path.split(/[\\/]/).pop()).slice(0, 120),
      dur: num(g.video.dur, 0, 0, 36000), vol: num(g.video.vol, 0.6, 0, 1) } : null;
    const max = limitOf({ video: v });
    const clips = (Array.isArray(g.clips) ? g.clips : []).slice(0, 400).filter((c) => c && c.recipe).map((c) => ({
      id: typeof c.id === "string" ? c.id : uid(), name: String(c.name || "Sound").slice(0, 80), recipe: X.cleanRecipe(c.recipe),
      start: Math.round(num(c.start, 0, 0, max - 0.1) * 1000) / 1000, vol: num(c.vol, 1, 0, 1.5), pan: num(c.pan, 0, -1, 1), mute: !!c.mute,
    }));
    const out = { v: 1, name: String(g.name || "My Gag").slice(0, 80), clips };
    if (v) out.video = v;
    return out;
  }

  // ------------------------------------------------------------------ gag presets (our own; start "+x" = x s after the clip before it ends)
  const PRESETS = [
    { name: "Banana Slip", about: "Whoosh, slide, thud, dizzy birds.", clips: [["Fast Whoosh", 0], ["Slide Whistle Down", 0.2], ["Heavy Thud", 1.1], ["Bonked Silly", 1.35, 0.7]] },
    { name: "Pie Fight", about: "Two throws, two hits, one yelp.", clips: [["Throw Whoosh", 0], ["Pie Splat", 0.35], ["Panic Yelp", 0.55], ["Swing Whoosh", 1.4, 1, 0.4], ["Pie Splat 2", 1.65, 1, 0.4]] },
    { name: "Sneak and Get Caught", about: "Tiptoe, a squeak, the alarm, run!", clips: [["Creeping Burglar", 0], ["Door Squeak", 1.7], ["Fire Drill", 2.2, 0.6], ["Panic Yelp", 2.4], ["Panic Run", 2.9]] },
    { name: "Magic Trick", about: "Drum roll, poof, sparkles, ta-da.", clips: [["p:Drum Roll", 0], ["Disappear", "+0"], ["Pixie Dust", "+-0.4", 0.8], ["Ta-Da", 2.4]] },
    { name: "Magic Trick Fail", about: "Drum roll, a cloud of dust, wah-wah.", clips: [["p:Drum Roll", 0], ["Cloud of Dust", "+0"], ["Not Again", "+0.1"]] },
    { name: "Boxing Round", about: "Bell, one-two-three, down they go.", clips: [["Boxing Bell", 0, 0.7], ["Punch", 0.9], ["Punch 2", 1.2], ["Punch 3", 1.45], ["Body Fall", 1.9], ["Bonked Silly", 2.2, 0.6]] },
    { name: "Late for Work", about: "Snoring, the alarm, panic, gone.", clips: [["Grandpa Snore", 0], ["Rise and Shine", 2.8, 0.8], ["Panic Yelp", 4.3], ["Dash Off", 5.1]] },
    { name: "Jackpot", about: "Up the bars, the till, the win.", clips: [["Climb the Ladder", 0], ["Big Payday", 1.0], ["Champion", 2.0, 0.8]] },
    { name: "Bad Joke", about: "Ba-dum-tss... a lonely bird... wah.", clips: [["Stand-Up Rimshot", 0], ["Little Tweet", 1.2, 0.8], ["Not Again", 2.4]] },
    { name: "Cartoon Chase", about: "Running, honking, zipping, crashing.", clips: [["Panic Run", 0], ["Honk Honk Honk", 0.5], ["Dash Off", 1.3], ["Tool Shed Collapse", 1.6]] },
    { name: "Perfect Jump", about: "Wahoo, spring, land, squeak, coin.", clips: [["Wahoo", 0], ["Spring Launch", 0.15], ["Landing Thud", 1.0], ["Toy Squeak", 1.05, 0.6], ["Coin", 1.3]] },
    { name: "Level Clear", about: "A star, a coin and the win jingle.", clips: [["Star Pickup", 0], ["Coin", 0.2], ["Level Complete", 0.4]] },
  ];
  function refToRecipe(ref) {
    if (ref.startsWith("p:")) { const p = S.PRESETS.find((x) => x.name === ref.slice(2)); return p ? { name: p.name, recipe: X.cleanRecipe(X.defaultRecipe(p.settings, p.name)) } : null; }
    const e = L.byId["b:" + ref];
    return e ? { name: e.name, recipe: X.cleanRecipe(e.recipe) } : null;
  }
  function presetGag(pr) {
    const clips = [];
    let prevEnd = 0;
    for (const [ref, start, vol, pan] of pr.clips) {
      const r = refToRecipe(ref);
      if (!r) continue;
      const st = typeof start === "string" ? Math.max(0, prevEnd + parseFloat(start.slice(1))) : start;
      const c = { id: uid(), name: r.name, recipe: r.recipe, start: Math.round(st * 1000) / 1000, vol: vol || 1, pan: pan || 0, mute: false };
      clips.push(c);
      prevEnd = st + clipLen(c);
    }
    return { v: 1, name: pr.name, clips };
  }

  // ------------------------------------------------------------------ the shared sound picker
  const picker = (() => {
    let resolve = null, previewSrc = null;
    function close(v) {
      if (previewSrc) { try { previewSrc.stop(); } catch (e) { /* */ } previewSrc = null; }
      $("picker").classList.add("hidden");
      document.removeEventListener("keydown", onKey, true);
      if (resolve) { const r = resolve; resolve = null; r(v); }
    }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(null); } }
    function preview(recipe) {
      if (previewSrc) { try { previewSrc.stop(); } catch (e) { /* */ } }
      const chs = renderRecipe(recipe), c = A.audio(), ab = c.createBuffer(chs.length, chs[0].length, RATE);
      chs.forEach((ch, i) => ab.copyToChannel(ch, i));
      previewSrc = c.createBufferSource(); previewSrc.buffer = ab; previewSrc.connect(c.destination); previewSrc.start();
    }
    const all = () => L.LIBRARY.map((e) => ({ name: e.name, sub: e.type, search: e.search, get: () => X.cleanRecipe(e.recipe) }))
      .concat(S.PRESETS.map((p) => ({ name: p.name, sub: S.TYPE_BY_KEY[p.settings.type].name + " preset", search: (p.name + " " + p.settings.type + " preset " + p.description).toLowerCase(),
        get: () => X.cleanRecipe(X.defaultRecipe(p.settings, p.name)) })));
    function draw() {
      const q = $("pickSearch").value.trim().toLowerCase();
      const items = all().filter((it) => !q || q.split(/\s+/).every((w) => it.search.includes(w))).slice(0, 300);
      const box = $("pickList");
      box.innerHTML = items.length ? "" : `<div class="empty">Nothing matches "${esc(q)}".</div>`;
      for (const it of items) {
        const row = document.createElement("div");
        row.className = "pick-row";
        row.innerHTML = `<button class="pl" title="Listen">&#9654;</button><span class="nm">${esc(it.name)}</span><span class="muted small">${esc(it.sub)}</span>`;
        row.querySelector(".pl").onclick = (e) => { e.stopPropagation(); preview(it.get()); };
        row.onclick = () => close({ name: it.name, recipe: it.get() });
        box.appendChild(row);
      }
    }
    /** Opens the picker. Resolves { name, recipe } or null. */
    function pick(title) {
      if (resolve) close(null);
      return new Promise((res) => {
        resolve = res;
        $("pickTitle").textContent = title || "Pick a sound";
        $("picker").classList.remove("hidden");
        $("pickSearch").value = "";
        draw();
        $("pickSearch").focus();
        document.addEventListener("keydown", onKey, true);
      });
    }
    function wire() {
      $("pickSearch").oninput = draw;
      $("pickClose").onclick = () => close(null);
      $("picker").onclick = (e) => { if (e.target === $("picker")) close(null); };
      $("pickDesigner").onclick = () => close({ name: A.currentName(), recipe: X.cleanRecipe(JSON.parse(JSON.stringify(A.currentRecipe()))) });
      $("pickFile").onclick = async () => {
        const keep = resolve; resolve = null;
        $("picker").classList.add("hidden");
        document.removeEventListener("keydown", onKey, true);
        const r = await A.pickOwnRecipe();
        keep(r);
      };
    }
    return { pick, wire, preview };
  })();

  // ------------------------------------------------------------------ Gag Builder state
  let gag = cleanGag(null), sel = null, pps = 140, playing = null;
  const undoStack = [], redoStack = [];
  let committed = "";
  const snap = () => JSON.stringify(gag);
  function commit() {
    const now = snap();
    if (now === committed) return;
    if (committed) { undoStack.push(committed); if (undoStack.length > 100) undoStack.shift(); }
    redoStack.length = 0;
    committed = now;
    remember();
    hist();
  }
  function hist() { $("gagUndo").disabled = !undoStack.length; $("gagRedo").disabled = !redoStack.length; }
  function undo() { commit(); const s = undoStack.pop(); if (!s) return; redoStack.push(committed); gag = cleanGag(JSON.parse(s)); committed = snap(); after(); }
  function redo() { const s = redoStack.pop(); if (!s) return; undoStack.push(committed); gag = cleanGag(JSON.parse(s)); committed = snap(); after(); }
  function after() { if (sel && !gag.clips.some((c) => c.id === sel)) sel = null; stop(); videoUi(); draw(); remember(); hist(); }
  let remT = 0;
  function remember() { clearTimeout(remT); remT = setTimeout(() => A.api("/api/config", { gag }).catch(() => {}), 500); }

  // ------------------------------------------------------------------ playback
  let src = null, playStart = 0, playFrom = 0, raf = 0;
  const vid = () => $("gagVideo");
  let headT = 0;
  function stop() {
    if (src) { try { src.onended = null; src.stop(); } catch (e) { /* */ } src = null; }
    if (gag.video) { try { vid().pause(); } catch (e) { /* */ } }
    cancelAnimationFrame(raf);
    playing = null;
    $("gagPlay").innerHTML = "&#9654; Play";
    drawHead(-1);
  }
  async function play(from) {
    A.stopDesigner();
    if (window.CSLibrary) window.CSLibrary.stop();
    stop();
    await Promise.all(gag.clips.map((c) => A.ensureFiles(c.recipe)));
    const chs = mixGag(gag), c = A.audio();
    const total = chs[0].length / RATE;
    from = clamp(from || 0, 0, Math.max(0, total - 0.01));
    const ab = c.createBuffer(chs.length, chs[0].length, RATE);
    chs.forEach((ch, i) => ab.copyToChannel(ch, i));
    src = c.createBufferSource(); src.buffer = ab; src.connect(c.destination);
    src.onended = () => { src = null; stop(); };
    playStart = c.currentTime + 0.01; playFrom = from;
    src.start(playStart, from);
    playing = true;
    if (gag.video && vid().readyState >= 1) {
      const v = vid();
      v.volume = gag.video.vol; v.muted = gag.video.vol <= 0;
      try { v.currentTime = Math.min(from, (v.duration || from) - 0.02); } catch (e) { /* */ }
      v.play().catch(() => {});
    }
    $("gagPlay").innerHTML = "&#9632; Stop";
    const tick = () => {
      const t = playFrom + (c.currentTime - playStart);
      drawHead(t);
      if (gag.video && !vid().paused && Math.abs(vid().currentTime - t) > 0.12) { try { vid().currentTime = t; } catch (e) { /* */ } }   // keep the picture on the sound
      if (src) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function drawHead(t) {
    const h = $("gagHead");
    if (t >= 0) { headT = t; if ($("gagVidTime")) $("gagVidTime").textContent = fmtT(t) + (gag.video ? " / " + fmtT(gag.video.dur) : ""); }
    if (!h) return;
    if (t < 0) { h.style.display = "none"; return; }
    h.style.display = "block"; h.style.left = (t * pps) + "px";
  }

  // ------------------------------------------------------------------ drawing the timeline
  const LANE = 50, TOP = 24;
  function lanes() {
    const order = gag.clips.slice().sort((a, b) => a.start - b.start), ends = [], out = {};
    for (const c of order) {
      let k = ends.findIndex((e) => e <= c.start + 0.001);
      if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = c.start + clipLen(c);
      out[c.id] = k;
    }
    return { lane: out, count: Math.max(1, ends.length) };
  }
  function draw() {
    const tl = $("gagTl"), { lane, count } = lanes();
    let end = 0;
    for (const c of gag.clips) end = Math.max(end, c.start + clipLen(c));
    const vd = gag.video ? Math.min(MAX_VIDEO, gag.video.dur || 0) : 0, top = TOP + (gag.video ? 24 : 0);
    const secs = Math.max(4, Math.ceil(end + 1.5), Math.ceil(vd));
    tl.style.width = (secs * pps) + "px";
    tl.style.height = (top + count * LANE + 10) + "px";
    let h = "";
    const step = pps >= 200 ? 0.25 : pps >= 90 ? 0.5 : 1;
    for (let t = 0; t <= secs + 1e-6; t += step) {
      const major = Math.abs(t - Math.round(t)) < 1e-6;
      h += `<div class="tick${major ? " major" : ""}" style="left:${t * pps}px">${major ? t + " s" : ""}</div>`;
    }
    h += `<div id="gagHead" class="gag-head"></div>`;
    if (gag.video) h += `<div class="vid-bar" style="width:${Math.max(20, vd * pps)}px" title="${esc(gag.video.path)}">&#127916; ${esc(gag.video.name)}</div>`;
    gag.clips.forEach((c, i) => {
      const w = Math.max(8, clipLen(c) * pps), color = CLIP_COLORS[i % CLIP_COLORS.length];
      h += `<div class="clip${c.id === sel ? " sel" : ""}${c.mute ? " muted" : ""}" data-id="${c.id}" style="left:${c.start * pps}px;top:${top + lane[c.id] * LANE}px;width:${w}px;--c:${color}">
        <canvas></canvas><span class="cn">${esc(c.name)}</span></div>`;
    });
    tl.innerHTML = h;
    for (const el of tl.querySelectorAll(".clip")) {
      const c = gag.clips.find((x) => x.id === el.dataset.id);
      drawClipWave(el.querySelector("canvas"), c);
      clipMouse(el, c);
    }
    $("gagName").value = gag.name;
    $("gagInfo").textContent = (gag.clips.length ? `${gag.clips.length} sound${gag.clips.length > 1 ? "s" : ""} · ${end.toFixed(2)} s` : "") +
      (gag.video ? ` · video ${fmtT(gag.video.dur)}` : "");
    $("gagEmpty").innerHTML = gag.video ? `Play the video and press <b>A</b> to add a sound where the playhead is (<b>Q</b> drops the last sound again without stopping).`
      : `Pick a gag preset above, or <b>+ Add sound</b>. Drag sounds to move them (Shift = 0.1 s steps), click one to hear the gag from there. <b>&#127916; Video...</b> puts sounds on a video.`;
    $("gagBounce").textContent = gag.video ? "Save the soundtrack" : "Save as one sound";
    $("gagVidNote").classList.toggle("hidden", !gag.video);
    $("gagEmpty").classList.toggle("hidden", gag.clips.length > 0);
    drawSel();
  }
  function drawClipWave(cv, c) {
    const chs = renderRecipe(c.recipe), dpr = window.devicePixelRatio || 1;
    const w = Math.max(4, Math.round(cv.clientWidth * dpr)), h = Math.max(4, Math.round(cv.clientHeight * dpr));
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d"), n = chs[0].length;
    g.fillStyle = "rgba(20,24,50,.55)";
    for (let x = 0; x < w; x++) {
      const a = Math.floor(x / w * n), b = Math.max(a + 1, Math.floor((x + 1) / w * n));
      let m = 0;
      for (const ch of chs) for (let i = a; i < b; i += 4) { const v = Math.abs(ch[i]); if (v > m) m = v; }
      const hh = Math.max(1, m * h * 0.45 * c.vol);
      g.fillRect(x, h / 2 - hh, 1, hh * 2);
    }
  }
  function clipMouse(el, c) {
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      sel = c.id;
      for (const x of document.querySelectorAll("#gagTl .clip.sel")) x.classList.remove("sel");
      el.classList.add("sel");
      drawSel();
      const x0 = e.clientX, s0 = c.start;
      let moved = false;
      el.setPointerCapture(e.pointerId);
      el.onpointermove = (m) => {
        const dx = m.clientX - x0;
        if (Math.abs(dx) > 2) moved = true;
        if (!moved) return;
        let st = clamp(s0 + dx / pps, 0, lim() - 0.1);
        st = Math.round(st / (m.shiftKey ? 0.1 : 0.01)) * (m.shiftKey ? 0.1 : 0.01);
        c.start = Math.round(st * 1000) / 1000;
        el.style.left = (c.start * pps) + "px";
        $("gagStart").value = c.start.toFixed(2);
      };
      el.onpointerup = () => {
        el.onpointermove = el.onpointerup = null;
        if (moved) { commit(); draw(); } else play(c.start);
      };
    };
  }

  // ------------------------------------------------------------------ the selected clip
  const selClip = () => gag.clips.find((c) => c.id === sel);
  function drawSel() {
    const c = selClip();
    $("gagSel").classList.toggle("hidden", !c);
    $("gagNoSel").classList.toggle("hidden", !!c);
    if (!c) return;
    $("gagSelName").textContent = c.name;
    $("gagStart").value = c.start.toFixed(2);
    const setR = (id, v, min, max, fmt) => { const r = $(id); r.value = v; r.style.setProperty("--p", ((v - min) / (max - min) * 100) + "%"); r.nextElementSibling.textContent = fmt(v); };
    setR("gagVol", c.vol, 0, 1.5, (v) => Math.round(v * 100) + "%");
    setR("gagPan", c.pan, -1, 1, (v) => (Math.abs(v) < 0.01 ? "centre" : (v < 0 ? "L " : "R ") + Math.round(Math.abs(v) * 100)));
    $("gagMute").textContent = c.mute ? "Unmute" : "Mute";
  }

  let lastPick = null;
  async function addClip(at, again) {
    const r = again && lastPick ? lastPick : await picker.pick(gag.video && at !== undefined ? "Add a sound at " + fmtT(at) : "Add a sound to the gag");
    if (!r) return;
    lastPick = { name: r.name, recipe: X.cleanRecipe(JSON.parse(JSON.stringify(r.recipe))) };
    let start = at;
    if (start === undefined) { start = 0; for (const c of gag.clips) start = Math.max(start, c.start + clipLen(c)); start = gag.clips.length ? start : 0; }
    const c = { id: uid(), name: r.name, recipe: r.recipe, start: Math.round(clamp(start, 0, lim() - 0.1) * 100) / 100, vol: 1, pan: 0, mute: false };
    await A.ensureFiles(c.recipe);
    gag.clips.push(c);
    sel = c.id;
    commit();
    if (again && playing) { picker.preview(c.recipe); requestAnimationFrame(() => { const keep = headT; draw(); drawHead(keep); }); return; }  // keep watching
    draw();
    play(c.start);
  }

  // ------------------------------------------------------------------ Round 11: Video Sync
  const fmtT = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
  function videoUi() {
    const has = !!gag.video;
    $("gagVid").classList.toggle("hidden", !has);
    $("gagVideoBtn").innerHTML = has ? "&#127916; Change video..." : "&#127916; Video...";
    if (!has) { const v = vid(); v.removeAttribute("src"); v.load(); return; }
    const want = "/api/video?path=" + encodeURIComponent(gag.video.path);
    if (vid().getAttribute("src") !== want) { vid().setAttribute("src", want); vid().load(); }
    $("gagVidName").textContent = gag.video.name;
    const r = $("gagVidVol"); r.value = gag.video.vol; r.style.setProperty("--p", (gag.video.vol * 100) + "%");
    r.nextElementSibling.textContent = Math.round(gag.video.vol * 100) + "%";
    $("gagVidTime").textContent = fmtT(headT) + " / " + fmtT(gag.video.dur);
  }
  async function pickVideo() {
    stop();
    let r;
    try { r = await A.api("/api/pick-video", {}); } catch (e) { A.toast(e.message, true); return; }
    if (!r.path) return;
    commit();
    gag.video = { path: r.path, name: r.path.split(/[\\/]/).pop(), dur: 0, vol: gag.video ? gag.video.vol : 0.6 };
    videoUi();
    A.status("Loading the video...");
  }
  function videoWire() {
    const v = vid();
    v.addEventListener("loadedmetadata", () => {
      A.status("");
      if (!gag.video) return;
      const d = Math.round((v.duration || 0) * 1000) / 1000;
      if (d && Math.abs(d - gag.video.dur) > 0.01) {
        const first = !gag.video.dur;
        gag.video.dur = d;
        if (first) { commit(); if (d > MAX_VIDEO) A.toast("The timeline covers the first 3 minutes of this video.", true); else A.toast("Video ready: play it and press A where a sound should go."); }
        draw();
      }
      videoUi();
      try { v.currentTime = Math.min(headT, d); } catch (e) { /* */ }
    });
    v.addEventListener("error", () => {
      A.status("");
      if (!gag.video || !v.getAttribute("src")) return;
      fetch(v.getAttribute("src"), { headers: { Range: "bytes=0-0" } }).then(async (r) => {
        let msg = "";
        if (!r.ok) { try { msg = (await r.json()).error; } catch (e) { /* */ } }
        A.toast(msg || "This video can't be played here. MP4 (H.264) and WebM work best: export a copy in one of those.", true);
      }).catch(() => {});
    });
    v.onclick = () => (playing ? stop() : play(headT));
    $("gagVideoBtn").onclick = pickVideo;
    $("gagVidRemove").onclick = () => { stop(); commit(); delete gag.video; commit(); videoUi(); draw(); A.toast("Video removed (the sounds stay). Undo brings it back."); };
    $("gagVidVol").oninput = () => { if (!gag.video) return; gag.video.vol = +$("gagVidVol").value; vid().volume = gag.video.vol; vid().muted = gag.video.vol <= 0; videoUi(); };
    $("gagVidVol").onchange = () => commit();
  }

  // ------------------------------------------------------------------ bounce
  async function bounce() {
    if (!gag.clips.length) { A.toast("Add some sounds first.", true); return; }
    await Promise.all(gag.clips.map((c) => A.ensureFiles(c.recipe)));
    const name = ($("gagName").value || "").trim() || "My Gag";
    const path = await A.saveAudio(gag.video ? name + " soundtrack" : name, mixGag(gag), $("gagKeep").checked ? { gag } : null);
    if (path && gag.video) A.toast("Saved. It's as long as the video and starts at 0: put it on the video in your editor at the very start.");
    if (path) A.status("Saved " + path.split(/[\\/]/).pop());
  }
  async function toDesigner() {
    if (!gag.clips.length) { A.toast("Add some sounds first.", true); return; }
    await Promise.all(gag.clips.map((c) => A.ensureFiles(c.recipe)));
    const wav = X.encodeWav(mixGag(gag), null, null);
    stop();
    A.comedify(wav, gag.name + ".wav", "new");
  }

  // ------------------------------------------------------------------ keys (only on this page)
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.page !== "gag" || !$("modal").classList.contains("hidden") || !$("picker").classList.contains("hidden")) return;
    const t = e.target, typing = (t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type)) || t.tagName === "TEXTAREA";
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === "s") { e.preventDefault(); bounce(); return; }
    if (typing) return;
    if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (ctrl && k === "d") { e.preventDefault(); duplicate(); return; }
    if (k === " ") { e.preventDefault(); if (playing) stop(); else play(gag.video ? headT : 0); return; }
    if (k === "a" && !ctrl) { e.preventDefault(); const t = headT; stop(); addClip(t); return; }
    if (k === "q" && !ctrl && lastPick) { e.preventDefault(); addClip(headT, true); return; }
    const c = selClip();
    if (!c) return;
    if (k === "delete" || k === "backspace") { e.preventDefault(); remove(); }
    else if (k === "arrowleft" || k === "arrowright") {
      e.preventDefault();
      c.start = Math.round(clamp(c.start + (k === "arrowleft" ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01), 0, lim() - 0.1) * 1000) / 1000;
      draw(); commit();
    }
    else if (k === "m") { c.mute = !c.mute; draw(); commit(); }
  });
  function duplicate() {
    const c = selClip();
    if (!c) return;
    const d = Object.assign(JSON.parse(JSON.stringify(c)), { id: uid(), start: Math.round(Math.min(lim() - 0.1, c.start + clipLen(c)) * 100) / 100 });
    d.recipe = X.cleanRecipe(d.recipe);
    gag.clips.push(d); sel = d.id; commit(); draw();
  }
  function remove() {
    const i = gag.clips.findIndex((c) => c.id === sel);
    if (i < 0) return;
    gag.clips.splice(i, 1); sel = null; commit(); draw();
  }

  // ------------------------------------------------------------------ start
  let started = false;
  function show() {
    if (!started) {
      started = true;
      picker.wire();
      const saved = A.cfg.gag;
      gag = cleanGag(saved && saved.clips ? saved : presetGag(PRESETS[0]));
      A.cfg.gag = gag;
      if (!(saved && saved.clips)) remember();        // keep the starting gag (stable clip ids for projects)
      committed = snap();
      const sel0 = $("gagPreset");
      sel0.innerHTML = `<option value="">Start from a gag...</option>` + PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}: ${esc(p.about)}</option>`).join("");
      sel0.onchange = async () => {
        const i = sel0.value; sel0.value = "";
        if (i === "") return;
        if (gag.clips.length) {
          const ok = await A.modal(`<h2>Start from "${esc(PRESETS[+i].name)}"?</h2><p>It replaces the sounds on the timeline (Undo brings them back).</p>`,
            [{ label: "Cancel", value: false }, { label: "Use it", value: true, primary: true }]);
          if (!ok) return;
        }
        commit();
        gag = presetGag(PRESETS[+i]); sel = null; commit(); draw(); play(0);
      };
      $("gagPlay").onclick = () => (playing ? stop() : play(0));
      $("gagAdd").onclick = () => addClip();
      $("gagUndo").onclick = undo;
      $("gagRedo").onclick = redo;
      $("gagClear").onclick = async () => {
        if (!gag.clips.length) return;
        commit(); gag.clips = []; sel = null; commit(); draw();
        A.toast("Timeline cleared. Undo (Ctrl+Z) brings it back.");
      };
      $("gagZoom").oninput = () => { pps = +$("gagZoom").value; $("gagZoom").style.setProperty("--p", ((pps - 40) / (400 - 40) * 100) + "%"); draw(); };
      $("gagZoom").value = pps; $("gagZoom").style.setProperty("--p", ((pps - 40) / 360 * 100) + "%");
      $("gagName").onchange = () => { gag.name = $("gagName").value.trim().slice(0, 80) || "My Gag"; commit(); };
      $("gagTlWrap").onpointerdown = (e) => {
        if (e.target.closest(".clip")) return;
        const box = $("gagTl").getBoundingClientRect(), t = Math.max(0, (e.clientX - box.left) / pps);
        sel = null; draw();
        play(t);
      };
      $("gagTlWrap").ondblclick = (e) => {
        if (e.target.closest(".clip")) return;
        const box = $("gagTl").getBoundingClientRect();
        addClip(Math.max(0, (e.clientX - box.left) / pps));
      };
      $("gagStart").onchange = () => { const c = selClip(); if (!c) return; c.start = Math.round(clamp(parseFloat($("gagStart").value) || 0, 0, lim() - 0.1) * 1000) / 1000; commit(); draw(); };
      $("gagVol").oninput = () => { const c = selClip(); if (!c) return; c.vol = +$("gagVol").value; drawSel(); };
      $("gagVol").onchange = () => { commit(); draw(); };
      $("gagPan").oninput = () => { const c = selClip(); if (!c) return; c.pan = Math.abs(+$("gagPan").value) < 0.03 ? 0 : +$("gagPan").value; drawSel(); };
      $("gagPan").onchange = () => { commit(); draw(); };
      $("gagMute").onclick = () => { const c = selClip(); if (!c) return; c.mute = !c.mute; commit(); draw(); };
      $("gagDup").onclick = duplicate;
      $("gagDel").onclick = remove;
      $("gagEdit").onclick = () => { const c = selClip(); if (!c) return; stop(); A.openRecipeObj(c.recipe, c.name); };
      $("gagSwap").onclick = async () => {
        const c = selClip(); if (!c) return;
        const r = await picker.pick("Swap " + c.name + " for...");
        if (!r) return;
        c.recipe = r.recipe; c.name = r.name; await A.ensureFiles(c.recipe); commit(); draw(); play(c.start);
      };
      $("gagFromDesigner").onclick = () => {
        const c = selClip(); if (!c) return;
        c.recipe = X.cleanRecipe(JSON.parse(JSON.stringify(A.currentRecipe()))); c.name = A.currentName(); commit(); draw(); play(c.start);
        A.toast(c.name + " from the Sound Designer is now on the timeline.");
      };
      $("gagBounce").onclick = bounce;
      videoWire();
      $("gagToDesigner").onclick = toDesigner;
      window.addEventListener("resize", () => { if (document.body.dataset.page === "gag") draw(); });
      hist();
      Promise.all(gag.clips.map((c) => A.ensureFiles(c.recipe))).then(() => { renderCache.clear(); draw(); });
    }
    videoUi();
    draw();
  }

  /** Opens a gag (from a bounced WAV or the Soundboard). */
  function open(g, name) {
    if (!started) show();
    commit();
    gag = cleanGag(g);
    if (name) gag.name = name;
    sel = null;
    commit();
    A.showPage("gag");
    videoUi();
    Promise.all(gag.clips.map((c) => A.ensureFiles(c.recipe))).then(() => { renderCache.clear(); draw(); });
  }

  window.CSPicker = { pick: (t) => { picker.wire(); return picker.pick(t); }, preview: picker.preview, render: renderRecipe };
  /** Round 8 (projects): the timeline as it would be saved, and putting one back without leaving the page you're on. */
  function state() {
    if (started) return gag;
    if (!(A.cfg.gag && A.cfg.gag.clips)) {            // first time: make the starting gag once and keep it (stable clip ids)
      A.cfg.gag = cleanGag(presetGag(PRESETS[0]));
      A.api("/api/config", { gag: A.cfg.gag }).catch(() => {});
    }
    return A.cfg.gag = cleanGag(A.cfg.gag);
  }
  function load(g) {
    const v = cleanGag(g && Array.isArray(g.clips) ? g : { name: "My Gag", clips: [] });
    A.cfg.gag = v;
    if (started) {
      stop();
      gag = v; sel = null; undoStack.length = 0; redoStack.length = 0; committed = snap(); hist();
      renderCache.clear();
      videoUi();
      if (document.body.dataset.page === "gag") draw();
    }
    A.api("/api/config", { gag: v }).catch(() => {});
    return Promise.all(v.clips.map((c) => A.ensureFiles(c.recipe))).then(() => { renderCache.clear(); if (started && document.body.dataset.page === "gag") draw(); });
  }

  window.CSGag = { show, stop, open, mixGag, cleanGag, PRESETS, presetGag, state, load, get gag() { return gag; } };
})();
