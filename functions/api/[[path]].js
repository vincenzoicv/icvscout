const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-ICV-Admin-Token, X-ICV-Cron-Token",
};

const DEFAULT_SOURCES = [
  {
    name: "Juventus ufficiale",
    url: "https://news.google.com/rss/search?q=site%3Ajuventus.com%2Fit%2Fnews%20Juventus&hl=it&gl=IT&ceid=IT:it",
    category: "juventus",
    reliability: "official",
  },
  {
    name: "Sky Sport Juventus",
    url: "https://news.google.com/rss/search?q=Juventus%20Sky%20Sport&hl=it&gl=IT&ceid=IT:it",
    category: "juventus",
    reliability: "trusted",
  },
  {
    name: "Juventus ultime 3 giorni",
    url: "https://news.google.com/rss/search?q=Juventus%20when%3A3d&hl=it&gl=IT&ceid=IT:it",
    category: "juventus",
    reliability: "aggregator",
  },
  {
    name: "Di Marzio Juventus",
    url: "https://news.google.com/rss/search?q=Juventus%20Di%20Marzio&hl=it&gl=IT&ceid=IT:it",
    category: "calciomercato",
    reliability: "trusted",
  },
  {
    name: "Fabrizio Romano Juventus",
    url: "https://t.me/s/fabrizioromanotg",
    category: "calciomercato",
    reliability: "trusted",
  },
  {
    name: "Il Bianconero",
    url: "https://feeds.footballco.com/ilbianconero/feed/x2mb7fql9vce6t1p",
    category: "juventus",
    reliability: "trusted",
  },
  {
    name: "Google News mercato",
    url: "https://news.google.com/rss/search?q=Juventus%20calciomercato&hl=it&gl=IT&ceid=IT:it",
    category: "calciomercato",
    reliability: "aggregator",
  },
  {
    name: "Mercato Juve ultime 3 giorni",
    url: "https://news.google.com/rss/search?q=Juventus%20mercato%20when%3A3d&hl=it&gl=IT&ceid=IT:it",
    category: "calciomercato",
    reliability: "aggregator",
  },
];

const DEFAULT_YOUTUBE_CHANNELS = [
  { name: "Romeo Agresti", channel: "@RomeoAgresti" },
  { name: "Gianni Balzarini", channel: "@GianniBalzariniofficial" },
  { name: "Luca Toselli", channel: "@LucaToselli" },
];

const OFFICIAL_SOURCE_PATTERNS = [
  "juventus.com",
  "legaseriea.it",
  "uefa.com",
  "fifa.com",
];

const TRUSTED_SOURCE_PATTERNS = [
  "sky",
  "di marzio",
  "gianlucadimarzio",
  "romano",
  "fabrizio romano",
  "agresti",
  "romeo agresti",
  "gazzetta",
];

const AUTO_PUBLISH_TRUSTED_SOURCE_PATTERNS = [
  "fabrizio romano",
];

const BLOCKED_NEWS_TOPIC_PATTERNS = [
  /\bjuve\s+stabia\b/,
  /\bjuvestabia\b/,
];

const DEFAULT_RADAR = {
  kicker: "Centro di controllo",
  title: "Estate Juve",
  copy: "Quando non c'e una partita, la home deve diventare il punto dove si capisce cosa sta cambiando: chi arriva, chi parte, quali ruoli sono scoperti e quando riparte il calendario.",
  cards: [
    { title: "Mercato", text: "Trattative, fonti e affidabilita prima di pubblicare." },
    { title: "Calendario", text: "Amichevoli, ritiro e prime date ufficiali appena escono." },
    { title: "Rosa", text: "Ruoli scoperti, esuberi e giocatori da rilanciare." },
    { title: "Social", text: "Post e Reel ICV importati automaticamente da Instagram." },
  ],
  watch: [
    { title: "Nuovo ciclo", text: "Che idea tecnica sta nascendo per la stagione 2026/27." },
    { title: "Priorita rosa", text: "Difesa, centrocampo e attacco: cosa manca davvero." },
    { title: "Fonti pulite", text: "Ufficiali e affidabili sopra rumor e aggregatori." },
    { title: "Contenuti ICV", text: "Reel e post recenti pronti da rilanciare sul sito." },
  ],
};

const DEFAULT_GRAPHICS = [];
const GRAPHICS_BUCKET = "graphics";
const MAX_GRAPHIC_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_GRAPHIC_DATA_URL_LENGTH = 1100 * 1024;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");

  try {
    if (path === "public/home") return publicHome(env);
    if (path === "public/graphics") return publicGraphics(env);
    if (path === "public/news") return publicNews(env, url);
    if (path === "world-cup/overview") return worldCupOverview(request, env, context);
    if (path === "world-cup/live") return worldCupLive(request, env);
    if (path === "world-cup/calendar.ics") return worldCupCalendar(request, env);
    if (path === "subscribe") return subscribeWorldCup(request, env);
    if (path === "quiz-result") return sendQuizResult(request, env);
    if (path === "admin/news") return adminNews(request, env);
    if (path === "admin/automate") return adminAutomate(request, env);
    if (path === "cron/autopilot") return cronAutopilot(request, env);
    if (path.startsWith("football-data/")) return footballDataProxy(path, url, env);
    return apiSportsProxy(path, url, env);
  } catch (err) {
    return json({ error: err.message || "Errore API" }, 500);
  }
}

export async function onScheduled(context) {
  return runScheduledAutomations({
    env: context.env,
    cron: context.cron || "",
    scheduledTime: context.scheduledTime || Date.now(),
  });
}

export async function scheduled(controller, env, ctx) {
  const promise = runScheduledAutomations({
    env,
    cron: controller && controller.cron || "",
    scheduledTime: controller && controller.scheduledTime || Date.now(),
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
  return promise;
}

async function cronAutopilot(request, env) {
  const url = new URL(request.url);
  const expected = env.CRON_SECRET || env.ADMIN_TOKEN;
  const token = request.headers.get("X-ICV-Cron-Token") || url.searchParams.get("token") || "";
  if (!expected || token !== expected) return json({ error: "Token cron non valido" }, 401);

  const job = url.searchParams.get("job") || "all";
  return json(await runScheduledAutomations({ env, cron: "manual:" + job, scheduledTime: Date.now(), job }));
}

async function runScheduledAutomations({ env, cron = "", scheduledTime = Date.now(), job = "" }) {
  const tasks = [];
  const normalizedJob = cleanText(job || "").toLowerCase();
  const shouldRunYoutube = youtubeScoutEnabled(env) && (normalizedJob === "all" || normalizedJob === "youtube" || cron === "15 6 * * *");
  const shouldRunMarket = normalizedJob === "all" || normalizedJob === "market";
  const shouldRunHome = normalizedJob
    ? normalizedJob === "all" || normalizedJob === "home"
    : cron !== "15 6 * * *";

  if (shouldRunHome) {
    tasks.push({ type: "home_autopilot", result: await runHomeAutopilot(env, { includeMarket: false }) });
  }

  if (shouldRunMarket) {
    tasks.push({ type: "market", result: await runMarketAutomation(env, { sourceLimit: 2, draftLimit: 6 }) });
  }

  if (shouldRunYoutube) {
    tasks.push({ type: "youtube_scout", result: await runYoutubeScoutAutomation(env) });
  }

  const result = {
    ok: tasks.every(task => task.result && task.result.ok !== false),
    cron,
    scheduled_at: new Date(scheduledTime).toISOString(),
    tasks,
  };
  await logRun(env, "scheduled_autopilot", result);
  return result;
}

async function publicHome(env) {
  if (!hasSupabase(env)) {
    return json({
      news: [],
      market: [],
      matches: [],
      social: [],
      graphics: DEFAULT_GRAPHICS,
      radar: DEFAULT_RADAR,
      auto: {
        enabled: false,
        interval_hours: Math.max(Number(env.HOME_AUTO_INTERVAL_HOURS || 6), 1),
        last_run_at: null,
        status: "missing_supabase",
      },
    });
  }

  const [news, market, marketNews, matches, social, auto, radar] = await Promise.all([
    sb(env, "/news?visible=eq.true&order=created_at.desc&limit=48"),
    sb(env, "/market_items?order=updated_at.desc&limit=12"),
    sb(env, "/news?visible=eq.true&category=eq.calciomercato&order=created_at.desc&limit=18"),
    sb(env, "/match_reports?order=match_date.desc&limit=3"),
    sb(env, "/social_drafts?platform=eq.instagram&visible=eq.true&order=created_at.desc&limit=12"),
    latestAutomationRun(env, "home_autopilot"),
    getSiteSetting(env, "radar_home", DEFAULT_RADAR),
  ]);
  const cleanNews = publicNewsRows(news).slice(0, 6);
  const cleanMarketNews = publicNewsRows(marketNews);
  const cleanMarket = publicMarketRows([
    ...publicMarketFromNews(cleanMarketNews),
    ...(market || []),
  ]);
  return json({
    news: cleanNews,
    market: aggregateMarketItems(cleanMarket),
    matches,
    social: publicSocialRows(social),
    graphics: [],
    radar,
    auto: { enabled: true, interval_hours: Math.max(Number(env.HOME_AUTO_INTERVAL_HOURS || 6), 1), last_run_at: auto && auto.created_at },
  });
}

async function publicGraphics(env) {
  if (!hasSupabase(env)) return json(DEFAULT_GRAPHICS);
  const graphics = await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS);
  return json(publicGraphicsRows(graphics));
}

function publicMarketFromNews(rows) {
  return (rows || []).slice(0, 8).map(row => ({
    player_name: extractPlayer(cleanText(row.title || "")) || "Mercato Juve",
    status: cleanText(row.editorial_status || statusFromReliability(row.reliability)),
    category: "calciomercato",
    source_name: cleanText(row.source || "ICV"),
    source_url: row.source_url,
    reliability: row.reliability || "trusted",
    note: cleanText(row.title),
    updated_at: row.created_at,
  }));
}

async function runHomeAutopilot(env, options = {}) {
  if (!hasSupabase(env)) return { ok: false, error: "Configura Supabase per Home Autopilot" };
  const includeMarket = options.includeMarket !== false;
  const intervalHours = Math.max(Number(env.HOME_AUTO_INTERVAL_HOURS || 6), 1);
  const latest = await latestAutomationRun(env, "home_autopilot");
  if (!options.force && latest && Date.now() - new Date(latest.created_at).getTime() < intervalHours * 3600000) {
    return { ok: true, skipped: true, reason: "interval_not_elapsed", interval_hours: intervalHours, last_run_at: latest.created_at };
  }

  const result = { ok: true, interval_hours: intervalHours, tasks: [] };

  if (env.IG_ACCESS_TOKEN) {
    try {
      result.tasks.push({ type: "instagram_import", result: await importInstagramMedia(env) });
    } catch (err) {
      result.ok = false;
      result.tasks.push({ type: "instagram_import", error: err.message || "Errore Instagram" });
    }
  }

  try {
    const sources = await getSources(env);
    const newsResult = await fetchNewsDrafts(env, sources);
    result.tasks.push({ type: "news", result: newsResult });
    await logRun(env, "news", newsResult);

    if (includeMarket) {
      result.tasks.push({ type: "market", result: await runMarketAutomation(env, { sources }) });
    }
  } catch (err) {
    result.ok = false;
    result.tasks.push({ type: "news_market", error: err.message || "Errore news/mercato" });
  }

  if (env.FOOTBALL_DATA_KEY) {
    try {
      result.tasks.push({ type: "match_center", result: await generateMatchCenter(env) });
    } catch (err) {
      result.tasks.push({ type: "match_center", error: err.message || "Errore Match Center" });
    }
  }

  await logRun(env, "home_autopilot", result);
  return result;
}

async function latestAutomationRun(env, type) {
  try {
    const rows = await sb(env, "/automation_runs?type=eq." + encodeURIComponent(type) + "&order=created_at.desc&limit=1");
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function publicNews(env, url) {
  const limit = Math.min(Number(url.searchParams.get("limit") || 12), 30);
  if (!hasSupabase(env)) return json([]);
  try {
    const rows = await sb(env, "/news?visible=eq.true&order=created_at.desc&limit=" + Math.max(limit, 30));
    return json(publicNewsRows(rows).slice(0, limit));
  } catch {
    return json([]);
  }
}

async function adminNews(request, env) {
  requireAdmin(request, env);

  if (!hasSupabase(env)) {
    return json({
      drafts: [],
      news: [],
      sources: DEFAULT_SOURCES,
      social: [],
      graphics: DEFAULT_GRAPHICS,
      market: [],
      matches: [],
      runs: [],
      radar: DEFAULT_RADAR,
      setup: {
        supabase: false,
        message: "Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY per salvare dati e automazioni.",
      },
    });
  }

  if (request.method === "GET") {
    const [drafts, news, sources, social, market, matches, runs, radar, graphics] = await Promise.all([
      safeAdminRead(() => sb(env, "/news_drafts?order=created_at.desc&limit=80"), []),
      safeAdminRead(() => sb(env, "/news?order=created_at.desc&limit=80"), []),
      safeAdminRead(() => getSources(env), DEFAULT_SOURCES),
      safeAdminRead(() => sb(env, "/social_drafts?order=created_at.desc&limit=40"), []),
      safeAdminRead(() => sb(env, "/market_items?order=updated_at.desc&limit=60"), []),
      safeAdminRead(() => sb(env, "/match_reports?order=match_date.desc&limit=20"), []),
      safeAdminRead(() => sb(env, "/automation_runs?order=created_at.desc&limit=12"), []),
      safeAdminRead(() => getSiteSetting(env, "radar_home", DEFAULT_RADAR), DEFAULT_RADAR),
      safeAdminRead(() => getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS), DEFAULT_GRAPHICS),
    ]);
    return json({ drafts, news, sources, social, market, matches, runs, radar, graphics });
  }

  const body = await readBody(request);
  if (request.method === "POST") {
    if (body.type === "manual_news") {
      const inserted = await insertNewsRow(env, {
          title: body.title,
          body: body.body,
          category: body.category || "juventus",
          urgency: normalizeNewsUrgencyForDb(body.urgency),
          source: body.source || "ICV",
          visible: body.visible !== false,
          auto_fetched: false,
          reliability: body.reliability || "trusted",
          editorial_status: body.editorial_status || "Confermato",
      });
      return json({ news: inserted[0] });
    }

    if (body.type === "approve_draft") {
      const draft = await getOne(env, "/news_drafts?id=eq." + encodeURIComponent(body.id));
      const inserted = await insertNewsRow(env, {
          title: body.title || draft.title,
          body: body.body || draft.body,
          category: body.category || draft.category,
          urgency: normalizeNewsUrgencyForDb(body.urgency || draft.urgency),
          source: draft.source_name,
          source_url: draft.source_url,
          visible: true,
          auto_fetched: true,
          reliability: draft.reliability,
          editorial_status: body.editorial_status || statusFromReliability(draft.reliability),
      });
      await sb(env, "/news_drafts?id=eq." + encodeURIComponent(body.id), {
        method: "PATCH",
        body: { review_status: "approved" },
      });
      return json({ news: inserted[0] });
    }

    if (body.type === "source") {
      const inserted = await sb(env, "/sources", {
        method: "POST",
        body: [{
          name: body.name,
          url: body.url,
          category: body.category || "juventus",
          reliability: body.reliability || "trusted",
          active: body.active !== false,
        }],
        prefer: "return=representation",
      });
      return json({ source: inserted[0] });
    }

    if (body.type === "instagram_pick") {
      const inserted = await sb(env, "/social_drafts", {
        method: "POST",
        body: [{
          platform: "instagram",
          hook: body.hook || "Post Instagram",
          caption: body.caption || "",
          post_url: body.post_url,
          media_type: body.media_type || "post",
          status: "published",
          visible: body.visible !== false,
        }],
        prefer: "return=representation",
      });
      return json({ social: inserted[0] });
    }

    if (body.type === "radar_settings") {
      const radar = normalizeRadar(body.radar);
      await setSiteSetting(env, "radar_home", radar);
      return json({ radar });
    }

    if (body.type === "graphic_inline") {
      let imageUrl = "";
      try {
        imageUrl = inlineGraphicImage(body);
      } catch (err) {
        return json({ error: err.message || "Errore caricamento grafica" }, 400);
      }
      if (!imageUrl) return json({ error: "Immagine non valida" }, 400);
      const current = await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS);
      const graphics = normalizeGraphics([
        {
          id: "g_" + Date.now().toString(36),
          title: body.title,
          image_url: imageUrl,
          link_url: body.link_url,
          visible: body.visible !== false,
          created_at: new Date().toISOString(),
        },
        ...(Array.isArray(current) ? current : []),
      ]);
      await setSiteSetting(env, "graphics_gallery", graphics);
      return json({ graphic: graphics[0], graphics });
    }

    if (body.type === "graphic_upload") {
      let imageUrl = "";
      try {
        imageUrl = await uploadGraphicImage(env, body);
      } catch (err) {
        imageUrl = inlineGraphicImage(body);
        if (!imageUrl) return json({ error: err.message || "Errore caricamento grafica" }, 400);
      }
      const current = await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS);
      const graphics = normalizeGraphics([
        {
          id: "g_" + Date.now().toString(36),
          title: body.title,
          image_url: imageUrl,
          link_url: body.link_url,
          visible: body.visible !== false,
          created_at: new Date().toISOString(),
        },
        ...(Array.isArray(current) ? current : []),
      ]);
      await setSiteSetting(env, "graphics_gallery", graphics);
      return json({ graphic: graphics[0], graphics });
    }

    if (body.type === "graphic") {
      if (!cleanText(body.image_url || "")) return json({ error: "URL immagine richiesto" }, 400);
      const current = await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS);
      const graphics = normalizeGraphics([
        {
          id: "g_" + Date.now().toString(36),
          title: body.title,
          image_url: body.image_url,
          link_url: body.link_url,
          visible: body.visible !== false,
          created_at: new Date().toISOString(),
        },
        ...(Array.isArray(current) ? current : []),
      ]);
      await setSiteSetting(env, "graphics_gallery", graphics);
      return json({ graphic: graphics[0], graphics });
    }
  }

  if (request.method === "PATCH") {
    if (body.type === "discard_draft") {
      await sb(env, "/news_drafts?id=eq." + encodeURIComponent(body.id), {
        method: "PATCH",
        body: { review_status: "discarded" },
      });
      return json({ ok: true });
    }

    if (body.type === "update_draft") {
      const updated = await sb(env, "/news_drafts?id=eq." + encodeURIComponent(body.id), {
        method: "PATCH",
        body: pick(body, ["title", "body", "category", "urgency", "editorial_note", "review_status"]),
        prefer: "return=representation",
      });
      return json({ draft: updated[0] });
    }

    if (body.type === "toggle_news") {
      const updated = await sb(env, "/news?id=eq." + encodeURIComponent(body.id), {
        method: "PATCH",
        body: { visible: body.visible },
        prefer: "return=representation",
      });
      return json({ news: updated[0] });
    }

    if (body.type === "toggle_social") {
      const updated = await sb(env, "/social_drafts?id=eq." + encodeURIComponent(body.id), {
        method: "PATCH",
        body: { visible: body.visible, updated_at: new Date().toISOString() },
        prefer: "return=representation",
      });
      return json({ social: updated[0] });
    }

    if (body.type === "toggle_graphic") {
      const current = normalizeGraphics(await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS));
      const graphics = current.map(item => item.id === body.id ? { ...item, visible: body.visible !== false } : item);
      await setSiteSetting(env, "graphics_gallery", graphics);
      return json({ graphics });
    }

    if (body.type === "move_graphic") {
      const current = normalizeGraphics(await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS));
      const index = current.findIndex(item => item.id === body.id);
      const target = index + (body.direction === "down" ? 1 : -1);
      if (index >= 0 && target >= 0 && target < current.length) {
        const graphics = current.slice();
        const moving = graphics[index];
        graphics[index] = graphics[target];
        graphics[target] = moving;
        await setSiteSetting(env, "graphics_gallery", graphics);
        return json({ graphics });
      }
      return json({ graphics: current });
    }

    if (body.type === "delete_graphic") {
      const current = normalizeGraphics(await getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS));
      const graphics = current.filter(item => item.id !== body.id);
      await setSiteSetting(env, "graphics_gallery", graphics);
      return json({ graphics });
    }
  }

  if (request.method === "DELETE") {
    await sb(env, "/news?id=eq." + encodeURIComponent(body.id), { method: "DELETE" });
    return json({ ok: true });
  }

  return json({ error: "Azione non supportata" }, 400);
}

