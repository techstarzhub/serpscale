# DataForSEO Cost Strategy

How every SEO feature is sourced, priced, and cached so the platform stays cheap
at 10 projects and stays cheap at 1,000. The rule everywhere: **fetch once, cache
hard, reuse for everyone.**

## Data sources by feature

| Feature | Tab | API | Raw cost / call | Cache TTL | Effective cost |
| --- | --- | --- | --- | --- | --- |
| Live SERP (organic, AI overview, PAA, related, features) | Keyword Research | SERP Google Organic **Live Advanced** | $0.002 | Redis + snapshot content-hash dedup | ~$0.002 first search, $0 on repeat |
| Keyword ideas (volume, difficulty, CPC, 12-mo trend) | Keyword Research | Labs `keyword_ideas` | ~$0.012 (100 rows) | 7 days | fraction of a cent / keyword / week |
| Ranked keywords (all terms the domain ranks for) | Rank Tracker | Labs `ranked_keywords` | ~$0.012 (100 rows) | 7 days | ~$0.012 / project / week |
| Keyword difficulty (bulk) | (available) | Labs `bulk_keyword_difficulty` | ~$0.012 | 7 days | shared with ideas |
| Backlink profile (summary + referring domains + links) | Backlinks | Backlinks `summary` + `referring_domains` + `backlinks` | ~$0.06 (3 calls) | 24 hours | ~$0.06 / project / day |
| Search analytics (clicks, impressions, CTR, position) | Overview, Rank Tracker | Google Search Console | free | 3 hours | free |
| Traffic (sessions, sources, geo, devices) | Traffic | Google Analytics 4 | free | 3 hours | free |
| Site audit (crawl, PageSpeed) | Site Audit | self-hosted crawler + PSI | free | on demand | free |

Google Search Console and GA4 do the heavy lifting for free. DataForSEO is only
used where Google gives us nothing: **live SERPs, keyword metrics, and backlinks.**

## Why the tiers matter

- **SERP Live Advanced ($0.002)** — real-time, on-demand. Used only when a human
  clicks Search. Never called in a loop.
- **SERP Standard queue ($0.0006)** — 3x cheaper, async. Use this for *scheduled*
  rank tracking (nightly re-check of a fixed keyword list), not for the interactive
  Explorer. Not yet wired; see "Next steps".
- **DataForSEO Labs (~$0.012 for 100 rows)** — a database, not live Google. One
  call returns 100 keywords with volume + CPC + trend. This is why keyword research
  is effectively free per keyword: the cost amortizes across every row and every
  cache hit for 7 days.
- **Backlinks (~$0.02 / call)** — the priciest endpoint, so it is the most heavily
  cached (24h) and only fetched when the Backlinks tab is opened.

## Caching (already implemented)

- **Redis + immutable snapshots** for SERPs — identical query/locale/device reuses
  the same snapshot via content-hash dedup (`SearchOrchestrator`).
- **`DataCache` table (stale-while-revalidate)** for Labs + Backlinks — the first
  request serves fresh, later requests serve instantly from cache; a background
  refresh runs only after the TTL expires. Implemented in `DataForSeoService.cached()`.
- Cache keys are **per domain / per locale**, so all users on the same project share
  one paid call.

## Cost projection

Assuming each project's owner opens Backlinks daily and does ~20 keyword searches/week:

| Scale | Backlinks (24h) | Keyword ideas + ranked (7d) | Live SERP (on demand) | **~Monthly** |
| --- | --- | --- | --- | --- |
| 10 projects | 10 x $0.06 x 30 = $18 | 10 x $0.024 x 4 = ~$1 | ~$4 | **~$23** |
| 100 projects | ~$180 | ~$10 | ~$40 | **~$230** |
| 1,000 projects | ~$1,800 | ~$100 | ~$400 | **~$2,300** |

These are ceilings — real usage is far lower because most projects are not opened
every day, and cache hits cost $0. Backlinks dominates the bill, so the biggest
lever is its TTL (raise to 48-72h to roughly halve backlink spend).

## Next steps to cut cost / add power

1. **Scheduled rank tracking on the Standard queue ($0.0006)** — a nightly BullMQ
   job that re-checks each project's tracked keywords and stores history. 3x cheaper
   than Live and gives day-over-day position deltas + charts.
2. **Batch Labs calls** — `keyword_ideas` and `bulk_keyword_difficulty` accept up to
   1,000 keywords per call. Batching a project's whole keyword set into one call is
   cheaper than many small ones.
3. **Per-tenant usage metering + plan caps** — the `SerpCredit` / `SerpUsageLog`
   models already exist; enforce a monthly credit budget per tenant so cost scales
   with revenue, not with abuse.
4. **Longer backlink TTL + "Refresh" button** — default 48-72h cache, with a manual
   refresh for when a user genuinely needs fresh numbers.
5. **Competitor & domain-vs-domain** (Labs `competitors_domain`, `domain_intersection`)
   — high-value, same cheap Labs pricing, 7-day cache.
