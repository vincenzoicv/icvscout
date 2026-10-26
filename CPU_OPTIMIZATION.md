# CPU budget for the free Cloudflare plan

The public home response is cached for 30 seconds before upstream reads or data
transformations. The shared key ignores tracking parameters. Failed source reads
are not cached; a cache outage falls back to the normal public read. Browsers
receive `Cache-Control: no-store` and `X-ICV-Cache: HIT` or `MISS`.

The cron trigger still wakes every minute so it can follow matches accurately.
For scheduled match jobs, the Pages API returns `next_check_at`; the cron Worker
caches that plan and avoids calling Pages until the next check is due.

- Outside a match window: read only fixture IDs, dates and statuses every 30 minutes.
- Refresh the broader future calendar at most every six hours, without unfolding
  lineups, goals, substitutions or bookings for every future match.
- From 90 minutes before kickoff through four hours after kickoff: retrieve the
  individual match every minute. Finished matches in this window use five minutes.
- Skip database writes when report content is unchanged, ignoring fetch timestamps
  and JSON object key ordering. Preserve active editorial corrections.
- Manual authenticated refreshes continue to run immediately and bypass the plan.
- Cache expiry, eviction or failure triggers a fresh authoritative check. Failed
  API calls do not populate the scheduler cache and are retried at the next tick.

CPU limits remain per invocation. Verify production `exceededCpu` outcomes and
request CPU after deploying; local test durations are not Cloudflare CPU metrics.
The calendar and home cache misses still execute real upstream reads, so a short
successful sample does not establish a full-day error rate.

Validation: `npm run check`, including `tests/public-home-cache.test.mjs` and
`tests/match-cpu-budget.test.mjs`. Observe the production Pages deployment and cron
Worker separately; the cron can complete while a downstream Pages request fails.
