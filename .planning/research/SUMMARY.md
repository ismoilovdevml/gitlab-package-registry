# Project Research Summary

**Project:** GitLab Package Registry UI
**Domain:** Enterprise Package Registry Management (Next.js, GitLab API v4)
**Researched:** 2026-03-12
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

This is a full-stack Next.js 16 web application that serves as a management UI over a self-hosted GitLab Package Registry. It is not a registry server — it is a proxying UI layer that issues authenticated requests to GitLab's REST API v4, renders results for enterprise users, and persists only what GitLab does not provide (audit events, cached stats, user preferences). The closest analogues in the industry are Nexus Repository Manager OSS and JFrog Artifactory; the MVP must match Nexus OSS's core browsing and management capabilities to achieve adoption from teams migrating from those tools.

The recommended architecture is a server-rendered Next.js App Router application with a strict server-side security boundary: GitLab PATs never reach the browser. All GitLab API calls are proxied through Next.js Server Components (for reads) and Route Handler BFF endpoints (for mutations). The session stores an encrypted JWT in an HttpOnly cookie, and a Data Access Layer (DAL) enforces authentication on every data access. This is a well-documented pattern in the official Next.js 16 docs and is the right approach for an enterprise tool handling credentials.

The primary risks are authentication architecture (OAuth token vs PAT confusion, PAT leakage if architecture is done wrong), Docker Registry's separate API surface (it uses a different protocol entirely from other package types), and GitLab self-hosted version variance (features and endpoints differ across GitLab 15.x–17.x). All three must be addressed in the foundation phases before building any feature UI. The complexity ceiling is medium — the stack is mainstream and well-documented, the GitLab API is stable for core package operations, and the target user count (~50 users) removes scaling concerns for v1.

---

## Key Findings

### Recommended Stack

The stack is built around Next.js 16 (App Router, TypeScript, React 19) with Tailwind CSS v4 and shadcn/ui for styling. Authentication is handled by Auth.js v5 (NextAuth) with a dual-token pattern: OAuth for identity, a programmatically-created PAT stored server-side for all API calls. Data fetching uses native Server Component fetch for initial SSR loads and TanStack Query v5 for interactive client-side queries. PostgreSQL with Drizzle ORM stores only application-layer data (audit log, cached stats, user preferences — never package metadata). The entire stack runs in Docker Compose with `output: standalone` for minimal image size.

**Core technologies:**
- **Next.js 16 + React 19 + TypeScript 5**: Full-stack framework with App Router — required; Server Components enforce the security boundary by keeping PATs server-side
- **Tailwind CSS v4 + shadcn/ui**: Utility CSS + owned-source component library — correct choice over MUI/Ant Design; no vendor lock-in, deep customization, works with Tailwind v4 CSS variables for theming
- **Auth.js v5 (NextAuth) + jose**: GitLab OAuth flow + stateless encrypted JWT session — listed in official Next.js docs; handles PKCE, CSRF, token rotation; `jose` provides edge-compatible JWT encryption
- **TanStack Query v5**: Client-side data fetching, caching, mutations — named in official Next.js docs; richer mutation and pagination support than SWR; required for interactive search/filter/bulk-op UX
- **PostgreSQL 15+ + Drizzle ORM**: Persistent storage for audit log, cached stats, user preferences — SQL-first, lightweight Docker footprint vs Prisma binary engine
- **pnpm 9**: Package manager — faster, disk-efficient, standard for modern Next.js projects
- **Vitest 2 + Playwright 1 + React Testing Library**: Test pyramid — Vitest is ~10x faster cold start than Jest; Playwright for critical flows (OAuth login, package delete)

**Critical version note:** Next.js 16.1.6 and Tailwind CSS 4.2 are verified via official docs. All other library versions are MEDIUM confidence from training data — run `pnpm info <package> version` during bootstrapping.

### Expected Features

Enterprise users migrating from Nexus OSS expect a complete browsing and management experience on day one. The MVP is anchored around matching Nexus OSS's core feature surface, with GitLab-native differentiators layered on top in v2.

