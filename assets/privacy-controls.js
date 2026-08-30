(function () {
  "use strict";

  var STORAGE_KEY = "icv_privacy_preferences";
  var VERSION = 1;
  var modal;

  function defaults() {
    return {
      version: VERSION,
      analytics: navigator.doNotTrack !== "1",
      external_media: false,
      updated_at: null
    };
  }

  function read() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (stored && stored.version === VERSION) {
        return {
          version: VERSION,
          analytics: stored.analytics !== false,
          external_media: stored.external_media === true,
          updated_at: stored.updated_at || null
        };
      }
    } catch (error) {}
    return defaults();
  }

  function enabled(category) {
    if (category === "technical") return true;
    if (category === "analytics" && navigator.doNotTrack === "1") return false;
    if (category === "external_media") return read().external_media === true;
    return read()[category] !== false;
  }

  function save(preferences) {
    var next = {
      version: VERSION,
      analytics: preferences.analytics !== false,
      external_media: preferences.external_media === true,
      updated_at: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (!next.analytics) sessionStorage.removeItem("icv_analytics_session");
    } catch (error) {}
    window.dispatchEvent(new CustomEvent("icv:privacychange", { detail: next }));
    return next;
  }

  function injectStyles() {
    if (document.getElementById("icv-privacy-styles")) return;
    var style = document.createElement("style");
    style.id = "icv-privacy-styles";
    style.textContent =
      ".icv-privacy-layer{position:fixed;z-index:10050;inset:0;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(12px)}" +
      ".icv-privacy-panel{width:min(520px,100%);max-height:calc(100vh - 36px);overflow:auto;border:1px solid rgba(225,185,78,.38);border-radius:8px;padding:24px;background:#11100d;color:#f5f1e8;box-shadow:0 28px 90px rgba(0,0,0,.7);font:15px/1.5 system-ui,sans-serif}" +
      ".icv-privacy-head{display:flex;align-items:start;justify-content:space-between;gap:18px}.icv-privacy-head h2{margin:0;font-size:26px;line-height:1.1}.icv-privacy-head button{width:36px;height:36px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#1b1915;color:#f5f1e8;font-size:22px;cursor:pointer}" +
      ".icv-privacy-panel>p{margin:10px 0 18px;color:#aaa49a}.icv-privacy-option{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 0;border-top:1px solid rgba(255,255,255,.1)}" +
      ".icv-privacy-option strong,.icv-privacy-option span{display:block}.icv-privacy-option span{margin-top:3px;color:#aaa49a;font-size:12px}.icv-privacy-option input{width:20px;height:20px;accent-color:#e1b94e}" +
      ".icv-privacy-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}.icv-privacy-actions a{color:#e1b94e}.icv-privacy-save{min-height:42px;border:0;border-radius:6px;padding:0 18px;background:#e1b94e;color:#17130a;font-weight:800;cursor:pointer}" +
      "@media(max-width:520px){.icv-privacy-actions{align-items:stretch;flex-direction:column}.icv-privacy-save{width:100%}}";
    document.head.appendChild(style);
  }

  function close() {
    if (modal) modal.remove();
    modal = null;
  }

  function open() {
    close();
    injectStyles();
    var preferences = read();
    modal = document.createElement("div");
    modal.className = "icv-privacy-layer";
    modal.innerHTML =
      '<section class="icv-privacy-panel" role="dialog" aria-modal="true" aria-labelledby="icvPrivacyTitle">' +
        '<div class="icv-privacy-head"><div><h2 id="icvPrivacyTitle">Preferenze privacy</h2></div><button type="button" aria-label="Chiudi">&times;</button></div>' +
        "<p>Gestisci le statistiche ICV e il caricamento dei contenuti esterni.</p>" +
        '<label class="icv-privacy-option"><span><strong>Funzioni tecniche</strong><span>Accesso, sicurezza, preferenze e funzionamento del servizio.</span></span><input type="checkbox" checked disabled aria-label="Funzioni tecniche sempre attive"></label>' +
        '<label class="icv-privacy-option"><span><strong>Analytics anonimo ICV</strong><span>Nessun indirizzo IP, dato scritto o profilo pubblicitario.</span></span><input id="icvPrivacyAnalytics" type="checkbox" ' + (preferences.analytics ? "checked" : "") + "></label>" +
        '<label class="icv-privacy-option"><span><strong>Video Instagram</strong><span>Il player riceve dati di navigazione e puo usare cookie propri. I video si caricano solo al clic.</span></span><input id="icvPrivacyMedia" type="checkbox" ' + (preferences.external_media ? "checked" : "") + '></label>' +
        '<div class="icv-privacy-actions"><span><a href="/privacy">Privacy Policy</a> · <a href="/cookie-policy">Cookie Policy</a></span><button class="icv-privacy-save" type="button">Salva preferenze</button></div>' +
      "</section>";
    document.body.appendChild(modal);
    modal.querySelector(".icv-privacy-head button").addEventListener("click", close);
    modal.querySelector(".icv-privacy-save").addEventListener("click", function () {
      save({ analytics: modal.querySelector("#icvPrivacyAnalytics").checked, external_media: modal.querySelector("#icvPrivacyMedia").checked });
      close();
    });
    modal.addEventListener("click", function (event) {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", function escape(event) {
      if (event.key === "Escape" && modal) {
        close();
        document.removeEventListener("keydown", escape);
      }
    });
    modal.querySelector("#icvPrivacyAnalytics").focus();
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-privacy-settings]");
    if (!trigger) return;
    event.preventDefault();
    open();
  });

  window.ICVPrivacy = {
    enabled: enabled,
    get: read,
    open: open,
    save: save
  };
})();
