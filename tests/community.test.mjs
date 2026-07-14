import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("gli script delle pagine principali hanno sintassi valida", async () => {
  for (const file of ["community.html", "icv_admin.html"]) {
    const html = await read(file);
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(Boolean);
    assert.ok(scripts.length, `${file} deve contenere JavaScript inline`);
    for (const script of scripts) new Function(script);
  }
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
  const [privacy, rules, sitemap, redirects] = await Promise.all([
    read("privacy.html"), read("regolamento-community.html"), read("sitemap.xml"), read("_redirects"),
  ]);
  assert.match(privacy, /cancellare definitivamente account e dati/);
  assert.match(privacy, /Supabase/);
  assert.match(rules, /Moderazione/);
  assert.match(sitemap, /<loc>https:\/\/ilcalciodivince\.com\/privacy<\/loc>/);
  assert.match(redirects, /\/regolamento-community\.html \/regolamento-community 301/);
});

test("la cancellazione rimuove file Storage e utente Auth", async () => {
  const api = await read("functions/api/[[path]].js");
  assert.match(api, /communityStoragePath/);
  assert.match(api, /storage\/v1\/object\/" \+ COMMUNITY_BUCKET/);
  assert.match(api, /prefixes: \[\.\.\.new Set\(storagePaths\)\]/);
});

test("gli script esterni non bloccano il parsing", async () => {
  const html = await read("community.html");
  assert.match(html, /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/);
  assert.match(html, /<script defer src="https:\/\/unpkg\.com\/lucide/);
  assert.match(html, /window\.addEventListener\("DOMContentLoaded",init\)/);
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