async function adminAutomate(request, env) {
  requireAdmin(request, env);
  const body = await readBody(request);
  const action = body.action || "fetch_news";

  if (action === "fetch_news") {
    const sources = await getSources(env);
    const result = await fetchNewsDrafts(env, sources);
    await logRun(env, "news", result);
    return json(result);
  }

  if (action === "match_center") {
    const result = await generateMatchCenter(env);
    await logRun(env, "match_center", result);
    return json(result);
  }

  if (action === "market") {
    const result = await runMarketAutomation(env);
    await logRun(env, "market", result);
    return json(result);
  }

  if (action === "social") {
    const result = await generateSocialDrafts(env);
    await logRun(env, "social", result);
    return json(result);
  }

  if (action === "instagram_import") {
    const result = await importInstagramMedia(env);
    await logRun(env, "instagram_import", result);
    return json(result);
  }

  if (action === "youtube_scout") {
    if (!youtubeScoutEnabled(env)) return json(youtubeScoutDisabledResult());
    const result = await runYoutubeScoutAutomation(env);
    return json(result);
  }

  if (action === "home_autopilot") {
    const result = await runHomeAutopilot(env, { force: true });
    return json(result);
  }

  return json({ error: "Automazione non supportata" }, 400);
}

async function runMarketAutomation(env, options = {}) {
  try {
    const rawSources = options.sources || await getSources(env);
    const marketSources = rawSources.filter(s => s.category === "calciomercato");
    const defaultLimit = marketSources.length ? marketSources.length : DEFAULT_SOURCES.length;
    const sources = (marketSources.length ? marketSources : DEFAULT_SOURCES)
      .filter(s => s.category === "calciomercato" || !marketSources.length)
      .slice(0, Math.max(1, Number(options.sourceLimit || defaultLimit)));
    return await generateMarketDrafts(env, sources, { draftLimit: options.draftLimit || 8 });
  } catch (err) {
    return { ok: false, error: err.message || "Errore mercato", scanned: 0, inserted: 0, market_items: 0 };
  }
}

async function runYoutubeScoutAutomation(env) {
  if (!youtubeScoutEnabled(env)) return youtubeScoutDisabledResult();
  let result;
  try {
    result = await generateYoutubeScoutDrafts(env);
  } catch (err) {
    result = { ok: false, error: err.message || "Errore YouTube Scout", scanned: 0, inserted: 0 };
  }
  await logRun(env, "youtube_scout", result);
  return result;
}

function youtubeScoutEnabled(env) {
  return String(env.YOUTUBE_SCOUT_ENABLED || "").trim().toLowerCase() === "true";
}

function youtubeScoutDisabledResult() {
  return {
    ok: true,
    disabled: true,
    scanned: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    message: "YouTube Scout disattivato: non crea bozze automatiche.",
  };
}

async function fetchNewsDrafts(env, sources) {
  let scanned = 0;
  let inserted = 0;
  let published = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  let skippedBlacklisted = 0;
  const errors = [];
  const sourcesReport = [];
  const recentNews = await recentNewsRows(env);
  const recentDrafts = await recentDraftRows(env);
  const romanoCleanup = await cleanupFabrizioRows(env, recentNews, recentDrafts);
  updated += romanoCleanup.updated;
  if (romanoCleanup.errors.length) errors.push(...romanoCleanup.errors);

  for (const source of sources.filter(s => s.active !== false)) {
    const report = {
      source: source.name,
      scanned: 0,
      relevant: 0,
      inserted: 0,
      published: 0,
      updated: 0,
      skipped_duplicates: 0,
    };
    try {
      if (isBlacklistedSource(env, source)) {
        skippedBlacklisted++;
        continue;
      }

      const items = (await fetchSourceItems(source)).slice(0, itemScanLimitForSource(source));
      scanned += items.length;
      report.scanned = items.length;

      for (const item of items) {
        const normalized = normalizeGoogleTitle(item.title);
        const title = normalized.title;
        const sourceName = normalized.source || item.source || source.name;
        if (!isRelevantNewsItem(title, item.description, source)) continue;
        report.relevant++;
        const url = item.link || source.url;
        const body = cleanNewsDescription(item.description || title, sourceName, title).slice(0, 500);
        const category = source.category || inferCategory(title);
        const reliability = reliabilityForSourceTier(sourceTier(env, source, sourceName, url));
        if (reliability === "blacklist") {
          skippedBlacklisted++;
          continue;
        }
        const urgency = inferUrgency(title, body, category, reliability);
        const editorialStatus = statusFromReliability(reliability);
        const hash = await digest(dedupeKey(title, sourceName, url));
        const candidate = { title, body, category, urgency, sourceName, sourceUrl: url, reliability, editorialStatus };

        const existingNews = findExistingNewsInRows(recentNews, candidate);
        if (existingNews) {
          if (await updateExistingNewsFromCandidate(env, existingNews, candidate)) {
            Object.assign(existingNews, {
              body: candidate.body && candidate.body.length > String(existingNews.body || "").length ? candidate.body : existingNews.body,
              source: mergeSourceNames(existingNews.source, candidate.sourceName),
              source_url: existingNews.source_url || candidate.sourceUrl,
              reliability: priorityForReliability(candidate.reliability) > priorityForReliability(existingNews.reliability) ? candidate.reliability : existingNews.reliability,
              editorial_status: priorityForReliability(candidate.reliability) > priorityForReliability(existingNews.reliability) ? candidate.editorialStatus : existingNews.editorial_status,
              urgency: priorityForUrgency(candidate.urgency) > priorityForUrgency(existingNews.urgency) ? candidate.urgency : existingNews.urgency,
            });
            updated++;
            report.updated++;
          }
          skippedDuplicates++;
          report.skipped_duplicates++;
          continue;
        }

        const existingDraft = findExistingDraftInRows(recentDrafts, candidate, hash);
        if (existingDraft) {
          const promotedDraft = await promoteExistingDraftFromCandidate(env, existingDraft, candidate, recentDrafts);
          Object.assign(existingDraft, promotedDraft);
          if (shouldAutoPublishCandidate(env, source, candidate)) {
            const news = await publishDraftAsNews(env, promotedDraft, { skipExistingCheck: true });
            if (news) {
              recentNews.unshift(news);
              await markDraftApproved(env, existingDraft.id);
              existingDraft.review_status = "approved";
              published++;
              report.published++;
            }
          } else if (promotedDraft.review_status === "ready" && existingDraft.review_status !== "ready") {
            updated++;
            report.updated++;
          }
          skippedDuplicates++;
          report.skipped_duplicates++;
          continue;
        }

        const trustedConfirmation = reliability === "trusted" ? findTrustedConfirmationInRows(recentDrafts, candidate) : null;
        const shouldPublish = shouldAutoPublishCandidate(env, source, candidate);
        const reviewStatus = shouldPublish ? "ready" : reviewStatusForReliability(reliability, trustedConfirmation);
        let draftRows = [];
        try {
          draftRows = await sb(env, "/news_drafts", {
            method: "POST",
            body: [{
              title,
              body,
              category,
              urgency,
              source_name: sourceName,
              source_url: url,
              reliability,
              editorial_status: editorialStatus,
              review_status: reviewStatus,
              content_hash: hash,
              raw_payload: {
                ...item,
                source_policy: {
                  tier: reliability,
                  auto_publish: shouldPublish,
                  trusted_confirmation: trustedConfirmation,
                },
              },
            }],
            prefer: "return=representation",
          });
        } catch (err) {
          if (isSupabaseEmptyJsonError(err)) {
            skippedDuplicates++;
            report.skipped_duplicates++;
            continue;
          }
          throw err;
        }
        const draft = draftRows[0];
        if (draft) recentDrafts.unshift(draft);
        inserted++;
        report.inserted++;
        if (shouldPublish) {
          const news = await publishDraftAsNews(env, draft, { skipExistingCheck: true });
          if (news) {
            recentNews.unshift(news);
            await markDraftApproved(env, draft.id);
            draft.review_status = "approved";
            published++;
            report.published++;
          }
        }
      }
    } catch (err) {
      if (isTransientFetchError(err)) {
        report.warning = err.message;
      } else {
        report.error = err.message;
        errors.push({ source: source.name, error: err.message });
      }
    } finally {
      if (isAutoPublishTrustedSource(env, source) || isTelegramWebSource(source.url)) {
        sourcesReport.push(report);
      }
    }
  }

  return { ok: true, scanned, inserted, published, updated, skipped_duplicates: skippedDuplicates, skipped_blacklisted: skippedBlacklisted, errors, sources_report: sourcesReport, romano_cleanup: romanoCleanup };
}

async function generateMarketDrafts(env, sources, options = {}) {
  const result = await fetchNewsDrafts(env, sources);
  const draftLimit = Math.max(1, Math.min(Number(options.draftLimit || 8), 12));
  const drafts = await sb(env, "/news_drafts?category=eq.calciomercato&review_status=in.(needs_review,ready)&order=created_at.desc&limit=" + draftLimit);
  let inserted = 0;
  const errors = Array.isArray(result.errors) ? result.errors.slice() : [];

  for (const draft of drafts) {
    if (isStaleMarketDraft(draft)) continue;
    const player = marketTopicName({ player_name: extractPlayer(draft.title), note: draft.title }).slice(0, 80);
    if (!player || player === "Mercato Juve") continue;
    try {
      const existing = await sb(env, "/market_items?player_name=eq." + encodeURIComponent(player) + "&select=id,source_name,source_url,reliability,status,note&limit=1");
      const sourceName = cleanText(draft.source_name || "").slice(0, 120);
      const sourceUrl = draft.source_url;
      const payload = {
        player_name: player,
        status: draft.editorial_status === "Rumor" ? "da verificare" : "monitorato",
        category: "calciomercato",
        source_name: sourceName,
        source_url: sourceUrl,
        reliability: draft.reliability || "rumor",
        note: cleanText(draft.title || "").slice(0, 500),
        updated_at: new Date().toISOString(),
      };
      if (existing.length) {
        payload.source_name = mergeSourceNames(existing[0].source_name, sourceName);
        payload.source_url = existing[0].source_url || sourceUrl;
        payload.reliability = bestReliability(existing[0].reliability, payload.reliability);
        payload.status = mergedMarketStatus(existing[0].status, payload.status, payload.reliability);
        await sb(env, "/market_items?id=eq." + existing[0].id, { method: "PATCH", body: payload });
      } else {
        await sb(env, "/market_items", { method: "POST", body: [payload] });
        inserted++;
      }
    } catch (err) {
      errors.push({ draft: draft.id, title: draft.title, error: err.message || "Errore market item" });
    }
  }

  return { ...result, errors, market_items: inserted };
}

function isStaleMarketDraft(draft) {
  const createdAt = new Date(draft && draft.created_at || 0).getTime();
  if (!createdAt) return false;
  return Date.now() - createdAt > 72 * 3600000;
}

