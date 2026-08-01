import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("la home distingue risultati e prossime amichevoli", async () => {
  const html = await read("index.html");
  for (const marker of [
    "Risultati e prossime",
    "Basilea-Juventus",
    "Risultato zero a zero",
    "Standard Liegi-Juventus",
    "Risultato zero a uno per la Juventus",
    "Gol Miretti",
    "Juventus-Nizza",
    "Risultato due a zero per la Juventus",
    "Douglas Luiz 10'",
    "Oboavwoduo 89'",
    "Amichevoli agosto",
    "Juventus-Chelsea",
    "Hong Kong",
    "Juventus-Inter",
    "Juventus-Palermo",
    "Juventus-Next Gen",
    "Allianz Stadium",
  ]) assert.ok(html.includes(marker), `manca ${marker}`);
  assert.match(html, /friendly-item is-final[\s\S]*?FINALE[\s\S]*?0-0/);
  assert.match(html, /25 LUG[\s\S]*?FINALE[\s\S]*?Standard Liegi-Juventus[\s\S]*?Gol Miretti[\s\S]*?0-1/);
  assert.match(html, /31 LUG[\s\S]*?FINALE[\s\S]*?Juventus-Nizza[\s\S]*?Douglas Luiz 10'[\s\S]*?Oboavwoduo 89'[\s\S]*?2-0/);
  assert.match(html, /Amichevoli agosto[\s\S]*?5 AGO[\s\S]*?Juventus-Chelsea[\s\S]*?Hong Kong/);
  assert.match(html, /8 AGO[\s\S]*?Juventus-Inter[\s\S]*?Perth[\s\S]*?11 AGO[\s\S]*?Juventus-Palermo[\s\S]*?Perth/);
  assert.match(html, /17 AGO[\s\S]*?Juventus-Next Gen[\s\S]*?Allianz Stadium/);
});

test("News e Statistiche scorrono alla sezione richiesta", async () => {
  const html = await read("index.html");
  assert.match(html, /function scrollSectionIntoView\(section, behavior\)/);
  assert.match(html, /scrollSectionIntoView\(el, scrollBehavior \|\| "smooth"\)/);
  assert.match(html, /showSection\(id, button \|\| null, "auto"\)/);
  assert.match(html, /renderHomeLinks\("homeInstagramList"[\s\S]*?alignHashedSection\(\)/);
  assert.doesNotMatch(html, /function showSec\(id,btn\)\{[\s\S]*?window\.scrollTo\(\{top:0/);
});

test("gli script delle pagine principali hanno sintassi valida", async () => {
  for (const file of ["community.html", "icv_admin.html", "mercato.html", "giocatore.html", "calendario-juventus.html"]) {
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
  for (const marker of ["Apple Calendar", "Google Calendar", "/api/juventus/calendar.ics", "Risultati automatici", "season=2026"]) {
    assert.ok(page.includes(marker), `manca ${marker}`);
  }
  for (const marker of ['path === "juventus/calendar.ics"', "juventus-serie-a-", "Risultato finale:", "LAST-MODIFIED", "SEQUENCE:"]) {
    assert.ok(api.includes(marker), `manca ${marker}`);
  }
  assert.match(redirects, /^\/calendario-juventus\.html \/calendario-juventus 301$/m);
  assert.match(sitemap, /https:\/\/ilcalciodivince\.com\/calendario-juventus/);
  assert.match(worker, /\/calendario-juventus\.html/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ matches: [{
    id: 2601,
    utcDate: "2026-08-23T16:30:00Z",
    lastUpdated: "2026-08-24T08:00:00Z",
    status: "FINISHED",
    matchday: 1,
    homeTeam: { name: "Frosinone Calcio" },
    awayTeam: { name: "Juventus FC" },
    score: { fullTime: { home: 0, away: 2 } },
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });
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
    assert.match(unfoldedCalendar, /UID:juventus-serie-a-2601@ilcalciodivince\.com/);
    assert.match(unfoldedCalendar, /SUMMARY:Juventus: Frosinone Calcio 0-2 Juventus FC/);
    assert.match(unfoldedCalendar, /Risultato finale: Frosinone Calcio 0-2 Juventus FC/);
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

test("Mercato Board classifica e filtra le trattative raccolte", async () => {
  const [page, api] = await Promise.all([
    read("mercato.html"),
    read("functions/api/[[path]].js"),
  ]);
  for (const marker of ["Mercato Board", "boardFilters", "setDirection", "deal-card", "Fase avanzata"]) {
    assert.ok(page.includes(marker), `manca ${marker}`);
  }
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
  assert.match(admin, /Token Instagram scaduto o revocato/);
  assert.match(admin, /contenuti controllati/);
});

test("il router traduce gli errori asincroni delle automazioni in risposte JSON", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /path === "admin\/automate"\) return await adminAutomate\(request, env\)/);
});
