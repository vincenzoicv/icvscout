import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8788);
const env = await readDevVars();
const hasRealEnv = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.ADMIN_TOKEN;
const adminToken = env.ADMIN_TOKEN || "demo";
const homeAutoIntervalMs = Math.max(Number(env.HOME_AUTO_INTERVAL_HOURS || 6), 1) * 3600000;
let lastHomeAutopilotAt = 0;

const defaultRadar = {
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

let cloudflareHandler = null;
if (hasRealEnv) {
  const mod = await import(pathToFileURL(join(root, "functions/api/[[path]].js")).href);
  cloudflareHandler = mod.onRequest;
}

const demoState = {
  drafts: [
    {
      id: 1,
      title: "Juventus, monitoraggio automatico sulle fonti ufficiali",
      body: "Bozza dimostrativa: il sistema raccoglie la notizia, assegna affidabilita e la mette in revisione.",
      category: "juventus",
      urgency: "normal",
      source_name: "Juventus ufficiale",
      source_url: "https://www.juventus.com/it/news/",
      reliability: "official",
      editorial_status: "Ufficiale",
      review_status: "ready",
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      title: "Mercato Juve, nuova voce da verificare",
      body: "Bozza dimostrativa da aggregatore: resta in attesa finche non viene confermata da una fonte affidabile.",
      category: "calciomercato",
      urgency: "rumor",
      source_name: "Google News mercato",
      source_url: "https://news.google.com/",
      reliability: "aggregator",
      editorial_status: "Da verificare",
      review_status: "needs_review",
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
  news: [
    {
      id: 10,
      title: "ICV Scout entra in modalita semi-autopilota",
      body: "News demo visibile sul sito pubblico: in produzione arrivera da Supabase dopo approvazione admin.",
      category: "juventus",
      urgency: "normal",
      source: "ICV",
      reliability: "trusted",
      editorial_status: "Confermato",
      visible: true,
      created_at: new Date().toISOString(),
    },
  ],
  sources: [
    { id: 1, name: "Juventus ufficiale", category: "juventus", reliability: "official", active: true },
    { id: 2, name: "Sky Sport Juventus", category: "juventus", reliability: "trusted", active: true },
    { id: 3, name: "Google News mercato", category: "calciomercato", reliability: "aggregator", active: true },
  ],
  social: [
    {
      id: 40,
      platform: "instagram",
      hook: "Il Calcio di Vince su Instagram",
      caption: "Post demo collegato alla home. Incolla un Reel o un post reale dall'admin per sostituirlo.",
      post_url: "https://www.instagram.com/ilcalciodivince_/",
      media_type: "post",
      status: "published",
      visible: true,
      created_at: new Date().toISOString(),
    },
  ],
  market: [
    {
      id: 20,
      player_name: "Demo Player",
      status: "monitorato",
      reliability: "aggregator",
      note: "Voce mercato demo visibile anche sul sito pubblico.",
      source_name: "Google News mercato",
    },
  ],
  matches: [],
  runs: [],
  radar: defaultRadar,
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      if (cloudflareHandler) return proxyCloudflare(req, res);
      return mockApi(req, res, url);
    }
    return serveStatic(res, url.pathname);
  } catch (err) {
    sendJson(res, { error: err.message }, 500);
  }
}).listen(port, host, () => {
  console.log(`ICV local dev: http://${host}:${port}/index.html`);
  console.log(`Admin: http://${host}:${port}/icv_admin.html`);
  console.log(hasRealEnv ? "Mode: real Cloudflare function" : `Mode: demo API, ADMIN_TOKEN=${adminToken}`);
});