async function generateMatchCenter(env) {
  const key = env.FOOTBALL_DATA_KEY;
  if (!key) return { ok: false, error: "FOOTBALL_DATA_KEY non configurata" };

  const matches = await fetchJson("https://api.football-data.org/v4/teams/109/matches?status=SCHEDULED&limit=1", {
    "X-Auth-Token": key,
  });
  const match = matches.matches && matches.matches[0];
  if (!match) return { ok: true, message: "Nessuna prossima partita trovata" };

  const opponent = match.homeTeam.id === 109 ? match.awayTeam.name : match.homeTeam.name;
  const isHome = match.homeTeam.id === 109;
  const report = {
    match_id: String(match.id),
    opponent,
    competition: match.competition && match.competition.name,
    match_date: match.utcDate,
    status: "pre_match",
    title: "Verso " + (isHome ? "Juventus-" + opponent : opponent + "-Juventus"),
    summary: "",
    tactical_key: "",
    source_payload: match,
    updated_at: new Date().toISOString(),
  };

  const existing = await sb(env, "/match_reports?match_id=eq." + encodeURIComponent(report.match_id) + "&select=id&limit=1");
  if (existing.length) {
    await sb(env, "/match_reports?id=eq." + existing[0].id, { method: "PATCH", body: report });
  } else {
    await sb(env, "/match_reports", { method: "POST", body: [report] });
  }
  return { ok: true, match: report.title };
}

async function generateSocialDrafts(env) {
  const news = await sb(env, "/news?visible=eq.true&order=created_at.desc&limit=8");
  let inserted = 0;
  for (const item of news) {
    const existing = await sb(env, "/social_drafts?news_id=eq." + item.id + "&select=id&limit=1");
    if (existing.length) continue;
    await sb(env, "/social_drafts", {
      method: "POST",
      body: [{
        news_id: item.id,
        platform: "instagram",
        hook: hookFromTitle(item.title),
        caption: buildCaption(item),
        card_text: item.title,
        status: "draft",
      }],
    });
    inserted++;
  }
  return { ok: true, inserted };
}

