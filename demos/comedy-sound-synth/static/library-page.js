/* RageRun Comedy Sound Synth - Library page (Round 6).
 * Built-in sounds (library.js), favourites, collections, user tags, My sounds (folders on this PC) and Comedy-fy.
 * Sounds are made by the engine when they're first played or shown, then kept in memory while the app runs.
 * Uses the shared helpers from app.js (window.CSApp). */
(() => {
  "use strict";
  const S = window.ComedySynth, X = window.ComedyFx, L = window.ComedyLibrary, A = window.CSApp;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc, RATE = S.RATE;
  const GROUP_ICON = { "Hits & crashes": "&#128165;", "Springs & wobbles": "&#127744;", Movement: "&#128168;", "Squishy & body": "&#129440;",
    Voices: "&#128483;", "Musical stings": "&#127930;", "Magic & tech": "&#10024;", Combos: "&#129529;" };

  // ------------------------------------------------------------------ saved state (config.json "library")
  let lib = { fav: [], cols: [], folders: [], tags: {}, hover: true, shelf: "all", sort: "type" };
  let saveTimer = 0;
  function remember() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => A.api("/api/config", { library: lib }).catch(() => {}), 400);
  }
  function loadState() {
    const c = A.cfg.library;
    if (c && typeof c === "object") {
      lib.fav = Array.isArray(c.fav) ? c.fav.filter((x) => typeof x === "string") : [];
      lib.cols = Array.isArray(c.cols) ? c.cols.filter((x) => x && typeof x.name === "string").map((x) => ({ name: x.name.slice(0, 60), ids: Array.isArray(x.ids) ? x.ids.filter((i) => typeof i === "string") : [] })) : [];
      lib.folders = Array.isArray(c.folders) ? c.folders.filter((x) => typeof x === "string") : [];
      lib.tags = c.tags && typeof c.tags === "object" ? c.tags : {};
      lib.hover = c.hover !== false;
      lib.shelf = typeof c.shelf === "string" ? c.shelf : "all";
      lib.sort = ["type", "az", "new"].includes(c.sort) ? c.sort : "type";
    }
  }

  // ------------------------------------------------------------------ items
  // Built-in: { id "b:<name>", kind "b", name, type, typeKey, group, tags, recipe }
  // File:     { id "f:<path>", kind "f", name, path, ext, secs, recipe (bool, a recipe is inside), mtime, folder }
  for (const e of L.LIBRARY) e.kind = "b";
  const files = new Map();               // id -> file item (from the folders listed so far)
  const folderItems = new Map();         // folder path -> [ids]
  const itemOf = (id) => (id.startsWith("b:") ? L.byId[id] : files.get(id) || stubFile(id));
  function stubFile(id) {
    const path = id.slice(2);
    const it = { id, kind: "f", path, name: path.split(/[\\/]/).pop().replace(/\.(wav|mp3|ogg|flac)$/i, ""), ext: (path.match(/\.(\w+)$/) || ["", "wav"])[1].toLowerCase(), secs: 0, recipe: false, mtime: 0 };
    files.set(id, it);
    return it;
  }
  const saveFolder = () => A.saveFolder || (A.cfg.saveFolder || "");
  const tagsOf = (it) => (it.kind === "b" ? it.tags : []).concat(lib.tags[it.id] || []);

  async function listFolder(path, force) {
    if (folderItems.has(path) && !force) return folderItems.get(path);
    const r = await A.api("/api/list", { path });
    const ids = [];
    for (const f of r.files) {
      const id = "f:" + f.path;
      files.set(id, Object.assign({ id, kind: "f", folder: path }, f));
      ids.push(id);
    }
    folderItems.set(path, ids);
    return ids;
  }

  // ------------------------------------------------------------------ audio for an item (cached)
  const audioCache = new Map();          // id -> { chs, recipe }
  const peaksCache = new Map();          // id -> Float32Array of peaks
  function cachePut(id, v) {
    audioCache.set(id, v);
    if (audioCache.size > 80) audioCache.delete(audioCache.keys().next().value);
  }
  async function audioOf(it) {
    const hit = audioCache.get(it.id);
    if (hit) return hit;
    let v;
    if (it.kind === "b") {
      v = { chs: X.render(it.recipe).final, recipe: it.recipe };
    } else {
      const res = await fetch("/api/audio?path=" + encodeURIComponent(it.path));
      if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch (e) { /* */ } throw new Error(m || "couldn't read it"); }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const recipe = it.ext === "wav" ? X.readRecipe(bytes) : null;
      it.gag = !recipe && it.ext === "wav" && !!X.readGag(bytes);
      if (recipe) {
        await A.ensureFiles(recipe);
        v = { chs: X.render(recipe).final, recipe, bytes };
      } else {
        const d = await A.decodeAny(bytes);
        v = { chs: d.chs, rate: d.rate, recipe: null, bytes };
      }
      it.recipe = !!recipe;
      it.secs = v.chs[0].length / (v.rate || RATE);
    }
    if (it.kind === "b") it.secs = v.chs[0].length / RATE;
    cachePut(it.id, v);
    return v;
  }

  // ------------------------------------------------------------------ playback (one sound at a time)
  let src = null, playingId = null;
  function stop() {
    if (src) { try { src.onended = null; src.stop(); } catch (e) { /* stopped */ } src = null; }
    if (playingId) markPlaying(playingId, false);
    playingId = null;
  }
  async function play(it) {
    A.stopDesigner();
    stop();
    playingId = it.id;
    markPlaying(it.id, true);
    try {
      const v = await audioOf(it);
      if (playingId !== it.id) return;
      const c = A.audio(), rate = v.rate || RATE;
      const ab = c.createBuffer(v.chs.length, v.chs[0].length, rate);
      v.chs.forEach((ch, i) => ab.copyToChannel(ch, i));
      src = c.createBufferSource();
      src.buffer = ab;
      src.connect(c.destination);
      src.onended = () => { if (playingId === it.id) { markPlaying(it.id, false); playingId = null; src = null; } };
      src.start();
      drawThumb(it);
    } catch (e) {
      markPlaying(it.id, false); playingId = null;
      A.toast("Couldn't play " + it.name + ": " + e.message, true);
    }
  }
  function markPlaying(id, on) {
    const el = grid().querySelector(`.lcard[data-id="${cssEsc(id)}"]`);
    if (el) el.classList.toggle("playing", on);
  }
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));

  // ------------------------------------------------------------------ thumbnails (made a few at a time while idle)
  const thumbQueue = [];
  let thumbBusy = false;
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { observer.unobserve(e.target); queueThumb(e.target.dataset.id); }
  }, { root: null, rootMargin: "200px" });
  function queueThumb(id) {
    thumbQueue.push(id);
    if (!thumbBusy) pumpThumbs();
  }
  function pumpThumbs() {
    const id = thumbQueue.shift();
    if (!id) { thumbBusy = false; return; }
    thumbBusy = true;
    const it = itemOf(id);
    const go = it.kind === "b" ? Promise.resolve(audioOf(it)) : (it.ext === "wav" && (it.size || 0) < 25e6 ? audioOf(it) : Promise.resolve(null));
    go.then(() => drawThumb(it)).catch(() => {}).finally(() => setTimeout(pumpThumbs, 0));
  }
  function peaksOf(it) {
    let p = peaksCache.get(it.id);
    if (p) return p;
    const v = audioCache.get(it.id);
    if (!v) return null;
    const n = v.chs[0].length, B = 120;
    p = new Float32Array(B);
    for (let b = 0; b < B; b++) {
      const a = Math.floor(b / B * n), e = Math.max(a + 1, Math.floor((b + 1) / B * n));
      let m = 0;
      for (const ch of v.chs) for (let i = a; i < e && i < n; i++) { const x = Math.abs(ch[i]); if (x > m) m = x; }
      p[b] = m;
    }
    peaksCache.set(it.id, p);
    return p;
  }
  function drawThumb(it) {
    const card = grid().querySelector(`.lcard[data-id="${cssEsc(it.id)}"]`);
    if (!card) return;
    const cv = card.querySelector("canvas"), p = peaksOf(it);
    const sub = card.querySelector(".len");
    if (sub && it.secs) sub.textContent = it.secs.toFixed(2) + " s";
    if (!p) return;
    const dpr = window.devicePixelRatio || 1, w = Math.max(10, Math.round(cv.clientWidth * dpr)), h = Math.max(10, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext("2d");
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#FF6FA8"); grad.addColorStop(0.5, "#FFC93C"); grad.addColorStop(1, "#FF6FA8");
    g.fillStyle = grad;
    const mx = Math.max(...p) || 1;
    for (let x = 0; x < w; x++) {
      const v = p[Math.min(p.length - 1, Math.floor(x / w * p.length))] / mx;
      const hh = Math.max(1, v * (h * 0.44));
      g.fillRect(x, h / 2 - hh, 1, hh * 2);
    }
  }

  // ------------------------------------------------------------------ shelves (left side)
  const grid = () => $("libGrid");
  const builtinIds = () => L.LIBRARY.map((e) => e.id);
  function shelfIds(shelf, force) {
    if (shelf === "all") return Promise.resolve(builtinIds());
    if (shelf === "fav") return Promise.resolve(lib.fav.slice());
    if (shelf.startsWith("group:")) { const g = shelf.slice(6); return Promise.resolve(L.LIBRARY.filter((e) => e.group === g).map((e) => e.id)); }
    if (shelf.startsWith("col:")) { const c = lib.cols[+shelf.slice(4)]; return Promise.resolve(c ? c.ids.slice() : []); }
    if (shelf === "saved") return listFolder(saveFolder(), force);
    if (shelf.startsWith("folder:")) return listFolder(shelf.slice(7), force);
    return Promise.resolve(builtinIds());
  }
  function shelfTitle(shelf) {
    if (shelf === "all") return ["All sounds", "Every built-in sound. Click to hear one, Edit to open it in the Sound Designer."];
    if (shelf === "fav") return ["Favourites", "Sounds you starred (built-in and your own)."];
    if (shelf.startsWith("group:")) { const g = shelf.slice(6); return [g, g === "Combos" ? "Layered sounds and sounds with effects: open one to see how it's made." : "Built-in sounds in this group."]; }
    if (shelf.startsWith("col:")) { const c = lib.cols[+shelf.slice(4)]; return [c ? c.name : "Collection", "Your collection. Add sounds with the ... button on any sound."]; }
    if (shelf === "saved") return ["Saved sounds", "Your save folder: " + saveFolder()];
    if (shelf.startsWith("folder:")) return [shelf.slice(7).split(/[\\/]/).pop() || shelf.slice(7), shelf.slice(7)];
    return ["Library", ""];
  }

  function drawSide() {
    const counts = {};
    for (const e of L.LIBRARY) counts[e.group] = (counts[e.group] || 0) + 1;
    const row = (shelf, icon, name, count, extra) => `<div class="shelf${lib.shelf === shelf ? " on" : ""}" data-shelf="${esc(shelf)}" title="${esc(name)}">
      <span class="ic">${icon}</span><span class="nm">${esc(name)}</span><span class="ct">${count === "" ? "" : count}</span>${extra || ""}</div>`;
    let h = row("all", "&#127925;", "All sounds", L.LIBRARY.length) + row("fav", "&#9733;", "Favourites", lib.fav.length) + `<div class="shelf-sep"></div>`;
    for (const g of L.GROUP_ORDER) if (counts[g]) h += row("group:" + g, GROUP_ICON[g] || "&#9679;", g, counts[g]);
    $("libShelves").innerHTML = h;
    $("libCols").innerHTML = lib.cols.length ? lib.cols.map((c, i) => row("col:" + i, "&#128193;", c.name, c.ids.length,
      `<button class="x" data-ren="${i}" title="Rename">&#9998;</button><button class="x" data-del="${i}" title="Delete this collection (the sounds stay)">&times;</button>`)).join("")
      : `<div class="side-empty">Group sounds for a game or a video: + New, then add sounds with the ... button.</div>`;
    $("libFolders").innerHTML = row("saved", "&#128190;", "Saved sounds", "") + lib.folders.map((f, i) => row("folder:" + f, "&#128194;", f.split(/[\\/]/).pop() || f, "",
      `<button class="x" data-rmf="${i}" title="Stop showing this folder here (nothing is deleted)">&times;</button>`)).join("");
    for (const el of document.querySelectorAll("#libSide .shelf")) {
      el.onclick = (e) => { if (e.target.tagName === "BUTTON") return; openShelf(el.dataset.shelf); };
    }
    for (const b of document.querySelectorAll("#libCols [data-ren]")) b.onclick = () => renameCol(+b.dataset.ren);
    for (const b of document.querySelectorAll("#libCols [data-del]")) b.onclick = () => deleteCol(+b.dataset.del);
    for (const b of document.querySelectorAll("#libFolders [data-rmf]")) b.onclick = () => {
      const f = lib.folders[+b.dataset.rmf];
      lib.folders.splice(+b.dataset.rmf, 1);
      if (lib.shelf === "folder:" + f) lib.shelf = "all";
      remember(); drawSide(); drawGrid();
    };
  }

  // ------------------------------------------------------------------ the grid
  let currentIds = [], tagFilter = new Set(), selId = null, drawToken = 0;
  function openShelf(shelf) {
    lib.shelf = shelf; tagFilter.clear(); remember();
    drawSide(); drawGrid(true, true);
  }

  async function drawGrid(scrollTop, force) {
    const token = ++drawToken;
    const [title, about] = shelfTitle(lib.shelf);
    $("libTitle").textContent = title;
    $("libAbout").textContent = about;
    let ids;
    try { ids = await shelfIds(lib.shelf, force); } catch (e) {
      grid().innerHTML = `<div class="lib-empty">${esc(e.message)}</div>`; $("libCount").textContent = ""; $("libTags").innerHTML = ""; return;
    }
    if (token !== drawToken) return;
    const q = $("libSearch").value.trim().toLowerCase();
    const searchAll = q && (lib.shelf === "all" || lib.shelf.startsWith("group:"));
    let items = (searchAll ? builtinIds() : ids).map(itemOf).filter(Boolean);
    if (q) items = items.filter((it) => q.split(/\s+/).every((w) => !w || ((it.search || it.name.toLowerCase()) + " " + tagsOf(it).join(" ").toLowerCase()).includes(w)));
    // tag chips: the most common tags here
    const tc = {};
    for (const it of items) for (const t of tagsOf(it)) tc[t] = (tc[t] || 0) + 1;
    const top = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 22).map((x) => x[0]);
    for (const t of tagFilter) if (!top.includes(t)) top.unshift(t);
    if (tagFilter.size) items = items.filter((it) => [...tagFilter].every((t) => tagsOf(it).includes(t)));
    $("libTags").innerHTML = top.map((t) => `<button class="chip${tagFilter.has(t) ? " on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
    for (const b of $("libTags").querySelectorAll("button")) b.onclick = () => { tagFilter.has(b.dataset.tag) ? tagFilter.delete(b.dataset.tag) : tagFilter.add(b.dataset.tag); drawGrid(); };
    // order
    const groupIdx = (it) => (it.group ? L.GROUP_ORDER.indexOf(it.group) : 99);
    if (lib.sort === "az") items.sort((a, b) => a.name.localeCompare(b.name));
    else if (lib.sort === "new" || items.every((it) => it.kind === "f")) items.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    else items.sort((a, b) => groupIdx(a) - groupIdx(b) || (a.type || "").localeCompare(b.type || "") || 0);
    currentIds = items.map((it) => it.id);
    $("libCount").textContent = items.length + (items.length === 1 ? " sound" : " sounds") + (searchAll && lib.shelf !== "all" ? " (searching all built-in sounds)" : "");
    const g = grid();
    observer.disconnect();
    g.innerHTML = "";
    if (!items.length) {
      g.innerHTML = `<div class="lib-empty">${emptyText(q)}</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(card(it));
    g.appendChild(frag);
    if (scrollTop) g.scrollTop = 0;
    for (const el of g.querySelectorAll(".lcard")) {
      const it = itemOf(el.dataset.id);
      if (peaksCache.has(it.id) || audioCache.has(it.id)) drawThumb(it); else observer.observe(el);
    }
  }

  function emptyText(q) {
    if (q || tagFilter.size) return "No sound matches that. Try another word, or clear the tags.";
    if (lib.shelf === "fav") return "No favourites yet: click the &#9733; on any sound.";
    if (lib.shelf.startsWith("col:")) return "This collection is empty. Add sounds with the ... button on any sound.";
    if (lib.shelf === "saved" || lib.shelf.startsWith("folder:")) return "No sounds in this folder yet (WAV, MP3, OGG and FLAC files show here).";
    return "Nothing here.";
  }

  function card(it) {
    const el = document.createElement("div");
    el.className = "lcard" + (it.id === playingId ? " playing" : "") + (it.id === selId ? " sel" : "");
    el.dataset.id = it.id;
    const fav = lib.fav.includes(it.id);
    const dotColor = it.kind === "b" ? (it.typeKey ? A.typeColor(it.typeKey) : "#FF9F5A") : "#7FD6FF";
    const letter = it.kind === "b" ? (it.group === "Combos" ? "+" : it.type[0]) : "&#9835;";
    const typeTxt = it.kind === "b" ? it.type : it.gag ? "Your gag (opens in the Gag Builder)" : (it.recipe ? "Your sound (editable)" : "Your file (" + (it.ext || "").toUpperCase() + ")") + (it.rel ? " · " + it.rel : "");
    const own = new Set(lib.tags[it.id] || []);
    const tags = tagsOf(it).slice(0, 6).map((t) => `<span class="${own.has(t) ? "mine" : ""}">${esc(t)}</span>`).join("");
    const editLabel = it.kind === "b" || it.recipe ? "Edit" : "Comedy-fy";
    el.title = "Click to play" + (it.kind === "f" ? "\n" + it.path : "");
    el.innerHTML = `<div class="lc-top"><span class="dot" style="background:${dotColor}">${it.kind === "b" ? esc(letter) : letter}</span><span class="nm">${esc(it.name)}</span>
        <button class="star${fav ? " on" : ""}" title="${fav ? "Remove from" : "Add to"} Favourites">${fav ? "&#9733;" : "&#9734;"}</button></div>
      <canvas class="lw"></canvas>
      <div class="lc-sub"><span class="ty">${esc(typeTxt)}</span><span class="len">${it.secs ? it.secs.toFixed(2) + " s" : ""}</span></div>
      <div class="lc-tags">${tags}</div>
      <div class="lc-act"><button class="ed" title="${editLabel === "Edit" ? "Open it in the Sound Designer to change it" : "Bring it into the Sound Designer and run it through layers and effects"}">${editLabel}</button>
        <button class="ly" title="Stack it onto the sound in the Sound Designer as a new layer">+ Layer</button><span class="grow"></span>
        <button class="more" title="Save as WAV, collections, tags${it.kind === "f" ? ", rename" : ""}">&middot;&middot;&middot;</button></div>`;
    el.onclick = (e) => {
      if (e.target.closest("button")) return;
      select(it.id);
      if (playingId === it.id && !lib.hover) stop(); else play(it);
    };
    let hoverT = 0;
    el.onmouseenter = () => { if (!lib.hover) return; clearTimeout(hoverT); hoverT = setTimeout(() => { if (playingId !== it.id) play(it); }, 220); };
    el.onmouseleave = () => { clearTimeout(hoverT); if (lib.hover && playingId === it.id) stop(); };
    el.querySelector(".star").onclick = () => toggleFav(it);
    el.querySelector(".ed").onclick = () => edit(it);
    el.querySelector(".ly").onclick = () => addAsLayer(it);
    el.querySelector(".more").onclick = () => more(it);
    return el;
  }

  function select(id) {
    selId = id;
    for (const el of grid().querySelectorAll(".lcard.sel")) el.classList.remove("sel");
    const el = grid().querySelector(`.lcard[data-id="${cssEsc(id)}"]`);
    if (el) el.classList.add("sel");
  }

  // ------------------------------------------------------------------ actions
  function toggleFav(it) {
    const i = lib.fav.indexOf(it.id);
    if (i >= 0) lib.fav.splice(i, 1); else lib.fav.unshift(it.id);
    remember(); drawSide();
    if (lib.shelf === "fav") drawGrid();
    else {
      const b = grid().querySelector(`.lcard[data-id="${cssEsc(it.id)}"] .star`);
      if (b) { const on = i < 0; b.classList.toggle("on", on); b.innerHTML = on ? "&#9733;" : "&#9734;"; b.title = (on ? "Remove from" : "Add to") + " Favourites"; }
    }
  }

  async function edit(it) {
    stop();
    try {
      if (it.kind === "b") return A.openRecipeObj(it.recipe, it.name);
      const v = await audioOf(it);
      if (v.recipe) return A.openRecipeObj(v.recipe, it.name);
      const g = it.ext === "wav" && X.readGag(v.bytes);
      if (g && window.CSGag) return window.CSGag.open(g, it.name);
      A.comedify(v.bytes, it.path, "new");
    } catch (e) { A.toast("Couldn't open " + it.name + ": " + e.message, true); }
  }

  async function addAsLayer(it) {
    stop();
    try {
      if (it.kind === "b") { if (A.addLayersFrom(it.recipe, it.name)) A.showPage("designer"); return; }
      const v = await audioOf(it);
      if (v.recipe) { if (A.addLayersFrom(v.recipe, it.name)) A.showPage("designer"); return; }
      A.comedify(v.bytes, it.path, "layer");
    } catch (e) { A.toast("Couldn't add " + it.name + ": " + e.message, true); }
  }

  async function more(it) {
    const own = (lib.tags[it.id] || []).join(", ");
    const inCol = lib.shelf.startsWith("col:") ? +lib.shelf.slice(4) : -1;
    const cols = lib.cols.map((c, i) => `<button class="chip${c.ids.includes(it.id) ? " on" : ""}" data-col="${i}">${esc(c.name)}</button>`).join("");
    const p = A.modal(`<h2>${esc(it.name)}</h2>
      <p class="muted small">${esc(it.kind === "b" ? it.type + " · " + it.group : it.path)}</p>
      <div class="sect">Collections</div>
      <div class="colpick">${cols || `<span class="muted small">No collections yet.</span>`}<button class="chip" data-newcol="1">+ New collection</button></div>
      <div class="sect">Your tags</div>
      <div class="row"><input id="mTags" placeholder="e.g. level 1, menu, boss" value="${esc(own)}" spellcheck="false"></div>
      ${it.kind === "f" ? `<div class="sect">File</div><div class="row"><input id="mName" value="${esc(it.name)}" spellcheck="false"><button id="mRename">Rename</button><button id="mShow">Show in folder</button></div>` : ""}
      <div class="row">${it.kind === "b" || it.recipe ? `<button id="mSave">Save in your save folder</button>` : ""}
        ${it.kind === "b" || it.recipe ? `<button id="mGag">Add to the Gag Builder</button>` : ""}
        ${inCol >= 0 ? `<button id="mRemove">Remove from this collection</button>` : ""}</div>`,
    [{ label: "Done", value: "done", primary: true }]);
    const body = $("modalBody");
    const colClick = (b) => {
      const c = lib.cols[+b.dataset.col], k = c.ids.indexOf(it.id);
      if (k >= 0) c.ids.splice(k, 1); else c.ids.push(it.id);
      b.classList.toggle("on", k < 0);
      remember(); drawSide();
    };
    for (const b of body.querySelectorAll("[data-col]")) b.onclick = () => colClick(b);
    body.querySelector("[data-newcol]").onclick = () => {
      const name = newColName();
      lib.cols.push({ name, ids: [it.id] });
      const b = document.createElement("button");
      b.className = "chip on"; b.dataset.col = String(lib.cols.length - 1); b.textContent = name;
      b.onclick = () => colClick(b);
      body.querySelector("[data-newcol]").before(b);
      remember(); drawSide();
      A.toast(`Made "${name}". Rename it in the list on the left.`);
    };
    const mSave = body.querySelector("#mSave");
    if (mSave) mSave.onclick = async () => {
      const v = it.kind === "b" ? { recipe: it.recipe } : await audioOf(it);
      const path = await A.saveRecipeAs(it.name, v.recipe);
      if (path) { mSave.textContent = "Saved"; mSave.disabled = true; folderItems.delete(saveFolder()); }
    };
    const mRename = body.querySelector("#mRename");
    if (mRename) mRename.onclick = async () => {
      const name = body.querySelector("#mName").value.trim();
      if (!name || name === it.name) return;
      try {
        const r = await A.api("/api/rename", { path: it.path, name });
        renameId(it.id, "f:" + r.path);
        A.toast("Renamed to " + r.path.split(/[\\/]/).pop());
        closeModal();
        drawSide();
      } catch (e) { A.toast("Couldn't rename: " + e.message, true); }
    };
    const mGag = body.querySelector("#mGag");
    if (mGag) mGag.onclick = async () => {
      const v = it.kind === "b" ? { recipe: it.recipe } : await audioOf(it);
      const G = window.CSGag;
      G.show();
      const g = JSON.parse(JSON.stringify(G.gag));
      let end = 0;
      for (const c of g.clips) end = Math.max(end, c.start + window.CSPicker.render(c.recipe)[0].length / RATE);
      g.clips.push({ name: it.name, recipe: v.recipe, start: Math.round(end * 100) / 100, vol: 1, pan: 0 });
      closeModal();
      G.open(g);
      A.toast(it.name + " is on the Gag Builder timeline.");
    };
    const mShow = body.querySelector("#mShow");
    if (mShow) mShow.onclick = () => A.api("/api/reveal", { path: it.path }).catch((e) => A.toast(e.message, true));
    const mRemove = body.querySelector("#mRemove");
    if (mRemove) mRemove.onclick = () => {
      const c = lib.cols[inCol], k = c.ids.indexOf(it.id);
      if (k >= 0) c.ids.splice(k, 1);
      remember(); drawSide();
      closeModal();
    };
    await p;
    const t = ($("mTags") ? $("mTags").value : own).split(",").map((x) => x.trim().toLowerCase().slice(0, 30)).filter(Boolean);
    const uniq = [...new Set(t)].slice(0, 12);
    if (uniq.length) lib.tags[it.id] = uniq; else delete lib.tags[it.id];
    remember(); drawGrid();
  }

  const closeModal = () => { const b = $("modalButtons").querySelector("button.primary"); if (b) b.click(); };

  /** Keeps favourites, collections and tags when a file is renamed. */
  function renameId(from, to) {
    lib.fav = lib.fav.map((x) => (x === from ? to : x));
    for (const c of lib.cols) c.ids = c.ids.map((x) => (x === from ? to : x));
    if (lib.tags[from]) { lib.tags[to] = lib.tags[from]; delete lib.tags[from]; }
    for (const [k, ids] of folderItems) folderItems.set(k, ids.map((x) => (x === from ? to : x)));
    const it = files.get(from);
    files.delete(from); audioCache.delete(from); peaksCache.delete(from);
    if (it) { it.id = to; it.path = to.slice(2); it.name = it.path.split(/[\\/]/).pop().replace(/\.(wav|mp3|ogg|flac)$/i, ""); files.set(to, it); }
    remember();
  }

  function newColName() {
    let n = lib.cols.length + 1, name;
    do { name = "Collection " + n++; } while (lib.cols.some((c) => c.name === name));
    return name;
  }
  async function renameCol(i) {
    const c = lib.cols[i];
    const p = A.modal(`<h2>Rename collection</h2><div class="row"><input id="mColName" value="${esc(c.name)}" maxlength="60" spellcheck="false"></div>`,
      [{ label: "Cancel", value: false }, { label: "Rename", value: true, primary: true }]);
    const inp = $("mColName"); inp.focus(); inp.select();
    if (await p) { const v = inp.value.trim(); if (v) { c.name = v.slice(0, 60); remember(); drawSide(); if (lib.shelf === "col:" + i) drawGrid(); } }
  }
  async function deleteCol(i) {
    const c = lib.cols[i];
    const ok = await A.modal(`<h2>Delete "${esc(c.name)}"?</h2><p>The collection goes; the sounds in it stay where they are.</p>`,
      [{ label: "Cancel", value: false }, { label: "Delete", value: true, primary: true }]);
    if (!ok) return;
    lib.cols.splice(i, 1);
    if (lib.shelf.startsWith("col:")) { const k = +lib.shelf.slice(4); lib.shelf = k === i ? "all" : k > i ? "col:" + (k - 1) : lib.shelf; }
    remember(); drawSide(); drawGrid();
  }
  async function newCol() {
    const name = newColName();
    lib.cols.push({ name, ids: [] });
    remember();
    openShelf("col:" + (lib.cols.length - 1));
    renameCol(lib.cols.length - 1);
  }
  async function addFolder() {
    try {
      const r = await A.api("/api/pick", { start: saveFolder(), title: "Show the sounds in this folder" });
      if (!r.path) return;
      if (!lib.folders.includes(r.path)) lib.folders.push(r.path);
      await A.api("/api/config", { library: lib });     // the server only reads folders that are in the list
      openShelf("folder:" + r.path);
    } catch (e) { A.toast(e.message, true); }
  }

  // ------------------------------------------------------------------ keys (only while the Library is showing)
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.page !== "library" || !$("modal").classList.contains("hidden")) return;
    const t = e.target, typing = t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type);
    if (e.key === "Escape" && typing) { t.value = ""; t.blur(); drawGrid(); return; }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "/") { e.preventDefault(); $("libSearch").focus(); return; }
    const i = currentIds.indexOf(selId);
    if (e.key === " ") { e.preventDefault(); if (!selId && currentIds.length) select(currentIds[0]); if (selId) { if (playingId === selId) stop(); else play(itemOf(selId)); } }
    else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) && currentIds.length) {
      e.preventDefault();
      const cols = Math.max(1, Math.round(grid().clientWidth / 242));
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : -cols;
      const j = Math.max(0, Math.min(currentIds.length - 1, i < 0 ? 0 : i + step));
      select(currentIds[j]);
      const el = grid().querySelector(`.lcard[data-id="${cssEsc(currentIds[j])}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
      play(itemOf(currentIds[j]));
    }
    else if (e.key.toLowerCase() === "f" && selId) toggleFav(itemOf(selId));
    else if (e.key === "Enter" && selId) edit(itemOf(selId));
  });

  // ------------------------------------------------------------------ start
  let started = false;
  function show() {
    if (!started) {
      started = true;
      loadState();
      $("libHover").checked = lib.hover;
      $("libSort").value = lib.sort;
      $("libHover").onchange = () => { lib.hover = $("libHover").checked; remember(); };
      $("libSort").onchange = () => { lib.sort = $("libSort").value; remember(); drawGrid(); };
      let qT = 0;
      $("libSearch").oninput = () => { clearTimeout(qT); qT = setTimeout(() => drawGrid(true), 120); };
      $("libNewCol").onclick = newCol;
      $("libAddFolder").onclick = addFolder;
      $("libComedify").onclick = () => A.pickOwnSound("new");
      $("libExport").onclick = exportPack;
      window.addEventListener("resize", () => { for (const id of currentIds.slice(0, 400)) if (peaksCache.has(id)) drawThumb(itemOf(id)); });
    }
    drawSide();
    drawGrid(false, true);
  }

  /** Round 8: the sounds shown right now (shelf, search and tags) as a pack: a folder or ZIP of files + a list. */
  function exportPack() {
    stop();
    const items = currentIds.map(itemOf).filter(Boolean);
    const entries = items.map((it) => ({
      name: it.name, type: it.kind === "b" ? it.type : "", group: it.kind === "b" ? it.group : "Your sounds", tags: tagsOf(it),
      source: it.kind === "b" ? "built-in" : "file", editable: it.kind === "f" && !!it.recipe,
      audio: async () => { const v = await audioOf(it); return { chs: v.chs, rate: v.rate || RATE, recipe: v.recipe || null }; },
    }));
    let title = $("libTitle").textContent || "Sound Pack";
    if ($("libSearch").value.trim()) title += " - " + $("libSearch").value.trim();
    window.CSExport.exportPack(entries, title);
  }

  window.CSLibrary = { show, stop, exportPack, get state() { return lib; } };
})();
