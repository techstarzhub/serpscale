# SEO Platform - High Level System Design

Goal: a self-owned SEO tool (SEMrush/Ahrefs style) where the data is our own -
crawled, scraped, and processed by us. This document is the simple, big-picture
view. Details live in each app's own README.

---

## 1. The whole system in one picture

```
                         ┌──────────────────────────┐
                         │         USER             │
                         │  (browser / dashboard)   │
                         └────────────┬─────────────┘
                                      │  HTTPS
                                      ▼
                         ┌──────────────────────────┐
                         │        WEB  (Next.js)     │
                         │  dashboard, auth, reports │
                         │  fully themeable UI       │
                         └────────────┬─────────────┘
                                      │  REST API (JSON)
                                      ▼
                         ┌──────────────────────────┐
                         │        API  (NestJS)      │
                         │  auth, users, billing,    │
                         │  projects, theme, reports │
                         └───┬───────────────┬──────┘
                             │               │
                 reads/writes│               │ queues jobs
                             ▼               ▼
                    ┌────────────────┐   ┌───────────────┐
                    │  PostgreSQL    │   │  Redis (queue)│
                    │  main data     │   │  job pipeline │
                    └────────────────┘   └───────┬───────┘
                                                 │  jobs pulled by workers
             ┌───────────────────────────────────┼───────────────────────────┐
             ▼                    ▼               ▼               ▼
      ┌────────────┐      ┌────────────┐   ┌────────────┐  ┌──────────────┐
      │  CRAWLER   │      │   RANK     │   │  BACKLINK  │  │   KEYWORD    │
      │  (Python)  │      │  TRACKER   │   │  PROCESSOR │  │   ENGINE     │
      │ crawl web  │      │ scrape     │   │ build link │  │ autocomplete │
      │ + audit    │      │ Google SERP│   │ graph, DA  │  │ + volumes    │
      └─────┬──────┘      └─────┬──────┘   └─────┬──────┘  └──────┬───────┘
            │                   │                │                │
            └───────────────────┴────────┬───────┴────────────────┘
                                          ▼
                         ┌──────────────────────────┐
                         │  Storage + Analytics DB   │
                         │  R2 (raw HTML)            │
                         │  ClickHouse (big metrics) │
                         └──────────────────────────┘
```

---

## 2. Each part in one line

| Part | What it does | Tech |
|------|--------------|------|
| Web | The dashboard the user sees: login, projects, reports. UI is 100% themeable. | Next.js + Tailwind |
| API | The brain: handles accounts, permissions, projects, and hands heavy work to the queue. | NestJS + Prisma |
| PostgreSQL | Main database: users, projects, keywords, saved reports. | Postgres |
| Redis (queue) | The to-do list for heavy jobs (crawl this site, check these ranks). | Redis + BullMQ |
| Crawler | Visits websites, saves pages, runs site audits, extracts links. | Python (Scrapy) |
| Rank Tracker | Scrapes Google results to record where keywords rank. | Python + proxies |
| Backlink Processor | Turns crawled links into a link graph and an authority score. | Python + Spark |
| Keyword Engine | Collects keyword ideas and estimates search volume. | Python + Keyword Planner |
| R2 | Cheap bulk storage for raw crawled HTML. | Cloudflare R2 |
| ClickHouse | Fast store for huge amounts of metrics (ranks over time, backlinks). | ClickHouse |

---

## 3. How data flows (a simple example)

User adds a website to track:

1. User types a domain in the dashboard (Web).
2. Web calls the API: "start a project for this domain".
3. API saves the project in PostgreSQL and drops jobs into the Redis queue:
   crawl the site, find its keywords, check its ranks.
4. Workers (Crawler, Rank Tracker, etc.) pick up the jobs one by one.
5. Raw data goes to R2; processed metrics go to ClickHouse / PostgreSQL.
6. When done, the dashboard shows the report. Nothing blocks the user - it all
   runs in the background.

---

## 4. Why this shape

- The Web never talks to the data engines directly - only through the API. One
  clean door in and out.
- Heavy work (crawling, scraping) is separate from the app, so the dashboard
  stays fast and one slow crawl never freezes the site.
- The queue lets us add more worker machines later without changing anything
  else. This is how we scale from 100 sites to millions.
- Each engine (crawler, ranks, backlinks, keywords) is independent - we can
  build and improve them one at a time.

---

## 5. Build order (each step is usable on its own)

1. Web + API + Postgres: accounts, login, themeable dashboard. (starting now)
2. Crawler + Site Audit: our first real, fully-owned data.
3. Rank Tracker: keyword positions over time.
4. Keyword Engine: keyword research.
5. Backlink Processor: link graph + authority.
6. Scale: more workers, ClickHouse, proxy fleet.
</content>
