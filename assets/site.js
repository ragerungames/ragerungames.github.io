/* RageRun Games: game pages. Trailer click-to-play and screenshot lightbox. */
(() => {
  // Trailer: loads the video only after a click. Opened from a file on disk, YouTube refuses
  // to embed, so the click opens the video in a new tab instead.
  document.querySelectorAll(".trailer").forEach((el) => {
    el.addEventListener("click", () => {
      const yt = el.dataset.yt, fallback = el.dataset.href;
      if (!yt) { if (fallback) window.open(fallback, "_blank", "noopener"); return; }
      if (location.protocol === "file:") { window.open("https://www.youtube.com/watch?v=" + yt, "_blank", "noopener"); return; }
      const f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + yt + "?autoplay=1&rel=0";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true; f.title = el.getAttribute("aria-label") || "Trailer";
      el.replaceChildren(f); el.style.cursor = "default";
    });
  });

  // Loops: play only while on screen (saves battery and bandwidth).
  const loops = document.querySelectorAll("video.loop");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause(); }), { threshold: 0.2 });
    loops.forEach((v) => io.observe(v));
  }

  // Lightbox
  const shots = [...document.querySelectorAll(".gallery button")];
  if (!shots.length) return;
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = '<img alt=""><button class="x" aria-label="Close">&times;</button><button class="nav prev" aria-label="Previous">&#8249;</button><button class="nav next" aria-label="Next">&#8250;</button>';
  document.body.append(lb);
  const img = lb.querySelector("img");
  let i = 0;
  const show = (n) => { i = (n + shots.length) % shots.length; img.src = shots[i].dataset.full; img.alt = shots[i].querySelector("img").alt; lb.classList.add("open"); };
  const close = () => lb.classList.remove("open");
  shots.forEach((b, n) => b.addEventListener("click", () => show(n)));
  lb.querySelector(".x").onclick = close;
  lb.querySelector(".prev").onclick = (e) => { e.stopPropagation(); show(i - 1); };
  lb.querySelector(".next").onclick = (e) => { e.stopPropagation(); show(i + 1); };
  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") show(i - 1); else if (e.key === "ArrowRight") show(i + 1);
  });
})();