**Must have (table stakes) — MVP:**
- GitLab OAuth + PAT authentication — nothing works without it; any separate credential prompt will cause rejection
- Multi-project/group package browsing — primary use case for 50+ dev organizations
- Package listing with search and type filters (npm, Maven, Docker, PyPI, etc.)
- Package detail view: version history, metadata, README rendering, install command snippets
- Delete package/version with GitLab permission enforcement (Maintainer+ required)
- Download statistics per package — basic governance requirement
- Storage usage per project/group — enterprise cost visibility
- Audit log (who did what, when) — required for regulated industries; cannot be deferred
- Docker tag listing and management — Docker is dominant registry type in most orgs
- Dark/light theme — developer tooling baseline expectation in 2025+

**Should have (competitive differentiators) — v1.x:**
- GitLab CI/CD pipeline linkage (show which pipeline published a version)
- Bulk multi-select delete operations — Nexus OSS lacks this; high demand
- Unified cross-format view (single list across all package types) — rare in competitors
- Instance-specific install command generation (not generic snippets)

**Defer (v2+):**
- Publish/upload packages via UI — users have CI pipelines; important but not adoption blocker
- Configurable retention policies — very high complexity; users can script manual cleanup
- GitLab vulnerability data per package — depends on GitLab scanning being configured
- Docker layer inspection — power user feature
- Package version comparison (diff) — niche differentiator
- PAT auto-management and expiry warnings
- Multi-GitLab-instance aggregation — enormous complexity multiplier; v3+ at earliest

**Anti-features (never build):** Package proxying/caching, CI pipeline authoring, user/GitLab admin management, LDAP/SSO direct integration, custom package formats, native mobile app, email/Slack notifications, package promotion workflows.

### Architecture Approach

The application is a single Next.js 16 Docker container backed by a PostgreSQL container. It acts as a Backend-For-Frontend (BFF): all GitLab API calls are proxied through the server, never issued from the browser. The critical security boundary is enforced architecturally — `server-only` imports prevent the GitLab API client from being bundled into client code. A middleware (`proxy.ts`) provides optimistic route protection, but the authoritative auth check is `lib/dal.verifySession()` called before every data access. This two-layer check is required because middleware cannot validate that the user's GitLab token is still active.

**Major components:**
1. **`proxy.ts` (middleware)** — Optimistic auth guard; reads JWT cookie, redirects unauthenticated requests; does NOT hit DB or GitLab API
2. **`app/(auth)/` route group** — Login, OAuth callback, PAT creation, session lifecycle management
3. **`app/(app)/` route group** — All authenticated UI: dashboard, packages, projects, admin — protected by layout-level `verifySession()`
4. **`app/api/gitlab/` Route Handlers (BFF)** — Proxy all client-initiated mutations (delete, publish, bulk ops) to GitLab; inject PAT server-side; client never sees the PAT
5. **`lib/gitlab/`** — Typed GitLab API client with pagination handling, error normalization, per-registry-type adapters (npm, Maven, Docker uses separate registry v2 client, PyPI, etc.)
6. **`lib/session/`** — Stateless encrypted JWT session using `jose`; PAT stored encrypted in HttpOnly cookie; no session database needed
7. **`lib/dal/`** — Data Access Layer with React `cache()`-wrapped `verifySession()`; all server data fetches go through here; single auditable security boundary
8. **PostgreSQL (via Drizzle ORM)** — Stores only: audit log events, cached download stats, user preferences; never package metadata

**Key patterns to follow:**
- DAL-gated fetchers: no page calls `lib/gitlab/` directly without first calling `verifySession()`
- Route groups `(auth)` / `(app)` for clean auth boundary in layouts
- Streaming with `<Suspense>` for slow GitLab API calls — ship the page shell immediately
- `Promise.allSettled()` for parallel data fetching on detail pages — partial failure should not blank the page
- BFF Route Handlers for all mutations — PAT never leaves the server
- Single `/packages/` route with `type` filter param + `PackageTypeRenderer` — do not create per-format route segments

