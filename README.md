# Ombor

A JFrog/Nexus-style web UI for the **self-hosted GitLab** Package Registry and Container Registry.
Browse, search, publish, delete and clean up packages across all your GitLab groups and projects from one place.

Users sign in with GitLab OAuth. Every GitLab API call is made with **the signed-in user's own token**,
so GitLab's roles decide what each person can see and do (Reporter: view · Developer: publish · Maintainer: delete / cleanup).

## Features

| Area | What you get |
|------|--------------|
| Overview | Package totals, storage of accessible projects, publishing activity (CI vs manual), recent packages, GitLab health |
| Packages | Cross-group package list with format/status/name filters, multi-select bulk delete |
| Package detail | Versions, files + checksums, pipelines, install snippets per client, delete version/file |
| Repositories | Per-project registry view, storage stats, container images and tags (delete tags/repositories) |
| Search | Name, `name@version` and checksum (sha256/sha1/md5) search, container images |
| Publish | Upload Generic packages and Helm charts from the browser (streamed to GitLab) |
| Client setup | Copy-paste config for npm, Maven, PyPI, NuGet, Go, Composer, Conan, Helm, Generic, Docker + CI snippets |
| Security | Registry hygiene checks on any edition; GitLab Ultimate vulnerabilities when available |
| Cleanup policies | Keep-latest-N / older-than-N-days rules with preview, dry-run, run-now and a scheduler |
| Audit log | Every login, publish, delete, policy and settings change; filters and CSV export |
| Admin | Ombor users (admin role, block, revoke sessions) and GitLab connection settings |

## Quick start (Docker Compose)

1. **Create a GitLab OAuth application** (Admin Area → Applications, or User Settings → Applications):
   - Redirect URI: `https://<ombor-host>/api/auth/callback`
   - Scopes: `api`, `read_user` · Confidential: yes
2. Configure and start:
   ```bash
   cp .env.example .env
   # set APP_URL, SESSION_SECRET (openssl rand -base64 48), POSTGRES_PASSWORD
   docker compose up -d --build
   ```
3. Open `APP_URL`. The setup wizard asks for the GitLab URL and the OAuth Client ID/Secret.
   **The first user to sign in becomes the Ombor admin.**

Health check: `GET /api/health` → `{"status":"ok","database":"ok"}`.

### Self-signed GitLab certificates

Put your CA bundle at `./certs/ca.crt`, then uncomment `NODE_EXTRA_CA_CERTS` and the `volumes` entry for `app` in `docker-compose.yml`.

### Scheduled cleanup

Scheduled cleanup policies run without a user session, so they use a **service token**:
an admin sets it in **Settings → Cleanup service token** (a GitLab group/project access token or PAT with `api` scope
and Maintainer role). Interval: `CLEANUP_INTERVAL_MINUTES` (default 1440). "Run now" in the UI uses your own token.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_URL` | yes | Public URL of Ombor; used for the OAuth redirect URI |
| `SESSION_SECRET` | yes | ≥32 chars. Encrypts OAuth tokens and stored secrets (AES-256-GCM). Changing it signs everyone out and invalidates stored secrets |
| `DATABASE_URL` | yes | PostgreSQL URL (compose builds it from `POSTGRES_PASSWORD`) |
| `COOKIE_SECURE` | no | Force `Secure` cookies on/off (default: on in production). Set `false` only for plain-HTTP test setups |
| `CLEANUP_INTERVAL_MINUTES` | no | Scheduler interval (default 1440) |
| `NODE_EXTRA_CA_CERTS` | no | CA bundle for self-signed GitLab |

GitLab URL and OAuth credentials live in the database and are editable in **Settings** without a restart.

## Security model

- OAuth access/refresh tokens are stored server-side, encrypted; the browser only holds an opaque session id (httpOnly cookie).
  Access tokens are refreshed automatically.
- The OAuth client secret and the cleanup service token are encrypted at rest.
- Write operations are checked against the user's GitLab role before calling GitLab, and GitLab enforces them again.
- All write operations are recorded in the audit log.

## Development

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL, SESSION_SECRET, APP_URL=http://localhost:3000
pnpm dev
```

The database schema is created/updated automatically on startup (`src/lib/db/migrate.ts`).

```bash
pnpm exec tsc --noEmit   # typecheck
pnpm lint                # eslint
pnpm build               # production build
```

## Project layout

```
src/app/(app)/        signed-in pages (dashboard, packages, repositories, search, publish, …)
src/app/(auth)/       sign-in
src/app/(setup)/      first-run wizard
src/app/api/          OAuth callback, logout, setup, publish upload, audit export, health
src/lib/gitlab/       GitLab REST client + typed APIs (packages, projects, groups, registry, catalog)
src/lib/session/      DB-backed sessions with token refresh
src/lib/db/           Drizzle schema + startup migration
src/components/ombor/ shared UI building blocks
```