async function generateYoutubeScoutDrafts(env) {
  if (!hasSupabase(env)) throw new Error("Configura Supabase per salvare le bozze YouTube Scout");
  if (!transcriptApiKey(env)) throw new Error("Configura TRANSCRIPT_API_KEY su Cloudflare per YouTube Scout");

  const channels = youtubeScoutChannels(env);
  const maxPerChannel = Math.max(1, Math.min(Number(env.YOUTUBE_SCOUT_MAX_PER_CHANNEL || 1), 3));
  let scanned = 0;
  let inserted = 0;
  const errors = [];
  const channelReports = [];

  for (const channel of channels) {
    const report = {
      channel: channel.name,
      handle: channel.channel,
      videos: 0,
      relevant: 0,
      scanned: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    try {
      const videos = (await fetchYoutubeLatestVideos(env, channel.channel)).slice(0, 15);
      report.videos = videos.length;
      const relevant = videos.filter(isRelevantYoutubeVideo).slice(0, maxPerChannel);
      report.relevant = relevant.length;
      scanned += relevant.length;
      report.scanned = relevant.length;

      for (const video of relevant) {
        const videoId = youtubeVideoId(video);
        if (!videoId) {
          const detail = { channel: channel.name, video: videoTitle(video), error: "Video senza ID riconoscibile" };
          errors.push(detail);
          report.errors.push(detail);
          continue;
        }
        const hash = await digest("youtube-scout|" + videoId);
        const existing = await sb(env, "/news_drafts?content_hash=eq." + encodeURIComponent(hash) + "&select=id&limit=1");
        if (existing.length) {
          report.skipped++;
          continue;
        }

        const transcript = await fetchYoutubeTranscript(env, videoId);
        const transcriptText = normalizeTranscriptText(transcript);
        if (!hasUsableYoutubeTranscript(transcriptText)) {
          const detail = { channel: channel.name, video: videoTitle(video), error: "Trascrizione non utile o non Juventus-related" };
          errors.push(detail);
          report.errors.push(detail);
          continue;
        }

        const title = youtubeDraftTitle(video, transcriptText);
        const body = youtubeDraftBody(video, transcriptText, channel.name);
        await sb(env, "/news_drafts", {
          method: "POST",
          body: [{
            title,
            body,
            category: inferCategory(title + " " + body),
            urgency: inferUrgency(title + " " + body),
            source_name: "YouTube · " + channel.name,
            source_url: youtubeVideoUrl(videoId),
            reliability: "trusted",
            editorial_status: "Da verificare",
            review_status: "needs_review",
            editorial_note: "Bozza generata da YouTube Scout usando trascrizione. Verificare sempre prima di approvare.",
            content_hash: hash,
            raw_payload: {
              channel: channel.name,
              video_id: videoId,
              video_title: videoTitle(video),
              published_at: video.published_at || video.published || video.publishedAt || null,
              transcript_excerpt: transcriptText.slice(0, 1200),
            },
          }],
        });
        inserted++;
        report.inserted++;
      }
    } catch (err) {
      const detail = { channel: channel.name, error: err.message || "Errore canale YouTube" };
      errors.push(detail);
      report.errors.push(detail);
    }
    channelReports.push(report);
  }

  return { ok: true, scanned, inserted, skipped: channelReports.reduce((sum, item) => sum + item.skipped, 0), errors, channels: channelReports };
}

async function importInstagramMedia(env) {
  if (!env.IG_ACCESS_TOKEN) throw new Error("Configura IG_ACCESS_TOKEN per importare Instagram");
  const fields = "id,caption,media_type,media_url,permalink,timestamp,thumbnail_url";
  const url = "https://graph.instagram.com/me/media?fields=" + encodeURIComponent(fields) + "&limit=8&access_token=" + encodeURIComponent(env.IG_ACCESS_TOKEN);
  const data = await fetchJson(url);
  const media = Array.isArray(data.data) ? data.data : [];
  let inserted = 0;

  for (const item of media) {
    if (!item.permalink) continue;
    const existing = await sb(env, "/social_drafts?post_url=eq." + encodeURIComponent(item.permalink) + "&select=id&limit=1");
    const payload = {
      platform: "instagram",
      hook: hookFromCaption(item.caption) || labelInstagramMedia(item.media_type),
      caption: item.caption || "",
      card_text: item.caption || labelInstagramMedia(item.media_type),
      post_url: item.permalink,
      media_type: String(item.media_type || "post").toLowerCase(),
      instagram_id: item.id,
      media_url: item.media_url || item.thumbnail_url || "",
      thumbnail_url: item.thumbnail_url || item.media_url || "",
      published_at: item.timestamp || null,
      status: "published",
      visible: true,
      updated_at: new Date().toISOString(),
    };

    if (existing.length) {
      await sb(env, "/social_drafts?id=eq." + existing[0].id, { method: "PATCH", body: payload });
    } else {
      await sb(env, "/social_drafts", { method: "POST", body: [payload] });
      inserted++;
    }
  }

  return { ok: true, imported: media.length, inserted };
}

async function footballDataProxy(path, url, env) {
  if (!env.FOOTBALL_DATA_KEY) return json({ error: "FOOTBALL_DATA_KEY non configurata" }, 500);
  const endpoint = path.replace(/^football-data\/?/, "");
  const target = "https://api.football-data.org/v4/" + endpoint + url.search;
  const response = await fetch(target, { headers: { "X-Auth-Token": env.FOOTBALL_DATA_KEY } });
  return new Response(await response.text(), {
    status: response.status,
    headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=900" },
  });
}

async function worldCupOverview(request, env, context) {
  if (!env.FOOTBALL_DATA_KEY) return json({ error: "FOOTBALL_DATA_KEY non configurata" }, 500);

  const requestUrl = new URL(request.url);
  const forceRefresh = requestUrl.searchParams.has("refresh");
  const cacheUrl = new URL(request.url);
  cacheUrl.search = "";
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache && !forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const headers = { "X-Auth-Token": env.FOOTBALL_DATA_KEY };
  const base = "https://api.football-data.org/v4/competitions/WC";
  const [competition, matchesData, standingsData, scorersData] = await Promise.all([
    fetchJson(base, headers),
    fetchJson(base + "/matches", headers),
    fetchJson(base + "/standings", headers),
    fetchJson(base + "/scorers?limit=25", headers).catch(() => ({ scorers: [] })),
  ]);

  let matches = (matchesData.matches || []).map(match => ({
    id: match.id,
    utcDate: match.utcDate,
    status: match.status,
    stage: match.stage,
    group: match.group,
    matchday: match.matchday,
    homeTeam: compactTeam(match.homeTeam),
    awayTeam: compactTeam(match.awayTeam),
    score: match.score,
    isLive: isWorldCupMatchLive(match),
  }));
  matches = await enrichWorldCupLiveGoals(matches, env, request, cache, context);
  const standings = (standingsData.standings || []).map(group => ({
    stage: group.stage,
    type: group.type,
    group: group.group,
    table: (group.table || []).map(row => ({
      position: row.position,
      team: compactTeam(row.team),
      playedGames: row.playedGames,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      points: row.points,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      form: row.form,
    })),
  }));
  const scorers = (scorersData.scorers || []).map(row => ({
    player: { id: row.player && row.player.id, name: row.player && row.player.name },
    team: compactTeam(row.team),
    goals: row.goals || 0,
    assists: row.assists || 0,
    penalties: row.penalties || 0,
  }));
  const live = matches.some(match => match.isLive);
  const maxAge = live ? 8 : 180;
  const payload = {
    competition: {
      id: competition.id,
      name: competition.name,
      code: competition.code,
      emblem: competition.emblem,
    },
    season: competition.currentSeason,
    resultSet: matchesData.resultSet,
    matches,
    standings,
    scorers,
    live,
    fetchedAt: new Date().toISOString(),
  };
  const response = new Response(JSON.stringify(payload), {
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": live
        ? `public, max-age=${maxAge}, must-revalidate`
        : `public, max-age=${maxAge}, stale-while-revalidate=300`,
    },
  });
  if (cache && context && typeof context.waitUntil === "function") {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

async function worldCupLive(request, env) {
  const games = await fetchWorldCup26Games();
  const matches = games.map(compactWorldCup26Game).filter(Boolean);
  return new Response(JSON.stringify({
    matches,
    live: matches.some(match => match.isLive),
    fetchedAt: new Date().toISOString(),
  }), {
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

async function worldCupCalendar(request, env) {
  if (request.method !== "GET") return json({ error: "Metodo non consentito" }, 405);
  if (!env.FOOTBALL_DATA_KEY) return json({ error: "FOOTBALL_DATA_KEY non configurata" }, 500);

  const headers = { "X-Auth-Token": env.FOOTBALL_DATA_KEY };
  const data = await fetchJson("https://api.football-data.org/v4/competitions/WC/matches", headers);
  const now = new Date();
  const calendarSequence = Math.floor(now.getTime() / (60 * 60 * 1000));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICV Scout//Mondiali 2026//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ICV Mondiali 2026",
    "X-WR-CALDESC:Calendario aggiornato delle 104 partite dei Mondiali 2026",
    "X-APPLE-CALENDAR-COLOR:#C99837",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const match of data.matches || []) {
    const kickoff = new Date(match.utcDate);
    if (!Number.isFinite(kickoff.getTime())) continue;
    const end = new Date(kickoff.getTime() + 2 * 60 * 60 * 1000);
    const home = worldCupTeamName(match.homeTeam, "Squadra da definire");
    const away = worldCupTeamName(match.awayTeam, "Squadra da definire");
    const stage = worldCupStageLabel(match.stage, match.group);
    const teamsDefined = home !== "Squadra da definire" || away !== "Squadra da definire";
    const summary = teamsDefined
      ? `Mondiali 2026: ${home} - ${away}`
      : `Mondiali 2026: ${stage}`;
    const description = [
      stage,
      teamsDefined ? "" : "Squadre aggiornate automaticamente appena definite.",
      "Orario aggiornato automaticamente da ICV Scout.",
      "https://ilcalciodivince.com/mondiali",
    ].filter(Boolean).join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:wc2026-${match.id || formatIcsDate(kickoff)}@ilcalciodivince.com`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `LAST-MODIFIED:${formatIcsDate(now)}`,
      `SEQUENCE:${calendarSequence}`,
      `DTSTART:${formatIcsDate(kickoff)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL:https://ilcalciodivince.com/mondiali`,
      `STATUS:${match.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  const calendar = lines.map(foldIcsLine).join("\r\n") + "\r\n";
  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ICV-Mondiali-2026.ics"',
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function subscribeWorldCup(request, env) {
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const body = await readBody(request);
  const email = cleanText(body.email || "").toLowerCase();
  if (body.website) return json({ ok: true, subscribed: false });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Email non valida" }, 400);
  }

  const listId = Number(env.BREVO_LIST_ID);
  const apiKey = brevoApiKey(env);
  if (!apiKey || !Number.isFinite(listId)) {
    return json({ ok: true, subscribed: false, configured: false });
  }

  const response = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, listIds: [listId], updateEnabled: true }),
  });
  if (response.ok) return json({ ok: true, subscribed: true });

  const error = await response.json().catch(() => ({}));
  if (error && error.code === "duplicate_parameter") {
    return json({ ok: true, subscribed: true });
  }
  console.error("[subscribe] Brevo error", response.status, error);
  return json({ ok: false, subscribed: false }, 502);
}

async function sendQuizResult(request, env) {
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const body = await readBody(request);
  const email = cleanText(body.email || "").toLowerCase();
  if (body.website) return json({ ok: true, sent: false, subscribed: false });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Email non valida" }, 400);
  }

  const numericScore = Number(body.score);
  if (!Number.isFinite(numericScore)) {
    return json({ error: "Risultato quiz non valido" }, 400);
  }
  const score = Math.max(10, Math.min(40, Math.round(numericScore)));
  const profile = quizProfileFromScore(score);
  const subscribed = await upsertBrevoContact(email, env).catch((err) => {
    console.error("[quiz-result] Brevo contact error", err && err.message || err);
    return false;
  });

  const apiKey = brevoApiKey(env);
  const senderEmail = cleanText(env.QUIZ_EMAIL_SENDER || env.BREVO_SENDER_EMAIL || "");
  const senderName = cleanText(env.QUIZ_EMAIL_SENDER_NAME || env.BREVO_SENDER_NAME || "Il Calcio di Vince");
  if (!apiKey || !senderEmail) {
    return json({ ok: true, sent: false, subscribed, configured: false });
  }

  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: "Il tuo profilo ICV: " + profile.title,
        htmlContent: quizResultEmailHtml(profile, score),
        textContent: quizResultEmailText(profile, score),
      }),
    });
  } catch (err) {
    console.error("[quiz-result] Brevo email fetch failed", err && err.message || err);
    return json({
      ok: false,
      sent: false,
      subscribed,
      error: "Invio mail non disponibile: controlla la chiave API Brevo salvata su Cloudflare.",
    });
  }

  if (response.ok) return json({ ok: true, sent: true, subscribed });
  const error = await response.json().catch(() => ({}));
  console.error("[quiz-result] Brevo email error", response.status, error);
  return json({
    ok: false,
    sent: false,
    subscribed,
    error: brevoPublicErrorMessage(response.status, error),
  });
}

async function upsertBrevoContact(email, env) {
  const listId = Number(env.BREVO_LIST_ID);
  const apiKey = brevoApiKey(env);
  if (!apiKey || !Number.isFinite(listId)) return false;
  const response = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      listIds: [listId],
      updateEnabled: true,
      attributes: { SOURCE: "quiz-juve" },
    }),
  });
  if (response.ok) return true;
  const error = await response.json().catch(() => ({}));
  if (error && error.code === "duplicate_parameter") return true;
  console.error("[quiz-result] Brevo contact upsert error", response.status, error);
  return false;
}

function brevoApiKey(env) {
  return String(env.BREVO_API_KEY || "").replace(/\s+/g, "").trim();
}

function brevoPublicErrorMessage(status, error = {}) {
  const code = cleanText(error.code || "");
  const message = cleanText(error.message || "");
  const publicDetail = [code, message].filter(Boolean).join(": ");
  const detail = (code + " " + message).toLowerCase();
  if (status === 401 || detail.includes("unauthorized") || detail.includes("authentication")) {
    return "Brevo non ha accettato la chiave API: ricontrolla BREVO_API_KEY su Cloudflare.";
  }
  if (detail.includes("sender") || detail.includes("from") || detail.includes("mittente")) {
    return "Brevo non ha accettato il mittente: verifica che QUIZ_EMAIL_SENDER sia una mail mittente confermata.";
  }
  return publicDetail
    ? "Brevo " + status + ": " + publicDetail
    : "Brevo non ha accettato l'invio adesso. Controlla mittente e piano Email transazionali.";
}

function quizProfileFromScore(score) {
  const profiles = [
    {
      min: 10,
      max: 17,
      title: "Tifoso occasionale",
      text: "La Juve ti interessa, ma scegli i momenti. ICV può essere il tuo riepilogo pulito: poche cose, buone fonti, niente confusione.",
    },
    {
      min: 18,
      max: 25,
      title: "Bianconero da matchday",
      text: "Il giorno della partita cambia ritmo. Segui risultato, emozioni e notizie principali: sei dentro, ma senza vivere ogni voce di mercato come una finale.",
    },
    {
      min: 26,
      max: 33,
      title: "Sempre sul pezzo",
      text: "Hai occhio per fonti, rosa e momenti chiave. Non ti basta sapere cosa è successo: vuoi capire perché conta.",
    },
    {
      min: 34,
      max: 38,
      title: "Scout ICV",
      text: "Sei il tipo che legge la partita e pesa le notizie. Fonti, ruoli, calendario e mercato per te sono parti dello stesso quadro.",
    },
    {
      min: 39,
      max: 40,
      title: "Malato di Juve",
      text: "Vivi la Juve ogni giorno. Non segui solo le partite: segui umore, fonti, dettagli, giovani, mercato e tutto quello che può cambiare la stagione.",
    },
  ];
  return profiles.find((profile) => score >= profile.min && score <= profile.max) || profiles[0];
}

function quizResultEmailHtml(profile, score) {
  const safeTitle = escapeHtml(profile.title);
  const safeText = escapeHtml(profile.text);
  const scoreText = escapeHtml(score + "/40");
  const links = [
    ["ICV Scout", "https://ilcalciodivince.com/"],
    ["News Juventus", "https://ilcalciodivince.com/#news"],
    ["Mercato live", "https://ilcalciodivince.com/mercato.html"],
    ["Mondiali", "https://ilcalciodivince.com/mondiali.html"],
    ["Agenda Mondiali", "https://ilcalciodivince.com/agenda.html"],
    ["Instagram", "https://instagram.com/ilcalciodivince_"],
    ["TikTok", "https://www.tiktok.com/@ilcalciodivince"],
    ["X", "https://x.com/VikBrancato"],
  ];
  const linkHtml = links.map(([label, href]) => {
    return '<a href="' + escapeHtml(href) + '" style="display:block;margin:8px 0;color:#d3a536;font-weight:800;text-decoration:none">' + escapeHtml(label) + '</a>';
  }).join("");
  return [
    '<div style="margin:0;padding:24px;background:#080808;color:#f5f2ea;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:620px;margin:0 auto;background:#151515;border:1px solid rgba(211,165,54,.35);border-radius:10px;padding:28px">',
    '<p style="margin:0 0 10px;color:#d3a536;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Il Calcio di Vince</p>',
    '<h1 style="margin:0 0 12px;font-size:34px;line-height:1.05">Il tuo profilo: ' + safeTitle + '</h1>',
    '<p style="margin:0 0 18px;color:#aaa;font-size:15px;line-height:1.6">Hai chiuso il quiz con <strong style="color:#f5d479">' + scoreText + '</strong>.</p>',
    '<p style="margin:0 0 22px;color:#ddd;font-size:16px;line-height:1.65">' + safeText + '</p>',
    '<h2 style="margin:24px 0 10px;font-size:20px">Resta aggiornato sulla Juventus</h2>',
    linkHtml,
    '<p style="margin:24px 0 0;color:#777;font-size:12px;line-height:1.5">Ricevi questa mail perché hai completato il quiz ICV “Quanto sei juventino?”.</p>',
    '</div>',
    '</div>',
  ].join("");
}

function quizResultEmailText(profile, score) {
  return [
    "Il tuo profilo ICV: " + profile.title,
    "",
    "Punteggio: " + score + "/40",
    "",
    profile.text,
    "",
    "Link ICV:",
    "ICV Scout: https://ilcalciodivince.com/",
    "News Juventus: https://ilcalciodivince.com/#news",
    "Mercato live: https://ilcalciodivince.com/mercato.html",
    "Mondiali: https://ilcalciodivince.com/mondiali.html",
    "Agenda Mondiali: https://ilcalciodivince.com/agenda.html",
    "Instagram: https://instagram.com/ilcalciodivince_",
    "TikTok: https://www.tiktok.com/@ilcalciodivince",
    "X: https://x.com/VikBrancato",
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function worldCupTeamName(team, fallback) {
  return cleanText(team && (team.name || team.shortName || team.tla)) || fallback;
}

function worldCupStageLabel(stage, group) {
  const labels = {
    GROUP_STAGE: group ? "Fase a gironi - " + String(group).replace(/^GROUP_?/i, "Gruppo ") : "Fase a gironi",
    LAST_32: "Sedicesimi di finale",
    LAST_16: "Ottavi di finale",
    QUARTER_FINALS: "Quarti di finale",
    SEMI_FINALS: "Semifinale",
    THIRD_PLACE: "Finale terzo posto",
    FINAL: "Finale",
  };
  return labels[stage] || cleanText(stage || "Mondiali 2026").replace(/_/g, " ");
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = "";
  let bytes = 0;
  for (const char of String(line)) {
    const size = encoder.encode(char).length;
    if (current && bytes + size > 73) {
      parts.push(current);
      current = " " + char;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  parts.push(current);
  return parts.join("\r\n");
}

function isWorldCupMatchLive(match, now = Date.now()) {
  const liveStatuses = ["IN_PLAY", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT"];
  if (!match || ["FINISHED", "AWARDED"].includes(match.status)) return false;
  if (liveStatuses.includes(match.status)) return true;
  if (!["TIMED", "SCHEDULED"].includes(match.status)) return false;
  const kickoff = Date.parse(match.utcDate || "");
  return Number.isFinite(kickoff) && now >= kickoff && now <= kickoff + 150 * 60 * 1000;
}

function compactTeam(team) {
  return {
    id: team && team.id,
    name: team && team.name,
    shortName: team && team.shortName,
    tla: team && team.tla,
    crest: team && team.crest,
  };
}

async function enrichWorldCupLiveGoals(matches, env, request, cache, context) {
  const liveMatches = matches.filter(match => match.isLive);
  if (!liveMatches.length) return matches;

  try {
    const cachedGoals = new Map();
    const cachedFallbacks = new Map();
    await Promise.all(liveMatches.map(async match => {
      const cached = await readLiveGoalCache(match, request, cache);
      if (cached) cachedFallbacks.set(match.id, cached);
    }));

    const worldCup26Games = await fetchWorldCup26Games().catch(() => []);
    liveMatches.forEach(match => {
      const game = findWorldCup26Game(match, worldCup26Games);
      if (!game) return;
      const liveScore = worldCup26Score(game);
      const goalEvents = compactWorldCup26Goals(game);
      const sourceGoals = liveScore.home + liveScore.away;
      if (sourceGoals < worldCupExpectedGoals(match) || goalEvents.length < sourceGoals) return;
      const value = {
        source: "worldcup2026",
        scoreKey: `${liveScore.home}:${liveScore.away}`,
        liveScore,
        goalEvents,
      };
      cachedGoals.set(match.id, value);
      writeLiveGoalCache(match, value, request, cache, context);
    });

    const unresolved = liveMatches
      .filter(match => !cachedGoals.has(match.id))
      .map(match => ({ match, cached: cachedFallbacks.get(match.id) }));
    if (!unresolved.length || !env.APISPORTS_KEY) {
      return applyWorldCupLiveGoals(matches, cachedGoals, cachedFallbacks);
    }

    const headers = { "x-apisports-key": env.APISPORTS_KEY };
    const needsFixture = unresolved.filter(link => !(link.cached && link.cached.fixtureId));
    const dates = [...new Set(needsFixture.map(link => String(link.match.utcDate || "").slice(0, 10)).filter(Boolean))];
    const fixturePayloads = await Promise.all(dates.map(date => fetchJson(
      `https://v3.football.api-sports.io/fixtures?league=1&season=2026&date=${encodeURIComponent(date)}&timezone=UTC`,
      headers
    )));
    const fixtures = fixturePayloads.flatMap(payload => Array.isArray(payload.response) ? payload.response : []);
    const links = unresolved.map(link => {
      if (link.cached && link.cached.fixtureId) return { ...link, fixtureId: link.cached.fixtureId };
      const fixture = findApiSportsFixture(link.match, fixtures);
      return { ...link, fixtureId: fixture && fixture.fixture && fixture.fixture.id };
    }).filter(link => link.fixtureId);
    if (!links.length) {
      return applyWorldCupLiveGoals(matches, cachedGoals, cachedFallbacks);
    }

    const eventPayloads = await Promise.all(links.map(link => fetchJson(
      `https://v3.football.api-sports.io/fixtures/events?fixture=${encodeURIComponent(link.fixtureId)}`,
      headers
    ).catch(() => ({ response: [] }))));
    links.forEach((link, index) => {
      const events = Array.isArray(eventPayloads[index].response) ? eventPayloads[index].response : [];
      const goalEvents = compactGoalEvents(events, link.match);
      if (goalEvents.length < worldCupExpectedGoals(link.match)) return;
      const value = {
        fixtureId: link.fixtureId,
        scoreKey: worldCupScoreKey(link.match),
        goalEvents,
      };
      cachedGoals.set(link.match.id, value);
      writeLiveGoalCache(link.match, value, request, cache, context);
    });
    return applyWorldCupLiveGoals(matches, cachedGoals, cachedFallbacks);
  } catch (error) {
    console.warn("World Cup live goals unavailable", error && error.message ? error.message : error);
    return matches;
  }
}

async function fetchWorldCup26Games() {
  const worldCup26Payload = await fetchJson("https://worldcup26.ir/get/games");
  return Array.isArray(worldCup26Payload)
    ? worldCup26Payload
    : (Array.isArray(worldCup26Payload && worldCup26Payload.games)
      ? worldCup26Payload.games
      : (Array.isArray(worldCup26Payload && worldCup26Payload.data) ? worldCup26Payload.data : []));
}

function compactWorldCup26Game(game) {
  if (!game) return null;
  const liveScore = worldCup26Score(game);
  const status = worldCup26Status(game);
  return {
    source: "worldcup2026",
    sourceId: game.id || game._id || "",
    utcDate: game.local_date || "",
    status,
    isLive: status === "IN_PLAY" || status === "PAUSED",
    homeTeam: { name: cleanText(game.home_team_name_en), id: game.home_team_id || null },
    awayTeam: { name: cleanText(game.away_team_name_en), id: game.away_team_id || null },
    score: { fullTime: liveScore },
    goalEvents: compactWorldCup26Goals(game),
    timeElapsed: cleanText(game.time_elapsed),
  };
}

function worldCup26Status(game) {
  const finished = String(game && game.finished || "").toLowerCase();
  const elapsed = String(game && game.time_elapsed || "").toLowerCase();
  if (finished === "true" || elapsed === "finished" || elapsed === "ft") return "FINISHED";
  if (elapsed === "pause" || elapsed === "paused" || elapsed === "ht") return "PAUSED";
  if (/^\d+/.test(elapsed) || elapsed === "live" || elapsed === "in_play") return "IN_PLAY";
  return "TIMED";
}

function applyWorldCupLiveGoals(matches, freshGoals, cachedFallbacks) {
  return matches.map(match => {
    const value = freshGoals.get(match.id) || cachedFallbacks.get(match.id);
    if (!value) return match;
    const candidateScore = value.liveScore;
    const liveScore = candidateScore
      && candidateScore.home + candidateScore.away >= worldCupExpectedGoals(match)
      ? candidateScore
      : null;
    const score = liveScore ? {
      ...match.score,
      fullTime: {
        ...(match.score && match.score.fullTime || {}),
        home: liveScore.home,
        away: liveScore.away,
      },
    } : match.score;
    return { ...match, score, goalEvents: value.goalEvents };
  });
}

function liveGoalCacheKey(match, request) {
  const url = new URL(request.url);
  url.pathname = `/api/world-cup/live-goals/${encodeURIComponent(match.id)}`;
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}

async function readLiveGoalCache(match, request, cache) {
  if (!cache) return null;
  try {
    const response = await cache.match(liveGoalCacheKey(match, request));
    if (!response) return null;
    const value = await response.json();
    return value && Array.isArray(value.goalEvents) ? value : null;
  } catch {
    return null;
  }
}

function writeLiveGoalCache(match, value, request, cache, context) {
  if (!cache || !context || typeof context.waitUntil !== "function") return;
  const response = new Response(JSON.stringify(value), {
    headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=8, must-revalidate" },
  });
  context.waitUntil(cache.put(liveGoalCacheKey(match, request), response));
}

function worldCupScoreKey(match) {
  const score = match && match.score || {};
  const current = score.fullTime || score.regularTime || {};
  return `${current.home ?? ""}:${current.away ?? ""}`;
}

function worldCupExpectedGoals(match) {
  const score = match && match.score || {};
  const current = score.fullTime || score.regularTime || {};
  return Math.max(0, Number(current.home) || 0) + Math.max(0, Number(current.away) || 0);
}

function findWorldCup26Game(match, games) {
  return games.find(game => sameWorldCupTeam(match.homeTeam && match.homeTeam.name, game && game.home_team_name_en)
    && sameWorldCupTeam(match.awayTeam && match.awayTeam.name, game && game.away_team_name_en)) || null;
}

function worldCup26Score(game) {
  return {
    home: Math.max(0, Number(game && game.home_score) || 0),
    away: Math.max(0, Number(game && game.away_score) || 0),
  };
}

function compactWorldCup26Goals(game) {
  return [
    ...parseWorldCup26Scorers(game && game.home_scorers, "home"),
    ...parseWorldCup26Scorers(game && game.away_scorers, "away"),
  ].sort((a, b) => (a.minute + a.extra / 100) - (b.minute + b.extra / 100));
}

function parseWorldCup26Scorers(rawValue, side) {
  const raw = String(rawValue || "").trim();
  if (!raw || raw.toLowerCase() === "null") return [];
  const entries = raw.replace(/[“”]/g, '"').replace(/^\s*\{|\}\s*$/g, "").split(/\s*,\s*/);
  return entries.map(entry => {
    const clean = entry.replace(/^"+|"+$/g, "").trim();
    const match = clean.match(/^(.*?)\s+(\d+)'(?:\+(\d+)')?\s*(.*)$/);
    if (!match) return null;
    const marker = match[4] || "";
    return {
      minute: Number(match[2]) || 0,
      extra: Number(match[3]) || 0,
      player: match[1].trim() || "Marcatore da confermare",
      assist: "",
      detail: /\bog\b/i.test(marker) ? "Own Goal" : (/\(\s*p\s*\)/i.test(marker) ? "Penalty" : "Normal Goal"),
      side,
    };
  }).filter(Boolean);
}

function findApiSportsFixture(match, fixtures) {
  const kickoff = Date.parse(match.utcDate || "");
  return fixtures
    .filter(item => {
      const home = item && item.teams && item.teams.home && item.teams.home.name;
      const away = item && item.teams && item.teams.away && item.teams.away.name;
      return sameWorldCupTeam(match.homeTeam && match.homeTeam.name, home)
        && sameWorldCupTeam(match.awayTeam && match.awayTeam.name, away);
    })
    .sort((a, b) => Math.abs(Date.parse(a.fixture.date) - kickoff) - Math.abs(Date.parse(b.fixture.date) - kickoff))[0] || null;
}

function sameWorldCupTeam(left, right) {
  const aliases = {
    "bosnia herzegovina": "bosnia",
    "congo dr": "dr congo",
    "cote d ivoire": "ivory coast",
    "korea republic": "south korea",
    "usa": "united states",
  };
  const normalize = value => {
    const clean = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\b(fc|national team)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    return aliases[clean] || clean;
  };
  const a = normalize(left);
  const b = normalize(right);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

function compactGoalEvents(events, match) {
  return events.filter(event => event && event.type === "Goal" && !/missed/i.test(event.detail || ""))
    .map(event => ({
      minute: Number(event.time && event.time.elapsed) || 0,
      extra: Number(event.time && event.time.extra) || 0,
      player: event.player && event.player.name || "Marcatore da confermare",
      assist: event.assist && event.assist.name || "",
      detail: event.detail || "Normal Goal",
      side: sameWorldCupTeam(match.homeTeam && match.homeTeam.name, event.team && event.team.name) ? "home" : "away",
    }))
    .sort((a, b) => (a.minute + a.extra / 100) - (b.minute + b.extra / 100));
}

async function apiSportsProxy(path, url, env) {
  if (!env.APISPORTS_KEY) return json({ error: "APISPORTS_KEY non configurata" }, 500);
  const targetUrl = "https://v3.football.api-sports.io/" + path + url.search;
  const response = await fetch(targetUrl, { headers: { "x-apisports-key": env.APISPORTS_KEY } });
  return new Response(await response.text(), {
    status: response.status,
    headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

async function getSources(env) {
  try {
    const sources = await sb(env, "/sources?active=eq.true&order=reliability.asc,name.asc");
    return mergeDefaultSources(sources);
  } catch {
    return DEFAULT_SOURCES;
  }
}

function mergeDefaultSources(sources) {
  const rows = Array.isArray(sources) ? sources.slice() : [];
  const seen = new Set(rows.map(sourceKey));
  for (const source of DEFAULT_SOURCES) {
    const key = sourceKey(source);
    if (!seen.has(key)) {
      rows.push(source);
      seen.add(key);
    }
  }
  return rows.length ? rows : DEFAULT_SOURCES;
}

function sourceKey(source) {
  return canonicalNewsUrl(source && source.url) || canonicalSourceName(source && source.name);
}

async function sb(env, path, options = {}) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nelle variabili ambiente");
  const method = options.method || "GET";
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
  let requestBody;
  if (hasBody) {
    const normalizedBody = normalizeSupabaseBody(options.body);
    if (isEmptySupabaseBody(normalizedBody)) {
      if (/^PATCH$/i.test(method)) return [];
      throw new Error("Body JSON vuoto per " + method + " " + path);
    }
    requestBody = JSON.stringify(normalizedBody);
    if (requestBody === undefined) throw new Error("Body JSON non valido per " + method + " " + path);
  } else if (/^(POST|PATCH|PUT)$/i.test(method)) {
    throw new Error("Body JSON mancante per " + method + " " + path);
  }

  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": "Bearer " + key,
      ...(options.prefer ? { "Prefer": options.prefer } : {}),
    },
    body: requestBody,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Supabase " + response.status + " " + method + " " + path + ": " + text);
  }
  if (response.status === 204) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

function normalizeSupabaseBody(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeSupabaseBody).filter(item => item !== undefined);
  }
  if (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) {
    return Object.entries(value).reduce((acc, entry) => {
      const key = entry[0];
      const clean = normalizeSupabaseBody(entry[1]);
      if (clean !== undefined) acc[key] = clean;
      return acc;
    }, {});
  }
  return value;
}

function isEmptySupabaseBody(value) {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isEmptySupabaseRow);
  return isEmptySupabaseRow(value);
}

