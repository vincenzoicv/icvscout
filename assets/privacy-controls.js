(function () {
  "use strict";

  var STORAGE_KEY = "icv_privacy_preferences";
  var VERSION = 3;
  var QUEUE_KEY = "icv_privacy_receipt_queue";
  var queue = [];
  var sending = false;
  var MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  var modal;
  var banner;
  var sessionPreferences;
  var previousFocus;
  var cmpMode = typeof location !== "undefined" && !/^\/icv_admin(?:\.html)?\/?$/.test(location.pathname);
  var cmpVerified = false;
  var cmpReady = false;
  var cmpTimer;

  function defaults() {
    return {
      version: VERSION,
      analytics: false,
      external_media: false,
      updated_at: null
    };
  }

  function read() {
    if (cmpMode && !cmpVerified) return defaults();
    try {
      var stored = sessionPreferences || JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      var age = stored && Date.now() - Date.parse(stored.updated_at);
      if (stored && stored.version === VERSION && age >= 0 && age < MAX_AGE) {
        return {
          version: VERSION,
          analytics: stored.analytics === true,
          external_media: stored.external_media === true,
          updated_at: stored.updated_at || null,
          receipt_id: stored.receipt_id || null,
          recorded: stored.recorded === true
        };
      }
    } catch (error) {}
    return defaults();
  }

  function enabled(category) {
    if (category === "technical") return true;
    if (category === "analytics" && navigator.doNotTrack === "1") return false;
    if (category === "external_media") return read().external_media === true;
    return read()[category] === true;
  }

  function save(preferences, action) {
    if (cmpMode && action !== "iubenda") {
      open();
      return read();
    }
    var next = {
      version: VERSION,
      analytics: preferences.analytics === true && navigator.doNotTrack !== "1",
      external_media: preferences.external_media === true,
      updated_at: new Date().toISOString(),
      receipt_id: crypto.randomUUID(),
      recorded: false
    };
    sessionPreferences = next;
    if (banner) { banner.remove(); banner = null; }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (!next.analytics) sessionStorage.removeItem("icv_analytics_session");
    } catch (error) {}
    window.dispatchEvent(new CustomEvent("icv:privacychange", { detail: next }));
    if (action === "iubenda") return next;
    queue.push({id: next.receipt_id, version: VERSION, analytics: next.analytics,
      external_media: next.external_media, chosen_at: next.updated_at, action: action || "customize"});
    persistQueue();
    flushReceipts();
    return next;
  }

  function persistQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (error) {}
  }

  function receiptStatus() {
    if (!modal) return;
    var preferences = read();
    var status = modal.querySelector(".icv-privacy-receipt");
    status.textContent = !preferences.updated_at ? "Nessuna scelta salvata." :
      (preferences.recorded ? "Scelta registrata. Ricevuta: " + preferences.receipt_id :
      "Scelta applicata. Registrazione non ancora confermata.");
  }

  async function flushReceipts() {
    if (sending || !queue.length) return;
    sending = true;
    try {
      while (queue.length) {
        var receipt = queue[0];
        var response = await window.fetch("/api/privacy/receipt", {method:"POST",
          headers:{"Content-Type":"application/json"}, body:JSON.stringify(receipt), keepalive:true});
        if (!response.ok) break;
        var result = await response.json();
        if (!result.accepted || result.id !== receipt.id) break;
        queue.shift();
        persistQueue();
        var preferences = read();
        if (preferences.receipt_id === receipt.id) {
          preferences.recorded = true;
          sessionPreferences = preferences;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch (error) {}
        }
        receiptStatus();
      }
    } catch (error) {} finally { sending = false; }
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
      ".icv-cookie-banner{position:fixed;z-index:10040;bottom:0;left:0;right:0;padding:20px max(20px,env(safe-area-inset-right));padding-bottom:max(20px,env(safe-area-inset-bottom));background:#151515;color:#fff;border-top:1px solid #777;font:15px/1.5 system-ui,sans-serif;box-shadow:0 -8px 32px #0005}.icv-cookie-inner{max-width:1100px;margin:auto}.icv-cookie-banner h2{font-size:20px;margin:0 0 8px}.icv-cookie-banner p{margin:0 0 14px}.icv-cookie-banner a{color:#f0cb68}.icv-cookie-buttons{display:flex;gap:12px;flex-wrap:wrap}.icv-cookie-buttons button{min-height:44px;flex:1;padding:10px 18px;border:1px solid #aaa;border-radius:6px;background:#262626;color:#fff;font:600 14px system-ui;cursor:pointer}.icv-cookie-buttons button:hover{background:#393939}.icv-cookie-buttons button:focus-visible,.icv-privacy-panel :focus-visible{outline:3px solid #f0cb68;outline-offset:3px}.icv-privacy-reopen{position:fixed;z-index:10030;right:12px;bottom:calc(90px + env(safe-area-inset-bottom));padding:8px 12px;border:1px solid #777;border-radius:6px;background:#151515;color:#fff;font:12px system-ui;cursor:pointer}.icv-cookie-banner~.icv-privacy-reopen{display:none}" +
      "@media(max-width:520px){.icv-privacy-actions{align-items:stretch;flex-direction:column}.icv-privacy-save{width:100%}.icv-cookie-buttons{gap:8px}.icv-cookie-buttons button{flex-basis:100%}.icv-cookie-banner{max-height:80dvh;overflow:auto}}";
    document.head.appendChild(style);
  }

  function close() {
    if (modal) modal.remove();
    modal = null;
    document.removeEventListener("keydown", modalKeys);
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }

  function modalKeys(event) {
    if (!modal) return;
    if (event.key === "Escape") { close(); return; }
    if (event.key !== "Tab") return;
    var targets = modal.querySelectorAll("button,a[href],input:not(:disabled)");
    var first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function open() {
    if (cmpMode && cmpReady) {
      window._iub.cs.api.openPreferences();
      return;
    }
    if (cmpMode) return;
    close();
    previousFocus = document.activeElement;
    injectStyles();
    var preferences = read();
    modal = document.createElement("div");
    modal.className = "icv-privacy-layer";
    modal.innerHTML =
      '<section class="icv-privacy-panel" role="dialog" aria-modal="true" aria-labelledby="icvPrivacyTitle">' +
        '<div class="icv-privacy-head"><div><h2 id="icvPrivacyTitle">Preferenze privacy</h2></div><button type="button" aria-label="Chiudi">&times;</button></div>' +
        "<p>Le categorie facoltative sono disattivate finch\u00e9 non scegli di consentirle.</p>" +
        '<label class="icv-privacy-option"><span><strong>Funzioni tecniche</strong><span>Accesso, sicurezza, preferenze e funzionamento del servizio.</span></span><input type="checkbox" checked disabled aria-label="Funzioni tecniche sempre attive"></label>' +
        '<label class="icv-privacy-option"><span><strong>Statistiche ICV</strong><span>Eventi di utilizzo e identificativo di sessione, senza IP o profili pubblicitari.</span></span><input id="icvPrivacyAnalytics" type="checkbox" ' + (preferences.analytics ? "checked" : "") + "></label>" +
        '<label class="icv-privacy-option"><span><strong>Video Instagram, TikTok e YouTube</strong><span>I player ricevono dati di navigazione e possono usare cookie propri. Con il consenso, le anteprime TikTok si caricano quando entrano nello schermo, senza riproduzione automatica. Instagram e YouTube si caricano al clic.</span></span><input id="icvPrivacyMedia" type="checkbox" ' + (preferences.external_media ? "checked" : "") + '></label>' +
        '<p class="icv-privacy-receipt" role="status" style="overflow-wrap:anywhere"></p>' +
        '<div class="icv-privacy-actions"><span><a href="/privacy">Privacy Policy</a> · <a href="/cookie-policy">Cookie Policy</a></span><button class="icv-privacy-save" type="button">Salva preferenze</button></div>' +
      "</section>";
    document.body.appendChild(modal);
    modal.querySelector(".icv-privacy-head button").addEventListener("click", close);
    modal.querySelector(".icv-privacy-save").addEventListener("click", function () {
      save({ analytics: modal.querySelector("#icvPrivacyAnalytics").checked, external_media: modal.querySelector("#icvPrivacyMedia").checked }, "customize");
      close();
    });
    modal.addEventListener("click", function (event) {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", modalKeys);
    receiptStatus();
    flushReceipts();
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

  function syncCmp() {
    var api = window._iub && window._iub.cs && window._iub.cs.api;
    if (!api) return;
    cmpMode = true;
    cmpReady = true;
    window.clearTimeout(cmpTimer);
    close();
    if (banner) { banner.remove(); banner = null; }
    var reopen = document.querySelector(".icv-privacy-reopen");
    if (reopen) reopen.remove();
    var preference = api.getPreferences();
    if (!api.isPreferenceExpressed() || !preference || !preference.purposes) {
      cmpVerified = false;
      window.dispatchEvent(new CustomEvent("icv:privacychange", {detail: defaults()}));
      return;
    }
    var next = {
      analytics: preference.purposes[4] === true && navigator.doNotTrack !== "1",
      external_media: preference.purposes[3] === true
    };
    var old = read();
    cmpVerified = true;
    if (!old.updated_at || old.analytics !== next.analytics || old.external_media !== next.external_media) {
      save(next, "iubenda");
    }
  }

  function cmpFallback() {
    if (cmpReady || !cmpMode) return;
    cmpMode = false;
    sessionPreferences = defaults();
    window.dispatchEvent(new CustomEvent("icv:privacychange", {detail: defaults()}));
    init();
  }

  if (cmpMode) {
    // Local gates remain authoritative even when the CMP is slow or unavailable.
    window._iub = window._iub || [];
    window._iub.csConfiguration = {
      siteId: 4718046, cookiePolicyId: 81625927, lang: "it",
      gdprAppliesGlobally: true, perPurposeConsent: true, purposes: "1,3,4",
      cookiePolicyUrl: "https://ilcalciodivince.com/cookie-policy",
      whitelabel: false, consentOnContinuedBrowsing: false,
      preferenceCookie: {expireAfter: 180},
      banner: {acceptButtonDisplay: true, rejectButtonDisplay: true,
        customizeButtonDisplay: true, closeButtonDisplay: false, listPurposes: true},
      callback: {onReady: syncCmp, onPreferenceExpressed: syncCmp,
        onPreferenceChange: syncCmp, onStartupFailed: cmpFallback, onFatalError: cmpFallback}
    };
  }

  function init() {
    if (/^\/icv_admin(?:\.html)?\/?$/.test(location.pathname)) return;
    if (cmpMode) {
      if (!document.getElementById("icv-iubenda-cmp")) {
        var script = document.createElement("script");
        script.id = "icv-iubenda-cmp";
        script.src = "https://embeds.iubenda.com/widgets/3c9725ce-06f0-418b-af95-3e6c3b4733d2.js";
        script.async = true;
        script.onerror = cmpFallback;
        document.head.appendChild(script);
        cmpTimer = window.setTimeout(cmpFallback, 12000);
      }
      return;
    }
    injectStyles();
    if (!read().updated_at) {
      banner = document.createElement("section");
      banner.className = "icv-cookie-banner";
      banner.setAttribute("aria-labelledby", "icvCookieTitle");
      banner.innerHTML = '<div class="icv-cookie-inner"><h2 id="icvCookieTitle">Cookie e privacy</h2><p>Usiamo strumenti tecnici necessari al sito. Solo con il tuo consenso attiviamo le statistiche ICV e i video di Instagram, TikTok e YouTube, che possono usare cookie e ricevere dati di navigazione. Puoi rifiutare e continuare a navigare, oppure cambiare scelta in qualsiasi momento. <a href="/cookie-policy">Cookie Policy</a> · <a href="/privacy">Privacy Policy</a></p><div class="icv-cookie-buttons"><button type="button" data-choice="reject">Rifiuta tutti</button><button type="button" data-choice="customize">Personalizza</button><button type="button" data-choice="accept">Accetta tutti</button></div></div>';
      banner.addEventListener("click", function(event) {
        var button = event.target.closest("[data-choice]");
        if (!button) return;
        var choice = button.getAttribute("data-choice");
        if (choice === "customize") { open(); return; }
        save({analytics: choice === "accept", external_media: choice === "accept"}, choice);
      });
      document.body.appendChild(banner);
    }
    var reopen = document.createElement("button");
    reopen.type = "button";
    reopen.className = "icv-privacy-reopen";
    reopen.setAttribute("data-privacy-settings", "");
    reopen.textContent = "Cookie e privacy";
    document.body.appendChild(reopen);
  }
  window.addEventListener("storage", function(event) {
    if (cmpMode) { syncCmp(); return; }
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sessionPreferences = null;
    window.dispatchEvent(new CustomEvent("icv:privacychange", {detail: read()}));
  });
  try {
    var pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    if (Array.isArray(pending)) queue = pending.filter(function(item) {
      return item && item.version === VERSION && Date.now() - Date.parse(item.chosen_at) < MAX_AGE;
    });
  } catch (error) {}
  window.addEventListener("online", flushReceipts);
  flushReceipts();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