### Critical Pitfalls

1. **OAuth token ≠ API PAT (Pitfall 1)** — The GitLab OAuth access_token and a PAT have different scopes and behaviors; package write endpoints may require `api` scope that the OAuth token doesn't carry. Solution: use OAuth for identity only; programmatically create a PAT at login time; store the PAT encrypted server-side for all subsequent API calls. Must be resolved in Phase 1 before any package operations are built.

2. **PAT stored client-side (Pitfall 4)** — Placing the PAT in React state, localStorage, or a client-accessible cookie exposes a long-lived high-privilege credential to XSS. Solution: PAT lives only in the encrypted HttpOnly session cookie, read exclusively by Server Components and Route Handlers via `lib/dal`. Non-negotiable from Phase 1.

3. **Docker uses a separate registry API (Pitfall 3)** — `GET /api/v4/projects/:id/packages` does NOT return Docker images. Docker metadata comes from `/api/v4/projects/:id/registry/repositories`; tag/manifest/layer operations require the Docker Registry HTTP API v2 with its own token exchange mechanism (short-lived tokens, not GitLab PATs). Solution: implement Docker as a distinct isolated adapter; do not mix into generic package browsing logic.

4. **GitLab self-hosted version variance (Pitfall 5)** — Organizations run GitLab 15.x–17.x; endpoint availability and response schemas differ materially. Bulk delete added in 15.7; package type support added in different releases. Solution: query `GET /api/v4/version` at startup, store version, implement feature detection before enabling version-gated features. Build this in the API client layer early.

5. **Pagination offset wall at 10,000 records (Pitfall 2)** — GitLab REST API offset pagination hard-stops at 10K records; large organizations will silently get incomplete results. Solution: use keyset pagination (`pagination=keyset`, `order_by=id`) where supported; use server-side filtering to keep result sets bounded. Design pagination strategy before building any list UI.

---

## Implications for Roadmap

Based on the component dependency graph in ARCHITECTURE.md and the feature dependency tree in FEATURES.md, the natural phase structure has 5 phases with a clear hard dependency chain in the first two phases.

### Phase 1: Foundation — Auth, Session, API Client Infrastructure

**Rationale:** Everything depends on an authenticated user with a valid PAT server-side. No feature can be built until the OAuth flow works, the PAT is created and stored correctly, and the GitLab API client is typed and testable. This phase is also where the highest-risk security decisions are made — getting them wrong means rewrites, not patches.

**Delivers:** Working GitLab OAuth login, encrypted server-side session, GitLab API client with version detection, self-signed TLS cert support, middleware route protection, DAL foundation

