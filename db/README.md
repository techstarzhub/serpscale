# Database snapshot (sanitized)

`seo_platform.sanitized.sql` — full `pg_dump` of the database (schema + data),
**with the data of secret-bearing tables excluded** so it is safe to keep in git.

Excluded table DATA (schema is still present — tables restore empty):

- `Integration` — Google OAuth access/refresh tokens
- `PlatformSetting` — SMTP / payment-gateway keys
- `PasswordReset`, `EmailOtp`, `RefreshToken` — ephemeral auth tokens

All other tables (users, orgs, projects, subscriptions, transactions, keywords,
crawl data, etc.) are included with their data.

## Restore

```bash
psql "postgresql://USER:PASSWORD@HOST:5432/DBNAME" -f db/seo_platform.sanitized.sql
```

After restoring on a new environment you must re-supply the excluded secrets:

- Reconnect Google (GA4 / Search Console) per project — repopulates `Integration`
- Re-enter SMTP / gateway keys via the admin settings UI — repopulates `PlatformSetting`

> A full dump *with* secrets is not kept in git (GitHub push-protection blocks it,
> and embedding live third-party credentials in history is unsafe). Take that dump
> locally only when needed:
> `pg_dump "$DATABASE_URL_without_query" -f seo_platform.full.sql`
