/* RageRun Comedy Sound Synth - Soundboard page (Round 7).
 * 16 pads on the keyboard (1-4, Q-R, A-F, Z-V by key position, so it works on any layout). Pads play at once
 * (polyphonic), can roll a new take on every hit, and a recording becomes a take you can save as one WAV or open
 * in the Gag Builder (every hit becomes a clip). Saved in config.json ("board"). */
(() => {
  "use strict";
  const S = window.ComedySynth, X = window.ComedyFx, L = window.ComedyLibrary, A = window.CSApp, P = window.CSPicker, G = window.CSGag;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc, RATE = S.RATE;
  const CODES = ["Digit1", "Digit2", "Digit3", "Digit4", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF", "KeyZ", "KeyX", "KeyC", "KeyV"];
  const LABELS = ["1", "2", "3", "4", "Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
  const COLORS = ["#FFC93C", "#FF6FA8", "#7FD6FF", "#B9F27C"];
  const BANKS = {
    "Cartoon Basics": ["Spring Boing", "Big Boing", "Body Fall", "Heavy Thud", "Fast Whoosh", "Throw Whoosh", "Toy Squeak", "Rubber Chicken", "Wahoo", "Ouch", "Bubble Pop", "Pie Splat", "Slide Whistle Up", "Slide Whistle Down", "Punch", "Head Bonk"],
    "Game Sounds": ["Coin", "Star Pickup", "Get the Upgrade", "Super Jump", "Laser Blast", "Space Blaster", "Level Complete", "Out of Battery", "Buzzer", "Ding", "Tick", "Bubble Scale", "Idea!", "Small Victory", "Oops", "Treasure Shine"],
    "Fight Night": ["Boxing Bell", "Punch", "Punch 2", "Punch 3", "Slap", "Kick", "Smack", "Boxing Glove", "Frying Pan Clang", "Bonk on the Head", "Body Fall", "Grunt", "Oof", "Swing Whoosh", "Bonked Silly", "Champion"],
    "Stand-Up": ["Stand-Up Rimshot", "Snappy Rimshot", "Triple Rimshot", "Lazy Rimshot", "Not Again", "Oops", "Epic Fail", "Bulb Horn", "Honk Honk Honk", "Goose Honk", "Kazoo Question", "Little Tweet", "Squeaky Chair", "Big Toot", "Gossip", "Cymbal Splash"],
    "Magic Show": ["And the Winner Is", "Quick Roll", "Disappear", "Pop In", "Pixie Dust", "Enchant", "Wand Wave", "Dream Sequence", "Angel Glide", "Shrink", "Ta-Da", "Grand Entrance", "Magic Appear", "Cloud of Dust", "Sparkly Sweep", "Almost a Win"],
  };
  const TAKE_PADS = new Set(["Body Fall", "Punch", "Punch 2", "Punch 3", "Toy Squeak", "Bubble Pop", "Pie Splat", "Fast Whoosh", "Swing Whoosh", "Coin", "Slap", "Smack", "Kick"]);

  function bankPads(name) {
    return BANKS[name].map((n) => { const e = L.byId["b:" + n]; return e ? { name: e.name, recipe: X.cleanRecipe(e.recipe), takes: TAKE_PADS.has(e.name) } : null; });
  }
  function cleanBoard(b) {
    b = b && typeof b === "object" ? b : {};
    const pads = Array.from({ length: 16 }, (_, i) => {
      const p = Array.isArray(b.pads) ? b.pads[i] : null;
      return p && p.recipe ? { name: String(p.name || "Sound").slice(0, 60), recipe: X.cleanRecipe(p.recipe), takes: !!p.takes } : null;
    });
    return { pads, vol: typeof b.vol === "number" ? Math.max(0, Math.min(1, b.vol)) : 0.8, bank: typeof b.bank === "string" ? b.bank : "" };
  }

  let board = null;
  let remT = 0;
  function remember() { clearTimeout(remT); remT = setTimeout(() => A.api("/api/config", { board }).catch(() => {}), 400); }

  // ------------------------------------------------------------------ playing pads
  let master = null;
  const hitCount = new Array(16).fill(0);
  function out() {
    const c = A.audio();
    if (!master || master.context !== c) { master = c.createGain(); master.connect(c.destination); }
    master.gain.value = board.vol;
    return master;
  }
  /** The recipe for this hit: the pad's own, or a new take (other seeds) when "new take each hit" is on. */
  function takeRecipe(i) {
    const p = board.pads[i];
    if (!p.takes) return p.recipe;
    const k = hitCount[i]++ % 4;
    if (!k) return p.recipe;
    const r = JSON.parse(JSON.stringify(p.recipe));
    for (const l of r.layers) { l.sound.seed = ((l.sound.seed + k * 131) % 99999) + 1; if (l.sound.randomness < 0.15) l.sound.randomness = 0.25; }
    return X.cleanRecipe(r);
  }
  const voices = [];
  function hit(i) {
    const p = board.pads[i];
    if (!p) { assign(i); return; }
    const recipe = takeRecipe(i), chs = P.render(recipe), c = A.audio();
    const ab = c.createBuffer(chs.length, chs[0].length, RATE);
    chs.forEach((ch, k) => ab.copyToChannel(ch, k));
    const s = c.createBufferSource();
    s.buffer = ab; s.connect(out()); s.start();
    voices.push(s);
    s.onended = () => { const k = voices.indexOf(s); if (k >= 0) voices.splice(k, 1); };
    if (voices.length > 24) { try { voices.shift().stop(); } catch (e) { /* */ } }
    const el = document.querySelector(`.pad[data-i="${i}"]`);
    if (el) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
    if (rec) rec.hits.push({ i, t: c.currentTime, name: p.name, recipe, vol: board.vol });
  }
  function stopAll() { for (const v of voices.splice(0)) { try { v.stop(); } catch (e) { /* */ } } stopTake(); }

  // ------------------------------------------------------------------ recording a take
  let rec = null, take = null, takeSrc = null, recTimer = 0;
  function toggleRec() {
    if (rec) {
      clearInterval(recTimer);
      const hits = rec.hits;
      rec = null;
      $("bRec").classList.remove("on"); $("bRec").innerHTML = "&#9679; Record";
      if (!hits.length) { $("bRecInfo").textContent = "Nothing was played."; return; }
      const t0 = hits[0].t;
      take = G.cleanGag({ name: "Soundboard Take", clips: hits.map((h, k) => ({ id: "t" + k, name: h.name, recipe: h.recipe, start: Math.round((h.t - t0) * 1000) / 1000, vol: h.vol / 0.8, pan: 0 })) });
      drawTake();
      return;
    }
    stopTake();
    A.audio();
    rec = { hits: [], from: A.audio().currentTime };
    take = null; drawTake();
    $("bRec").classList.add("on"); $("bRec").innerHTML = "&#9632; Stop recording";
    recTimer = setInterval(() => { if (rec) $("bRecInfo").textContent = `Recording... ${rec.hits.length} hit${rec.hits.length === 1 ? "" : "s"} · ${(A.audio().currentTime - rec.from).toFixed(1)} s (starts at your first hit)`; }, 100);
  }
  function drawTake() {
    $("bTake").classList.toggle("hidden", !take);
    if (!take) { if (!rec) $("bRecInfo").textContent = "Press Record, play the pads, press Stop: the take starts at your first hit."; return; }
    const len = G.mixGag(take)[0].length / RATE;
    $("bRecInfo").textContent = `Take: ${take.clips.length} hit${take.clips.length === 1 ? "" : "s"} · ${len.toFixed(2)} s`;
  }
  function playTake() {
    stopTake();
    if (!take) return;
    const chs = G.mixGag(take), c = A.audio(), ab = c.createBuffer(chs.length, chs[0].length, RATE);
    chs.forEach((ch, i) => ab.copyToChannel(ch, i));
    takeSrc = c.createBufferSource(); takeSrc.buffer = ab; takeSrc.connect(c.destination); takeSrc.start();
  }
  function stopTake() { if (takeSrc) { try { takeSrc.stop(); } catch (e) { /* */ } takeSrc = null; } }

  // ------------------------------------------------------------------ pads
  function draw() {
    const box = $("bPads");
    box.innerHTML = "";
    board.pads.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "pad" + (p ? "" : " empty");
      el.dataset.i = i;
      el.style.setProperty("--c", COLORS[Math.floor(i / 4)]);
      el.innerHTML = `<span class="key">${LABELS[i]}</span>
        <span class="pn">${p ? esc(p.name) : "Empty pad"}</span>
        <span class="ps muted small">${p ? (p.takes ? "new take each hit" : "&nbsp;") : "click to pick a sound"}</span>
        <div class="pad-tools">${p ? `<button class="pt-take${p.takes ? " on" : ""}" title="New take each hit: a slightly different version every time (great for punches and footsteps)">&#8635;</button>` : ""}
          <button class="pt-set" title="Pick the sound for this pad">&#9998;</button>${p ? `<button class="pt-clr" title="Empty this pad">&times;</button>` : ""}</div>`;
      el.onpointerdown = (e) => { if (e.target.closest("button")) return; e.preventDefault(); hit(i); };
      el.querySelector(".pt-set").onclick = () => assign(i);
      const tk = el.querySelector(".pt-take");
      if (tk) tk.onclick = () => { p.takes = !p.takes; remember(); draw(); };
      const cl = el.querySelector(".pt-clr");
      if (cl) cl.onclick = () => { board.pads[i] = null; remember(); draw(); };
      box.appendChild(el);
    });
    $("bVol").value = board.vol; $("bVol").style.setProperty("--p", board.vol * 100 + "%");
    $("bVol").nextElementSibling.textContent = Math.round(board.vol * 100) + "%";
  }
  async function assign(i) {
    const r = await P.pick(`Sound for pad ${LABELS[i]}`);
    if (!r) return;
    await A.ensureFiles(r.recipe);
    board.pads[i] = { name: r.name.slice(0, 60), recipe: r.recipe, takes: false };
    board.bank = "";
    remember(); draw();
    hit(i);
  }

  // ------------------------------------------------------------------ keys (only on this page)
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.page !== "board" || !$("modal").classList.contains("hidden") || !$("picker").classList.contains("hidden")) return;
    const t = e.target;
    if ((t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type)) || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const i = CODES.indexOf(e.code);
    if (i >= 0) { e.preventDefault(); if (!e.repeat) hit(i); return; }
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) toggleRec(); }
    else if (e.code === "Escape") stopAll();
  });

  // ------------------------------------------------------------------ start
  let started = false;
  function show() {
    if (!started) {
      started = true;
      board = cleanBoard(A.cfg.board);
      if (!board.pads.some(Boolean)) { board.pads = bankPads("Cartoon Basics"); board.bank = "Cartoon Basics"; }
      const bs = $("bBank");
      bs.innerHTML = `<option value="">Load a set of pads...</option>` + Object.keys(BANKS).map((b) => `<option>${esc(b)}</option>`).join("");
      bs.onchange = async () => {
        const b = bs.value; bs.value = "";
        if (!b) return;
        if (board.pads.some(Boolean)) {
          const ok = await A.modal(`<h2>Load "${esc(b)}"?</h2><p>It replaces all 16 pads.</p>`, [{ label: "Cancel", value: false }, { label: "Load", value: true, primary: true }]);
          if (!ok) return;
        }
        board.pads = bankPads(b); board.bank = b; remember(); draw();
      };
      $("bVol").oninput = () => { board.vol = +$("bVol").value; if (master) master.gain.value = board.vol; draw(); remember(); };
      $("bRec").onclick = toggleRec;
      $("bTakePlay").onclick = playTake;
      $("bTakeSave").onclick = async () => {
        if (!take) return;
        const name = ($("bTakeName").value || "").trim() || "Soundboard Take";
        await Promise.all(take.clips.map((c) => A.ensureFiles(c.recipe)));
        A.saveAudio(name, G.mixGag(take), { gag: Object.assign({}, take, { name }) });
      };
      $("bTakeGag").onclick = () => { if (take) { stopTake(); G.open(take, ($("bTakeName").value || "").trim() || "Soundboard Take"); } };
      $("bStop").onclick = stopAll;
      drawTake();
      Promise.all(board.pads.filter(Boolean).map((p) => A.ensureFiles(p.recipe)));
    }
    draw();
    // warm the cache so the first hit of each pad is instant
    setTimeout(() => { for (const p of board.pads) if (p) P.render(p.recipe); }, 30);
  }
  function leave() { if (rec) toggleRec(); stopTake(); }

  /** Round 8 (projects): the pads as they would be saved, and putting a set back. */
  function state() {
    if (started) return board;
    const b = cleanBoard(A.cfg.board);
    if (!b.pads.some(Boolean)) { b.pads = bankPads("Cartoon Basics"); b.bank = "Cartoon Basics"; }
    return b;
  }
  function load(b) {
    const v = cleanBoard(b);
    if (!v.pads.some(Boolean)) { v.pads = bankPads("Cartoon Basics"); v.bank = "Cartoon Basics"; }
    A.cfg.board = v;
    if (started) { stopAll(); board = v; if (document.body.dataset.page === "board") draw(); }
    A.api("/api/config", { board: v }).catch(() => {});
    return Promise.all(v.pads.filter(Boolean).map((p) => A.ensureFiles(p.recipe)));
  }

  window.CSBoard = { show, leave, stopAll, BANKS, state, load, get board() { return board; } };
})();
