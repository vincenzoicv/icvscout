const DEFAULT_ORIGIN = "https://ilcalciodivince.com";
const YOUTUBE_CRON = "15 6 * * *";

export default {
  async scheduled(controller, env, ctx) {
    const promise = runCronJob(env, jobFromCron(controller && controller.cron), controller && controller.cron);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
    return promise;
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const job = url.searchParams.get("job") || "home";
    if (!["home", "youtube", "all"].includes(job)) {
      return json({ error: "Job cron non supportato" }, 400);
    }
    return json(await runCronJob(env, job, "manual:" + job));
  },
};

function jobFromCron(cron) {
  return cron === YOUTUBE_CRON ? "youtube" : "home";
}

async function runCronJob(env, job, cron) {
  const secret = env.CRON_SECRET || env.ADMIN_TOKEN;
  if (!secret) return { ok: false, error: "Configura CRON_SECRET nel Worker cron", job, cron };

  const origin = String(env.ICV_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, "");
  const target = new URL("/api/cron/autopilot", origin);
  target.searchParams.set("job", job);

  const response = await fetch(target.toString(), {
    method: "POST",
    headers: { "X-ICV-Cron-Token": secret },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return {
    ok: response.ok && payload.ok !== false,
    job,
    cron,
    status: response.status,
    target: target.toString(),
    payload,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
