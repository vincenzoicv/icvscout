const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-ICV-Admin-Token",
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
    name: "Di Marzio Juventus",
    url: "https://news.google.com/rss/search?q=Juventus%20Di%20Marzio&hl=it&gl=IT&ceid=IT:it",
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
    if (path === "admin/news") return adminNews(request, env);
    if (path === "admin/automate") return adminAutomate(request, env);
    if (path.startsWith("football-data/")) return footballDataProxy(path, url, env);
    return apiSportsProxy(path, url, env);
  } catch (err) {
    return json({ error: err.message || "Errore API" }, 500);
  }
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
    sb(env, "/news?visible=eq.true&order=created_at.desc&limit=6"),
    sb(env, "/market_items?order=updated_at.desc&limit=12"),
    sb(env, "/news?visible=eq.true&category=eq.calciomercato&order=created_at.desc&limit=6"),
    sb(env, "/match_reports?order=match_date.desc&limit=3"),
    sb(env, "/social_drafts?platform=eq.instagram&visible=eq.true&order=created_at.desc&limit=12"),
    latestAutomationRun(env, "home_autopilot"),
    getSiteSetting(env, "radar_home", DEFAULT_RADAR),
  ]);
  return json({
    news,
    market: market && market.length ? market : publicMarketFromNews(marketNews),
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
  return (rows || []).slice(0, 3).map(row => ({
    player_name: extractPlayer(row.title || "") || "Mercato Juve",
    status: row.editorial_status || statusFromReliability(row.reliability),
    category: "calciomercato",
    source_name: row.source || "ICV",
    source_url: row.source_url,
    reliability: row.reliability || "trusted",
    note: row.title,
    updated_at: row.created_at,
  }));
}

async function runHomeAutopilot(env) {
  const intervalHours = Math.max(Number(env.HOME_AUTO_INTERVAL_HOURS || 6), 1);
  const latest = await latestAutomationRun(env, "home_autopilot");
  if (latest && Date.now() - new Date(latest.created_at).getTime() < intervalHours * 3600000) return;

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

    const marketSources = sources.filter(s => s.category === "calciomercato");
    result.tasks.push({ type: "market", result: await generateMarketDrafts(env, marketSources.length ? marketSources : DEFAULT_SOURCES) });
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
  const rows = await sb(env, "/news?visible=eq.true&order=created_at.desc&limit=" + limit);
  return json(rows);
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
      sb(env, "/news_drafts?order=created_at.desc&limit=80"),
      sb(env, "/news?order=created_at.desc&limit=80"),
      sb(env, "/sources?order=reliability.asc,name.asc"),
      sb(env, "/social_drafts?order=created_at.desc&limit=40"),
      sb(env, "/market_items?order=updated_at.desc&limit=60"),
      sb(env, "/match_reports?order=match_date.desc&limit=20"),
      sb(env, "/automation_runs?order=created_at.desc&limit=12"),
      getSiteSetting(env, "radar_home", DEFAULT_RADAR),
      getSiteSetting(env, "graphics_gallery", DEFAULT_GRAPHICS),
    ]);
    return json({ drafts, news, sources, social, market, matches, runs, radar, graphics });
  }

  const body = await readBody(request);
  if (request.method === "POST") {
    if (body.type === "manual_news") {
      const inserted = await sb(env, "/news", {
        method: "POST",
        body: [{
          title: body.title,
          body: body.body,
          category: body.category || "juventus",
          urgency: body.urgency || "normal",
          source: body.source || "ICV",
          visible: body.visible !== false,
          auto_fetched: false,
          reliability: body.reliability || "trusted",
          editorial_status: body.editorial_status || "Confermato",
        }],
        prefer: "return=representation",
      });
      return json({ news: inserted[0] });
    }

    if (body.type === "approve_draft") {
      const draft = await getOne(env, "/news_drafts?id=eq." + encodeURIComponent(body.id));
      const inserted = await sb(env, "/news", {
        method: "POST",
        body: [{
          title: body.title || draft.title,
          body: body.body || draft.body,
          category: body.category || draft.category,
          urgency: body.urgency || draft.urgency || "normal",
          source: draft.source_name,
          source_url: draft.source_url,
          visible: true,
          auto_fetched: true,
          reliability: draft.reliability,
          editorial_status: body.editorial_status || statusFromReliability(draft.reliability),
        }],
        prefer: "return=representation",
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
    const sources = (await getSources(env)).filter(s => s.category === "calciomercato");
    let result;
    try {
      result = await generateMarketDrafts(env, sources.length ? sources : DEFAULT_SOURCES);
    } catch (err) {
      result = { ok: false, error: err.message || "Errore mercato", scanned: 0, inserted: 0, market_items: 0 };
    }
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

  return json({ error: "Automazione non supportata" }, 400);
}

async function fetchNewsDrafts(env, sources) {
  let scanned = 0;
  let inserted = 0;
  const errors = [];

  for (const source of sources.filter(s => s.active !== false)) {
    try {
      const xml = await fetchText(source.url);
      const items = parseRss(xml).slice(0, 6);
      scanned += items.length;

      for (const item of items) {
        const normalized = normalizeGoogleTitle(item.title);
        const title = normalized.title;
        const sourceName = normalized.source || source.name;
        const url = item.link || source.url;
        const hash = await digest(title + "|" + sourceName);
        const existing = await sb(env, "/news_drafts?content_hash=eq." + encodeURIComponent(hash) + "&select=id&limit=1");
        if (existing.length) continue;

        const reliability = source.reliability || reliabilityForSource(sourceName, url);
        await sb(env, "/news_drafts", {
          method: "POST",
          body: [{
            title,
            body: cleanText(item.description || title).slice(0, 500),
            category: source.category || inferCategory(title),
            urgency: inferUrgency(title),
            source_name: sourceName,
            source_url: url,
            reliability,
            editorial_status: statusFromReliability(reliability),
            review_status: reliability === "official" ? "ready" : "needs_review",
            content_hash: hash,
            raw_payload: item,
          }],
        });
        inserted++;
      }
    } catch (err) {
      errors.push({ source: source.name, error: err.message });
    }
  }

  return { ok: true, scanned, inserted, errors };
}

async function generateMarketDrafts(env, sources) {
  const result = await fetchNewsDrafts(env, sources);
  const drafts = await sb(env, "/news_drafts?category=eq.calciomercato&review_status=in.(needs_review,ready)&order=created_at.desc&limit=20");
  let inserted = 0;
  const errors = Array.isArray(result.errors) ? result.errors.slice() : [];

  for (const draft of drafts) {
    const player = cleanText(extractPlayer(draft.title)).slice(0, 80);
    if (!player) continue;
    try {
      const existing = await sb(env, "/market_items?player_name=eq." + encodeURIComponent(player) + "&select=id&limit=1");
      const payload = {
        player_name: player,
        status: draft.editorial_status === "Rumor" ? "rumor" : "monitorato",
        category: "calciomercato",
        source_name: cleanText(draft.source_name || "").slice(0, 120),
        source_url: draft.source_url,
        reliability: draft.reliability || "rumor",
        note: cleanText(draft.title || "").slice(0, 500),
        updated_at: new Date().toISOString(),
      };
      if (existing.length) {
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
    summary: "Bozza pre-partita generata automaticamente: forma recente, indisponibili e chiave tattica da rifinire in admin.",
    tactical_key: "Da completare: duello decisivo, uscita palla e zona in cui la Juve puo creare superiorita.",
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
    return sources.length ? sources : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}

async function sb(env, path, options = {}) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nelle variabili ambiente");

  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1" + path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": "Bearer " + key,
      ...(options.prefer ? { "Prefer": options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Supabase " + response.status + ": " + text);
  }
  if (response.status === 204) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
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
  const response = await fetch(url, { headers: { "User-Agent": "ICV Scout/1.0" } });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.text();
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function parseRss(xml) {
  const chunks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return chunks.map(chunk => ({
    title: decodeXml(tag(chunk, "title")),
    link: decodeXml(tag(chunk, "link")),
    description: decodeXml(tag(chunk, "description")),
    pubDate: decodeXml(tag(chunk, "pubDate")),
  })).filter(item => item.title);
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
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function cleanText(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
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
  return "Rumor";
}

function inferCategory(title) {
  return /mercato|trattativa|rinnovo|prestito|acquisto|cessione|offerta/i.test(title) ? "calciomercato" : "juventus";
}

function inferUrgency(title) {
  return /ufficiale|comunicato|breaking/i.test(title) ? "breaking" : (/rumor|interesse|offerta/i.test(title) ? "rumor" : "normal");
}

function extractPlayer(title) {
  const ignored = new Set(["Juventus", "Juve", "Mercato", "Calciomercato", "Serie", "Sky", "Sport"]);
  const names = title.match(/\b[A-ZÀ-Ý][a-zà-ÿ']{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ']{2,})?\b/g) || [];
  return names.find(name => !ignored.has(name.split(" ")[0])) || "";
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