function isEmptySupabaseRow(value) {
  if (value === undefined) return true;
  if (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !(value instanceof Uint8Array)) return Object.keys(value).length === 0;
  return false;
}

function isSupabaseEmptyJsonError(err) {
  const msg = String(err && err.message || err || "");
  return /PGRST102|empty or invalid json|Body JSON vuoto|Body JSON non valido/i.test(msg);
}

function isSupabaseCheckConstraintError(err) {
  return /23514|violates check constraint|new row for relation .* violates check constraint/i.test(String(err && err.message || err || ""));
}

async function safeAdminRead(read, fallback) {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function hasSupabase(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

async function getOne(env, path) {
  const rows = await sb(env, path + (path.includes("?") ? "&" : "?") + "limit=1");
  if (!rows.length) throw new Error("Elemento non trovato");
  return rows[0];
}

function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) throw new Error("Configura ADMIN_TOKEN nelle variabili ambiente");
  const token = request.headers.get("X-ICV-Admin-Token") || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token !== expected) throw new Error("Token admin non valido");
}

async function readBody(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const body = {};
    for (const [key, value] of form.entries()) {
      if (key === "image") {
        body.image_file = value;
        body.filename = value && value.name;
      } else {
        body[key] = value;
      }
    }
    return body;
  }
  try { return await request.json(); } catch { return {}; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function fetchText(url) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, { headers: fetchHeadersForUrl(url) });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (!isTransientHttpStatus(response.status) || attempt === 1) break;
    await delay(300);
  }
  throw new Error("HTTP " + lastStatus);
}