**Addresses:** Auth (table stake #1 from FEATURES.md)

**Avoids:** Pitfall 1 (OAuth vs PAT), Pitfall 4 (PAT leakage), Pitfall 5 (version variance), Pitfall 8 (TLS cert), Pitfall 14 (CI job tokens)

**Research flag:** NEEDS PHASE RESEARCH — Auth.js v5 GitLab provider configuration for self-hosted instances (custom `issuer` URL) needs API verification; PAT creation scope (`api` vs `write_registry`) needs validation against target GitLab version.

---

### Phase 2: Core Package Browsing (Read-Only)

**Rationale:** The primary value of the product is browsing packages. Once auth works, the fastest path to user value is a working package browser with search, filter, and package detail views. All other features are secondary.

**Delivers:** Multi-project/group navigation, package list with search and type filters, package detail view with version history and install command snippets, README rendering, download statistics, URL-safe routing for all package name formats

**Addresses:** Table stakes 2–8 from FEATURES.md (browsing, search, detail, version history, install commands, stats)

**Avoids:** Pitfall 2 (pagination wall — keyset pagination from the start), Pitfall 6 (N+1 requests — lazy enrichment), Pitfall 7 (group/project scope confusion — explicit scope selector), Pitfall 12 (semver sort), Pitfall 13 (metadata divergence — normalized nullable model), Pitfall 15 (URL encoding)

**Research flag:** Verify GitLab `/api/v4/groups/:id/packages` keyset pagination support and response schema at target GitLab version. Verify `per_page` maximum.

---

### Phase 3: Docker Registry + Delete Operations

**Rationale:** Docker is the dominant package type in enterprise environments and cannot be bolted onto the generic package browser — it requires a separate API client and auth token mechanism. Delete operations are also table stakes for storage hygiene but depend on the detail view being available for context. Group these together as they both require write operations and the Docker adapter.

**Delivers:** Docker tag listing and management, Docker metadata via Container Registry API, delete package/delete version with confirmation dialog and permission check, "pending GC" UI state for Docker deletions, GitLab permissions enforcement on write operations

**Addresses:** Docker tag management (table stake), delete operations (table stake), GitLab role enforcement

**Avoids:** Pitfall 3 (Docker separate API — isolated adapter), Pitfall 9 (async GC — pending deletion state), Pitfall 11 (Docker registry token TTL — refresh middleware)

**Research flag:** NEEDS PHASE RESEARCH — Docker Registry HTTP API v2 authentication against GitLab's container registry (token exchange endpoint, required scopes); confirm whether GitLab self-hosted exposes the registry on a separate subdomain or path.

---

### Phase 4: Dashboard, Storage, and Audit Log

**Rationale:** Compliance and operational visibility features (audit log, storage usage, registry health dashboard) are required for enterprise adoption in regulated industries, but they depend on having a working package browser to provide context. Build after the core browsing experience is stable.

**Delivers:** Audit log (who published/deleted/downloaded, with timestamps), storage usage per project/group, registry health/status panel, download statistics aggregated views, dark/light theme

**Addresses:** Audit log (table stake for compliance), storage visibility (table stake for cost management), health dashboard, theming

**Avoids:** Pitfall 10 (rate limiting for aggregate stats queries — concurrency limiter)

**Research flag:** Determine whether GitLab v4 API provides sufficient data for an audit log or whether application-layer event tracking is the only option. Verify storage stats endpoint availability per GitLab version.

---

### Phase 5: Admin Features — Bulk Operations and Retention Policies

**Rationale:** High-complexity features that depend on the full package understanding built in earlier phases. Bulk operations require the package list and delete operations to be mature. Retention policies require understanding the data model well enough to define policy rules and schedule execution.

**Delivers:** Bulk multi-select delete with progress tracking, configurable retention policy UI, rate-limited API client for bulk operations, policy storage in PostgreSQL, scheduled policy execution

**Addresses:** Bulk operations (v1 differentiator), retention policies (v1 differentiator)

**Avoids:** Pitfall 10 (rate limiting — p-queue with 429/Retry-After handling, mandatory in this phase)

**Research flag:** Verify GitLab bulk delete API availability and batch size limits. Retention policy execution requires a background job scheduler — research Next.js-compatible scheduling patterns (cron in Docker vs external scheduler).

---

### Phase Ordering Rationale

- Phase 1 must come first: auth is a hard dependency for everything else; security decisions made here cannot be retrofitted without rewrites
- Phase 2 comes second because it delivers the primary user value fastest; read-only operations are lower risk and allow early user feedback
- Phase 3 groups Docker and delete operations together because Docker requires the same isolated-adapter thinking that underpins safe delete — both involve separate code paths and GitLab permission verification
- Phase 4 adds visibility and compliance features after the core product is working; these features need real package data to be meaningful
- Phase 5 is last because bulk operations and retention policies carry the highest operational risk and depend on understanding the full data model

### Research Flags

**Needs `/gsd:research-phase` during planning:**
- **Phase 1:** Auth.js v5 custom GitLab OAuth provider configuration; PAT creation API scopes; verify `jose` session encryption implementation pattern against current Next.js 16 auth docs
- **Phase 3:** Docker Registry HTTP API v2 auth against self-hosted GitLab; container registry subdomain vs path configuration
- **Phase 5:** Background job scheduling in containerized Next.js; GitLab bulk delete API specifics

**Standard patterns (skip research-phase):**
- **Phase 2:** Package listing, search, pagination, and detail views follow well-documented Next.js App Router patterns; GitLab package API is stable and well-documented
- **Phase 4:** Dashboard and audit log use standard database query patterns with Drizzle; no novel integration surface

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next.js 16, Tailwind CSS v4, React 19, TypeScript verified against official docs. Auth.js, TanStack Query, Drizzle referenced in official Next.js docs. Individual library version numbers for ecosystem libraries are MEDIUM — verify at bootstrap. |
| Features | MEDIUM | Based on training knowledge of Nexus OSS, Artifactory, Harbor, GitHub Packages (cutoff Aug 2025). Core UI patterns in this domain are stable. External source verification was unavailable during research. |
| Architecture | HIGH | Directly derived from official Next.js 16 App Router documentation (verified current). DAL pattern, route groups, Server Component auth boundary, BFF Route Handlers — all documented in official Next.js auth and data fetching guides. |
| Pitfalls | HIGH for critical pitfalls | OAuth vs PAT, pagination wall, Docker registry separation, PAT leakage, version variance — all based on fundamental GitLab API architecture and standard web security principles. MEDIUM for Docker token TTL, rate limit defaults, async GC behavior — depend on GitLab version and admin configuration. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Auth.js v5 GitLab self-hosted configuration:** Custom `issuer` URL behavior for self-hosted GitLab OAuth providers is not verified against official Auth.js docs. Must validate during Phase 1 before building the auth flow.

- **Keyset pagination support per endpoint:** Not all GitLab package endpoints support keyset pagination. Need to test each list endpoint (`/groups/:id/packages`, `/projects/:id/packages`) against target GitLab version to confirm keyset support before committing to pagination architecture.

- **PAT creation scope requirements:** Exact required scopes for `api`, `read_registry`, `write_registry` on the PAT need verification against target GitLab version — some scopes were renamed or split in GitLab 16.x.

- **Docker Registry v2 endpoint topology:** Whether the container registry is on `registry.gitlab.example.com` or `gitlab.example.com:5050` varies by installation. Self-hosted installs with reverse proxies may have non-standard paths. The Docker adapter must be configurable on the `GITLAB_REGISTRY_URL` env var, not derived from `GITLAB_URL`.

- **Storage stats API availability:** GitLab's per-project storage statistics endpoint availability and response schema should be confirmed before Phase 4 scope is locked.

---

## Sources

### Primary (HIGH confidence)
- Next.js 16 official docs (nextjs.org, version 16.1.6, verified 2026-02-27) — App Router, authentication, data fetching, proxy, route handlers, Server Components
- Next.js Authentication guide (nextjs.org/docs/app/guides/authentication, verified) — Auth.js, jose, Zod, DAL pattern, session encryption, middleware
- Tailwind CSS v4 docs (tailwindcss.com, v4.2, verified 2026-03-12) — CSS-native configuration, PostCSS plugin, breaking changes from v3

### Secondary (MEDIUM confidence)
- GitLab REST API v4 documentation (training knowledge, cutoff Aug 2025) — package endpoints, pagination, authentication, rate limiting, version detection
- Auth.js docs (authjs.dev — WebFetch denied during research; citing via Next.js official docs reference)
- Training knowledge of Nexus Repository Manager 3.x, JFrog Artifactory OSS/Pro, Harbor 2.x, GitHub Packages — feature landscape research
- Docker Registry HTTP API v2 / OCI Distribution Spec — registry auth token model, manifest/layer operations
- GitLab Package Registry changelog — version-specific feature availability

### Tertiary (LOW confidence — validate before use)
- React Hook Form 7.x version — training data, verify at implementation
- Zustand 4.x, TanStack Table 8.x, nuqs 2.x, Recharts 2.x, Vitest 2.x, Playwright 1.x — training data versions; run `pnpm info <package> version` before use

---

*Research completed: 2026-03-12*
*Ready for roadmap: yes*
