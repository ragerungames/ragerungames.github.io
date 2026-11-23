/* RageRun Comedy Sound Synth - first-run tour (Round 9).
 * A short spotlight tour of the Sound Designer and the other pages. Shown once on the first start (config "tourDone"),
 * again from the ? box ("Take the tour"). Keys: Enter / right arrow next, left arrow back, Esc closes.
 * Steps whose target is hidden (for example in the web demo) are skipped. */
(() => {
  "use strict";
  const A = () => window.CSApp;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DEMO = !!window.CS_DEMO;

  const STEPS = [
    { title: "Welcome to Comedy Sound Synth!", text: DEMO
        ? "Design cartoon sound effects yourself: boings, bonks, slide whistles and gibberish voices. This quick tour shows you around (about a minute)."
        : "Design cartoon sound effects yourself: boings, bonks, splats and slide whistles. Everything you make is yours, royalty-free. This quick tour shows you around (about a minute).",
      play: true },
    { sel: "#typeList", title: "1. Pick a sound type", text: DEMO
        ? "Four types are open in the demo. The full app has 42, from Bonk and Crash to Kazoo, Snore and Ka-ching."
        : "42 types in 7 groups. The search box above finds types and presets by name (try \"fail\" or \"jump\").", side: "right" },
    { sel: "#presetList", title: "2. Then a preset", text: "Each type has ready-made presets. Click one to load it and hear it.", side: "right" },
    { sel: "#sliders", title: "3. Shape it", text: "Plain-language sliders: Pitch, Length, Squishiness, Bounce... Double-click a slider to put it back. The padlocks keep a slider when you randomize.", side: "top" },
    { sel: "#waveWrap", title: "4. Listen and trim", text: "Click the waveform (or press Space) to play. Drag the yellow bars to trim and the pink dots to fade.", side: "bottom" },
    { sel: ".transport", title: "5. Happy accidents", text: "Randomize (R) rolls new values, Mutate (M) makes it a bit different, Variation (V) is the same sound, a new take. Ctrl+Z undoes anything.", side: "bottom" },
    { sel: ".card.layers", title: "6. Stack sounds", text: "Layers put up to 4 sounds into one: a boing, a thud and a squeak make a perfect landing.", side: "bottom" },
    { sel: "#fxLooks", title: "7. Effects", text: "One-click looks (Chipmunk, Giant, Robot, Haunted...) or set each effect yourself. They work on the whole sound.", side: "left" },
    { sel: ".card.save", title: "8. Save", text: DEMO
        ? "Save downloads the sound as a WAV. Use it in any game or video: royalty-free, no credit needed."
        : "Ctrl+S saves the sound. Format... picks WAV, OGG or MP3 and has ready-made settings for Unity, Godot, Unreal, GameMaker, web games and video.", side: "top" },
    { sel: "nav.pages", title: DEMO ? "9. More in the full app" : "9. Three more pages", text: DEMO
        ? "The full app adds a Library of 294 finished sounds, the Gag Builder (a timeline for whole gags) and a Soundboard you play from the keyboard."
        : "Library: 294 finished sounds, your favourites and your own folders. Gag Builder: put sounds on a timeline. Soundboard: play sounds live from the keyboard.", side: "bottom" },
    { sel: "#btnProject", title: "10. Projects", text: "Keep everything (the Designer, the gag and the pads) in one project file. Double-click a .csynth file to open it.", side: "bottom" },
    { sel: "#btnAbout", title: "That's it!", text: DEMO
        ? "The ? button has the keys and this tour. Have fun making silly sounds!"
        : "The ? button has every shortcut, this tour, the self-test and support. Have fun making silly sounds!", side: "bottom" },
  ];

  let i = 0, root = null, hole = null, bubble = null, onKey = null, active = false;

  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== "hidden"; };
  const target = (s) => (s.sel ? document.querySelector(s.sel) : null);
  const usable = (s) => !s.sel || visible(target(s));

  function start() {
    if (active) return;
    try { if (A().page !== "designer") A().showPage("designer"); } catch (e) { /* not ready */ }
    active = true; i = 0;
    root = document.createElement("div");
    root.id = "tour";
    root.innerHTML = `<div class="tour-hole"></div><div class="tour-bubble" role="dialog" aria-live="polite"></div>`;
    document.body.appendChild(root);
    hole = root.querySelector(".tour-hole");
    bubble = root.querySelector(".tour-bubble");
    root.addEventListener("mousedown", (e) => { if (e.target === root) e.preventDefault(); });
    onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); go(-1); }
      else { if (e.key === " ") e.preventDefault(); e.stopPropagation(); }     // the app's own keys wait until the tour is over
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    show();
  }

  function go(d) {
    let j = i + d;
    while (j >= 0 && j < STEPS.length && !usable(STEPS[j])) j += d;
    if (j >= STEPS.length) return finish();
    if (j < 0) return;
    i = j; show();
  }

  function show() {
    const s = STEPS[i];
    const shown = STEPS.filter(usable), n = shown.indexOf(s) + 1, last = !STEPS.slice(i + 1).some(usable);
    bubble.innerHTML = `<div class="tour-count">${n} / ${shown.length}</div>
      <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
      <div class="tour-btns"><button class="ghost small t-skip">${last ? "" : "Skip the tour"}</button><span class="spacer"></span>
        ${n > 1 ? `<button class="small t-back">Back</button>` : ""}
        <button class="primary small t-next">${last ? "Start making sounds" : i === 0 ? "Show me" : "Next"}</button></div>`;
    const skip = bubble.querySelector(".t-skip");
    if (last) skip.remove(); else skip.onclick = finish;
    const back = bubble.querySelector(".t-back");
    if (back) back.onclick = () => go(-1);
    bubble.querySelector(".t-next").onclick = () => go(1);
    if (s.play) { try { if (A().cfg.autoPlay !== false) document.getElementById("btnPlay").click(); } catch (e) { /* fine */ } }
    const el = target(s);
    if (el) el.scrollIntoView({ block: "nearest" });
    place();
    bubble.querySelector(".t-next").focus();
  }

  function place() {
    if (!active) return;
    const s = STEPS[i], el = target(s);
    const W = window.innerWidth, H = window.innerHeight, pad = 8, gap = 14;
    bubble.style.left = bubble.style.top = "0px";
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    if (!el) {
      hole.style.cssText = `left:${W / 2}px;top:${H / 2}px;width:0;height:0`;
      bubble.style.left = (W - bw) / 2 + "px"; bubble.style.top = (H - bh) / 2 + "px";
      bubble.dataset.side = "";
      return;
    }
    const r = el.getBoundingClientRect();
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    const w = Math.min(W - 8, r.right + pad) - x, h = Math.min(H - 8, r.bottom + pad) - y;
    hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    const fits = {
      right: x + w + gap + bw < W - 8, left: x - gap - bw > 8, bottom: y + h + gap + bh < H - 8, top: y - gap - bh > 8,
    };
    const side = [s.side, "bottom", "right", "top", "left"].find((k) => k && fits[k]) || "inside";
    let bx, by;
    if (side === "right") { bx = x + w + gap; by = y + Math.min(h, 240) / 2 - bh / 2; }
    else if (side === "left") { bx = x - gap - bw; by = y + Math.min(h, 240) / 2 - bh / 2; }
    else if (side === "bottom") { bx = x + w / 2 - bw / 2; by = y + h + gap; }
    else if (side === "top") { bx = x + w / 2 - bw / 2; by = y - gap - bh; }
    else { bx = x + w - bw - 16; by = y + h - bh - 16; }
    bubble.style.left = Math.max(8, Math.min(W - bw - 8, bx)) + "px";
    bubble.style.top = Math.max(8, Math.min(H - bh - 8, by)) + "px";
    bubble.dataset.side = side;
  }

  function finish() {
    if (!active) return;
    active = false;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    root.remove(); root = null;
    const work = document.getElementById("work");          // Round 10: back to the top, where you start making sounds
    if (work) work.scrollTo({ top: 0, behavior: "smooth" });
    try {
      A().cfg.tourDone = true;
      A().api("/api/config", { tourDone: true }).catch(() => {});
    } catch (e) { /* fine */ }
  }

  window.CSTour = { start, get active() { return active; }, STEPS };
  const auto = () => {
    const q = new URLSearchParams(location.search);
    if (q.get("selftest") || q.get("notour")) return;
    if (A().cfg && A().cfg.tourDone) return;
    setTimeout(start, 600);
  };
  if (window.CSAppReady) auto(); else window.addEventListener("csapp:ready", auto, { once: true });
})();