function fetchHeadersForUrl(url) {
  if (isTelegramWebSource(url)) {
    return {
      "User-Agent": "Mozilla/5.0 (compatible; ICV Scout/1.0; +https://ilcalciodivince.com)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
    };
  }
  return { "User-Agent": "ICV Scout/1.0" };
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function isTransientHttpStatus(status) {
  return [429, 500, 502, 503, 504].includes(Number(status));
}

function isTransientFetchError(err) {
  const msg = String(err && err.message || err || "");
  const match = msg.match(/HTTP\s+(\d{3})/i);
  return !!match && isTransientHttpStatus(match[1]);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function transcriptApiBase(env) {
  const raw = String(env.TRANSCRIPT_API_BASE || "https://transcriptapi.com/api/v2").replace(/\/$/, "");
  return raw.endsWith("/api/v2") ? raw : raw + "/api/v2";
}

function transcriptApiKey(env) {
  return env.TRANSCRIPT_API_KEY || env.TRANSCRIPTAPI_KEY || env.TRANSCRIPTAPI_API_KEY || "";
}

function transcriptApiHeaders(env) {
  return { "Authorization": "Bearer " + transcriptApiKey(env), "Accept": "application/json" };
}

async function fetchYoutubeLatestVideos(env, channel) {
  const base = transcriptApiBase(env);
  const param = encodeURIComponent(channel);
  const urls = [
    base + "/youtube/channel/latest?channel=" + param,
    base + "/youtube/channel/videos?channel=" + param,
  ];
  let lastError;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, transcriptApiHeaders(env));
      const rows = normalizeYoutubeVideos(data);
      if (rows.length) return rows;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Nessun video trovato per " + channel);
}

async function fetchYoutubeTranscript(env, videoId) {
  const base = transcriptApiBase(env);
  const videoUrl = encodeURIComponent(youtubeVideoUrl(videoId));
  const videoParam = encodeURIComponent(videoId);
  const urls = [
    base + "/youtube/transcript?video_url=" + videoUrl,
    base + "/youtube/transcript?video_url=" + videoParam,
  ];
  let lastError;
  for (const url of urls) {
    try {
      return await fetchJson(url, transcriptApiHeaders(env));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Trascrizione non trovata");
}

function normalizeYoutubeVideos(data) {
  const rows = Array.isArray(data) ? data : (data && (data.results || data.videos || data.items || data.data)) || [];
  return Array.isArray(rows) ? rows : [];
}

function youtubeScoutChannels(env) {
  const raw = String(env.YOUTUBE_SCOUT_CHANNELS || "").trim();
  if (!raw) return DEFAULT_YOUTUBE_CHANNELS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((item, index) => ({
        name: cleanText(item.name || item.channel || item.handle || "YouTube " + (index + 1)),
        channel: cleanText(item.channel || item.handle || item.url || item.name),
      })).filter(item => item.channel);
    }
  } catch {}
  return raw.split(",").map(value => cleanText(value)).filter(Boolean).map(value => ({ name: value.replace(/^@/, ""), channel: value }));
}

function isRelevantYoutubeVideo(video) {
  const text = [videoTitle(video), video.description, video.summary].join(" ");
  return /juve|juventus|bianconer|serie a|champions|europa league|mercato|calciomercato|spalletti|comolli|vlahovic/i.test(text);
}

function youtubeVideoId(video) {
  const raw = video.video_id || video.videoId || video.id || video.youtube_id || "";
  if (/^[A-Za-z0-9_-]{8,20}$/.test(String(raw))) return String(raw);
  const url = String(video.url || video.link || video.watch_url || "");
  const match = url.match(/[?&]v=([A-Za-z0-9_-]{8,20})|youtu\.be\/([A-Za-z0-9_-]{8,20})|\/shorts\/([A-Za-z0-9_-]{8,20})/);
  return match ? (match[1] || match[2] || match[3]) : "";
}

function youtubeVideoUrl(videoId) {
  return "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId);
}

function videoTitle(video) {
  return cleanText(video.title || video.name || video.video_title || "Video YouTube");
}

function normalizeTranscriptText(data) {
  const transcript = data && (data.transcript || data.text || data.content || data.data || data.segments || data.items);
  if (typeof transcript === "string") return cleanText(transcript);
  if (Array.isArray(transcript)) {
    return cleanText(transcript.map(item => typeof item === "string" ? item : (item.text || item.content || item.caption || "")).join(" "));
  }
  if (transcript && typeof transcript === "object") return normalizeTranscriptText(transcript);
  return cleanText(JSON.stringify(data || ""));
}

function hasUsableYoutubeTranscript(text) {
  return text.length > 280 && /juve|juventus|bianconer|spalletti|comolli|vlahovic|mercato|calciomercato/i.test(text);
}

function isRelevantNewsItem(title, description, source) {
  const text = normalizeTopicKey([title, description].join(" "));
  if (isBlockedNewsTopic(text)) return false;
  if (isJuventusNewsText(text)) return true;
  if ((source && source.category) === "calciomercato" && isJuventusMarketText(text)) return true;
  return false;
}

function isBlockedNewsTopic(text) {
  return BLOCKED_NEWS_TOPIC_PATTERNS.some(pattern => pattern.test(text));
}

function isJuventusNewsText(text) {
  return /juve|juventus|bianconer|spalletti|comolli|vlahovic|dusan|bremer|cambiaso|sorloth|sorlot|kolo muani|openda|locatelli|conceicao|douglas luiz|kenan|yildiz|dibu martinez|vicario|di gregorio|perin|kalulu|koopmeiners|thuram|gatti|milik/.test(text);
}

function isJuventusMarketText(text) {
  return isJuventusNewsText(text) && /mercato|calciomercato|rinnovo|cessione|trattativa|prestito|offerta|contatti|priorita|ingaggio|porta|attacco|difesa/.test(text);
}

function youtubeDraftTitle(video, transcriptText) {
  return youtubeEditorialAngle(video, transcriptText).title;
}

function youtubeDraftBody(video, transcriptText, channelName) {
  const title = videoTitle(video);
  const angle = youtubeEditorialAngle(video, transcriptText);
  const evidence = youtubeEditorialEvidence(transcriptText).slice(0, 2);
  const source = channelName ? " da " + channelName : "";
  const body = [
    "Secondo quanto emerge dal video" + source + ", " + angle.lead,
    evidence.length ? "Il passaggio chiave: " + evidence.join(" ") : "",
    "La bozza resta da verificare prima della pubblicazione. Fonte video: " + title,
  ].filter(Boolean).join(" ");
  return cleanText(body).slice(0, 760);
}

function youtubeEditorialAngle(video, transcriptText) {
  const text = normalizeTopicKey([videoTitle(video), transcriptText.slice(0, 1800)].join(" "));
  const hasVlahovic = /vlahovic|vlawic|blaovic|duan|dusan/.test(text);
  const hasPostVlahovic = /post vlahovic|dopo vlahovic|senza vlahovic|sostituto/.test(text);
  const hasSorloth = /sorloth|sorlot|solot/.test(text);
  const hasKolo = /kolo muani|colomin|muani/.test(text);
  const hasOpenda = /openda/.test(text);
  const hasPerin = /perin|vice portiere|secondo portiere/.test(text);
  const hasDodo = /\bdodo\b|fiorentina/.test(text);
  const hasComolli = /comolli/.test(text);
  const hasSpalletti = /spalletti/.test(text);
  const hasEuropaLeague = /europa league/.test(text);
  const hasBudget = /ingaggio|stipendio|cifra|disponibilita|sacrifici|accordo|rinnovo/.test(text);
  const hasDelay = /ritardo|anticipare|subire|garanzie|programmazione|sesto posto/.test(text);
  const hasSales = /fare soldi|incassare|cessione|uscita|vendere|liberarsi|sacrifici/.test(text);

  if (hasVlahovic && (hasSorloth || hasKolo || hasOpenda || hasPostVlahovic)) {
    const names = [hasSorloth ? "Sorloth" : "", hasKolo ? "Kolo Muani" : "", hasOpenda ? "Openda" : ""].filter(Boolean).slice(0, 2).join(" e ");
    return {
      title: names ? "Juve, dopo Vlahovic prende quota il dossier " + names : "Juve, dopo Vlahovic si apre il dossier attacco",
      lead: names ? "la Juventus sta ragionando sul dopo Vlahovic e il nome di " + names + " resta tra i profili da monitorare." : "la Juventus sta ragionando sul dopo Vlahovic, con il reparto offensivo al centro delle valutazioni di mercato.",
    };
  }
  if (hasVlahovic && hasBudget) {
    return {
      title: "Juve-Vlahovic, il nodo economico spinge verso l'addio",
      lead: "il futuro di Vlahovic resta legato soprattutto al nodo economico, tra rinnovo complicato, ingaggio e possibile separazione.",
    };
  }
  if (hasVlahovic) {
    return {
      title: "Juve-Vlahovic, futuro sempre piu lontano",
      lead: "il futuro di Vlahovic continua a essere uno dei temi centrali della giornata bianconera.",
    };
  }
  if (hasPerin) {
    return {
      title: "Juve, nodo Perin: possibile intervento sul vice",
      lead: "la situazione di Perin puo incidere sulle mosse bianconere tra porta, gerarchie interne e possibili interventi sul mercato.",
    };
  }
  if (hasDodo && hasSales) {
    return {
      title: "Juve, cessioni e incassi restano centrali nel mercato",
      lead: "la necessita di fare cassa resta un tema sensibile per la Juventus, con uscite e opportunita da monitorare.",
    };
  }
  if (hasDelay) {
    return {
      title: "Juve, mercato gia sotto pressione: serve accelerare",
      lead: "la programmazione bianconera viene indicata come un punto da seguire con attenzione, tra ritardi, garanzie tecniche e necessita di anticipare le mosse.",
    };
  }
  if (hasComolli || hasSpalletti) {
    return {
      title: "Juve, il confronto tecnico guida le mosse di mercato",
      lead: "la linea tecnica e dirigenziale della Juventus resta al centro delle prossime mosse, con mercato e progetto sportivo da riallineare.",
    };
  }
  if (hasEuropaLeague || hasBudget) {
    return {
      title: "Juve, mercato condizionato da budget ed Europa League",
      lead: "la prossima sessione bianconera potrebbe essere condizionata da budget, appeal europeo e necessita di fare scelte mirate.",
    };
  }
  const topic = cleanYoutubeTopic(extractPlayer(videoTitle(video) + " " + transcriptText.slice(0, 500)));
  return {
    title: topic ? "Juve, focus su " + topic : "Juve, spunto mercato da verificare",
    lead: "emerge uno spunto Juventus da trattare con cautela editoriale e da verificare con altre fonti prima della pubblicazione.",
  };
}

function youtubeEditorialEvidence(transcriptText) {
  return transcriptText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(cleanText)
    .filter(sentence => sentence.length >= 55 && sentence.length <= 260)
    .map(sentence => ({ sentence, score: youtubeSentenceScore(sentence) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.sentence);
}

function youtubeSentenceScore(sentence) {
  let score = 0;
  if (/buonasera|stavo dicendo|sto guardando|allenamento|rigori|riccione|ci si porta avanti/i.test(sentence)) score -= 5;
  if (/juve|juventus|bianconer/i.test(sentence)) score += 3;
  if (/mercato|calciomercato|cessione|rinnovo|trattativa|accordo|offerta|ingaggio/i.test(sentence)) score += 3;
  if (/spalletti|comolli|vlahovic|alisson|icardi|bremer|kolo muani|douglas luiz|conceicao|locatelli|perin|openda|cambiaso|sorloth|dodo/i.test(sentence)) score += 2;
  if (/ritardo|anticipare|subire|garanzie|fare soldi|incassare|uscita|vendere|sacrifici|vice/i.test(sentence)) score += 2;
  if (/secondo|notizia|conferma|situazione|scenario|futuro|rottura/i.test(sentence)) score += 1;
  if (sentence.length < 45 || sentence.length > 320) score -= 2;
  return score;
}

function cleanYoutubeTopic(topic) {
  const value = cleanText(topic);
  if (!value || isBadYoutubeTopic(value)) return "";
  return value;
}

function isBadYoutubeTopic(value) {
  return /^(siamo|buonasera|buongiorno|adesso|oggi|ieri|domani|juve|juventus|mercato|calciomercato|fonte|video|tema|focus|luca|romeo|gianni|toselli|agresti|balzarini)$/i.test(cleanText(value));
}

async function fetchSourceItems(source) {
  const text = await fetchText(source.url);
  if (isTelegramWebSource(source.url)) return parseTelegramWeb(text, source);
  return parseRss(text);
}

function isTelegramWebSource(url) {
  return /:\/\/t\.me\/s\//i.test(String(url || ""));
}

function itemScanLimitForSource(source) {
  if (isTelegramWebSource(source && source.url)) return 32;
  return 18;
}

function parseTelegramWeb(html, source) {
  const chunks = html.match(/<div class="tgme_widget_message[^\"]*"[^>]*data-post=[\s\S]*?(?=<div class="tgme_widget_message[^\"]*"[^>]*data-post=|<\/section>|<\/body>)/gi) || [];
  return chunks.map(chunk => {
    const textMatch = chunk.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const text = cleanTelegramText(textMatch ? textMatch[1] : "");
    const editorial = telegramEditorialText(text);
    const link = canonicalTelegramPostUrl(tagAttr(chunk, "data-post"), source.url);
    const date = telegramDate(chunk);
    return {
      title: editorial.title,
      link,
      description: editorial.body,
      pubDate: date,
    };
  }).filter(item => item.title);
}

function tagAttr(html, attrName) {
  const re = new RegExp("\\s" + attrName + "=[\"']([^\"']+)[\"']", "i");
  const match = html.match(re);
  return match ? decodeXml(match[1]) : "";
}

function telegramDate(html) {
  const time = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (time) return decodeXml(time[1]);
  const dateLink = html.match(/class=["'][^"']*tgme_widget_message_date[^"']*["'][\s\S]*?<a[^>]+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
  return dateLink ? cleanText(dateLink[1]) : "";
}

function canonicalTelegramPostUrl(post, fallbackUrl) {
  const value = String(post || "").replace(/^@/, "").trim();
  if (value && value.includes("/")) return "https://t.me/" + value;
  return fallbackUrl || "";
}

function cleanTelegramText(value) {
  return cleanText(String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<a[^>]+href=["'][^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, "$1")
  )
    .replace(/^RT\s+@?FabrizioRomano:\s*/i, "")
    .replace(/\s*[-—]\s*Fabrizio Romano\s*\(@FabrizioRomano\).*$/i, "")
    .replace(/\s*(YouTube|X \(formerly Twitter\)|Twitter)\s+.*$/i, "")
    .replace(/[🚨⚪⚫🔵🌎🔃🎥📺🎬🔗❤👍🔥😁🤩✍🙏🤔⚡👌😐👀🇮🇹🇦🇹]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function telegramTitle(text) {
  const clean = cleanText(text);
  if (!clean) return "";
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return firstSentence.length > 140 ? firstSentence.slice(0, 137).trim() + "..." : firstSentence;
}

function telegramEditorialText(text) {
  const clean = cleanTelegramText(text);
  const topic = normalizeTopicKey(clean);

  if (/juventus.*dibu martinez|dibu martinez.*juventus/.test(topic)) {
    return {
      title: "Juve, Dibu Martinez e la priorita per la porta",
      body: "Secondo Fabrizio Romano, la Juventus considera Dibu Martinez una priorita per la porta dopo lo stop alla pista Alisson. Sono partiti i contatti per capire prezzo e dettagli contrattuali; resta sullo sfondo anche Vicario.",
    };
  }

  if (/juve.*sorloth|sorloth.*juve|sorloth.*juventus/.test(topic)) {
    return {
      title: "Juve, Sorloth resta un nome caldo per l'attacco",
      body: "Secondo Fabrizio Romano, Sorloth resta un profilo da seguire per l'attacco bianconero. La Juventus continua a monitorare il mercato offensivo in vista delle prossime mosse.",
    };
  }

  if (/carnevali.*(?:ceo|chief executive|comolli)|(?:ceo|chief executive|comolli).*carnevali/.test(topic)) {
    return {
      title: "Juventus, Carnevali scelto come nuovo amministratore delegato",
      body: "Secondo Fabrizio Romano, il piano della Juventus e definito: Giovanni Carnevali e destinato a diventare il nuovo amministratore delegato al posto di Damien Comolli.",
    };
  }

  if (/juventus|juve/.test(topic)) {
    const translated = translateTelegramJuventusText(clean);
    if (hasUntranslatedEnglish(translated)) return { title: "", body: "" };
    return {
      title: telegramTitle(translated),
      body: translated.slice(0, 500),
    };
  }

  return { title: "", body: "" };
}

function translateTelegramJuventusText(text) {
  return cleanText(text)
    .replace(/\bJuventus want\b/gi, "La Juventus vuole")
    .replace(/\bJuve want\b/gi, "La Juve vuole")
    .replace(/\bas priority target\b/gi, "come obiettivo prioritario")
    .replace(/\bfor GK position\b/gi, "per la porta")
    .replace(/\bafter Alisson deal off\b/gi, "dopo lo stop alla pista Alisson")
    .replace(/\bTalks have started to ask about price and contract details\b/gi, "Sono iniziati i contatti per capire prezzo e dettagli contrattuali")
    .replace(/\bhigh salary but Juve keen to explore move\b/gi, "ingaggio alto, ma la Juve vuole esplorare l'operazione")
    .replace(/\bAnother option remains Spurs GK Vicario\b/gi, "Resta tra le opzioni anche Vicario del Tottenham");
}

function hasUntranslatedEnglish(value) {
  return /\b(?:the|with|after|before|from|into|will|would|have|has|had|want|wants|wanted|talks|deal|agreement|confirmed|expected|set to|new ceo|replace|join|leave|move|club|player|sign|signed|signing)\b/i.test(cleanText(value));
}

function parseRss(xml) {
  const chunks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return chunks.map(chunk => {
    const description = decodeXml(tag(chunk, "description"));
    const content = decodeXml(tag(chunk, "content:encoded"));
    return {
      title: decodeXml(tag(chunk, "title")),
      link: decodeXml(tag(chunk, "link")),
      description: description || content,
      pubDate: decodeXml(tag(chunk, "pubDate")),
      source: decodeXml(tag(chunk, "source")),
    };
  }).filter(item => item.title);
}

function tag(xml, name) {
  const match = xml.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i"));
  return match ? match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "") : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function cleanText(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanNewsDescription(description, sourceName = "", title = "") {
  let text = cleanText(description || title);
  const source = cleanText(sourceName);
  text = cleanText(text
    .replace(/\s*[-–—]\s*Juventus Football Club\s*-\s*Sito Ufficiale\s*$/i, "")
    .replace(/\s*[-–—]\s*Juventus Football Club\s*$/i, "")
    .replace(/\s*[-–—]\s*Sito Ufficiale\s*$/i, "")
    .replace(/\s+Juventus Football Club\s*-\s*Sito Ufficiale\s*$/i, "")
    .replace(/\s+Juventus Football Club\s*$/i, "")
    .replace(/\s+Sito Ufficiale\s*$/i, "")
    .replace(/^Juventus Football Club\s*-\s*Sito Ufficiale$/i, "")
    .replace(/^Juventus Football Club$/i, "")
    .replace(/^Sito Ufficiale$/i, ""));
  if (source) {
    text = text.replace(new RegExp("\\s*[-–—]\\s*" + escapeRegExp(source) + "\\s*$", "i"), "");
    text = text.replace(new RegExp("\\s+" + escapeRegExp(source) + "\\s*$", "i"), "");
  }
  return cleanText(text.replace(/\s*[-–—:·]\s*$/i, ""));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGoogleTitle(title) {
  const clean = cleanText(title);
  const parts = clean.match(/^(.+?)\s+-\s+([^-]{3,80})$/);
  return { title: parts ? parts[1].trim() : clean, source: parts ? parts[2].trim() : "" };
}

async function digest(text) {
  const data = new TextEncoder().encode(text.toLowerCase().trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function reliabilityForSource(source, url) {
  const s = (source + " " + url).toLowerCase();
  if (s.includes("juventus.com") || s.includes("legaseriea")) return "official";
  if (s.includes("sky") || s.includes("di marzio") || s.includes("romano") || s.includes("agresti") || s.includes("gazzetta")) return "trusted";
  if (s.includes("google")) return "aggregator";
  return "rumor";
}

function statusFromReliability(reliability) {
  if (reliability === "official") return "Ufficiale";
  if (reliability === "trusted") return "Confermato";
  if (reliability === "aggregator") return "Da verificare";
  if (reliability === "blacklist") return "Ignorata";
  return "Rumor";
}

function aggregateMarketItems(rows) {
  const byTopic = new Map();
  for (const row of rows || []) {
    if (isIgnoredMarketSignal(row)) continue;
    const topic = marketTopicName(row);
    const key = normalizeTopicKey(topic);
    if (!key) continue;
    const existing = byTopic.get(key);
    const sourceName = cleanText(row.source_name || "");
    if (!existing) {
      byTopic.set(key, {
        ...row,
        player_name: topic,
        source_name: sourceName,
        source_count: splitSourceNames(sourceName).length,
        related_count: 1,
      });
      continue;
    }
    const mergedSources = mergeSourceNames(existing.source_name, sourceName);
    existing.source_name = mergedSources;
    existing.source_count = splitSourceNames(mergedSources).length;
    existing.related_count = Number(existing.related_count || 1) + 1;
    existing.reliability = bestReliability(existing.reliability, row.reliability);
    existing.status = mergedMarketStatus(existing.status, row.status, existing.reliability);
    existing.source_url = existing.source_url || row.source_url;
    if (new Date(row.updated_at || 0) > new Date(existing.updated_at || 0)) {
      existing.note = row.note || existing.note;
      existing.updated_at = row.updated_at;
    }
  }
  return Array.from(byTopic.values()).sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

function marketTopicName(row) {
  const name = cleanText(row && row.player_name);
  const text = cleanText([name, row && row.note, row && row.source_name].join(" "));
  const direct = [
    ["Sorloth", /s[øo]rloth|sorlot|solot/i],
    ["Kolo Muani", /kolo\s+muani|muani/i],
    ["Openda", /\bopenda\b/i],
    ["Goretzka", /\bgoretzka\b/i],
    ["Dibu Martinez", /\bdibu\s+martinez\b|\bjuve\s+su\s+martinez\b|\bmartinez\b.*\b(porta|portiere|juve|juventus)\b/i],
    ["Kessie", /\bkessi(?:e|é)?\b/i],
    ["Brahim Diaz", /\bbrahim\s+diaz\b/i],
    ["Jonathan David", /\bjonathan\s+david\b|\bdavid\b/i],
    ["Maignan", /\bmaignan\b/i],
    ["Alisson-Juve", /\balisson\b/i],
    ["Icardi", /\bicardi\b/i],
    ["Robertson", /\brobertson\b/i],
    ["Vlahovic", /\bvlahovic\b|vlawic|blaovic|du[sc]an/i],
    ["Bremer", /\bbremer\b/i],
    ["Cambiaso", /\bcambiaso\b/i],
    ["Douglas Luiz", /douglas\s+luiz/i],
    ["Nico Gonzalez", /nico\s+gonzalez/i],
    ["Comolli", /\bcomolli\b/i],
    ["Spalletti", /\bspalletti\b/i],
    ["Locatelli", /\blocatelli\b/i],
    ["Conceicao", /concei[cç]ao/i],
  ];
  for (const [topic, pattern] of direct) {
    if (pattern.test(name)) return topic;
  }
  for (const [topic, pattern] of direct) {
    if (pattern.test(text)) return topic;
  }
  if (/youtube\s+scout/i.test(name) && /post\s+vlahovic|dopo\s+vlahovic|attacco|s[øo]rloth|sorlot|solot/i.test(text)) return "Sorloth";
  if (/mercato\s+juve|chi\s+resta|chi\s+parte|punto\s+mercato/i.test(text)) return "Punto mercato";
  const extracted = extractPlayer(text);
  return isBadMarketTopic(name) ? (extracted || "Mercato Juve") : (name || extracted || "Mercato Juve");
}

function isIgnoredMarketSignal(row) {
  const name = cleanText(row && row.player_name);
  const text = cleanText([name, row && row.note, row && row.source_name].join(" ")).toLowerCase();
  const createdAt = new Date(row && row.created_at || 0).getTime();
  if (createdAt && Date.now() - createdAt > 72 * 3600000) return true;
  if (/^(pap|papa|marzio|di marzio|luca toselli|romeo agresti|gianni balzarini)$/i.test(name)) return true;
  if (/youtube/.test(text) && isBadMarketTopic(name)) return true;
  if (/youtube scout:/.test(text)) return true;
  if (/maradona|ferlaino|salas|cristiano ronaldo alla juventus sfumo|cristiano ronaldo alla juventus sfumò/.test(text)) return true;
  return false;
}

function isBadMarketTopic(value) {
  return /^(youtube\s+)?scout$|^marzio$|^di\s+marzio$|^dalla\s+sicilia$|^siamo$|^buonasera$|^buongiorno$|^adesso$|^oggi$|^perch$|^pap$|^papa$|^inter$|^milan$|^roma$|^napoli$|^udinese$|^solet$|^atta$|^greenwood$|^luca\s+toselli$|^romeo\s+agresti$|^gianni\s+balzarini$/i.test(cleanText(value));
}

function normalizeTopicKey(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitSourceNames(value) {
  const seen = new Set();
  return cleanText(value)
    .split(/\s*,\s*/)
    .map(source => source.trim())
    .filter(Boolean)
    .filter(source => {
      const key = source.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeSourceNames(...values) {
  return splitSourceNames(values.filter(Boolean).join(", ")).slice(0, 5).join(", ");
}

function bestReliability(...values) {
  const rank = { official: 4, trusted: 3, aggregator: 2, rumor: 1, blacklist: -1 };
  return values.filter(Boolean).sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || "rumor";
}

function mergedMarketStatus(oldStatus, nextStatus, reliability) {
  const text = [oldStatus, nextStatus].join(" ").toLowerCase();
  if (/ufficial/.test(text) || reliability === "official") return "ufficiale";
  if (/rumor|verificare/.test(text) || reliability === "aggregator" || reliability === "rumor") return "da verificare";
  return "monitorato";
}

function isOfficialSource(source, sourceName = "", url = "") {
  return matchesAnySourcePattern(sourceText(source, sourceName, url), OFFICIAL_SOURCE_PATTERNS);
}

function isTrustedSource(source, sourceName = "", url = "") {
  return matchesAnySourcePattern(sourceText(source, sourceName, url), TRUSTED_SOURCE_PATTERNS);
}

function isAutoPublishTrustedSource(env, source, sourceName = "", url = "") {
  const envPatterns = String(env && env.NEWS_TRUSTED_AUTOPUBLISH || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return matchesAnySourcePattern(sourceText(source, sourceName, url), AUTO_PUBLISH_TRUSTED_SOURCE_PATTERNS.concat(envPatterns));
}

function shouldAutoPublishCandidate(env, source, candidate) {
  if (!candidate) return false;
  if (candidate.reliability === "official" && isOfficialSource(source, candidate.sourceName, candidate.sourceUrl)) return true;
  return candidate.reliability === "trusted" && isAutoPublishTrustedSource(env, source, candidate.sourceName, candidate.sourceUrl);
}

function sourceTier(env, source, sourceName = "", url = "") {
  const explicit = String(source && source.reliability || "").toLowerCase();
  if (isBlacklistedSource(env, source, sourceName, url)) return "blacklist";
  if (explicit === "official" && isOfficialSource(source, sourceName, url)) return "official";
  if (isOfficialSource(source, sourceName, url)) return "official";
  if (explicit === "trusted" || isTrustedSource(source, sourceName, url)) return "trusted";
  if (explicit === "aggregator") return "aggregator";
  if (explicit === "rumor") return "rumor";
  return reliabilityForSource(sourceName || source && source.name, url || source && source.url);
}

function reliabilityForSourceTier(tier) {
  if (tier === "blacklist") return "blacklist";
  if (tier === "official") return "official";
  if (tier === "trusted") return "trusted";
  if (tier === "aggregator") return "aggregator";
  return "rumor";
}

function reviewStatusForReliability(reliability, trustedConfirmation) {
  if (reliability === "official") return "ready";
  if (reliability === "trusted" && trustedConfirmation) return "ready";
  return "needs_review";
}

function isBlacklistedSource(env, source, sourceName = "", url = "") {
  if (String(source && source.reliability || "").toLowerCase() === "blacklist") return true;
  const patterns = String(env && env.NEWS_BLACKLIST || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return patterns.length ? matchesAnySourcePattern(sourceText(source, sourceName, url), patterns) : false;
}

function sourceText(source, sourceName = "", url = "") {
  return safeDecodeURIComponent([source && source.name, source && source.url, sourceName, url].filter(Boolean).join(" ")).toLowerCase();
}

function matchesAnySourcePattern(text, patterns) {
  return patterns.some(pattern => text.includes(pattern));
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

async function findTrustedConfirmation(env, candidate) {
  const rows = await sb(env, "/news_drafts?order=created_at.desc&select=id,title,source_name,source_url,reliability,review_status,created_at&limit=80");
  return findTrustedConfirmationInRows(rows, candidate);
}

function findTrustedConfirmationInRows(rows, candidate) {
  const similar = findSimilarRow(
    rows.filter(row =>
      row.reliability &&
      row.reliability !== "blacklist" &&
      row.reliability !== "aggregator" &&
      row.source_name !== candidate.sourceName
    ),
    candidate,
    { urlField: "source_url" }
  );
  if (!similar) return null;
  return {
    draft_id: similar.id,
    source_name: similar.source_name,
    reliability: similar.reliability,
  };
}

async function findExistingNews(env, candidate) {
  const exact = await findExactNews(env, candidate);
  if (exact) return exact;

  const recent = await sb(env, "/news?order=created_at.desc&select=id,title,body,source,source_url,reliability,editorial_status,urgency&limit=80");
  return findSimilarRow(recent, candidate, { urlField: "source_url" });
}

async function recentNewsRows(env) {
  return sb(env, "/news?order=created_at.desc&select=id,title,body,category,source,source_url,reliability,editorial_status,urgency,visible&limit=120");
}

async function recentDraftRows(env) {
  return sb(env, "/news_drafts?order=created_at.desc&select=id,title,body,category,urgency,source_name,source_url,reliability,editorial_status,review_status,content_hash&limit=160");
}

async function cleanupFabrizioRows(env, recentNews, recentDrafts) {
  let updated = 0;
  let hidden = 0;
  let discarded = 0;
  const errors = [];

  for (const row of (recentNews || []).filter(row => isFabrizioSourceName(row.source)).slice(0, 8)) {
    try {
      const fixed = existingFabrizioEditorial(row);
      const patch = {};
      if (fixed) {
        if (fixed.title && fixed.title !== row.title) patch.title = fixed.title;
        if (fixed.body && fixed.body !== row.body) patch.body = fixed.body;
      } else if (row.visible !== false) {
        patch.visible = false;
      }
      if (!Object.keys(patch).length) continue;
      await sb(env, "/news?id=eq." + encodeURIComponent(row.id), {
        method: "PATCH",
        body: patch,
      });
      Object.assign(row, patch);
      updated++;
      if (patch.visible === false) hidden++;
    } catch (err) {
      errors.push({ source: row.source || "Fabrizio Romano", error: err.message || "Errore pulizia news Fabrizio" });
    }
  }

  for (const row of (recentDrafts || []).filter(row => isFabrizioSourceName(row.source_name) && row.review_status !== "approved" && row.review_status !== "discarded").slice(0, 8)) {
    try {
      const fixed = existingFabrizioEditorial(row);
      const patch = { updated_at: new Date().toISOString() };
      if (fixed) {
        if (fixed.title && fixed.title !== row.title) patch.title = fixed.title;
        if (fixed.body && fixed.body !== row.body) patch.body = fixed.body;
      } else {
        patch.review_status = "discarded";
      }
      if (Object.keys(patch).length === 1) continue;
      const rows = await sb(env, "/news_drafts?id=eq." + encodeURIComponent(row.id), {
        method: "PATCH",
        body: patch,
        prefer: "return=representation",
      });
      Object.assign(row, rows[0] || patch);
      updated++;
      if (patch.review_status === "discarded") discarded++;
    } catch (err) {
      errors.push({ source: row.source_name || "Fabrizio Romano", error: err.message || "Errore pulizia bozza Fabrizio" });
    }
  }

  return { updated, hidden, discarded, errors };
}

function existingFabrizioEditorial(row) {
  const text = cleanTelegramText([row && row.title, row && row.body].join(" "));
  const editorial = telegramEditorialText(text);
  if (!isRelevantNewsItem(editorial.title, editorial.body, { category: (row && row.category) || "calciomercato" })) return null;
  return editorial.title && editorial.body ? editorial : null;
}

function findExistingNewsInRows(rows, candidate) {
  const exact = findExactNewsInRows(rows, candidate);
  return exact || findSimilarRow(rows, candidate, { urlField: "source_url" });
}

function findExactNewsInRows(rows, candidate) {
  const canonicalUrl = canonicalNewsUrl(candidate.sourceUrl);
  if (candidate.sourceUrl) {
    const byUrl = rows.find(row => row.source_url === candidate.sourceUrl);
    if (byUrl) return byUrl;
  }
  if (canonicalUrl) {
    const byCanonicalUrl = rows.find(row => canonicalNewsUrl(row.source_url) === canonicalUrl);
    if (byCanonicalUrl) return byCanonicalUrl;
  }
  return rows.find(row => row.title === candidate.title && row.source === (candidate.sourceName || "")) || null;
}

async function findExactNews(env, candidate) {
  const canonicalUrl = canonicalNewsUrl(candidate.sourceUrl);
  if (candidate.sourceUrl) {
    const rows = await sb(env, "/news?source_url=eq." + encodeURIComponent(candidate.sourceUrl) + "&select=id,title,body,source,source_url,reliability,editorial_status,urgency&limit=1");
    if (rows.length) return rows[0];
  }

  if (canonicalUrl) {
    const recentByUrl = await sb(env, "/news?order=created_at.desc&select=id,title,body,source,source_url,reliability,editorial_status,urgency&limit=80");
    const byCanonicalUrl = recentByUrl.find(row => canonicalNewsUrl(row.source_url) === canonicalUrl);
    if (byCanonicalUrl) return byCanonicalUrl;
  }

  const sameTitleSource = await sb(
    env,
    "/news?title=eq." + encodeURIComponent(candidate.title) +
    "&source=eq." + encodeURIComponent(candidate.sourceName || "") +
    "&select=id,title,body,source,source_url,reliability,editorial_status,urgency&limit=1"
  );
  return sameTitleSource[0] || null;
}

async function findExistingDraft(env, candidate, hash) {
  const byHash = await sb(env, "/news_drafts?content_hash=eq." + encodeURIComponent(hash) + "&select=id,title,body,category,urgency,source_name,source_url,reliability,editorial_status,review_status&limit=1");
  if (byHash.length) return byHash[0];

  const recent = await sb(env, "/news_drafts?order=created_at.desc&select=id,title,body,category,urgency,source_name,source_url,reliability,editorial_status,review_status&limit=80");
  return findSimilarRow(recent, candidate, { urlField: "source_url" });
}

function findExistingDraftInRows(rows, candidate, hash) {
  const byHash = rows.find(row => row.content_hash && row.content_hash === hash);
  return byHash || findSimilarRow(rows, candidate, { urlField: "source_url" });
}

function findSimilarRow(rows, candidate, fields) {
  const candidateTitle = canonicalNewsTitle(candidate.title);
  const candidateUrl = canonicalNewsUrl(candidate.sourceUrl);
  const candidateTokens = titleTokens(candidateTitle);

  for (const row of rows || []) {
    if (candidateUrl && canonicalNewsUrl(row[fields.urlField]) === candidateUrl) return row;

    const rowTitle = canonicalNewsTitle(row.title);
    if (rowTitle && rowTitle === candidateTitle) return row;

    const rowTokens = titleTokens(rowTitle);
    if (titleSimilarity(candidateTokens, rowTokens) >= 0.72) return row;
  }

  return null;
}

async function updateExistingNewsFromCandidate(env, existing, candidate) {
  if (!existing || !existing.id) return false;
  const patch = {};

  if (candidate.sourceUrl && !existing.source_url) patch.source_url = candidate.sourceUrl;
  if (isFabrizioCandidate(candidate) && candidate.title && candidate.title !== existing.title) patch.title = candidate.title;
  if (isFabrizioCandidate(candidate) && candidate.body && candidate.body !== existing.body) patch.body = candidate.body;
  if (!patch.body && candidate.body && candidate.body.length > String(existing.body || "").length) patch.body = candidate.body;
  if (priorityForUrgency(candidate.urgency) > priorityForUrgency(existing.urgency)) patch.urgency = normalizeNewsUrgencyForDb(candidate.urgency);
  const mergedSource = mergeSourceNames(existing.source, candidate.sourceName);
  if (mergedSource !== cleanText(existing.source || "")) patch.source = mergedSource;
  if (priorityForReliability(candidate.reliability) > priorityForReliability(existing.reliability)) {
    patch.reliability = candidate.reliability;
    patch.editorial_status = candidate.editorialStatus;
  }

  if (!Object.keys(patch).length) return false;
  await sb(env, "/news?id=eq." + encodeURIComponent(existing.id), {
    method: "PATCH",
    body: patch,
  });
  return true;
}

function isFabrizioCandidate(candidate) {
  return isFabrizioSourceName(candidate && candidate.sourceName);
}

function isFabrizioSourceName(value) {
  return /fabrizio\s+romano/i.test(cleanText(value || ""));
}

async function promoteExistingDraftFromCandidate(env, existing, candidate, recentDrafts = null) {
  if (!existing || !existing.id) return existing;

  const confirmation = candidate.reliability === "trusted"
    ? (Array.isArray(recentDrafts) ? findTrustedConfirmationInRows(recentDrafts, candidate) : await findTrustedConfirmation(env, candidate))
    : null;
  const patch = {
    updated_at: new Date().toISOString(),
  };

  if (isFabrizioCandidate(candidate) && candidate.title && candidate.title !== existing.title) patch.title = candidate.title;
  if (isFabrizioCandidate(candidate) && candidate.body && candidate.body !== existing.body) patch.body = candidate.body;
  if (!patch.body && candidate.body && candidate.body.length > String(existing.body || "").length) patch.body = candidate.body;
  if (priorityForUrgency(candidate.urgency) > priorityForUrgency(existing.urgency)) patch.urgency = candidate.urgency;

  if (priorityForReliability(candidate.reliability) > priorityForReliability(existing.reliability)) {
    patch.source_name = candidate.sourceName;
    patch.source_url = candidate.sourceUrl;
    patch.reliability = candidate.reliability;
    patch.editorial_status = candidate.editorialStatus;
  }

  if (candidate.reliability === "official") {
    patch.review_status = "ready";
  } else if (candidate.reliability === "trusted" && confirmation && existing.review_status !== "ready") {
    patch.review_status = "ready";
    patch.editorial_note = "Confermata da almeno due fonti affidabili: " + confirmation.source_name + " e " + candidate.sourceName;
  }

  if (Object.keys(patch).length === 1) return existing;
  const rows = await sb(env, "/news_drafts?id=eq." + encodeURIComponent(existing.id), {
    method: "PATCH",
    body: patch,
    prefer: "return=representation",
  });
  return rows[0] || { ...existing, ...patch };
}

function dedupeKey(title, sourceName, sourceUrl) {
  return [canonicalNewsTitle(title), canonicalSourceName(sourceName), canonicalNewsUrl(sourceUrl)].filter(Boolean).join("|");
}

function canonicalNewsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref"].forEach(key => url.searchParams.delete(key));
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "");
    return (url.hostname.replace(/^www\./, "").toLowerCase() + path + (url.search ? url.search : "")).toLowerCase();
  } catch {
    return cleanText(value).toLowerCase().replace(/\/+$/, "");
  }
}

function canonicalSourceName(value) {
  return cleanText(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(www\.)?juventus(\.com)?\b/g, "juve")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalNewsTitle(value) {
  return cleanText(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bjuventus\b/g, "juve")
    .replace(/\bfc\b/g, "")
    .replace(/\b(ufficiale|official|comunicato|comunica|annuncia|annuncio|news|live)\b/g, " ")
    .replace(/\b(calcio|sport|tuttosport|gazzetta|sky|di marzio)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title) {
  const ignored = new Set([
    "la", "il", "lo", "le", "gli", "i", "un", "una", "di", "da", "del", "della", "dei", "a", "al", "alla", "con", "per", "e", "in", "su", "tra", "fra", "juve",
    "arriva", "arrivo", "nuovo", "nuova", "firma", "firmato", "accordo", "contratto", "giocatore", "giocatrice", "bianconero", "bianconera",
  ]);
  return new Set(String(title || "").split(/\s+/).filter(token => token.length > 2 && !ignored.has(token)));
}

function titleSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.max(left.size, right.size);
}

function priorityForReliability(value) {
  if (value === "official") return 4;
  if (value === "trusted") return 3;
  if (value === "aggregator") return 2;
  if (value === "rumor") return 1;
  if (value === "blacklist") return -1;
  return 0;
}

function priorityForUrgency(value) {
  if (value === "breaking") return 3;
  if (value === "important") return 2;
  if (value === "normal") return 1;
  if (value === "low") return 0;
  if (value === "rumor") return -1;
  return 0;
}

async function publishDraftAsNews(env, draft, options = {}) {
  if (!draft) return null;
  if (!options.skipExistingCheck) {
    const existing = await findExistingNews(env, { title: draft.title, sourceName: draft.source_name, sourceUrl: draft.source_url });
    if (existing) return null;
  }

  const inserted = await insertNewsRow(env, {
      title: draft.title,
      body: draft.body,
      category: draft.category,
      urgency: normalizeNewsUrgencyForDb(draft.urgency),
      source: draft.source_name,
      source_url: draft.source_url,
      visible: true,
      auto_fetched: true,
      reliability: draft.reliability,
      editorial_status: draft.editorial_status || statusFromReliability(draft.reliability),
  });
  return inserted[0] || null;
}

async function insertNewsRow(env, payload) {
  const cleanPayload = normalizeNewsInsertPayload(payload);
  try {
    return await sb(env, "/news", {
      method: "POST",
      body: [cleanPayload],
      prefer: "return=representation",
    });
  } catch (err) {
    if (!isSupabaseCheckConstraintError(err)) throw err;
    return sb(env, "/news", {
      method: "POST",
      body: [compatNewsInsertPayload(cleanPayload)],
      prefer: "return=representation",
    });
  }
}

function normalizeNewsInsertPayload(payload) {
  const reliability = normalizeReliabilityForDb(payload && payload.reliability);
  return {
    title: cleanText(payload && payload.title).slice(0, 220) || "News Juventus",
    body: cleanText(payload && payload.body).slice(0, 1000) || cleanText(payload && payload.title).slice(0, 500) || "Aggiornamento Juventus.",
    category: normalizeNewsCategoryForDb(payload && payload.category),
    urgency: normalizeNewsUrgencyForDb(payload && payload.urgency),
    source: cleanText(payload && payload.source).slice(0, 120) || "ICV",
    source_url: cleanText(payload && payload.source_url).slice(0, 500) || null,
    visible: payload && payload.visible === false ? false : true,
    auto_fetched: payload && payload.auto_fetched === true,
    reliability,
    editorial_status: normalizeEditorialStatusForDb(payload && payload.editorial_status, reliability),
  };
}

function compatNewsInsertPayload(payload) {
  return {
    title: payload.title,
    body: payload.body,
    category: "juventus",
    urgency: "normal",
    source: payload.source,
    source_url: payload.source_url,
    visible: payload.visible,
    auto_fetched: payload.auto_fetched,
  };
}

async function markDraftApproved(env, id) {
  await sb(env, "/news_drafts?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    body: { review_status: "approved", updated_at: new Date().toISOString() },
  });
}

function inferCategory(title) {
  return /mercato|trattativa|rinnovo|prestito|acquisto|cessione|offerta/i.test(title) ? "calciomercato" : "juventus";
}

function inferUrgency(title, body = "", category = "", reliability = "") {
  const text = cleanText([title, body, category, reliability].join(" "))
    .replace(/\bjuventus football club\b|\bsito ufficiale\b/gi, " ")
    .toLowerCase();

  if (isLowValueOfficialText(text)) {
    return "low";
  }

  if (/rumor|indiscrezione|sondaggio|interesse|contatti|offerta|trattativa|osserva|piace|nel mirino/.test(text) && reliability !== "official") {
    return "rumor";
  }

  if (/breaking|ufficiale|comunicato|esonero|dimissioni|nuovo allenatore|allenatore|infortunio|lesione|operazione|intervento|acquisto ufficiale|cessione ufficiale|depositato|firma|ha firmato/.test(text)) {
    return "breaking";
  }

  if (/convocati|convocate|calendario|conferenza stampa|rinnovo|ritiro|amichevole|presentazione|accordo|lista champions|lista uefa|sorteggio|coppa|europa league|serie a|designazione arbitrale|arbitro/.test(text)) {
    return "important";
  }

  if (/sponsor|store|maglia|academy|under 23|under23|women|charity|museum|membership|ticketing|biglietti|partnership|evento/.test(text)) {
    return "low";
  }

  return "normal";
}

function isLowValueOfficialText(text) {
  return /academy|settore giovanile|under\s?\d+|u\d{2}|women|femminile|convocate con le nazionali|agenda del mese|buon compleanno|compleanno|commemorazione|museo|museum|membership|ticketing|biglietti/.test(text);
}

function extractPlayer(title) {
  const ignored = new Set(["Juventus", "Juve", "Mercato", "Calciomercato", "Serie", "Sky", "Sport", "Scout", "YouTube", "Marzio", "Sicilia", "Buongiorno", "Buonasera", "Siamo", "Adesso", "Fonte", "Pap", "Papa", "Inter", "Milan", "Roma", "Napoli", "Udinese", "Solet", "Atta", "Greenwood", "Luca Toselli", "Romeo Agresti", "Gianni Balzarini"]);
  const names = title.match(/\b[A-ZÀ-Ý][a-zà-ÿ']{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ']{2,})?\b/g) || [];
  return names.find(name => {
    const parts = name.split(" ");
    return !ignored.has(parts[0]) && !ignored.has(name) && !isBadMarketTopic(name) && !isBadYoutubeTopic(name);
  }) || "";
}

function hookFromTitle(title) {
  return "Occhio a questa notizia: " + title;
}

function hookFromCaption(caption) {
  const clean = cleanText(caption || "").split(/\n+/)[0].trim();
  return clean.length > 90 ? clean.slice(0, 87).trim() + "..." : clean;
}

function labelInstagramMedia(type) {
  const t = String(type || "").toUpperCase();
  if (t === "VIDEO" || t === "REELS" || t === "REEL") return "Nuovo Reel Instagram";
  if (t === "CAROUSEL_ALBUM") return "Nuovo carosello Instagram";
  return "Nuovo post Instagram";
}

function publicNewsRows(rows) {
  return (rows || [])
    .map(row => {
      const normalized = {
        ...row,
        title: cleanText(row.title),
        body: cleanNewsDescription(row.body, row.source, row.title),
        category: cleanText(row.category),
        urgency: normalizeUrgency(row.urgency),
        source: cleanText(row.source),
        editorial_status: cleanText(row.editorial_status),
      };
      if (!isFabrizioSourceName(normalized.source)) return normalized;
      const editorial = existingFabrizioEditorial(normalized);
      return editorial ? { ...normalized, title: editorial.title, body: editorial.body } : null;
    })
    .filter(Boolean)
    .filter(row => !isFabrizioSourceName(row.source) || isRelevantNewsItem(row.title, row.body, { category: row.category || "calciomercato" }))
    .filter(row => !isLowValuePublicNews(row))
    .sort((a, b) => {
      const scoreDiff = newsPriorityScore(b) - newsPriorityScore(a);
      if (scoreDiff) return scoreDiff;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

function isLowValuePublicNews(row) {
  const text = cleanText([row && row.title, row && row.body].join(" ")).toLowerCase();
  const official = cleanText(row && row.reliability).toLowerCase() === "official" || /juventus\.com|sito ufficiale/i.test(cleanText(row && row.source));
  return official && isLowValueOfficialText(text);
}

function normalizeUrgency(value) {
  const clean = cleanText(value).toLowerCase();
  if (clean === "breaking" || clean === "important" || clean === "normal" || clean === "low" || clean === "rumor") return clean;
  return "normal";
}

function normalizeNewsUrgencyForDb(value) {
  const urgency = normalizeUrgency(value);
  return urgency === "low" ? "normal" : urgency;
}

function normalizeNewsCategoryForDb(value) {
  const clean = cleanText(value).toLowerCase();
  if (clean === "calciomercato" || clean === "mercato") return "calciomercato";
  if (clean === "statistiche" || clean === "stats") return "statistiche";
  if (clean === "grafiche" || clean === "graphics") return "grafiche";
  return "juventus";
}

function normalizeReliabilityForDb(value) {
  const clean = cleanText(value).toLowerCase();
  if (clean === "official" || clean === "trusted" || clean === "aggregator" || clean === "rumor") return clean;
  return "trusted";
}

function normalizeEditorialStatusForDb(value, reliability = "trusted") {
  const clean = cleanText(value);
  if (/^ufficiale$/i.test(clean)) return "Ufficiale";
  if (/^confermato$/i.test(clean)) return "Confermato";
  if (/^da verificare$/i.test(clean)) return "Da verificare";
  if (/^rumor$/i.test(clean)) return "Rumor";
  return statusFromReliability(reliability);
}

function newsPriorityScore(row) {
  const urgencyScore = {
    breaking: 50,
    important: 35,
    normal: 20,
    low: 8,
    rumor: 0,
  }[normalizeUrgency(row && row.urgency)] || 20;
  const reliabilityScore = {
    official: 8,
    trusted: 5,
    aggregator: -2,
    rumor: -4,
  }[cleanText(row && row.reliability).toLowerCase()] || 0;
  const ageHours = Math.max(0, (Date.now() - new Date(row && row.created_at || 0).getTime()) / 3600000);
  const recencyScore = Math.max(0, 12 - ageHours);
  return urgencyScore + reliabilityScore + recencyScore;
}

function publicMarketRows(rows) {
  return (rows || []).map(row => ({
    ...row,
    player_name: cleanText(row.player_name),
    status: cleanText(row.status),
    category: cleanText(row.category),
    source_name: cleanText(row.source_name),
    reliability: cleanText(row.reliability),
    note: cleanText(row.note),
  }));
}

function publicSocialRows(rows) {
  const seen = new Set();
  const realPosts = (rows || []).filter(s => /instagram\.com\/(p|reel)\//.test(String(s.post_url || "")));
  const sourceRows = realPosts.length ? realPosts : (rows || []);
  return sourceRows
    .filter(s => s.visible !== false && s.post_url)
    .sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0))
    .filter(s => {
      const key = String(s.post_url || "").replace(/\/$/, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function publicGraphicsRows(rows) {
  return normalizeGraphics(rows)
    .filter(item => item.visible !== false && item.image_url);
}

function inlineGraphicImage(body) {
  const dataUrl = String(body.image_data || "").trim();
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(dataUrl)) return "";
  if (dataUrl.length > MAX_GRAPHIC_DATA_URL_LENGTH) throw new Error("Immagine troppo pesante: prova a ridurla o salvarla in JPG");
  return dataUrl.replace(/\s/g, "");
}

async function uploadGraphicImage(env, body) {
  if (body.image_file) return uploadGraphicFile(env, body.image_file, body.filename || body.image_file.name);

  const dataUrl = String(body.image_data || "");
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) throw new Error("Immagine non valida");

  const contentType = cleanText(body.content_type || match[1]).toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("File immagine richiesto");

  const base64 = match[2].replace(/\s/g, "");
  const byteLength = Math.floor(base64.length * 3 / 4);
  if (byteLength > MAX_GRAPHIC_UPLOAD_BYTES) throw new Error("Immagine troppo pesante");

  await ensureStorageBucket(env, GRAPHICS_BUCKET);

  const bytes = decodeBase64(base64);
  const objectName = Date.now().toString(36) + "-" + safeStorageName(body.filename || "grafica", contentType);
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(base + "/storage/v1/object/" + GRAPHICS_BUCKET + "/" + encodeURIComponent(objectName), {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Upload Supabase " + response.status + ": " + text);
  }

  return base + "/storage/v1/object/public/" + GRAPHICS_BUCKET + "/" + encodeURIComponent(objectName);
}

async function uploadGraphicFile(env, file, filename) {
  const contentType = cleanText(file.type || "image/jpeg").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("File immagine richiesto");
  if (file.size > MAX_GRAPHIC_UPLOAD_BYTES) throw new Error("Immagine troppo pesante");

  await ensureStorageBucket(env, GRAPHICS_BUCKET);

  const objectName = Date.now().toString(36) + "-" + safeStorageName(filename || file.name || "grafica", contentType);
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(base + "/storage/v1/object/" + GRAPHICS_BUCKET + "/" + encodeURIComponent(objectName), {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: await file.arrayBuffer(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Upload Supabase " + response.status + ": " + text);
  }

  return base + "/storage/v1/object/public/" + GRAPHICS_BUCKET + "/" + encodeURIComponent(objectName);
}

async function ensureStorageBucket(env, bucket) {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nelle variabili ambiente");
  const root = base.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": "Bearer " + key,
  };

  const existing = await fetch(root + "/storage/v1/bucket/" + encodeURIComponent(bucket), { headers });
  if (existing.ok) return;
  if (existing.status !== 404) {
    const text = await existing.text();
    throw new Error("Storage Supabase " + existing.status + ": " + text);
  }

  const created = await fetch(root + "/storage/v1/bucket", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
    }),
  });

  if (!created.ok && created.status !== 409) {
    const text = await created.text();
    throw new Error("Creazione bucket Supabase " + created.status + ": " + text);
  }
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeStorageName(filename, contentType) {
  const clean = cleanText(filename || "grafica").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const extension = extensionForImage(contentType, clean);
  const base = clean.replace(/\.(png|jpe?g|webp|gif)$/i, "").slice(0, 70) || "grafica";
  return base + extension;
}

function extensionForImage(contentType, filename) {
  const existing = String(filename || "").match(/\.(png|jpe?g|webp|gif)$/i);
  if (existing) return existing[0].toLowerCase().replace(".jpeg", ".jpg");
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return ".jpg";
}

function normalizeGraphics(input) {
  const rows = Array.isArray(input) ? input : [];
  return rows
    .map((item, index) => {
      const rawImageUrl = String(item && item.image_url || "").trim();
      const imageUrl = rawImageUrl.startsWith("data:image/") ? rawImageUrl.slice(0, MAX_GRAPHIC_DATA_URL_LENGTH) : cleanText(rawImageUrl).slice(0, 700);
      const title = cleanText(item && item.title || "Grafica ICV").slice(0, 90);
      const linkUrl = cleanText(item && item.link_url || "").slice(0, 700);
      return {
        id: cleanText(item && item.id || "g_" + index).slice(0, 80),
        title,
        image_url: imageUrl,
        link_url: linkUrl,
        visible: item && item.visible === false ? false : true,
        created_at: item && item.created_at || new Date().toISOString(),
      };
    })
    .filter(item => item.image_url);
}

function normalizeRadar(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    kicker: cleanText(value.kicker || DEFAULT_RADAR.kicker).slice(0, 80),
    title: cleanText(value.title || DEFAULT_RADAR.title).slice(0, 80),
    copy: cleanText(value.copy || DEFAULT_RADAR.copy).slice(0, 280),
    cards: normalizeRadarList(value.cards, DEFAULT_RADAR.cards, 4),
    watch: normalizeRadarList(value.watch, DEFAULT_RADAR.watch, 4),
  };
}

function normalizeRadarList(input, fallback, limit) {
  const rows = Array.isArray(input) ? input : fallback;
  return rows.slice(0, limit).map((item, index) => ({
    title: cleanText(item && item.title || fallback[index] && fallback[index].title || "").slice(0, 60),
    text: cleanText(item && item.text || fallback[index] && fallback[index].text || "").slice(0, 140),
  }));
}

async function getSiteSetting(env, key, fallback) {
  try {
    const rows = await sb(env, "/site_settings?key=eq." + encodeURIComponent(key) + "&select=value&limit=1");
    return rows[0] && rows[0].value ? rows[0].value : fallback;
  } catch {
    return fallback;
  }
}

async function setSiteSetting(env, key, value) {
  const existing = await sb(env, "/site_settings?key=eq." + encodeURIComponent(key) + "&select=key&limit=1");
  const payload = { key, value, updated_at: new Date().toISOString() };
  if (existing.length) {
    await sb(env, "/site_settings?key=eq." + encodeURIComponent(key), { method: "PATCH", body: payload });
  } else {
    await sb(env, "/site_settings", { method: "POST", body: [payload] });
  }
}

function buildCaption(item) {
  const source = item.source ? "\n\nFonte: " + item.source : "";
  return item.title + "\n\n" + cleanText(item.body || "").slice(0, 220) + source + "\n\n#Juventus #ICVScout #IlCalcioDiVince";
}

function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});
}

async function logRun(env, type, result) {
  try {
    await sb(env, "/automation_runs", {
      method: "POST",
      body: [{ type, status: result.ok === false ? "error" : "ok", payload: result }],
    });
  } catch {
    // Logging non deve bloccare la pubblicazione.
  }
}
