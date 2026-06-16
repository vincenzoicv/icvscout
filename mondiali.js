(function () {
  "use strict";

  var API_URL = "/api/world-cup/overview";
  var CACHE_KEY = "icv_world_cup_2026_live";
  var LIVE_STATUSES = ["IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT"];
  var SCHEDULED_STATUSES = ["TIMED", "SCHEDULED"];
  var LIVE_WINDOW_MS = 150 * 60 * 1000;
  var FINISHED_STATUSES = ["FINISHED", "AWARDED"];
  var currentFilter = "today";
  var worldCup = null;
  var refreshTimer = null;

  var TEAM_NAMES = {
    "Bosnia-Herzegovina": "Bosnia-Erzegovina",
    Czechia: "Repubblica Ceca",
    "Congo DR": "RD Congo",
    Croatia: "Croazia",
    Curaçao: "Curacao",
    England: "Inghilterra",
    Germany: "Germania",
    "Ivory Coast": "Costa d'Avorio",
    IvoryCoast: "Costa d'Avorio",
    Japan: "Giappone",
    Mexico: "Messico",
    Morocco: "Marocco",
    Netherlands: "Paesi Bassi",
    "New Zealand": "Nuova Zelanda",
    "Saudi Arabia": "Arabia Saudita",
    Scotland: "Scozia",
    "South Africa": "Sudafrica",
    "South Korea": "Corea del Sud",
    Spain: "Spagna",
    Sweden: "Svezia",
    Switzerland: "Svizzera",
    Tunisia: "Tunisia",
    Turkey: "Turchia",
    "United States": "Stati Uniti"
  };

  var STAGE_LABELS = {
    GROUP_STAGE: "Fase a gironi",
    LAST_32: "Sedicesimi",
    LAST_16: "Ottavi",
    QUARTER_FINALS: "Quarti",
    SEMI_FINALS: "Semifinali",
    THIRD_PLACE: "Finale 3° posto",
    FINAL: "Finale"
  };

  var STATUS_LABELS = {
    SCHEDULED: "Programmata",
    TIMED: "Programmata",
    IN_PLAY: "Live",
    PAUSED: "Intervallo",
    EXTRA_TIME: "Supplementari",
    PENALTY_SHOOTOUT: "Rigori",
    FINISHED: "Finale",
    AWARDED: "Assegnata",
    POSTPONED: "Rinviata",
    SUSPENDED: "Sospesa",
    CANCELLED: "Cancellata"
  };

  window.switchTab = function (id, btn) {
    document.querySelectorAll(".pane").forEach(function (pane) { pane.classList.remove("active"); });
    document.querySelectorAll(".tab-btn").forEach(function (button) { button.classList.remove("active"); });
    var pane = document.getElementById("pane-" + id);
    if (pane) pane.classList.add("active");
    if (btn) btn.classList.add("active");
  };

  window.loadWorldCup = async function (force) {
    var refreshButton = document.getElementById("refreshBtn");
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "Aggiorno...";
    }

    try {
      var data = await fetchOverview(force);
      if (!data.matches || !data.standings) throw new Error("Dati incompleti");
      worldCup = data;
      saveCache(data);
      renderAll();
    } catch (error) {
      var cached = loadCache();
      if (cached) {
        worldCup = cached;
        renderAll();
        setConnectionState(false, "Dati salvati · collegamento momentaneamente assente");
      } else {
        showFatalError("I dati dei Mondiali non sono disponibili. Riprova tra poco.");
      }
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = "Aggiorna";
      }
      scheduleRefresh();
    }
  };

  async function fetchOverview(force) {
    var url = force ? API_URL + "?refresh=" + Date.now() : API_URL;
    var response = await fetch(url, { cache: "no-store" });
    if (response.ok) return response.json();

    var localHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    if (!localHost) throw new Error("HTTP " + response.status);

    var root = "https://ilcalciodivince.com/api/football-data/competitions/WC";
    var responses = await Promise.all([
      fetch(root, { cache: "no-store" }),
      fetch(root + "/matches", { cache: "no-store" }),
      fetch(root + "/standings", { cache: "no-store" }),
      fetch(root + "/scorers?limit=25", { cache: "no-store" })
    ]);
    if (responses.slice(0, 3).some(function (item) { return !item.ok; })) {
      throw new Error("API Mondiali non disponibile");
    }

    var payloads = await Promise.all(responses.map(function (item, index) {
      return item.ok ? item.json() : index === 3 ? { scorers: [] } : Promise.reject(new Error("HTTP " + item.status));
    }));
    var matches = payloads[1].matches || [];
    return {
      competition: payloads[0],
      matches: matches,
      standings: payloads[2].standings || [],
      scorers: payloads[3].scorers || [],
      fetchedAt: new Date().toISOString(),
      live: matches.some(isLiveMatch)
    };
  }

  function renderAll() {
    renderConnectionState();
    renderSchedule();
    renderGroups();
    renderBracket();
    renderStats();
  }

  function renderConnectionState() {
    var live = (worldCup.matches || []).some(isLiveMatch);
    var played = (worldCup.matches || []).filter(isFinished).length;
    var label = live ? "Partite in diretta" : "Dati live · " + played + " di 104 partite concluse";
    setConnectionState(live, label);
    var updated = document.getElementById("updatedAt");
    if (updated) {
      var date = new Date(worldCup.fetchedAt || Date.now());
      updated.textContent = "Aggiornato alle " + date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    }
  }

  function setConnectionState(live, label) {
    var dot = document.getElementById("liveDot");
    var text = document.getElementById("liveLabel");
    if (dot) dot.classList.toggle("on", !!live);
    if (text) text.textContent = label;
  }

  function renderSchedule() {
    var container = document.getElementById("schedule");
    if (!container) return;
    var matches = (worldCup.matches || []).slice().sort(byDate).filter(matchForCurrentFilter);
    if (!matches.length) {
      container.innerHTML = '<div class="empty-state">Nessuna partita in questa sezione.</div>';
      return;
    }

    var days = {};
    matches.forEach(function (match) {
      var key = localDateKey(match.utcDate);
      if (!days[key]) days[key] = [];
      days[key].push(match);
    });

    container.innerHTML = Object.keys(days).map(function (key) {
      return '<section><div class="day-title">' + formatDay(days[key][0].utcDate) + '</div>' +
        '<div class="fixture-list">' + days[key].map(fixtureHtml).join("") + '</div></section>';
    }).join("");
  }

  function matchForCurrentFilter(match) {
    if (currentFilter === "all") return true;
    if (currentFilter === "live") return isLiveMatch(match);
    if (currentFilter === "finished") return isFinished(match);
    if (currentFilter === "upcoming") return !isFinished(match) && !isLiveMatch(match) && new Date(match.utcDate) >= new Date();
    return localDateKey(match.utcDate) === localDateKey(new Date());
  }

  function fixtureHtml(match) {
    var live = isLiveMatch(match);
    var score = scorePair(match);
    var time = live ? (LIVE_STATUSES.includes(match.status) ? STATUS_LABELS[match.status] : "In corso") :
      (isFinished(match) ? "Finale" : new Date(match.utcDate).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    return '<article class="fixture' + (live ? " live" : "") + '">' +
      '<div class="fixture-time">' + escapeHtml(time) + '<small>' + escapeHtml(groupOrStage(match)) + '</small></div>' +
      '<div class="fixture-teams">' + teamLine(match.homeTeam) + teamLine(match.awayTeam) + '</div>' +
      '<div class="fixture-score"><span>' + score[0] + '</span><span>' + score[1] + '</span></div>' +
      liveGoalEventsHtml(match, live) +
      '<div class="fixture-meta">' + escapeHtml(live && !LIVE_STATUSES.includes(match.status) ? "In corso" : STATUS_LABELS[match.status] || match.status) + '</div>' +
      '</article>';
  }

  function liveGoalEventsHtml(match, live) {
    var goals = Array.isArray(match.goalEvents) ? match.goalEvents : [];
    if (!live || !goals.length) return "";
    return '<div class="fixture-goals">' + goals.map(function (goal) {
      var minute = String(goal.minute || 0) + (goal.extra ? "+" + goal.extra : "") + "'";
      var detail = /penalty/i.test(goal.detail || "") ? " (rig.)" : /own goal/i.test(goal.detail || "") ? " (aut.)" : "";
      return '<div class="goal-event ' + (goal.side === "away" ? "away" : "home") + '">' +
        '<span class="goal-minute">' + escapeHtml(minute) + '</span> ' + escapeHtml(goal.player || "Marcatore da confermare") + escapeHtml(detail) +
        '</div>';
    }).join("") + '</div>';
  }

  function teamLine(team) {
    return '<div class="fixture-team">' + crestHtml(team) + '<span>' + escapeHtml(teamName(team)) + '</span></div>';
  }

  function renderGroups() {
    var grid = document.getElementById("groupsGrid");
    if (!grid) return;
    var groupMatches = (worldCup.matches || []).filter(function (match) { return match.stage === "GROUP_STAGE"; });
    grid.innerHTML = (worldCup.standings || []).map(function (standing) {
      var letter = String(standing.group || "").replace(/Group\s*/i, "");
      var matches = groupMatches.filter(function (match) { return match.group === "GROUP_" + letter; }).sort(byDate);
      return '<article class="group-card">' +
        '<div class="group-hd"><span class="group-letter">Gruppo ' + escapeHtml(letter) + '</span><span class="group-label">' + matches.filter(isFinished).length + '/6 giocate</span></div>' +
        '<table class="standings"><thead><tr><th>Squadra</th><th>G</th><th>Pt</th><th>GF</th><th>GS</th><th>DR</th></tr></thead>' +
        '<tbody>' + (standing.table || []).map(standingRow).join("") + '</tbody></table>' +
        '<div class="matches-toggle" onclick="toggleGroupMatches(\'' + escapeHtml(letter) + '\')">Partite del gruppo</div>' +
        '<div class="matches-list" id="ml-' + escapeHtml(letter) + '">' + matches.map(groupMatchHtml).join("") + '</div>' +
        '</article>';
    }).join("");
  }

  function standingRow(row) {
    var gd = Number(row.goalDifference || 0);
    return '<tr class="' + (row.position <= 2 ? "q" + row.position : "") + '">' +
      '<td><div class="team-cell"><div class="q-dot"></div>' + crestHtml(row.team, "group-team-crest") + '<span class="team-nm">' + escapeHtml(teamName(row.team)) + '</span></div></td>' +
      '<td>' + row.playedGames + '</td><td class="pts">' + row.points + '</td><td>' + row.goalsFor + '</td><td>' + row.goalsAgainst + '</td>' +
      '<td style="color:' + (gd > 0 ? "var(--green)" : gd < 0 ? "var(--red)" : "var(--text2)") + '">' + (gd > 0 ? "+" : "") + gd + '</td></tr>';
  }

  window.toggleGroupMatches = function (group) {
    var list = document.getElementById("ml-" + group);
    if (list) list.classList.toggle("open");
  };

  function groupMatchHtml(match) {
    var score = scorePair(match);
    return '<div class="match-row"><div class="match-tm">' + crestHtml(match.homeTeam) + '<span>' + escapeHtml(teamName(match.homeTeam)) + '</span></div>' +
      '<div class="match-sc"><strong>' + score[0] + '</strong><span class="sc-sep">:</span><strong>' + score[1] + '</strong></div>' +
      '<div class="match-tm r"><span>' + escapeHtml(teamName(match.awayTeam)) + '</span>' + crestHtml(match.awayTeam) + '</div></div>';
  }

  function renderBracket() {
    var bracket = document.getElementById("bracket");
    if (!bracket) return;
    var stages = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"];
    bracket.innerHTML = stages.map(function (stage) {
      var matches = (worldCup.matches || []).filter(function (match) { return match.stage === stage; }).sort(byDate);
      return '<section class="b-round bracket-stage"><div class="b-round-hd">' + STAGE_LABELS[stage] + '</div><div class="b-matches">' +
        matches.map(bracketMatchHtml).join("") + '</div></section>';
    }).join("") + winnerHtml();

    var third = (worldCup.matches || []).find(function (match) { return match.stage === "THIRD_PLACE"; });
    var thirdContainer = document.getElementById("thirdPlace");
    if (thirdContainer) thirdContainer.innerHTML = third ? '<div class="third-place"><div class="b-round-hd">Finale 3° posto</div>' + bracketMatchHtml(third) + '</div>' : "";
  }

  function bracketMatchHtml(match) {
    var score = scorePair(match);
    return '<article class="b-match' + (match.stage === "FINAL" ? " gold-match" : "") + '">' +
      bracketTeamHtml(match.homeTeam, score[0], match.score && match.score.winner === "HOME_TEAM") +
      bracketTeamHtml(match.awayTeam, score[1], match.score && match.score.winner === "AWAY_TEAM") +
      '<div class="fixture-meta" style="padding:7px 10px">' + formatShortDate(match.utcDate) + ' · ' + escapeHtml(STATUS_LABELS[match.status] || match.status) + '</div></article>';
  }

  function bracketTeamHtml(team, score, winner) {
    return '<div class="b-team' + (!team || !team.name ? " empty" : "") + (winner ? " winner" : "") + '">' +
      (team && team.name ? crestHtml(team, "b-team-flag") + '<span>' + escapeHtml(teamName(team)) + '</span>' : '<span>Da definire</span>') +
      '<span class="b-team-score">' + score + '</span></div>';
  }

  function winnerHtml() {
    var finalMatch = (worldCup.matches || []).find(function (match) { return match.stage === "FINAL"; });
    var winner = null;
    if (finalMatch && isFinished(finalMatch)) {
      winner = finalMatch.score.winner === "HOME_TEAM" ? finalMatch.homeTeam : finalMatch.awayTeam;
    }
    return '<div class="b-winner-col"><div class="b-trophy"' + (winner ? "" : ' style="opacity:.15;filter:none"') + '>🏆</div>' +
      (winner ? '<div class="b-winner-lbl">Campione</div><div class="b-winner-name">' + escapeHtml(teamName(winner)) + '</div>' : '<div class="b-winner-empty">In attesa</div>') + '</div>';
  }

  function renderStats() {
    var matches = worldCup.matches || [];
    var played = matches.filter(isFinished);
    var goals = played.reduce(function (total, match) {
      var score = scorePair(match, true);
      return total + (score[0] || 0) + (score[1] || 0);
    }, 0);
    var live = matches.filter(isLiveMatch).length;
    var values = [
      { value: played.length, label: "Partite concluse" },
      { value: 104 - played.length, label: "Partite da giocare" },
      { value: goals, label: "Gol segnati" },
      { value: played.length ? (goals / played.length).toFixed(2) : "0.00", label: "Gol per partita" },
      { value: live, label: "Partite live" },
      { value: (worldCup.scorers || []).length, label: "Marcatori registrati" },
      { value: 48, label: "Nazionali" },
      { value: 12, label: "Gironi" }
    ];
    var grid = document.getElementById("statsGrid");
    if (grid) grid.innerHTML = values.map(function (item) {
      return '<div class="stat-box"><div class="stat-value">' + item.value + '</div><div class="stat-label">' + item.label + '</div></div>';
    }).join("");

    var body = document.getElementById("scorersBody");
    if (!body) return;
    var scorers = worldCup.scorers || [];
    body.innerHTML = scorers.length ? scorers.map(function (row, index) {
      return '<tr><td><span class="rank">' + (index + 1) + '</span><strong>' + escapeHtml(row.player && row.player.name || "-") + '</strong>' +
        '<div class="player-team">' + crestHtml(row.team) + escapeHtml(teamName(row.team)) + '</div></td>' +
        '<td><strong>' + (row.goals || 0) + '</strong></td><td>' + (row.assists || 0) + '</td><td>' + (row.penalties || 0) + '</td></tr>';
    }).join("") : '<tr><td colspan="4">La classifica marcatori comparirà dopo le prime reti.</td></tr>';
  }

  function scorePair(match, numeric) {
    var score = match && match.score && match.score.fullTime || {};
    if (numeric) return [Number(score.home || 0), Number(score.away || 0)];
    return [score.home === null || score.home === undefined ? "–" : score.home, score.away === null || score.away === undefined ? "–" : score.away];
  }

  function teamName(team) {
    if (!team || !team.name) return "Da definire";
    return TEAM_NAMES[team.name] || team.shortName || team.name;
  }

  function crestHtml(team, className) {
    if (!team || !team.crest) return '<span class="' + (className || "mini-crest") + '"></span>';
    return '<img class="' + (className || "mini-crest") + '" src="' + escapeHtml(team.crest) + '" alt="" loading="lazy">';
  }

  function groupOrStage(match) {
    if (match.group) return match.group.replace("GROUP_", "Gruppo ");
    return STAGE_LABELS[match.stage] || "Mondiali";
  }

  function isFinished(match) { return FINISHED_STATUSES.includes(match.status); }

  function isLiveMatch(match) {
    if (!match || isFinished(match)) return false;
    if (match.isLive || LIVE_STATUSES.includes(match.status)) return true;
    if (!SCHEDULED_STATUSES.includes(match.status)) return false;
    var kickoff = Date.parse(match.utcDate || "");
    var now = Date.now();
    return Number.isFinite(kickoff) && now >= kickoff && now <= kickoff + LIVE_WINDOW_MS;
  }

  function byDate(a, b) { return new Date(a.utcDate) - new Date(b.utcDate); }

  function localDateKey(value) {
    var date = value instanceof Date ? value : new Date(value);
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    return map.year + "-" + map.month + "-" + map.day;
  }

  function formatDay(value) {
    return new Date(value).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" });
  }

  function formatShortDate(value) {
    return new Date(value).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: data })); } catch (error) {}
  }

  function loadCache() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (parsed && parsed.data && Date.now() - parsed.savedAt < 6 * 60 * 60 * 1000) return parsed.data;
    } catch (error) {}
    return null;
  }

  function showFatalError(message) {
    ["schedule", "groupsGrid", "bracket"].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.innerHTML = '<div class="error-state">' + escapeHtml(message) + '</div>';
    });
    setConnectionState(false, "Dati non disponibili");
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    var live = worldCup && (worldCup.matches || []).some(isLiveMatch);
    var delay = live ? 10000 : 180000;
    refreshTimer = setTimeout(function () {
      if (document.visibilityState === "visible") window.loadWorldCup(false);
      else scheduleRefresh();
    }, delay);
  }

  document.getElementById("matchFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;
    currentFilter = button.getAttribute("data-filter");
    document.querySelectorAll(".filter-btn").forEach(function (item) { item.classList.toggle("active", item === button); });
    renderSchedule();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && worldCup) window.loadWorldCup(false);
  });

  window.loadWorldCup(false);
})();
