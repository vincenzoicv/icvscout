import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("la home lascia le amichevoli al calendario ufficiale", async () => {
  const html = await read("index.html");
  assert.match(html, /class="hero-season-link" href="\/calendario-juventus">Calendario ufficiale 2026\/27/);
  assert.doesNotMatch(html, /<div class="friendly-strip"/);
  assert.doesNotMatch(html, /Risultati e prossime/);
});

test("Anime.js anima la home rispettando Riduci movimento", async () => {
  const html = await read("index.html");
  assert.match(html, /<script src="\/assets\/anime\.umd\.min\.js\?v=4\.5\.0"><\/script>/);
  assert.match(html, /function setupIcvAnimations\(\)/);
  assert.match(html, /function animateLiveDeskRows\(\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /setupIcvAnimations\(\);[\s\S]*?setupHomeMotion\(\);/);
  assert.match(html, /box\.innerHTML = rows\.map[\s\S]*?animateLiveDeskRows\(\);/);
  assert.doesNotMatch(html, /https:\/\/cdn[^"']*anime/i);
});

test("la modalita chiara usa una palette leggibile in tutta la home", async () => {
  const html = await read("index.html");
  assert.match(html, /body\.light\{[^}]*--gold-l:#765100[^}]*--t3:rgba\(24,23,19,\.66\)/);
  assert.match(html, /body\.light \.hero h1 span,[^{]+\{color:#efbd52;\}/);
  assert.match(html, /body\.light \.stat-val\{background:linear-gradient\(135deg,#8a6100,#4f3500\)/);
  assert.match(html, /body\.light \.mob-btn\{color:var\(--t3\);\}/);
  assert.match(html, /body\.light \.live-desk-tag\[data-kind="official"\][^{]+\{color:#176b3a/);
});

test("la home apre con fotografie reali dello Stadium su desktop e mobile", async () => {
  const [html, worker] = await Promise.all([read("index.html"), read("sw.js")]);
  for (const marker of [
    "/assets/hero-allianz-user-2026.webp",
    "/assets/hero-allianz-user-mobile-2026.jpg",
    "<h1><span>ICV</span><strong>SCOUT</strong></h1>",
    'id="heroAtmosphere"',
    "function setupImmersiveHero()",
    "setupImmersiveHero();",
    "pointer:fine",
  ]) assert.ok(html.includes(marker), `manca ${marker}`);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(worker, /hero-allianz-user-2026\.webp/);
  assert.match(worker, /hero-allianz-user-mobile-2026\.jpg/);
  assert.doesNotMatch(html, /hero h1[^}]*background:linear-gradient/);
});

test("la home propone l'installazione PWA senza essere invadente", async () => {
  const [html, manifest, worker] = await Promise.all([
    read("index.html"),
    read("manifest.json"),
    read("sw.js"),
  ]);
  for (const marker of [
    "Porta ICV Scout nella Home",
    "Senza store · sempre con te",
    "function scheduleInstallCard()",
    "icv_install_prompt_dismissed_v1",
    "installPromptDelay = 7000",
    "installPromptCooldown = 14 * 24 * 60 * 60 * 1000",
    "beforeinstallprompt",
    "display-mode: standalone",
  ]) assert.ok(html.includes(marker), `manca ${marker}`);
  assert.match(html, /onclick="closeInstallCard\(true\)"/);
  assert.match(html, /window\.addEventListener\("load", scheduleInstallCard\)/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(worker, /const CACHE = 'icv-v20'/);
});

test("ICV Match Hub gestisce avvicinamento, live, finale e Match Receipt", async () => {
  const [html, api, admin, cron, cronConfig] = await Promise.all([
    read("index.html"),
    read("functions/api/[[path]].js"),
    read("icv_admin.html"),
    read("workers/icv-cron.js"),
    read("wrangler.cron.toml"),
  ]);
  for (const marker of [
    'id="homeMatchHub"',
    '<div class="match-hub-head">',
    "ICV Match Hub",
    "Prossimo incontro",
    "ICV Match Receipt",
    "Il referto della partita",
    "downloadMatchReceipt",
    "shareMatchReceipt",
    "function matchHubPhase",
    "function matchHubFreshness",
    "function homeDashboardInterval",
    "cache:\"no-store\"",
    "Forma recente",
    "function renderMatchHub",
    "function normalizeMatchHubRows",
    "function matchHubIsSerieA",
    "var upcoming = live || nextSerieA",
    'previous.status === "finished" && match.status !== "finished"',
    "function matchHubRecordLabel",
    "function matchHubRomeDayNumber",
    "function renderMatchHubProbable",
    "function renderMatchHubUpcoming",
    "function animateMatchHub",
    "ICV_VERIFIED_MATCH_DATA",
  ]) assert.ok(html.includes(marker), `manca ${marker}`);
  assert.match(html, /id="matchHubNextDate">29 agosto 2026 · 20:45/);
  assert.match(html, /id="matchHubNextHome">Juventus FC/);
  assert.match(html, /id="matchHubNextAway">Parma Calcio 1913/);
  assert.match(html, /id="matchHubCompetition">Serie A/);
  assert.match(html, /id="matchHubVenue">Allianz Stadium · Torino/);
  assert.match(html, /id="matchHubCountdown">Tra 5 giorni/);
  assert.match(html, /id="matchHubCountdownWrap"/);
  assert.match(html, /id="matchHubUpcomingPanel"/);
  assert.match(html, /id="matchHubUpcoming"/);
  assert.match(html, /<h4>Prossime 3<\/h4>/);
  assert.match(html, /Allianz Stadium · Torino/);
  assert.match(html, /Juventus FC",away:"Parma Calcio 1913"/);
  assert.match(html, /Juventus FC",away:"AC Milan"/);
  assert.match(html, /US Sassuolo Calcio",away:"Juventus FC"/);
  assert.match(html, /<h4>Probabile formazione<\/h4>/);
  assert.match(html, /match-hub-probable-module">4-2-3-1/);
  for (const player of ["Kolo Muani", "Conceicao", "Koopmeiners", "Boga", "Locatelli", "Douglas Luiz", "Cambiaso", "Bremer", "Kelly", "Kalulu", "Vicario"]) {
    assert.ok(html.includes(player), `manca ${player} nella probabile formazione`);
  }
  assert.match(html, /13<\/b>Boga[\s\S]*8<\/b>Koopmeiners[\s\S]*7<\/b>Conceicao/);
  assert.match(html, /5<\/b>Locatelli[\s\S]*12<\/b>Douglas Luiz/);
  assert.match(html, /20<\/b>Cambiaso[\s\S]*3<\/b>Bremer[\s\S]*6<\/b>Kelly[\s\S]*15<\/b>Kalulu/);
  assert.match(html, /match-hub-probable-number">25<\/b>Vicario/);
  assert.match(html, /Aggiornata dopo la conferenza del 28 agosto/);
  assert.match(html, /Cambiaso \/ Celik/);
  assert.match(html, /Koopmeiners \/ Alajbegovic/);
  assert.match(html, /<b>Assenti<\/b>Yildiz, McKennie/);
  assert.match(html, /<b>Da valutare<\/b>Thuram/);
  assert.match(html, /!\/parma\/i\.test\(teams\)/);
  assert.match(html, /\["buildup", "matchday"\]\.includes\(phase\)/);
  assert.match(html, /calendarDays === 1\) return "Domani"/);
  assert.match(html, /timeZone: "Europe\/Rome"/);
  assert.match(html, /\.match-hub-next\{[^}]*align-items:center[^}]*text-align:center/);
  assert.match(html, /\.match-hub-phase\{[^}]*justify-content:center[^}]*text-align:center/);
  assert.match(html, /\.match-hub-meta\{[^}]*justify-content:center/);
  assert.match(html, /data-state="final"\] \.match-hub-vs[^}]*font-size:72px/);
  assert.match(html, /Bremer 22'/);
  assert.match(html, /FINO ALLA FINE\./);
  assert.doesNotMatch(html, /id="receiptLineups/);
  assert.doesNotMatch(html, /match\.lineupsText/);
  assert.doesNotMatch(html, /FORMAZIONI UFFICIALI/);
  assert.match(html, /countdownWrap\.hidden = phase === "final" \|\| phase === "post"/);
  assert.doesNotMatch(html, /id="receiptPrinterSource"/);
  assert.doesNotMatch(html, /Marcatori non disponibili dalla fonte/);
  assert.doesNotMatch(html, /Formazioni non pubblicate dalla fonte/);
  assert.match(html, /function matchHubVenue/);
  assert.doesNotMatch(html, /Orario e sede verificati/);
  assert.doesNotMatch(html, /Informazioni verificate/);
  assert.doesNotMatch(html, /matchHubFact/);
  assert.match(html, /nextSerieA = matches\.find[\s\S]*?matchHubIsSerieA\(match\)/);
  assert.doesNotMatch(html, /Focus ICV|buildEditorialFocus|homeFocusTitle/);
  assert.match(html, /renderLiveDesk\(data\.live_desk\);[\s\S]*?renderMatchHub\(matches\);/);
  assert.match(html, /icvReducedMotion\(\)[\s\S]*?#homeMatchHub/);
  assert.match(api, /match_reports\?order=match_date\.asc&limit=80/);
  assert.match(api, /matches\?dateFrom=/);
  for (const header of ["X-Unfold-Lineups", "X-Unfold-Bookings", "X-Unfold-Subs", "X-Unfold-Goals"]) {
    assert.ok(api.includes(header), `manca ${header}`);
  }
  assert.match(api, /function matchReportFromFootballData/);
  assert.match(api, /function upsertMatchReport/);
  assert.match(api, /body\.type === "match_override"/);
  assert.match(api, /icv_manual/);
  assert.match(admin, /Salva correzione/);
  assert.match(admin, /Ripristina fonte/);
  assert.match(cron, /const MATCH_CRON = "\* \* \* \* \*"/);
  assert.match(cron, /\["home", "market", "match", "all"\]\.includes\(job\)/);
  assert.match(cronConfig, /"\* \* \* \* \*"/);

  const { footballDataMatchStatus, matchReportFromFootballData } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  assert.equal(footballDataMatchStatus("TIMED"), "pre_match");
  assert.equal(footballDataMatchStatus("IN_PLAY"), "in_play");
  assert.equal(footballDataMatchStatus("PAUSED"), "halftime");
  assert.equal(footballDataMatchStatus("FINISHED"), "finished");
  const report = matchReportFromFootballData({
    id: 558635,
    utcDate: "2026-08-23T16:30:00Z",
    status: "IN_PLAY",
    matchday: 1,
    competition: { name: "Serie A" },
    homeTeam: { id: 470, name: "Frosinone Calcio" },
    awayTeam: { id: 109, name: "Juventus FC" },
    score: { fullTime: { home: 0, away: 1 } },
    goals: [{ minute: 34, team: { name: "Juventus FC" }, scorer: { name: "Kenan Yildiz" } }],
  }, { sourceUrl: "https://api.football-data.org/v4/teams/109/matches" });
  assert.equal(report.status, "in_play");
  assert.equal(report.title, "Frosinone Calcio 0-1 Juventus FC");
  assert.match(report.summary, /Kenan Yildiz 34'/);
  assert.equal(report.source_payload.icv_meta.provider, "football-data.org");
});

test("Community e API mostrano la prossima partita, non una gara successiva", async () => {
  const [community, api] = await Promise.all([
    read("community.html"),
    read("functions/api/[[path]].js"),
  ]);
  assert.match(community, /function selectCommunityMatch\(rows\)/);
  assert.match(community, /var match=selectCommunityMatch\(data\.matches\)/);
  assert.doesNotMatch(community, /var match=data\.matches&&data\.matches\[0\]/);
  assert.match(api, /const orderedMatches = orderPublicMatches\(matches\)\.slice\(0, 12\)/);

  const { orderPublicMatches } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const matches = [
    { match_id: "milan", match_date: "2026-09-06T18:45:00Z", status: "pre_match", title: "Verso Juventus-AC Milan" },
    { match_id: "parma", match_date: "2026-08-29T18:45:00Z", status: "pre_match", title: "Verso Juventus-Parma" },
    { match_id: "frosinone", match_date: "2026-08-23T16:30:00Z", status: "pre_match", title: "Verso Frosinone-Juventus" },
    { match_id: "palermo", match_date: "2026-08-11T12:00:00Z", status: "pre_match", title: "Verso Juventus-Palermo" },
  ];
  const ordered = orderPublicMatches(matches, { now: "2026-08-13T12:00:00Z" });
  assert.equal(ordered[0].match_id, "frosinone");
  assert.equal(ordered[1].match_id, "parma");
  assert.equal(ordered[2].match_id, "milan");
  assert.equal(ordered[3].match_id, "palermo");

  const live = orderPublicMatches([
    ...matches,
    { match_id: "live", match_date: "2026-08-13T11:45:00Z", status: "in_play", title: "Juventus in campo" },
  ], { now: "2026-08-13T12:00:00Z" });
  assert.equal(live[0].match_id, "live");
});

test("News e Statistiche scorrono alla sezione richiesta", async () => {
  const html = await read("index.html");
  assert.match(html, /function scrollSectionIntoView\(section, behavior\)/);
  assert.match(html, /scrollSectionIntoView\(el, scrollBehavior \|\| "smooth"\)/);
  assert.match(html, /showSection\(id, button \|\| null, "auto"\)/);
  assert.match(html, /renderHomeLinks\("homeInstagramList"[\s\S]*?alignHashedSection\(\)/);
  assert.doesNotMatch(html, /function showSec\(id,btn\)\{[\s\S]*?window\.scrollTo\(\{top:0/);
});

test("le statistiche mostrano esclusivamente la stagione 2026/27", async () => {
  const html = await read("index.html");
  const section = html.match(/<section class="section" id="statistiche">([\s\S]*?)<\/section>/)?.[1] || "";
  assert.match(section, /Stagione 2026\/27/);
  assert.match(section, /Classifica Serie A 2026\/27/);
  assert.match(section, /Frosinone Calcio vs Juventus/);
  assert.match(section, /0 - 1/);
  assert.doesNotMatch(section, /2025\/26/);
  assert.match(html, /season=" \+ CURRENT_SEASON/);
  assert.match(html, /function isCurrentStandings\(table\)/);
  assert.match(html, /function renderStandingsUnavailable\(\)/);
  assert.doesNotMatch(html, /renderStandings\(ICV_STANDINGS_FALLBACK/);
});

test("gli script delle pagine principali hanno sintassi valida", async () => {
  for (const file of ["index.html", "community.html", "icv_admin.html", "mercato.html", "giocatore.html", "calendario-juventus.html"]) {
    const html = await read(file);
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(Boolean);
    assert.ok(scripts.length, `${file} deve contenere JavaScript inline`);
    for (const script of scripts) new Function(script);
  }
});

test("il calendario Juventus si aggiorna su Apple e Google con i risultati", async () => {
  const [home, page, api, redirects, sitemap, worker] = await Promise.all([
    read("index.html"),
    read("calendario-juventus.html"),
    read("functions/api/[[path]].js"),
    read("_redirects"),
    read("sitemap.xml"),
    read("sw.js"),
  ]);
  assert.match(home, /href=["']\/calendario-juventus["']/);
  assert.match(home, /class="match-hub-calendar-link" href="\/calendario-juventus">Calendario/);
  assert.doesNotMatch(home, /class="match-banner"/);
  assert.doesNotMatch(home, /Aggiungi al calendario/);
  for (const marker of ["Apple Calendar", "Google Calendar", "/api/juventus/calendar.ics", ">38<", "Europa League", "Real Sociedad", "Rennes", "Omonia Nicosia", "NEC Nijmegen", "AZ Alkmaar", "Ferencvaros", "Celta Vigo", "Hapoel Be’er Sheva", "16/17 SET", "28 GEN"]) {
    assert.ok(page.includes(marker), `manca ${marker}`);
  }
  for (const removed of ["Come funziona", "Orari aggiornati", "Risultati automatici", "Promemoria incluso"]) {
    assert.ok(!page.includes(removed), `va rimosso ${removed}`);
  }
  assert.match(page, /data-calendar-filter="europa"/);
  assert.match(page, /Nessun evento europeo viene aggiunto al calendario finché il programma non è definitivo/);
  assert.match(page, /Le date indicano le otto giornate UEFA, non sono ancora abbinate alle singole avversarie/);
  for (const marker of ['path === "juventus/calendar.ics"', "JUVENTUS_SERIE_A_2026_27", "Risultato finale:", "LAST-MODIFIED", "SEQUENCE:"]) {
    assert.ok(api.includes(marker), `manca ${marker}`);
  }
  assert.doesNotMatch(page, /api\/football-data\/teams\/109\/matches/);
  assert.match(redirects, /^\/calendario-juventus\.html \/calendario-juventus 301$/m);
  assert.match(redirects, /^\/mercato \/calendario-juventus 301$/m);
  assert.match(redirects, /^\/mercato\.html \/calendario-juventus 301$/m);
  assert.match(sitemap, /https:\/\/ilcalciodivince\.com\/calendario-juventus/);
  assert.doesNotMatch(sitemap, /https:\/\/ilcalciodivince\.com\/mercato/);
  assert.match(worker, /\/calendario-juventus\.html/);
  assert.doesNotMatch(worker, /\/mercato\.html/);
  assert.doesNotMatch(home, /location\.href=["']\/mercato|>Mercato<\/button>/);
  assert.match(home, /location\.href='\/calendario-juventus'">Calendario/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ matches: [
    {
      id: 2601,
      utcDate: "2026-08-23T16:30:00Z",
      lastUpdated: "2026-08-24T08:00:00Z",
      status: "FINISHED",
      matchday: 1,
      homeTeam: { name: "Frosinone Calcio" },
      awayTeam: { name: "Juventus FC" },
      score: { fullTime: { home: 0, away: 2 } },
    },
    {
      id: 2602,
      utcDate: "2026-08-29T18:45:00Z",
      lastUpdated: "2026-06-24T08:00:00Z",
      status: "SCHEDULED",
      matchday: 2,
      homeTeam: { name: "Inter" },
      awayTeam: { name: "Juventus" },
      score: { fullTime: { home: null, away: null } },
    },
  ] }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const { onRequest } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
    const response = await onRequest({
      request: new Request("https://ilcalciodivince.com/api/juventus/calendar.ics"),
      env: { FOOTBALL_DATA_KEY: "test" },
    });
    const calendar = await response.text();
    const unfoldedCalendar = calendar.replace(/\r\n /g, "");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/calendar/);
    assert.equal((unfoldedCalendar.match(/BEGIN:VEVENT/g) || []).length, 38);
    assert.match(unfoldedCalendar, /UID:juventus-serie-a-2026-27-g1@ilcalciodivince\.com/);
    assert.match(unfoldedCalendar, /SUMMARY:Juventus: Frosinone 0-2 Juventus/);
    assert.match(unfoldedCalendar, /Risultato finale: Frosinone 0-2 Juventus/);
    assert.match(unfoldedCalendar, /SUMMARY:Serie A: Juventus - Parma/);
    const secondRound = unfoldedCalendar.match(/UID:juventus-serie-a-2026-27-g2@[\s\S]*?END:VEVENT/)[0];
    assert.doesNotMatch(secondRound, /Inter - Juventus/);
    assert.match(unfoldedCalendar, /SUMMARY:Serie A: Juventus - Frosinone/);

    const fallbackResponse = await onRequest({
      request: new Request("https://ilcalciodivince.com/api/juventus/calendar.ics"),
      env: {},
    });
    const fallbackCalendar = (await fallbackResponse.text()).replace(/\r\n /g, "");
    assert.equal(fallbackResponse.status, 200);
    assert.equal((fallbackCalendar.match(/BEGIN:VEVENT/g) || []).length, 38);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("i collegamenti intelligenti uniscono giocatori, news, mercato e Community", async () => {
  const [page, market, community, home, redirects] = await Promise.all([
    read("giocatore.html"),
    read("mercato.html"),
    read("community.html"),
    read("index.html"),
    read("_redirects"),
  ]);
  for (const marker of ["ICV Player Hub", "Ultime notizie", "Mercato Board", "Discussioni"]) {
    assert.ok(page.includes(marker), `manca ${marker}`);
  }
  assert.ok(market.includes("/giocatore?slug="));
  assert.ok(community.includes("loadPlayerEntities"));
  assert.ok(community.includes("player-mention"));
  assert.ok(home.includes("related_players"));
  assert.ok(!redirects.includes("/giocatori/*"));

  const { playerEntitySlug, playerEntityMatches, buildPlayerIndex } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  assert.equal(playerEntitySlug("Dušan Vlahović"), "dusan-vlahovic");
  const index = buildPlayerIndex([{ player_name: "Kolo Muani", updated_at: "2026-07-20T12:00:00Z" }], [
    { title: "La Juventus torna su Randal Kolo Muani", body: "" },
  ]);
  assert.equal(index[0].news_count, 1);
  assert.equal(playerEntityMatches("Discussione su Muani", index[0]), true);
});

test("Mercato Radar seleziona e divide le trattative raccolte", async () => {
  const [page, api] = await Promise.all([
    read("mercato.html"),
    read("functions/api/[[path]].js"),
  ]);
  for (const marker of ["Mercato Radar", "Operazioni chiuse", "Radar acquisti", "Radar cessioni", "marketSectionHtml", "deal-card", "Fase avanzata"]) {
    assert.ok(page.includes(marker), `manca ${marker}`);
  }
  assert.ok(!page.includes("Selezione automatica controllata"));
  assert.ok(!page.includes("Mostriamo solo operazioni recenti"));
  for (const marker of ["marketDealMetadata", "deal_stage", "confidence", "marketStageRank"]) {
    assert.ok(api.includes(marker), `manca ${marker}`);
  }

  const { marketDealMetadata } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  assert.deepEqual(marketDealMetadata({
    player_name: "Vicario",
    note: "Juventus, per la porta risalgono le quotazioni di Vicario",
    reliability: "trusted",
    source_name: "Gianluca Di Marzio",
  }), { direction: "incoming", deal_stage: "interest", confidence: "medium", source_count: 1 });
  assert.equal(marketDealMetadata({
    player_name: "Muharemovic",
    note: "Muharemovic va al Leeds e porta una plusvalenza",
    reliability: "trusted",
    source_name: "La Gazzetta dello Sport",
  }).direction, "outgoing");
  assert.equal(marketDealMetadata({
    player_name: "Openda",
    note: "Juventus, Loïs Openda verso il Lione: da definire gli ultimi dettagli economici",
    reliability: "trusted",
    source_name: "Google News mercato",
  }).direction, "outgoing");
  assert.equal(marketDealMetadata({
    player_name: "Joao Mario",
    note: "Di Marzio: Joao Mario, offerta presentata alla Juve. Ecco quando si chiude",
    reliability: "trusted",
    source_name: "Di Marzio Juventus",
  }).direction, "outgoing");
  assert.equal(marketDealMetadata({
    player_name: "Kolo Muani",
    note: "La Juventus presenta una nuova offerta al PSG per Kolo Muani",
    reliability: "trusted",
    source_name: "Sky Sport",
  }).direction, "incoming");
  assert.equal(marketDealMetadata({
    player_name: "Kolo Muani",
    note: "Tre possibili alternative a Kolo Muani",
    reliability: "trusted",
    source_name: "Sky Sport, Gianluca Di Marzio",
  }).direction, "scenario");

  const { marketTopicName, isIgnoredMarketSignal } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  assert.equal(marketTopicName({
    player_name: "Fiorentina",
    note: "La Fiorentina insiste per Joao Mario: ecco quanto chiede la Juventus",
  }), "Joao Mario");
  assert.equal(marketTopicName({
    player_name: "Romano",
    note: "Romano: Per Alajbegovic si è mosso il Chelsea, ma Napoli e Juve hanno telefonato",
  }), "Alajbegovic");
  assert.equal(isIgnoredMarketSignal({ player_name: "Pagina", note: "Pagina 1 articolo" }), true);
  assert.equal(isIgnoredMarketSignal({ player_name: "Punto mercato", note: "Riepilogo generico" }), true);
  for (const row of [
    { player_name: "L'ultima", note: "L'ultima gara ufficiale fra Juventus e Palermo", reliability: "official" },
    { player_name: "Domenica", note: "Di Marzio: Domenica le visite mediche di Lucumi con la Juventus" },
    { player_name: "Nodo", note: "Nodo Di Gregorio, oltre i sondaggi il nulla" },
    { player_name: "Colpo Juve", note: "Colpo Juve, preso Lucumi dal Bologna" },
    { player_name: "Real Madrid", note: "La Juve cerca un portiere: spunta un nome dal Real Madrid" },
  ]) assert.notEqual(marketTopicName(row), row.player_name);
});

test("la Community espone le funzioni finali di lancio", async () => {
  const html = await read("community.html");
  for (const marker of [
    "openNotification(",
    "handleMentionInput",
    "deleteAccountForm",
    "/regolamento-community",
    "/privacy",
    "prefers-reduced-motion",
    "aria-live=\"polite\"",
  ]) assert.ok(html.includes(marker), `manca ${marker}`);
});

test("la Community espone discovery, sondaggi e conversazioni evolute", async () => {
  const html = await read("community.html");
  for (const marker of [
    'data-category="following"',
    "togglePollEditor",
    "toggleRepost",
    "startQuote",
    "openTopic",
    "function timeUntil",
    "openPostPermalink",
    "openCommunitySettings",
    "Nota ICV",
  ]) assert.ok(html.includes(marker), `manca ${marker}`);
});

test("l'API supporta feed seguiti, sondaggi, repost e preferenze", async () => {
  const api = await read("functions/api/[[path]].js");
  for (const marker of [
    'scope === "following"',
    "normalizeCommunityPoll",
    "communityPollSummary",
    'route === "preferences"',
    'route === "muted-words"',
    "/community_reposts",
    "/community_context_notes",
    "newsNotes",
  ]) assert.ok(api.includes(marker), `manca ${marker}`);
});

test("la migrazione social crea tabelle e colonne necessarie", async () => {
  const sql = await read("supabase/migrations/20260713170000_community_social_features.sql");
  for (const marker of [
    "quote_post_id",
    "community_poll_votes",
    "community_reposts",
    "community_notification_preferences",
    "community_muted_words",
    "community_context_notes",
  ]) assert.ok(sql.includes(marker), `manca ${marker}`);
});

test("l'API protegge cancellazione account e deep link", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /route === "me" && method === "DELETE"/);
  assert.match(api, /confirmation \|\| ""\)\.toUpperCase\(\) !== "ELIMINA"/);
  assert.match(api, /\/auth\/v1\/admin\/users\//);
  assert.match(api, /async function communitySinglePost/);
  assert.match(api, /async function communitySingleNews/);
  assert.match(api, /COMMUNITY_BLOCKED_LANGUAGE/);
});

test("il feed Community espone gli errori principali e conferma le pubblicazioni", async () => {
  const [api, html] = await Promise.all([
    read("functions/api/[[path]].js"),
    read("community.html"),
  ]);
  assert.match(api, /let posts = await sb\(env, "\/community_posts\?status=eq\.published"/);
  assert.match(api, /const rows = await sb\(env, "\/community_posts\?id=eq\." \+ encodeURIComponent\(postId\)/);
  assert.doesNotMatch(api, /let posts = await safeAdminRead\([\s\S]{0,160}community_posts\?status=eq\.published/);
  assert.match(html, /Post pubblicato\. Ricarica la pagina per vederlo nel feed\./);
  assert.match(html, /onclick='loadFeed\(\)'>Riprova/);
  assert.match(html, /raw=await response\.text\(\)/);
});

test("privacy, regolamento e sitemap sono pubblicabili", async () => {
  const [privacy, cookies, rules, sitemap, redirects] = await Promise.all([
    read("privacy.html"), read("cookie-policy.html"), read("regolamento-community.html"), read("sitemap.xml"), read("_redirects"),
  ]);
  assert.match(privacy, /cancellare definitivamente account e dati/i);
  assert.match(privacy, /Supabase/);
  assert.match(cookies, /Analytics anonimo ICV/);
  assert.match(cookies, /data-privacy-settings/);
  assert.match(rules, /Moderazione/);
  assert.match(sitemap, /<loc>https:\/\/ilcalciodivince\.com\/privacy<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/ilcalciodivince\.com\/cookie-policy<\/loc>/);
  assert.match(redirects, /\/cookie-policy\.html \/cookie-policy 301/);
  assert.match(redirects, /\/regolamento-community\.html \/regolamento-community 301/);
});

test("la cancellazione rimuove file Storage e utente Auth", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /communityStoragePath/);
  assert.match(api, /storage\/v1\/object\/" \+ COMMUNITY_BUCKET/);
  assert.match(api, /prefixes: \[\.\.\.new Set\(storagePaths\)\]/);
});

test("le librerie Community sono locali e non bloccano il parsing", async () => {
  const html = await read("community.html");
  assert.match(html, /<script defer src="\/assets\/supabase\.min\.js/);
  assert.match(html, /<script defer src="\/assets\/lucide\.min\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg\.com/);
  assert.match(html, /window\.addEventListener\("DOMContentLoaded",init\)/);
});

test("l'autenticazione torna sempre alla Community pubblica", async () => {
  const html = await read("community.html");
  assert.match(html, /function authRedirectUrl\(\)/);
  assert.match(html, /https:\/\/ilcalciodivince\.com\/community/);
  assert.match(html, /emailRedirectTo:authRedirectUrl\(\)/);
  assert.match(html, /redirectTo:authRedirectUrl\(\)/);
  assert.doesNotMatch(html, /redirectTo:location\.origin\+"\/community"/);
});

test("la Community completa feed, profili, notifiche e Match Room", async () => {
  const [html, api, admin, migration, redirects] = await Promise.all([
    read("community.html"),
    read("functions/api/[[path]].js"),
    read("icv_admin.html"),
    read("supabase/migrations/20260713210000_community_completion.sql"),
    read("_redirects"),
  ]);
  for (const marker of ["feedPostHtml", "renderProfileTab", "loadNotifications", "openPostDetail", "openMatchRoom"]) assert.ok(html.includes(marker), `manca ${marker}`);
  for (const marker of ["reposted_by", "assertCommunityUniqueContent", 'route === "match-room"', "notificationReadMatch"]) assert.ok(api.includes(marker), `manca ${marker}`);
  assert.match(admin, /Pubblica Nota ICV/);
  assert.match(migration, /community_match_messages/);
  assert.match(redirects, /\/community\/post\/\* \/community 200/);
});

test("il feed Community non dipende dalla relazione self-reference dei post citati", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /function communityPostSelect\(\)/);
  assert.match(api, /async function attachQuotedCommunityPosts\(env, posts\)/);
  assert.doesNotMatch(api, /quoted_post:community_posts!community_posts_quote_post_id_fkey/);
});

test("Turnstile protegge tutti i flussi pubblici di scrittura", async () => {
  const [community, quiz, agenda, helper] = await Promise.all([
    read("community.html"), read("quiz.html"), read("agenda.html"), read("assets/turnstile.js"),
  ]);
  for (const action of ["community_post", "community_comment", "match_room", "community_report"]) {
    assert.ok(community.includes(`ICVTurnstile.verify("${action}")`), `manca ${action}`);
  }
  assert.match(quiz, /ICVTurnstile\.verify\("quiz_result"\)/);
  assert.match(agenda, /ICVTurnstile\.verify\('newsletter_subscribe'\)/);
  assert.match(helper, /data-action="turnstile-spin-v1"/);
  assert.match(helper, /result\.success !== true/);
});


test("i segnalibri includono post e notizie ufficiali", async () => {
  const [html, api, migration] = await Promise.all([
    read("community.html"),
    read("functions/api/[[path]].js"),
    read("supabase/migrations/20260714190000_community_news_bookmarks.sql"),
  ]);
  assert.match(html, /aria-label='Salva notizia'/);
  assert.match(html, /openSavedNews/);
  assert.match(api, /newsSaveMatch/);
  assert.match(api, /news:news!community_saves_news_id_fkey/);
  assert.match(migration, /community_saves_news_user_unique/);
});

test("ICV Analytics raccoglie dati anonimi e li mostra nell'admin", async () => {
  const [tracker, api, admin, migration] = await Promise.all([
    read("assets/analytics.js"),
    read("functions/api/[[path]].js"),
    read("icv_admin.html"),
    read("supabase/migrations/20260715150000_icv_analytics.sql"),
  ]);
  assert.match(tracker, /sessionStorage/);
  assert.match(tracker, /icv_privacy_preferences/);
  assert.match(tracker, /isAnalyticsEnabled/);
  assert.match(tracker, /navigator\.doNotTrack/);
  assert.match(tracker, /icv_internal_traffic/);
  assert.match(tracker, /isInternalTraffic\(\)/);
  assert.match(admin, /markInternalTraffic/);
  assert.match(api, /path === "analytics"/);
  assert.match(api, /path === "admin\/analytics"/);
  assert.match(api, /analyticsSummary/);
  assert.match(admin, /ICV Analytics/);
  assert.match(admin, /loadAnalytics/);
  assert.match(migration, /create table if not exists public\.analytics_events/);
  assert.match(migration, /enable row level security/);
});

test("le notifiche sono paginate e i rate limit spiegano quando riprovare", async () => {
  const [html, api] = await Promise.all([
    read("community.html"),
    read("functions/api/[[path]].js"),
  ]);
  for (const marker of ["notificationCursor", "loadMoreNotifications", "maybeLoadMoreNotifications", "notificationGroupLabel", "notificationBadgeMobile"]) {
    assert.ok(html.includes(marker), `manca ${marker}`);
  }
  assert.match(api, /url\.searchParams\.get\("before"\)/);
  assert.match(api, /next_cursor/);
  assert.match(api, /retry_after_seconds/);
  assert.match(api, /"Retry-After"/);
  assert.match(api, /code: "RATE_LIMIT"/);
  assert.match(html, /registerRateLimit/);
  assert.match(html, /rateLimitNotice/);
});

test("le notizie ufficiali Juventus usano anche una fonte diretta", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /name: "Juventus\.com diretto"/);
  assert.match(api, /url: "https:\/\/www\.juventus\.com\/it\/"/);
  assert.match(api, /isJuventusOfficialHomepage/);
  assert.match(api, /parseJuventusOfficialPage/);
  assert.match(api, /normalizeJuventusArticleUrl/);
  assert.match(api, /shouldAutoPublishCandidate/);

  const { parseJuventusOfficialPage } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const fixture = `<script type="application/ld&#x2B;json">{"@type":"ItemList","itemListElement":[{"url":"https://www.juventus.com/it/it/news/articoli/amichevole-basilea-juventus","name":"Basilea-Juventus | Le scelte degli allenatori"},{"url":"https://www.juventus.com/it/it/biglietti/partita","name":"Biglietti"}]}</script>`;
  assert.deepEqual(parseJuventusOfficialPage(fixture), [{
    title: "Basilea-Juventus | Le scelte degli allenatori",
    link: "https://www.juventus.com/it/news/articoli/amichevole-basilea-juventus",
    description: "Basilea-Juventus | Le scelte degli allenatori",
    pubDate: "",
    source: "Juventus.com",
  }]);
});

test("gli aggiornamenti news ripiegano sulle priorita compatibili", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /async function patchNewsRow/);
  assert.match(api, /compatNewsUpdatePayload\(patch\)/);
  assert.match(api, /compatible\.urgency === "breaking" \|\| compatible\.urgency === "rumor"/);
});

test("la sezione News viene popolata anche aprendo direttamente il deep link", async () => {
  const html = await read("index.html");
  assert.match(html, /fetch\("\/api\/public\/news\?limit=10"\)/);
  assert.match(html, /loadHomeGraphics\(\);\s*loadAndRenderNews\(\);/);
  assert.match(html, /grid\.dataset\.loading === "true"/);
});

test("il Live Desk unifica automaticamente news, mercato e Match Center", async () => {
  const [home, admin, api] = await Promise.all([
    read("index.html"), read("icv_admin.html"), read("functions/api/[[path]].js"),
  ]);
  assert.match(home, /id="homeLiveDesk"/);
  assert.match(home, /function renderLiveDesk/);
  assert.match(admin, /data-tab="live"/);
  assert.match(admin, /function renderLiveDesk/);
  assert.match(api, /live_desk: buildLiveDeskEntries/);

  const { buildLiveDeskEntries } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const now = new Date().toISOString();
  const rows = buildLiveDeskEntries({
    news: [{ id: 1, title: "Ufficiale | Nuovo giocatore della Juventus", source: "Juventus.com", reliability: "official", visible: true, created_at: now }],
    market: [{ id: 2, player_name: "Mario Rossi", note: "Contatti avviati per Mario Rossi", source_name: "Sky Sport", reliability: "trusted", updated_at: now }],
    matches: [{ id: 3, title: "Basilea-Juventus 0-0", status: "finished", summary: "Finale", competition: "Amichevole", updated_at: now }],
  });
  assert.deepEqual(rows.map(row => row.kind).sort(), ["market", "match", "official"]);
  assert.equal(rows.find(row => row.kind === "official").label, "Ufficiale");

  const officialNames = ["Celik", "Rossi", "Bianchi", "Verdi", "Neri"];
  const marketNames = ["Obiettivo Alfa", "Obiettivo Beta"];
  const matchNames = ["Basilea", "Liegi", "Nizza"];
  const balancedRows = buildLiveDeskEntries({
    news: officialNames.map((name, index) => ({
      id: `official-${index}`,
      title: `Ufficiale | ${name} firma con la Juventus`,
      source: "Juventus.com",
      reliability: "official",
      visible: true,
      created_at: new Date(Date.now() - index * 1000).toISOString(),
    })),
    market: marketNames.map((name, index) => ({
      id: `market-${index}`,
      player_name: name,
      note: `Contatti avviati per ${name}`,
      source_name: "Sky Sport",
      reliability: "trusted",
      updated_at: new Date(Date.now() - (index + 10) * 1000).toISOString(),
    })),
    matches: matchNames.map((name, index) => ({
      id: `match-${index}`,
      title: `Juventus-${name}`,
      status: "finished",
      summary: "Finale",
      competition: "Amichevole",
      updated_at: new Date(Date.now() - (index + 5) * 1000).toISOString(),
    })),
  }, 6);
  const kindCounts = balancedRows.reduce((counts, row) => ({
    ...counts,
    [row.kind]: (counts[row.kind] || 0) + 1,
  }), {});
  assert.equal(balancedRows.length, 6);
  assert.ok(kindCounts.official <= 2);
  assert.ok(kindCounts.match <= 2);
  assert.ok(kindCounts.market >= 1);
});

test("Fetch News mostra cosa ha trovato e usa una fonte Juventus aggiornata", async () => {
  const [admin, api] = await Promise.all([
    read("icv_admin.html"),
    read("functions/api/[[path]].js"),
  ]);
  assert.match(api, /name: "JuventusNews24"/);
  assert.match(api, /url: "https:\/\/www\.juventusnews24\.com\/feed\/"/);
  assert.match(api, /reliability: "aggregator"/);
  assert.match(api, /discoveries/);
  assert.match(api, /addFetchDiscovery/);
  assert.match(admin, /id="fetchResults"/);
  assert.match(admin, /function renderFetchResults/);
  assert.match(admin, /Gia pubblicata/);
  assert.match(admin, /state\.latestFetch = res/);
});

test("le fonti Google News recuperano dai 503 con retry e fallback RSS", async () => {
  const { fetchSourceItems, fetchHeadersForUrl, googleNewsFallbackUrl } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const googleUrl = "https://news.google.com/rss/search?q=Juventus%20calciomercato&hl=it&gl=IT&ceid=IT:it";
  const fallbackUrl = googleNewsFallbackUrl(googleUrl);
  assert.match(fallbackUrl, /^https:\/\/www\.bing\.com\/news\/search\?/);
  assert.equal(new URL(fallbackUrl).searchParams.get("q"), "Juventus calciomercato");
  assert.equal(new URL(fallbackUrl).searchParams.get("format"), "rss");
  assert.match(fetchHeadersForUrl(googleUrl).Accept, /application\/rss\+xml/);

  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    if (String(url).startsWith("https://news.google.com/")) return new Response("", { status: 503 });
    return new Response(`<?xml version="1.0"?><rss><channel><item><title>Juventus, nuova offerta per il mercato</title><link>https://example.com/news</link><description>Ultime sul calciomercato Juventus</description></item></channel></rss>`, { status: 200 });
  };
  try {
    const items = await fetchSourceItems({ name: "Google News mercato", url: googleUrl, category: "calciomercato" });
    assert.equal(requested.filter(url => url.startsWith("https://news.google.com/")).length, 3);
    assert.ok(requested.some(url => url.startsWith("https://www.bing.com/news/search")));
    assert.equal(items[0].title, "Juventus, nuova offerta per il mercato");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la sezione Mondiali conclusa non compare piu nel sito pubblico", async () => {
  const [home, mercato, grafiche, quiz, sitemap, redirects, worker] = await Promise.all([
    read("index.html"),
    read("mercato.html"),
    read("grafiche.html"),
    read("quiz.html"),
    read("sitemap.xml"),
    read("_redirects"),
    read("sw.js"),
  ]);
  for (const page of [home, mercato, grafiche, quiz]) {
    assert.doesNotMatch(page, /href=["']\/mondiali|location\.href=["']\/mondiali/);
  }
  assert.doesNotMatch(sitemap, /\/mondiali|\/agenda/);
  assert.match(redirects, /^\/mondiali \/ 301$/m);
  assert.match(redirects, /^\/agenda \/ 301$/m);
  assert.doesNotMatch(worker, /mondiali\.html|mondiali\.js|agenda\.html/);
});

test("la rifinitura segmenta notifiche, spiega le fonti e monitora le automazioni", async () => {
  const [community, admin, api] = await Promise.all([
    read("community.html"),
    read("icv_admin.html"),
    read("functions/api/[[path]].js"),
  ]);
  for (const marker of ["Interazioni", "Aggiornamenti ICV", "icv_notification_filter", "notificationTypeMeta"]) {
    assert.ok(community.includes(marker), `manca ${marker}`);
  }
  for (const marker of ["Salute Automazioni", "reliability-guide", "updateContentFilters", "renderAutomationMonitor"]) {
    assert.ok(admin.includes(marker), `manca ${marker}`);
  }
  assert.match(api, /type=in\.\(comment,reply,like,repost,quote,follow\)/);
  assert.match(api, /automation_monitor: buildAutomationMonitor/);

  const { buildAutomationMonitor } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const monitor = buildAutomationMonitor([
    { id: 1, type: "news", status: "ok", created_at: "2026-07-20T11:00:00Z", payload: { sources_report: [{ source: "Juventus.com", scanned: 5, relevant: 3, warning: "Risposta lenta" }] } },
    { id: 2, type: "market", status: "error", created_at: "2026-07-20T10:30:00Z", payload: { ok: false, error: "Fonte non disponibile" } },
    { id: 3, type: "home_autopilot", status: "ok", created_at: "2026-07-20T02:00:00Z", payload: { ok: true } },
  ], { now: "2026-07-20T12:00:00Z", cadences: { home_autopilot: 2 } });
  assert.equal(monitor.jobs.find(job => job.key === "news").status, "degraded");
  assert.equal(monitor.jobs.find(job => job.key === "market").status, "error");
  assert.equal(monitor.jobs.find(job => job.key === "home_autopilot").status, "delayed");
  assert.equal(monitor.sources[0].status, "degraded");
});

test("l'import Instagram spiega gli errori Meta e registra i fallimenti", async () => {
  const [admin, api] = await Promise.all([
    read("icv_admin.html"),
    read("functions/api/[[path]].js"),
  ]);
  const { instagramFailureDetails } = await import(new URL("../functions/api/[[path]].js", import.meta.url));

  const expired = instagramFailureDetails(400, {
    error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190, error_subcode: 463 },
  });
  assert.equal(expired.details.action, "refresh_token");
  assert.match(expired.message, /Token Instagram scaduto o revocato/);
  assert.equal(expired.details.provider_code, 190);
  assert.doesNotMatch(expired.message, /EA[A-Za-z0-9]+/);

  const rateLimited = instagramFailureDetails(429, { error: { message: "Application request limit reached", code: 4 } });
  assert.equal(rateLimited.details.action, "retry_later");
  assert.match(rateLimited.message, /temporaneamente limitato/);

  assert.match(api, /logRun\(env, "instagram_import", automationFailure/);
  assert.match(api, /social_drafts\?platform=eq\.instagram&visible=eq\.true&post_url=not\.is\.null&order=published_at\.desc\.nullslast,created_at\.desc&limit=12/);
  assert.match(admin, /Token Instagram scaduto o revocato/);
  assert.match(admin, /contenuti controllati/);
});

test("il router traduce gli errori asincroni delle automazioni in risposte JSON", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /path === "admin\/automate"\) return await adminAutomate\(request, env\)/);
});

test("Mercato Board distingue entrate e uscite senza inventare giocatori dai titoli rassegna", async () => {
  const {
    isMarketRelevantNewsRow,
    marketDealMetadata,
    marketTopicName,
  } = await import(new URL("../functions/api/[[path]].js", import.meta.url));

  assert.equal(marketDealMetadata({
    player_name: "Openda",
    note: "Openda saluta la Juventus, ufficiale al Lione: i dettagli",
    reliability: "trusted",
  }).direction, "outgoing");
  assert.equal(marketDealMetadata({
    player_name: "Gatti",
    note: "Il Napoli avanza per Gatti, si lavora ad un prestito",
    reliability: "trusted",
  }).direction, "outgoing");
  assert.equal(marketDealMetadata({
    player_name: "Joao Mario",
    note: "Juventus, Joao Mario ai saluti: accordo con la Fiorentina",
    reliability: "trusted",
  }).deal_stage, "advanced");

  assert.equal(marketTopicName({
    player_name: "Lindstrom",
    note: "Lindstrom resta a Napoli, Juve c'e Vicario. Roma su Read",
  }), "Vicario");
  assert.equal(isMarketRelevantNewsRow({
    title: "Lindstrom resta a Napoli",
    source: "Napoli News",
  }), false);
});

test("Mercato Board conserva le ufficialita Juventus anche davanti a rumor piu recenti", async () => {
  const { aggregateMarketItems, publicMarketFromNews } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const now = Date.now();
  const hoursAgo = hours => new Date(now - hours * 3600000).toISOString();
  const officialRows = publicMarketFromNews([
    {
      title: "Ufficiale | Kolo Muani e un nuovo giocatore della Juventus",
      source: "Juventus.com",
      source_url: "https://www.juventus.com/it/news/articoli/ufficiale-kolo-muani",
      reliability: "official",
      editorial_status: "Ufficiale",
      created_at: hoursAgo(2),
    },
    {
      title: "Ufficiale | Alajbegovic e un nuovo giocatore della Juventus",
      source: "Juventus.com",
      source_url: "https://www.juventus.com/it/news/articoli/ufficiale-alajbegovic",
      reliability: "official",
      editorial_status: "Ufficiale",
      created_at: hoursAgo(3),
    },
  ]);
  const rows = aggregateMarketItems([
    ...officialRows,
    {
      player_name: "Kolo Muani",
      note: "La Juventus valuta ancora il ritorno di Kolo Muani",
      source_name: "Google News mercato",
      reliability: "aggregator",
      status: "Da verificare",
      updated_at: hoursAgo(1),
    },
  ]);

  const kolo = rows.find(row => row.player_name === "Kolo Muani");
  const alajbegovic = rows.find(row => row.player_name === "Alajbegovic");
  assert.equal(kolo.deal_stage, "official");
  assert.equal(kolo.reliability, "official");
  assert.match(kolo.note, /Ufficiale/);
  assert.equal(alajbegovic.deal_stage, "official");
});

test("Mercato Board scarta interviste e smentite e normalizza le ufficialita", async () => {
  const {
    aggregateMarketItems,
    isMarketRelevantNewsRow,
    marketDealMetadata,
    marketTopicName,
  } = await import(new URL("../functions/api/[[path]].js", import.meta.url));

  assert.equal(isMarketRelevantNewsRow({
    title: 'Juventus-Nizza, Spalletti: "Mi e piaciuto tutto. Mercato? I direttori sono perfetti"',
    source: "Sky Sport Juventus",
  }), false);
  assert.equal(isMarketRelevantNewsRow({
    title: "Juve: Carnevali, 'Vlahovic? Mai incontrato, non rincorro nessuno'",
    source: "Google News mercato",
  }), false);
  assert.equal(marketTopicName({
    player_name: "Ufficiale",
    note: "Ufficiale | Kerim Alajbegović e un nuovo giocatore della Juventus",
  }), "Alajbegovic");
  assert.equal(marketTopicName({
    player_name: "Ufficiale",
    note: "Next Gen | Lorenzo Villa ceduto a titolo definitivo al Sion",
  }), "Lorenzo Villa");
  assert.equal(marketDealMetadata({
    player_name: "Adzic",
    note: "Sassuolo-Adzic, c'e l'accordo: mancano solo le firme",
    reliability: "trusted",
  }).direction, "outgoing");

  const alajbegovicRows = aggregateMarketItems([
    {
      player_name: "Ufficiale",
      note: "Ufficiale | Kerim Alajbegović e un nuovo giocatore della Juventus",
      reliability: "official",
      status: "Ufficiale",
      source_name: "Juventus.com",
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      player_name: "Alajbegovic",
      note: "Chi e Kerim Alajbegovic, il 18enne preso dalla Juve",
      reliability: "aggregator",
      source_name: "Google News mercato",
      updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
  ]);
  assert.equal(alajbegovicRows.length, 1);
  assert.equal(alajbegovicRows[0].player_name, "Alajbegovic");
  assert.equal(alajbegovicRows[0].deal_stage, "official");
});

test("Mercato Radar riconosce il calciatore reale e rimuove le schede generiche", async () => {
  const { aggregateMarketItems } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const updatedAt = new Date().toISOString();
  const rows = aggregateMarketItems([
    {
      player_name: "Next Gen",
      note: "Next Gen | Tommaso Mancini rinnova fino al 2029 e passa in prestito al Livorno",
      reliability: "official",
      status: "Ufficiale",
      source_name: "Juventus.com",
      updated_at: updatedAt,
    },
    {
      player_name: "Domenica",
      note: "Di Marzio: Domenica le visite mediche di Lucumi con la Juventus",
      reliability: "trusted",
      status: "Confermato",
      source_name: "Di Marzio Juventus",
      updated_at: updatedAt,
    },
    {
      player_name: "Nodo",
      note: "Nodo Di Gregorio, oltre i sondaggi il nulla: la Juve non riceve nessuna offerta",
      reliability: "trusted",
      status: "Confermato",
      source_name: "Tuttosport",
      updated_at: updatedAt,
    },
    {
      player_name: "L'ultima",
      note: "L'ultima gara ufficiale fra Juventus e Palermo",
      reliability: "official",
      status: "Ufficiale",
      source_name: "Juventus.com",
      updated_at: updatedAt,
    },
    {
      player_name: "Real Madrid",
      note: "La Juve cerca un portiere: spunta un nome dal Real Madrid",
      reliability: "trusted",
      status: "Confermato",
      source_name: "Sportmediaset",
      updated_at: updatedAt,
    },
    {
      player_name: "Del Piero",
      note: "Del Piero, la figlia Dorotea lascia la Juve: andra in prestito",
      reliability: "aggregator",
      status: "Da verificare",
      source_name: "Google News mercato",
      updated_at: updatedAt,
    },
  ]);

  assert.deepEqual(rows.map(row => row.player_name).sort(), ["Di Gregorio", "Lucumi", "Tommaso Mancini"]);
  assert.equal(rows.find(row => row.player_name === "Tommaso Mancini").direction, "outgoing");
  assert.equal(rows.find(row => row.player_name === "Tommaso Mancini").deal_stage, "official");
  assert.equal(rows.find(row => row.player_name === "Di Gregorio").direction, "outgoing");
});

test("le bozze duplicate sono ignorate atomicamente senza degradare Mercato", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /news_drafts\?on_conflict=content_hash/);
  assert.match(api, /resolution=ignore-duplicates,return=representation/);
  assert.match(api, /isSupabaseUniqueViolation\(err\)/);
  assert.match(api, /23505\|duplicate key value violates unique constraint/);
});

test("la raccolta scarta rassegne miste, pagine interne e articoli vecchi", async () => {
  const { newsItemRejectionReason } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const now = Date.parse("2026-08-11T13:00:00Z");
  const marketSource = { name: "Google News mercato", category: "calciomercato", reliability: "aggregator" };

  assert.equal(newsItemRejectionReason(
    { pubDate: "2026-08-11T12:30:00Z" },
    "Le notizie di calciomercato del 6 agosto: Milan, Juve, Roma e Napoli",
    "Tutte le trattative di Serie A",
    marketSource,
    marketSource.name,
    now
  ), "noise");
  assert.equal(newsItemRejectionReason(
    { pubDate: "2026-08-11T12:30:00Z" },
    "Pagina 3 | Calciomercato Juve: Suzuki, Lucumi e Zirkzee",
    "Le ultime operazioni bianconere",
    marketSource,
    marketSource.name,
    now
  ), "noise");
  assert.equal(newsItemRejectionReason(
    { pubDate: "2026-08-06T12:30:00Z" },
    "Juve vicina a Zirkzee",
    "La Juventus lavora all'attaccante",
    marketSource,
    marketSource.name,
    now
  ), "stale");
  assert.equal(newsItemRejectionReason(
    { pubDate: "2026-08-11T12:30:00Z" },
    "Juventus-Palermo 2-0: Yildiz e Milik decidono l'amichevole",
    "La squadra bianconera vince a Perth",
    marketSource,
    marketSource.name,
    now
  ), "");
});

test("la pulizia della coda conserva la bozza migliore e scarta i doppioni", async () => {
  const { planNewsDraftCleanup } = await import(new URL("../functions/api/[[path]].js", import.meta.url));
  const now = Date.parse("2026-08-11T13:00:00Z");
  const base = {
    title: "Amichevole Juventus-Palermo 2-0: Yildiz prima e Milik poi",
    body: "La Juventus batte il Palermo con i gol di Yildiz e Milik.",
    category: "juventus",
    source_url: "https://example.com/juventus-palermo",
    raw_payload: { pubDate: "2026-08-11T12:30:00Z" },
    created_at: "2026-08-11T12:45:00Z",
  };
  const result = planNewsDraftCleanup([
    { ...base, id: "trusted", source_name: "Sky Sport Juventus", reliability: "trusted", review_status: "ready" },
    { ...base, id: "copy", source_name: "Google News mercato", reliability: "aggregator", review_status: "needs_review" },
    { ...base, id: "published", source_name: "Google News mercato", reliability: "aggregator", review_status: "approved" },
  ], now);
  assert.deepEqual(result.ids, ["copy"]);
  assert.equal(result.reasons.duplicate, 1);
});

test("il login admin riceve errori JSON gestiti invece del Cloudflare 1101", async () => {
  const [admin, apiModule] = await Promise.all([
    read("icv_admin.html"),
    import(new URL("../functions/api/[[path]].js", import.meta.url)),
  ]);
  const response = await apiModule.onRequest({
    request: new Request("https://ilcalciodivince.com/api/admin/news"),
    env: { ADMIN_TOKEN: "segreto" },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Token admin non valido" });
  assert.match(admin, /normalizeAdminToken/);
  assert.match(admin, /API admin non disponibile/);
  assert.match(admin, /return r\.text\(\)/);
});
