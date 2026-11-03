# Ombor

**A Nexus/Artifactory-style UI for the self-hosted GitLab Package & Container Registry.**

Browse, search, publish and clean up packages across every GitLab group from one place.
Users sign in with GitLab; every request runs with their own token, so GitLab roles decide what they can see and do.

![Overview](docs/screenshots/overview.png)

## Features

- **One catalog**: npm, Maven, PyPI, NuGet, Go, Composer, Conan, Helm, Generic, Debian, RubyGems, Terraform and container images across all groups and projects
- **Package detail**: versions, files with checksums, pipelines, copy-paste install commands
- **Search**: by name, `name@version`, or sha256/sha1/md5
- **Publish**: upload Generic packages and Helm charts from the browser
- **Cleanup policies**: keep-latest-N / older-than-N-days, with preview, dry run and a scheduler
- **Security**: registry hygiene checks on any edition, plus vulnerabilities on GitLab Ultimate
- **Audit log**: logins, publishes, deletes and settings changes, with CSV export
- **Admin**: Ombor users (admin role, block, revoke sessions) and GitLab connection settings

| Packages | Package detail |
|---|---|
| ![Packages](docs/screenshots/packages.png) | ![Package detail](docs/screenshots/package-detail.png) |
| **Search** | **Container tags** |
| ![Search](docs/screenshots/search.png) | ![Container tags](docs/screenshots/container-tags.png) |
| **Cleanup policies** | **Security** |
| ![Cleanup](docs/screenshots/cleanup.png) | ![Security](docs/screenshots/security.png) |

## Quick start

1. **Create a GitLab OAuth app** (Admin Area → Applications):
   - Redirect URI: `https://<ombor-host>/api/auth/callback`
   - Scopes: `api` and `read_user`
   - Confidential: on
2. **Run Ombor:**
   ```bash
   cp .env.example .env   # set APP_URL, SESSION_SECRET, POSTGRES_PASSWORD
   docker compose up -d --build
   ```
3. **Open `APP_URL`.** The setup wizard asks for the GitLab URL and the OAuth Client ID/Secret.
   **The first user to sign in becomes the admin.**

Health check: `GET /api/health`.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | yes | Public URL. The OAuth redirect URI is `${APP_URL}/api/auth/callback` |
| `SESSION_SECRET` | yes | At least 32 characters (`openssl rand -base64 48`). Encrypts tokens and secrets at rest |
| `DATABASE_URL` | yes | PostgreSQL. Compose builds it from `POSTGRES_PASSWORD` |
| `NODE_EXTRA_CA_CERTS` | no | CA bundle for a self-signed GitLab certificate |
| `CLEANUP_INTERVAL_MINUTES` | no | How often scheduled cleanup runs. Default 1440 |
| `COOKIE_SECURE` | no | Set `false` only for plain-HTTP test setups |

The GitLab URL and OAuth credentials are stored in the database and can be changed in **Settings** without a restart.
Scheduled cleanup needs a service token (`api` scope, Maintainer), which is also set in **Settings**.

## Permissions

| GitLab role | In Ombor |
|---|---|
| Reporter | View packages and images |
| Developer | Publish |
| Maintainer | Delete versions, files and tags; manage cleanup policies |

## Security

- OAuth tokens are stored server-side and encrypted with AES-256-GCM; the browser only gets an opaque httpOnly session cookie.
- Access tokens are refreshed automatically.
- Every write is checked against the user's GitLab role and written to the audit log.

## Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The database schema is applied automatically on startup. Checks: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

**Stack:** Next.js 16, React 19, Tailwind CSS 4, PostgreSQL with Drizzle.