async function proxyCloudflare(nodeReq, nodeRes) {
  const chunks = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${nodeReq.url}`, {
    method: nodeReq.method,
    headers: nodeReq.headers,
    body: nodeReq.method === "GET" || nodeReq.method === "HEAD" ? undefined : body,
  });
  const response = await cloudflareHandler({ request, env });
  nodeRes.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  nodeRes.end(Buffer.from(await response.arrayBuffer()));
}

async function mockApi(req, res, url) {
  if (url.pathname === "/api/public/home") {
    await runHomeAutopilotDemo();
    return sendJson(res, {
      news: demoState.news.filter(n => n.visible),
      market: demoState.market,
      matches: demoState.matches,
      social: publicSocialRows(demoState.social),
      radar: demoState.radar,
      auto: { enabled: true, interval_hours: homeAutoIntervalMs / 3600000, last_run_at: lastHomeAutopilotAt ? new Date(lastHomeAutopilotAt).toISOString() : null },
    });
  }
  if (url.pathname === "/api/public/news") return sendJson(res, demoState.news.filter(n => n.visible));
  if (url.pathname.startsWith("/api/football-data/")) return sendJson(res, { error: "Demo locale: statistiche live disponibili con chiavi reali" }, 503);
  if (url.pathname === "/api/admin/news") {
    if (!isAdmin(req)) return sendJson(res, { error: "Token demo non valido. Usa: demo" }, 401);
    const body = await readJson(req);

    if (req.method === "GET") return sendJson(res, demoState);
    if (req.method === "POST" && body.type === "approve_draft") {
      const draft = demoState.drafts.find(d => String(d.id) === String(body.id));
      if (!draft) return sendJson(res, { error: "Bozza non trovata" }, 404);
      draft.review_status = "approved";
      const news = {
        id: Date.now(),
        title: draft.title,
        body: draft.body,
        category: draft.category,
        urgency: draft.urgency,
        source: draft.source_name,
        reliability: draft.reliability,
        editorial_status: draft.editorial_status,
        visible: true,
        created_at: new Date().toISOString(),
      };
      demoState.news.unshift(news);
      return sendJson(res, { news });
    }
    if (req.method === "POST" && body.type === "manual_news") {
      const news = {
        id: Date.now(),
        title: body.title,
        body: body.body,
        category: body.category,
        urgency: body.urgency || "normal",
        source: body.source || "ICV",
        reliability: body.reliability || "trusted",
        editorial_status: body.editorial_status || "Confermato",
        visible: true,
        created_at: new Date().toISOString(),
      };
      demoState.news.unshift(news);
      return sendJson(res, { news });
    }
    if (req.method === "POST" && body.type === "instagram_pick") {
      const post = {
        id: Date.now(),
        platform: "instagram",
        hook: body.hook || "Post Instagram",
        caption: body.caption || "",
        post_url: body.post_url,
        media_type: body.media_type || "post",
        status: "published",
        visible: body.visible !== false,
        created_at: new Date().toISOString(),
      };
      demoState.social.unshift(post);
      return sendJson(res, { social: post });
    }
    if (req.method === "POST" && body.type === "radar_settings") {
      demoState.radar = normalizeRadar(body.radar);
      return sendJson(res, { radar: demoState.radar });
    }
    if (req.method === "PATCH" && body.type === "discard_draft") {
      const draft = demoState.drafts.find(d => String(d.id) === String(body.id));
      if (draft) draft.review_status = "discarded";
      return sendJson(res, { ok: true });
    }
    if (req.method === "PATCH" && body.type === "toggle_news") {
      const news = demoState.news.find(n => String(n.id) === String(body.id));
      if (news) news.visible = !!body.visible;
      return sendJson(res, { news });
    }
    if (req.method === "PATCH" && body.type === "toggle_social") {
      const social = demoState.social.find(s => String(s.id) === String(body.id));
      if (social) social.visible = !!body.visible;
      return sendJson(res, { social });
    }
    return sendJson(res, { ok: true });
  }
  if (url.pathname === "/api/admin/automate") {
    if (!isAdmin(req)) return sendJson(res, { error: "Token demo non valido. Usa: demo" }, 401);
    const body = await readJson(req);
    if (body.action === "market") {
      demoState.market.unshift({
        id: Date.now(),
        player_name: "Demo Player",
        status: "monitorato",
        reliability: "aggregator",
        note: "Voce mercato demo generata dall'automazione locale.",
        source_name: "Google News mercato",
      });
    }
    if (body.action === "match_center") {
      demoState.matches.unshift({
        id: Date.now(),
        match_id: "demo-" + Date.now(),
        opponent: "Demo FC",
        competition: "Serie A",
        match_date: new Date(Date.now() + 86400000).toISOString(),
        status: "pre_match",
        title: "Verso Juventus-Demo FC",
        summary: "Scheda pre-partita demo: prossima sfida, chiave tattica e note da rifinire prima della pubblicazione.",
        tactical_key: "Pressione alta, uscita dal basso e gestione delle transizioni.",
      });
    }
    if (body.action === "social") {
      demoState.social.unshift({
        id: Date.now(),
        platform: "instagram",
        hook: "Hook demo per il prossimo post ICV",
        caption: "Caption demo generata dalla news pubblicata. #Juventus #ICVScout",
        status: "draft",
      });
    }
    if (body.action === "instagram_import") {
      const result = env.IG_ACCESS_TOKEN ? await importInstagramDemo(env.IG_ACCESS_TOKEN) : null;
      if (!result) {
        demoState.social.unshift({
          id: Date.now(),
          platform: "instagram",
          hook: "Ultimo Reel importato da Instagram",
          caption: result && result.error ? "Import non riuscito: " + result.error : "Import demo: in produzione questo record arriva da Meta API e si aggiorna dal pulsante admin.",
          post_url: "https://www.instagram.com/ilcalciodivince_/",
          media_type: "reel",
          status: "published",
          visible: true,
          created_at: new Date().toISOString(),
        });
      }
    }
    let automationPayload = { ok: true, action: body.action, demo: true };
    if (body.action === "fetch_news") {
      demoState.drafts.unshift({
        id: Date.now(),
        title: "Nuova bozza demo recuperata dalle fonti",
        body: "Questa bozza simula il risultato del fetch automatico.",
        category: "juventus",
        urgency: "normal",
        source_name: "Sky Sport Juventus",
        source_url: "https://sport.sky.it/calcio/serie-a/squadre/juventus",
        reliability: "trusted",
        editorial_status: "Confermato",
        review_status: "needs_review",
        created_at: new Date().toISOString(),
      });
    }
    if (body.action === "youtube_scout") {
      demoState.drafts.unshift({
        id: Date.now(),
        title: "YouTube Scout: tema Juve da verificare",
        body: "Dal video emerge questo tema da verificare: la Juve deve chiarire le priorita di mercato prima di accelerare sulle entrate. Bozza demo generata da YouTube Scout.",
        category: "calciomercato",
        urgency: "normal",
        source_name: "YouTube · Demo",
        source_url: "https://www.youtube.com/",
        reliability: "trusted",
        editorial_status: "Da verificare",
        review_status: "needs_review",
        created_at: new Date().toISOString(),
      });
      automationPayload = { ok: true, action: body.action, demo: true, scanned: 1, inserted: 1, skipped: 0, errors: [] };
    }
    const run = { id: Date.now(), type: body.action, status: "ok", payload: automationPayload, created_at: new Date().toISOString() };
    demoState.runs.unshift(run);
    demoState.runs = demoState.runs.slice(0, 12);
    return sendJson(res, automationPayload);
  }
  sendJson(res, { error: "API demo non trovata" }, 404);
}

async function runHomeAutopilotDemo() {
  if (Date.now() - lastHomeAutopilotAt < homeAutoIntervalMs) return;
  lastHomeAutopilotAt = Date.now();
  const result = env.IG_ACCESS_TOKEN ? await importInstagramDemo(env.IG_ACCESS_TOKEN) : { imported: 0 };
  demoState.runs.unshift({ id: Date.now(), type: "home_autopilot", status: result.error ? "error" : "ok", payload: result, created_at: new Date().toISOString() });
  demoState.runs = demoState.runs.slice(0, 12);
}

async function importInstagramDemo(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const direct = await fetchInstagramLoginMedia(token, controller.signal);
    if (direct.ok) return insertImportedSocial(direct.rows);
    const facebook = await fetchFacebookLoginInstagramMedia(token, controller.signal);
    if (facebook.ok) return insertImportedSocial(facebook.rows);
    return { imported: 0, error: facebook.error || direct.error || "Token Instagram non valido" };
  } catch (err) {
    return { imported: 0, error: err.name === "AbortError" ? "Timeout chiamata Meta API" : (err.message || "Errore Instagram") };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchInstagramLoginMedia(token, signal) {
  const fields = "id,caption,media_type,media_url,permalink,timestamp,thumbnail_url";
  const url = "https://graph.instagram.com/me/media?fields=" + encodeURIComponent(fields) + "&limit=8&access_token=" + encodeURIComponent(token);
  const response = await fetch(url, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data.error && data.error.message ? data.error.message : "HTTP " + response.status };
  return { ok: true, rows: Array.isArray(data.data) ? data.data : [] };
}

async function fetchFacebookLoginInstagramMedia(token, signal) {
  const pageFields = "id,name,access_token,instagram_business_account{id,username}";
  const pagesUrl = "https://graph.facebook.com/v25.0/me/accounts?fields=" + encodeURIComponent(pageFields) + "&access_token=" + encodeURIComponent(token);
  const pagesResponse = await fetch(pagesUrl, { signal });
  const pagesData = await pagesResponse.json().catch(() => ({}));
  if (!pagesResponse.ok) return { ok: false, error: pagesData.error && pagesData.error.message ? pagesData.error.message : "HTTP " + pagesResponse.status };

  const page = (pagesData.data || []).find(p => p.instagram_business_account && p.instagram_business_account.id);
  if (!page) return { ok: false, error: "Nessuna Pagina Facebook con account Instagram collegato trovata nel token" };

  const fields = "id,caption,media_type,media_url,permalink,timestamp,thumbnail_url";
  const mediaUrl = "https://graph.facebook.com/v25.0/" + page.instagram_business_account.id + "/media?fields=" + encodeURIComponent(fields) + "&limit=8&access_token=" + encodeURIComponent(page.access_token || token);
  const mediaResponse = await fetch(mediaUrl, { signal });
  const mediaData = await mediaResponse.json().catch(() => ({}));
  if (!mediaResponse.ok) return { ok: false, error: mediaData.error && mediaData.error.message ? mediaData.error.message : "HTTP " + mediaResponse.status };
  return { ok: true, rows: Array.isArray(mediaData.data) ? mediaData.data : [] };
}

function insertImportedSocial(rows) {
  let imported = 0;
  rows.forEach(item => {
    if (!item.permalink || demoState.social.some(s => s.post_url === item.permalink)) return;
    demoState.social.unshift({
      id: Date.now() + Math.floor(Math.random() * 1000),
      platform: "instagram",
      hook: hookFromCaption(item.caption) || labelInstagramMedia(item.media_type),
      caption: item.caption || "",
      post_url: item.permalink,
      media_type: String(item.media_type || "post").toLowerCase(),
      status: "published",
      visible: true,
      created_at: item.timestamp || new Date().toISOString(),
    });
    imported += 1;
  });
  return { imported };
}

function publicSocialRows(rows) {
  const seen = new Set();
  const realPosts = rows.filter(s => /instagram\.com\/(p|reel)\//.test(String(s.post_url || "")));
  const sourceRows = realPosts.length ? realPosts : rows;
  return sourceRows
    .filter(s => s.visible !== false && s.post_url)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .filter(s => {
      const key = String(s.post_url || "").replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function normalizeRadar(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    kicker: cleanText(value.kicker || defaultRadar.kicker).slice(0, 80),
    title: cleanText(value.title || defaultRadar.title).slice(0, 80),
    copy: cleanText(value.copy || defaultRadar.copy).slice(0, 280),
    cards: normalizeRadarList(value.cards, defaultRadar.cards, 4),
    watch: normalizeRadarList(value.watch, defaultRadar.watch, 4),
  };
}

function normalizeRadarList(input, fallback, limit) {
  const rows = Array.isArray(input) ? input : fallback;
  return rows.slice(0, limit).map((item, index) => ({
    title: cleanText(item && item.title || fallback[index] && fallback[index].title || "").slice(0, 60),
    text: cleanText(item && item.text || fallback[index] && fallback[index].text || "").slice(0, 140),
  }));
}

function hookFromCaption(caption) {
  const clean = cleanText(caption || "");
  if (!clean) return "";
  return clean.length > 90 ? clean.slice(0, 87).trim() + "..." : clean;
}

function labelInstagramMedia(type) {
  const t = String(type || "").toUpperCase();
  if (t === "VIDEO" || t === "REELS" || t === "REEL") return "Nuovo Reel Instagram";
  if (t === "CAROUSEL_ALBUM") return "Nuovo carosello Instagram";
  return "Nuovo post Instagram";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function serveStatic(res, pathname) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".md": "text/markdown; charset=utf-8",
    ".sql": "text/plain; charset=utf-8",
  }[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  res.end(await readFile(filePath));
}

async function readDevVars() {
  const vars = {};
  const path = join(root, ".dev.vars");
  if (!existsSync(path)) return vars;
  const text = await readFile(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) continue;
    const [key, ...rest] = clean.split("=");
    vars[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

function isAdmin(req) {
  return req.headers["x-icv-admin-token"] === adminToken;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}
