/* RageRun Comedy Sound Synth - free web demo shim (dev\webdemo, copied into the demo build only).
 * The desktop page talks to its local server at /api/...; in the browser there is no server, so this answers those
 * calls here: settings live in localStorage, Save downloads the file, everything that needs the PC says "full app". */
(() => {
  "use strict";
  const KEY = "rr-comedy-synth-demo";
  const D = window.CS_DEMO;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } };
  const store = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode or full: fine */ } };
  const json = (obj, code) => new Response(JSON.stringify(obj), { status: code || 200, headers: { "Content-Type": "application/json" } });
  const FULL = "That's in the full app (Windows): " + D.buy.split("?")[0];
  const realFetch = window.fetch.bind(window);

  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function body(opt) {
    const b = opt && opt.body;
    if (b == null) return null;
    if (typeof b === "string") { try { return JSON.parse(b); } catch (e) { return b; } }
    return b;
  }

  window.fetch = async (input, opt) => {
    const url = typeof input === "string" ? input : input.url;
    const m = url.match(/\/api\/([\w/-]+)(\?.*)?$/);
    if (!m) return realFetch(input, opt);
    const path = m[1], q = new URLSearchParams(m[2] || "");
    const post = opt && opt.method === "POST";
    const data = await body(opt);
    switch (path) {
      case "config": {
        const c = load();
        if (!post) {
          return json(Object.assign({ autoPlay: true, last: null, tourDone: false }, c, {
            saveFolder: "Downloads", recent: [], app: { name: "RageRun Comedy Sound Synth", version: D.version + " (web demo)", page: D.buy,
              email: "support@ragerungames.com", discord: "https://discord.gg/kj8D8kwttZ", demo: true } }));
        }
        for (const k of ["autoPlay", "last", "tourDone", "export"]) if (data && k in data) c[k] = data[k];
        store(c);
        return json({ ok: true });
      }
      case "save": {
        const ext = q.get("ext") || "wav";
        const name = (q.get("name") || "Sound").replace(/[<>:"/\\|?*]+/g, "");
        const file = /\.(wav|ogg|mp3)$/i.test(name) ? name : name + "." + ext;
        download(data, file, { wav: "audio/wav", ogg: "audio/ogg", mp3: "audio/mpeg" }[ext] || "application/octet-stream");
        return json({ path: "Downloads/" + file, exists: false });
      }
      case "exists": return json({ exists: [] });
      case "state": case "reveal": return json({ ok: true });
      case "pending": return json({ open: [] });
      case "list": return json({ files: [] });
      case "open": {
        const u = String((data && data.url) || "");
        if (/^(https?:|mailto:)/.test(u)) window.open(u, "_blank", "noopener");
        return json({ ok: true });
      }
      case "doc": return json({ text: "The licence agreement is on " + D.buy.split("?")[0] + "\n\nSounds you make in the demo are royalty-free: use them in your games and videos, commercial use OK, no credit needed." });
      default: return json({ error: FULL }, 400);
    }
  };
})();
