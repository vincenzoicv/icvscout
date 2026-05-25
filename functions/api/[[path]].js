// Cloudflare Pages Function — proxy per api-sports.io
// Sostituisce il redirect [[redirects]] del netlify.toml
// Routing: /api/* → https://v3.football.api-sports.io/*

export async function onRequest(context) {
  const { request, env } = context;

  // Gestisce il preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const url = new URL(request.url);
  // Rimuove il prefisso /api/ dal path
  const apiPath = url.pathname.replace(/^\/api\//, "");
  const targetUrl = `https://v3.football.api-sports.io/${apiPath}${url.search}`;

  const apiKey = env.APISPORTS_KEY || "7f89907a9c5f2f3f58653373ca8a7338";

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
