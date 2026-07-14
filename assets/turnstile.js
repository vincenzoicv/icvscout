(function () {
  "use strict";

  var SITEKEY = "0x4AAAAAAD11A2Matr0ykDlH";
  var VERIFY_URL = "https://turnstile-siteverify-icvscout.vincenzo-brancato85.workers.dev";
  var SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  var scriptPromise;

  function loadScript() {
    if (window.turnstile) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Protezione antispam non disponibile. Riprova tra poco.")); };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  function createChallenge() {
    var overlay = document.createElement("div");
    overlay.className = "icv-turnstile-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Verifica di sicurezza");
    overlay.innerHTML = '<div class="icv-turnstile-panel"><strong>Verifica di sicurezza</strong><p>Un ultimo controllo prima di continuare.</p><div class="icv-turnstile-widget" data-action="turnstile-spin-v1"></div></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function ensureStyles() {
    if (document.getElementById("icv-turnstile-styles")) return;
    var style = document.createElement("style");
    style.id = "icv-turnstile-styles";
    style.textContent = ".icv-turnstile-overlay{position:fixed;z-index:10000;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(12px)}.icv-turnstile-panel{width:min(360px,100%);padding:22px;border:1px solid rgba(225,185,78,.4);border-radius:10px;background:#11100d;color:#f5f1e8;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.65)}.icv-turnstile-panel strong{display:block;font:800 20px system-ui,sans-serif}.icv-turnstile-panel p{margin:7px 0 16px;color:#aaa49a;font:14px/1.5 system-ui,sans-serif}.icv-turnstile-widget{display:flex;justify-content:center;min-height:65px}";
    document.head.appendChild(style);
  }

  async function verify(action) {
    ensureStyles();
    await loadScript();
    var overlay = createChallenge();
    var target = overlay.querySelector(".icv-turnstile-widget");
    return new Promise(function (resolve, reject) {
      var settled = false;
      var widgetId;
      var timeout = setTimeout(function () { finish(new Error("Verifica scaduta. Riprova.")); }, 120000);

      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId);
        overlay.remove();
        if (error) reject(error); else resolve(true);
      }

      widgetId = window.turnstile.render(target, {
        sitekey: SITEKEY,
        action: "turnstile-spin-v1",
        theme: "dark",
        size: "flexible",
        callback: async function (token) {
          try {
            var response = await fetch(VERIFY_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: token, cdata: String(action || "write").slice(0, 255) })
            });
            var result = await response.json().catch(function () { return {}; });
            if (!response.ok || result.success !== true) throw new Error("Verifica antispam non superata. Riprova.");
            finish();
          } catch (error) {
            finish(error);
          }
        },
        "error-callback": function () { finish(new Error("Verifica antispam non riuscita. Riprova.")); },
        "expired-callback": function () { finish(new Error("Verifica scaduta. Riprova.")); }
      });
    });
  }

  window.ICVTurnstile = { verify: verify };
})();
