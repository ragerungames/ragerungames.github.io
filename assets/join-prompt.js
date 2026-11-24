/* RageRun Games newsletter prompt. Written by RageRun Studio (Email page). Do not edit by hand: change it in Studio and write it again.
   One small slide-in, about 3 seconds after the page loads (or at half a page of scrolling). It comes back on every visit until the visitor joins or presses X; then it stays away for 60 days.
   Only the home page loads this file (no web demo pages). Add ?join=1 to the address to see it again for a test.
   rr-join-prompt:MUIFAFwvjw2Vmd8nvPrB0fLmjum8EwkEAH4APypzaBgG_87Tygce4VvJRm_dcSbYzuUd94w-nvoSLzIrWXvrBGzrffLfTkGcPSbhSu16fZGWh6_r5iEtCBgk0ue5_Rpg3ITZipYDkUrt3Gf8YqQ8njWDHnrq1lquGddJTuNTP_lo9-rVROe_n-8n9ct7pnA1VcZ8bEroCwLM-DJSZw== */
(() => {
  "use strict";
  const FORM = "https://ff45649d.sibforms.com/serve/MUIFAFwvjw2Vmd8nvPrB0fLmjum8EwkEAH4APypzaBgG_87Tygce4VvJRm_dcSbYzuUd94w-nvoSLzIrWXvrBGzrffLfTkGcPSbhSu16fZGWh6_r5iEtCBgk0ue5_Rpg3ITZipYDkUrt3Gf8YqQ8njWDHnrq1lquGddJTuNTP_lo9-rVROe_n-8n9ct7pnA1VcZ8bEroCwLM-DJSZw==";
  const KEY = "rr-join", DAYS = 60, WAIT_MS = 3000, SCROLL_AT = 0.5;
  const force = /[?&]join=1(?:&|$)/.test(location.search);
  const now = Date.now();
  let seenThisPage = false;

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const write = (state) => { try { localStorage.setItem(KEY, JSON.stringify({ state, until: now + DAYS * 86400000 })); } catch (e) { /* storage blocked: still only once per page */ } };
  const saved = read();
  if (!force && saved && saved.until > now) return;
  if (!force && matchMedia && matchMedia("(display-mode: standalone)").matches) return;

  const css = `
#rr-join{position:fixed;right:16px;bottom:16px;z-index:60;width:min(360px,calc(100vw - 32px));box-sizing:border-box;background:var(--surface,#fff);color:var(--ink,#141a2e);border:1px solid var(--line,#d9deea);border-radius:14px;padding:16px 16px 14px;box-shadow:0 10px 30px rgba(0,0,0,.28);font:14px/1.45 Inter,system-ui,sans-serif;transform:translateY(24px);opacity:0;transition:transform .35s ease,opacity .35s ease}
#rr-join.on{transform:none;opacity:1}
@media (prefers-reduced-motion:reduce){#rr-join{transition:none}}
#rr-join h2{margin:0 24px 4px 0;font-size:16px;font-weight:800}
#rr-join p{margin:0 0 10px;color:var(--muted,#586079)}
#rr-join form{display:flex;gap:8px}
#rr-join input[type=email]{flex:1;min-width:0;box-sizing:border-box;font:inherit;color:inherit;background:var(--bg,#f3f5fa);border:1px solid var(--line,#d9deea);border-radius:9px;padding:9px 10px}
#rr-join input[type=email]:focus{outline:2px solid var(--orange,#f2622e);outline-offset:1px}
#rr-join button[type=submit]{font:inherit;font-weight:800;color:#fff;background:var(--orange,#f2622e);border:0;border-radius:9px;padding:9px 14px;cursor:pointer}
#rr-join button[type=submit][disabled]{opacity:.6;cursor:default}
#rr-join .x{position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--muted,#586079);font-size:20px;line-height:1;cursor:pointer}
#rr-join .x:hover{background:var(--cobalt-soft,#e4e9fb);color:var(--ink,#141a2e)}
#rr-join .hp{position:absolute;left:-5000px;width:1px;height:1px;overflow:hidden}
#rr-join .msg{margin-top:8px;font-weight:600;display:none}
#rr-join .msg.ok{display:block;color:var(--good,#1d8a55)}
#rr-join .msg.bad{display:block;color:#d33}
#rr-join .fine{margin-top:8px;font-size:12px;color:var(--muted,#586079)}
#rr-join .fine a{color:inherit}`;

  function build() {
    if (seenThisPage || document.getElementById("rr-join")) return;
    seenThisPage = true;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const box = document.createElement("section");
    box.id = "rr-join";
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", "Newsletter signup");
    box.innerHTML =
      '<button class="x" type="button" aria-label="Close">&times;</button>' +
      "<h2>Get new assets first</h2>" +
      "<p>One email a month: new Unity assets, sales and devlogs. Unsubscribe any time.</p>" +
      '<form novalidate><input type="email" name="EMAIL" placeholder="you@example.com" autocomplete="email" required aria-label="Your email address">' +
      '<div class="hp" aria-hidden="true"><input type="text" name="email_address_check" value="" tabindex="-1" autocomplete="off"></div>' +
      '<input type="hidden" name="locale" value="en"><input type="hidden" name="html_type" value="simple">' +
      '<button type="submit">Join</button></form>' +
      '<div class="msg" role="status"></div>' +
      '<div class="fine">We send a confirmation email first. <a href="join/">Full page</a></div>';
    document.body.appendChild(box);
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("on")));

    const form = box.querySelector("form"), msg = box.querySelector(".msg"), go = box.querySelector("button[type=submit]");
    const show = (t, ok) => { msg.textContent = t; msg.className = "msg " + (ok ? "ok" : "bad"); };
    const close = (state) => { write(state); box.classList.remove("on"); setTimeout(() => box.remove(), 400); };
    box.querySelector(".x").addEventListener("click", () => close("closed"));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = form.querySelector("[name=EMAIL]").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { show("Please enter a valid email address.", false); return; }
      go.disabled = true; go.textContent = "Sending...";
      fetch(FORM + (FORM.includes("?") ? "&" : "?") + "isAjax=1", { method: "POST", body: new FormData(form) })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.success) {
            form.style.display = "none";
            show("Almost there! Check your inbox and click the confirmation link.", true);
            write("joined");
            setTimeout(() => close("joined"), 6000);
          } else { go.disabled = false; go.textContent = "Join"; show((d && d.errors && d.errors.EMAIL) || "That didn't work. Check the address and try again.", false); }
        })
        .catch(() => { go.disabled = false; go.textContent = "Join"; show("Could not send. Try the full page below.", false); });
    });
  }

  if (force) { setTimeout(build, 800); return; }
  const timer = setTimeout(go, WAIT_MS);
  function go() { cleanup(); build(); }
  function onScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    if (h > 0 && scrollY / h >= SCROLL_AT) go();
  }
  function cleanup() { clearTimeout(timer); removeEventListener("scroll", onScroll); }
  addEventListener("scroll", onScroll, { passive: true });
})();
