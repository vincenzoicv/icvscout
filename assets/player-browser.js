(function () {
  "use strict";
  var tabs = Array.from(document.querySelectorAll(".tabs button"));
  var status = document.getElementById("playerStatus");
  var errorBox = document.getElementById("playerError");
  var retry = document.getElementById("playerRetry");
  var slug = new URLSearchParams(location.search).get("slug") || "";
  var loading = false;
  window.date = function (value) {
    var parsed = value ? new Date(value) : null;
    return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "Data non disponibile";
  };

  window.setTab = function (id) {
    if (!tabs.some(function (tab) { return tab.dataset.tab === id; })) id = "overview";
    tabs.forEach(function (tab) {
      var active = tab.dataset.tab === id;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      var panel = document.getElementById(tab.dataset.tab);
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  };
  function choose(id, focus) {
    setTab(id);
    history.replaceState(null, "", location.pathname + location.search + "#" + id);
    if (focus) tabs.find(function (tab) { return tab.dataset.tab === id; }).focus();
  }
  tabs.forEach(function (tab, index) {
    tab.id = "player-tab-" + tab.dataset.tab;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", tab.dataset.tab);
    var panel = document.getElementById(tab.dataset.tab);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    tab.onclick = function () { choose(tab.dataset.tab); };
    tab.addEventListener("keydown", function (event) {
      var next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); choose(tabs[next].dataset.tab, true); }
    });
  });
  function restoreTab() { setTab(location.hash.slice(1)); }
  restoreTab();
  window.addEventListener("hashchange", restoreTab);
  window.addEventListener("popstate", restoreTab);

  // Preserve the existing editorial renderer while validating its input contract.
  function renderPlayer(data) {
    if (!data || !data.player || typeof data.player.name !== "string") throw new Error("Dati non validi");
    ["news", "market", "discussions", "related"].forEach(function (key) { if (!Array.isArray(data[key])) data[key] = []; });
    data.counts = data.counts || {};
    [["news", "news"], ["market", "market"], ["discussions", "discussions"]].forEach(function (pair) {
      if (!Number.isFinite(data.counts[pair[0]])) data.counts[pair[0]] = data[pair[1]].length;
    });
    render(data);
    if (!data.player.updated_at) document.getElementById("playerSummary").textContent = data.counts.news + " news · " + data.counts.discussions + " discussioni";
    ["news", "market", "community"].forEach(function (id, index) {
      var metric = document.querySelectorAll("#metrics .metric")[index];
      var link = document.createElement("a");
      link.className = metric.className;
      link.href = "#" + id;
      link.replaceChildren.apply(link, Array.from(metric.childNodes));
      link.addEventListener("click", function (event) { event.preventDefault(); choose(id, true); });
      metric.replaceWith(link);
    });
    document.querySelectorAll(".row[target='_blank']").forEach(function (link) {
      var url;
      try { url = new URL(link.getAttribute("href"), location.origin); } catch (error) {}
      if (!url || !["https:", "http:"].includes(url.protocol)) {
        link.removeAttribute("href");
        link.removeAttribute("target");
      } else {
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", link.querySelector("h3").textContent + " (si apre in una nuova scheda)");
      }
    });
    document.querySelector("link[rel='canonical']").href = "https://ilcalciodivince.com/giocatore?slug=" + encodeURIComponent(slug);
    status.textContent = "";
  }

  async function load() {
    if (loading) return;
    if (!slug) {
      document.getElementById("playerName").textContent = "Scegli un giocatore";
      document.getElementById("metrics").replaceChildren();
      document.getElementById("playerErrorText").textContent = "Il collegamento non indica un giocatore.";
      retry.hidden = true;
      errorBox.hidden = false;
      return;
    }
    loading = true;
    retry.disabled = true;
    errorBox.hidden = true;
    status.textContent = "Caricamento profilo...";
    document.getElementById("main-content").setAttribute("aria-busy", "true");
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch("/api/public/players/" + encodeURIComponent(slug), { signal: controller.signal });
      if (response.status === 404) { var missing = new Error("Profilo non trovato"); missing.notFound = true; throw missing; }
      if (!response.ok) throw new Error("Servizio non disponibile");
      renderPlayer(await response.json());
    } catch (error) {
      document.getElementById("playerName").textContent = "Profilo non disponibile";
      document.getElementById("metrics").replaceChildren();
      status.textContent = "";
      document.getElementById("playerErrorText").textContent = error.notFound ? "Questo profilo non e disponibile. Cerca un altro giocatore." : "Impossibile caricare il profilo. Riprova tra poco.";
      retry.hidden = !!error.notFound;
      errorBox.hidden = false;
    } finally {
      clearTimeout(timer);
      loading = false;
      retry.disabled = false;
      document.getElementById("main-content").removeAttribute("aria-busy");
    }
  }
  retry.addEventListener("click", function () { tabs.find(function (tab) { return tab.getAttribute("aria-selected") === "true"; }).focus(); load(); });
  load();
}());
