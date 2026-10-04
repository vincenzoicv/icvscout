(function () {
  "use strict";
  var modal = document.getElementById("searchModal");
  var input = document.getElementById("searchInput");
  var box = document.getElementById("searchResults");
  var status = document.getElementById("communitySearchStatus");
  var request = 0, controller, trigger;
  var originalClose = window.closeLayer;

  window.closeLayer = function (id) {
    originalClose(id);
    if (id === "searchModal") {
      request++;
      if (controller) controller.abort();
      box.removeAttribute("aria-busy");
      if (trigger && trigger.isConnected) trigger.focus();
    }
  };
  window.openSearch = function () {
    trigger = document.activeElement;
    modal.classList.remove("hidden");
    input.focus();
    refreshIcons();
  };

  function row(item, type) {
    var link = type === "players" || type === "news";
    var element = document.createElement(link ? "a" : "button");
    element.className = "result-row";
    element.style.cssText = "width:100%;text-align:left;color:var(--text);font:inherit;text-decoration:none;min-height:48px";
    if (link) element.href = type === "players" ? "/giocatore?slug=" + encodeURIComponent(item.slug) : "/community?news=" + encodeURIComponent(item.id);
    else {
      element.type = "button";
      element.addEventListener("click", function () {
        closeLayer("searchModal");
        if (type === "profiles") openPublicProfile(item.username);
        else openPostDetail(item.id, true);
      });
    }
    var copy = document.createElement("div");
    copy.className = "result-copy";
    var title = document.createElement("strong"), detail = document.createElement("span");
    title.style.overflowWrap = "anywhere";
    title.textContent = type === "players" ? item.name : type === "profiles" ? item.display_name : type === "posts" ? item.author && item.author.display_name || "Community" : item.title;
    detail.textContent = type === "players" ? (item.news_count || 0) + " news" : type === "profiles" ? "@" + item.username : item.body || "News ICV";
    copy.append(title, detail);
    element.append(copy);
    return element;
  }

  window.runSearch = async function (event) {
    if (event) event.preventDefault();
    var q = input.value.trim(), current = ++request;
    if (controller) controller.abort();
    box.replaceChildren();
    if (q.length < 2) {
      box.removeAttribute("aria-busy");
      status.textContent = "Scrivi almeno due caratteri.";
      return;
    }
    controller = new AbortController();
    var activeController = controller;
    var timer = setTimeout(function () { activeController.abort(); }, 15000);
    box.setAttribute("aria-busy", "true");
    status.textContent = "Ricerca in corso...";
    try {
      var data = await communityApi("search?q=" + encodeURIComponent(q), { signal: controller.signal });
      if (current !== request) return;
      var count = 0;
      [["players", "Giocatori"], ["profiles", "Profili"], ["posts", "Discussioni"], ["news", "News ICV"]].forEach(function (group) {
        var items = Array.isArray(data[group[0]]) ? data[group[0]] : [];
        if (!items.length) return;
        var heading = document.createElement("h3");
        heading.className = "result-section";
        heading.textContent = group[1] + " (" + items.length + ")";
        box.append(heading);
        items.forEach(function (item) { box.append(row(item, group[0])); });
        count += items.length;
      });
      status.textContent = count ? count + (count === 1 ? " risultato" : " risultati") + " per \u201c" + q + "\u201d" : "Nessun risultato per \u201c" + q + "\u201d.";
    } catch (error) {
      if (current !== request) return;
      status.textContent = "La ricerca non e disponibile. Riprova tra poco.";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "publish";
      retry.textContent = "Riprova";
      retry.addEventListener("click", function () { input.focus(); runSearch(); });
      box.append(retry);
    } finally {
      clearTimeout(timer);
      if (current === request) box.removeAttribute("aria-busy");
    }
  };

  input.addEventListener("input", function () {
    request++;
    if (controller) controller.abort();
    box.removeAttribute("aria-busy");
    box.replaceChildren();
    status.textContent = input.value.trim().length < 2 ? "Scrivi almeno due caratteri." : "";
  });
  modal.querySelector(".close").setAttribute("aria-label", "Chiudi ricerca");
  modal.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var controls = Array.from(modal.querySelectorAll("a[href],button:not([disabled]),input"));
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}());
