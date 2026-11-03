# Domain Pitfalls

**Domain:** GitLab Package Registry UI (Next.js, GitLab API v4, OAuth + PAT)
**Researched:** 2026-03-12
**Confidence:** MEDIUM — Based on GitLab API v4 documentation knowledge (training cutoff Aug 2025). External verification unavailable in this environment. Flag critical items for manual verification before implementation.

---

## Critical Pitfalls

Mistakes that cause rewrites, security incidents, or fundamental breakage.

---

### Pitfall 1: Conflating OAuth Token with API PAT — Wrong Token for Wrong Job

**What goes wrong:** The GitLab OAuth access token (obtained after login) and a Personal Access Token are different objects with different scopes, expiry behaviors, and API behaviors. Many projects use the OAuth token directly for all package API calls, then hit permission errors on package-specific endpoints that require `api` scope — a scope that OAuth tokens may not carry depending on the OAuth application configuration.

**Why it happens:** GitLab OAuth flow returns an `access_token` that looks like any other bearer token. Developers assume it works everywhere. It doesn't: the OAuth application must request `api` scope explicitly, and even then, some package endpoints behave differently with OAuth tokens vs PATs.

**Consequences:**
- Package publish/delete endpoints silently fail or return 403 with confusing error messages
- The project ships OAuth-based auth, then discovers PAT is needed for certain operations at production time
- Token refresh logic for OAuth (short-lived tokens) and PAT lifecycle (long-lived, user-managed) are completely different — building one system that handles both is complex

**Prevention:**
- Decide upfront: use OAuth for identity/login only, then immediately create a project-scoped PAT programmatically via `/api/v4/users/:id/personal_access_tokens` with `api` scope
- Store the PAT (encrypted) for all subsequent API calls; use the OAuth session only to establish identity
- Document explicitly: OAuth token = authentication identity; PAT = API authorization

**Detection (warning signs):**
- 403 errors on `/packages` endpoints despite successful login
- `"insufficient_scope"` error in API response body
- Package publish works in GitLab UI but fails via your API call

**Phase:** Authentication foundation (Phase 1/2) — must be resolved before any package operations are built

---

### Pitfall 2: Pagination Offset Limit — Hitting the 10,000 Record Wall

**What goes wrong:** GitLab REST API v4 uses offset-based pagination by default (page/per_page). Offset pagination hard-stops at 10,000 records. For large organizations with many packages, `GET /api/v4/groups/:id/packages` or `GET /api/v4/projects/:id/packages` will refuse to paginate beyond offset 10,000. The API returns an empty result or a 422 error — no warning that you've hit a wall.

**Why it happens:** GitLab imposes this limit for database performance. The keyset pagination alternative exists but is not supported on all package endpoints and requires different query parameters (`pagination=keyset`, `order_by=id`, `sort=asc`).

**Consequences:**
- Browse UI silently shows incomplete results for large organizations
- Infinite scroll or "load more" stops working at ~10K items with no user-visible explanation
- Automated cleanup jobs that paginate all versions will silently miss packages

**Prevention:**
- Check keyset pagination support for each endpoint before building pagination logic (`pagination=keyset` query param)
- For endpoints that don't support keyset: implement server-side filtering (search, date ranges, package type) to keep result sets under 10K per query
- Never expose "total package count" from header `X-Total` if it's unreliable at scale — verify behavior with test data

**Detection (warning signs):**
- `GET /api/v4/.../packages?page=101&per_page=100` returns empty array instead of the expected next page
- `X-Total-Pages` header shows fewer pages than logically expected given `X-Total`
- API returns 422 with message about offset exceeding maximum

**Phase:** Package listing/browsing (Phase 2/3) — design pagination strategy before building any list UI

---

### Pitfall 3: Docker Registry Uses a Different API Entirely

**What goes wrong:** The GitLab Package Registry API (`/api/v4/projects/:id/packages`) does NOT cover Docker images. Docker images are served via the Docker Registry HTTP API v2 spec at a separate endpoint (`registry.gitlab.example.com/v2/...`). The GitLab REST API has a Container Registry API (`/api/v4/projects/:id/registry/repositories`) that gives metadata, but image layer inspection, tag manifest fetching, and digest operations go directly to the registry v2 endpoint with separate authentication.

**Why it happens:** Docker Registry is a separate service (GitLab uses its own container registry implementation). The authentication model is also different: it uses a token exchange mechanism (Bearer token from registry auth endpoint), not the standard GitLab PAT/OAuth directly.

**Consequences:**
- Treating Docker the same as npm/Maven in the UI leads to dead endpoints and wrong data shapes
- Layer inspection feature requires a completely separate HTTP client setup with registry auth token exchange
- Deleting Docker tags via the GitLab API marks them for GC but doesn't immediately free space — UI must communicate this clearly
- `docker manifest` data (size, layers, digest) is not in the GitLab REST API; requires registry v2 `GET /v2/:name/manifests/:reference` with Accept header for schema v2

**Prevention:**
- Implement Docker as a distinct registry adapter with its own API client
- Use GitLab REST API (`/registry/repositories`) only for metadata (name, location, tag count)
- Implement registry v2 token auth exchange for any tag/manifest/layer operations
- Clearly separate the Docker code path from other package types from day one

**Detection (warning signs):**
- `GET /api/v4/projects/:id/packages` returns no Docker packages — this is expected, not a bug
- 401 with `Www-Authenticate: Bearer realm=...` from registry endpoint — this is the registry auth challenge, not a GitLab API auth failure

**Phase:** Docker-specific phase or clearly isolated adapter (Phase 3 or later) — do not mix into generic package browsing phase

---

### Pitfall 4: Storing PAT in Next.js Client-Side State — Token Leakage

**What goes wrong:** The PAT (Personal Access Token) used for API calls is placed in React state, localStorage, or a client-accessible cookie, where it's exposed to XSS attacks and browser devtools inspection.

**Why it happens:** Next.js apps commonly store auth tokens in `localStorage` or client-accessible cookies for convenience. Developers new to the OAuth+PAT dual-token pattern don't realize the PAT is a long-lived high-privilege credential that must be treated like a password.

**Consequences:**
- XSS vulnerability exposes PAT — attacker gains full GitLab API access for the victim's account
- PATs are long-lived (can be years) — exposure window is enormous compared to short-lived JWT
- For enterprise: one leaked PAT can expose all packages across all projects the user has access to

**Prevention:**
- Store PAT exclusively in server-side session (encrypted, HttpOnly cookie for session ID, PAT never leaves the server)
- All GitLab API calls go through Next.js API routes (server-side proxy) — client never touches GitLab API directly
- Use `iron-session` or NextAuth.js with encrypted server-side storage for the PAT
- Set PAT expiry during creation (use shortest practical lifetime, rotate programmatically)

**Detection (warning signs):**
- PAT appears in browser Network tab response bodies or request headers
- PAT visible in React DevTools state inspector
- `localStorage.getItem('gitlab_token')` returns a non-null value in browser console

**Phase:** Authentication (Phase 1) — non-negotiable, must be correct from the start

---

### Pitfall 5: Not Handling GitLab Self-Hosted Version Variance

**What goes wrong:** The project assumes a specific GitLab version API behavior. Self-hosted organizations run a wide range of GitLab versions — from 15.x to 17.x. Package Registry API features, endpoint availability, and response schemas differ significantly across versions. A feature that exists in GitLab 16.x may not exist in 15.5.

**Why it happens:** GitLab.com is always on the latest version. Documentation is written for the latest version. Self-hosted instances lag by months or years.

**Consequences:**
- Features built against GitLab 16+ API silently fail on GitLab 15.x installations
- Package type support varies by version (Terraform modules, Conan, Helm added in different releases)
- Bulk delete endpoint was added in GitLab 15.7 — organizations on older versions can't use it
- Group-level package listing behavior changed between versions

**Prevention:**
- Query `GET /api/v4/version` on first connection and store the GitLab version
- Implement feature detection: check version before enabling features that require a minimum GitLab version
- Display GitLab version in the UI settings/status page so admins can see if their version supports all features
- Maintain a compatibility matrix (GitLab version → supported features) in the codebase

**Detection (warning signs):**
- 404 on endpoints that exist in documentation (endpoint may not exist in that GitLab version)
- Response missing fields documented as always present (field added in newer version)
- `GET /api/v4/version` returns `"version": "15.x.x"` and a feature stops working

**Phase:** Initial API client setup (Phase 1/2) — version detection must be built early, not retrofitted

---

## Moderate Pitfalls

---

### Pitfall 6: N+1 API Requests for Package Listings

**What goes wrong:** The package list endpoint returns packages with minimal metadata. To show enriched data (latest version, file size, download count, vulnerability status), the UI fires one additional API request per package. A page of 20 packages generates 20+ sequential API requests, making the UI feel sluggish.

**Why it happens:** GitLab's package list API (`GET /api/v4/projects/:id/packages`) is intentionally lean. Enrichment data lives on separate endpoints (`/packages/:package_id`, `/packages/:package_id/package_versions`).

**Prevention:**
- Design the UI to work with what the list endpoint provides first; load enrichment data lazily on row expansion or hover
- Server-side: batch multiple package detail requests in parallel (Promise.all with concurrency limiting) in the Next.js API route before returning to client
- Cache enrichment data aggressively — package metadata doesn't change frequently

**Detection (warning signs):**
- Browser Network tab shows 20+ API calls firing when a package list page loads
- Page TTFB is fast but time-to-interactive is slow (waterfall of sequential requests)

**Phase:** Package listing UI (Phase 2/3) — establish data fetching patterns before building list views

---

### Pitfall 7: GitLab Group vs Project Package Scoping Confusion

**What goes wrong:** GitLab packages live at the project level but can be browsed at the group level. The group-level API endpoint (`GET /api/v4/groups/:id/packages`) returns packages from all subgroups and projects within the group. The project-level endpoint only returns that project's packages. Cross-group browsing requires iterating group hierarchies — GitLab doesn't have a "search all packages across all groups I have access to" endpoint.

**Why it happens:** GitLab's data model is deeply hierarchical (groups → subgroups → projects). Newcomers assume a flat "all packages" view is available via a single endpoint. It isn't.

**Consequences:**
- "Browse all packages" feature requires multiple API calls to traverse group/subgroup hierarchy
- Package name collisions across groups/projects (two projects can have an npm package with the same name and version)
- Search results from group endpoint may include packages the user can see but can't manage (different permission levels)

**Prevention:**
- Implement group hierarchy traversal explicitly; cache the group tree
- Use the group-level packages endpoint for browsing within a group context
- Make the scope selector (group vs project) a first-class UI element, not an afterthought
- Display package path (group/project/package) always — never just the package name alone

**Phase:** Multi-project browsing (Phase 2/3) — define scoping model before building search

---

### Pitfall 8: CORS and Self-Signed Certificates on Self-Hosted GitLab

**What goes wrong:** Self-hosted GitLab instances frequently use self-signed TLS certificates, internal CA certificates, or non-standard ports. Browser-based API calls and Node.js server-side API calls both reject these by default. Docker registry endpoints on a separate subdomain compound this.

**Why it happens:** Enterprise self-hosted environments regularly use internal PKI infrastructure. Developers test against GitLab.com or a properly-certificated staging instance, then deploy to a customer with a self-signed cert.

**Consequences:**
- `UNABLE_TO_VERIFY_LEAF_SIGNATURE` crashes the Next.js API routes
- Docker registry on `registry.gitlab.example.com` has a different certificate than `gitlab.example.com` — both need to be trusted
- Cannot set `NODE_TLS_REJECT_UNAUTHORIZED=0` globally — this disables ALL TLS verification and is a security violation

**Prevention:**
- Accept a `GITLAB_CA_CERT` environment variable (path to CA bundle) and pass it to the Node.js `https.Agent`
- Use a configurable `httpsAgent` in all Axios/fetch calls to GitLab, not the system default
- Provide a Docker Compose volume mount for the CA certificate bundle
- Test explicitly against a self-signed cert in CI/dev environment

**Phase:** Configuration/deployment setup (Phase 1) — must be addressed before any integration works in real enterprise environments

---

### Pitfall 9: Package Delete Does Not Delete Registry Files Immediately

**What goes wrong:** Deleting a Docker image tag via the GitLab API marks it for garbage collection but doesn't immediately free storage. The file is removed only after the GC job runs (scheduled, typically daily on self-hosted). For non-Docker packages (npm, Maven), deletion is more immediate but still async in some versions.

**Why it happens:** GitLab uses a background GC process to avoid consistency issues and performance impact of synchronous deletion.

**Consequences:**
- Storage usage dashboard shows "stale" storage numbers after bulk deletion
- Users delete packages expecting immediate storage relief, then raise support tickets
- Audit log shows deletion but files still physically present — confusing for compliance

**Prevention:**
- Display a "deletion pending GC" state clearly in the UI after tag/package deletion
- Do not immediately remove the item from the UI list — mark as "pending deletion" instead
- Show a tooltip/note that storage metrics update after garbage collection completes
- Link to GitLab documentation on container registry GC for Docker deletes

**Phase:** Delete operations (Phase 3/4) — UX copy and state management must account for async deletion

---

### Pitfall 10: GitLab API Rate Limiting Under Bulk Operations

**What goes wrong:** Bulk delete operations (delete 200 old package versions) fire many API DELETE requests in rapid succession. GitLab's rate limiter (default: 300 requests per minute per user on self-hosted, configurable by admin) kicks in, returning 429 responses. Naive retry logic with exponential backoff can lock a bulk job for minutes.

**Why it happens:** Bulk operations are often implemented as simple `for` loops with `await` per item, or `Promise.all` across all items simultaneously. Neither approach respects rate limits.

**Consequences:**
- Bulk delete of 500 versions takes 15+ minutes instead of 2 minutes due to throttling
- User sees the operation "stuck" with no progress feedback
- Unhandled 429 responses cause the bulk job to fail silently or crash midway

**Prevention:**
- Implement a rate-limited API client with request queuing (p-queue or similar) — max concurrency 5-10 requests, with automatic 429 retry using `Retry-After` header
- Show real progress for bulk operations (X of Y deleted)
- Add cancellation support for long-running bulk jobs
- Document recommended GitLab rate limit settings for the target instance

**Phase:** Bulk operations (Phase 4/5) — build rate-limited client before any bulk feature

---

### Pitfall 11: Docker Registry Auth Token Expiry Mid-Session

**What goes wrong:** The Docker registry v2 auth token (obtained from the registry auth endpoint) has a short TTL (typically 5 minutes). Long-running operations like layer inspection or bulk tag enumeration will hit 401 mid-operation when the token expires. The UI must re-authenticate with the registry for each operation, or implement token refresh.

**Why it happens:** Docker registry spec defines short-lived tokens as a security feature. GitLab's container registry respects this. Unlike OAuth, there's no refresh token — you get a new token by re-authenticating.

**Prevention:**
- Implement registry token refresh as middleware in the Docker API client
- Cache registry tokens with expiry tracking; auto-refresh before TTL
- Do not reuse registry tokens across different registry repositories (tokens are scoped)

**Phase:** Docker registry feature (Phase 3+) — required for any reliable Docker UI operations

---

## Minor Pitfalls

---

### Pitfall 12: Package Version Sort Order Is Not Semantic

**What goes wrong:** GitLab API returns package versions in creation-date order by default, not semantic version order. Displaying the "latest" version as the first result requires client-side semantic version sorting. For Maven, version schemes are non-trivial (1.0.0-SNAPSHOT vs 1.0.0-RC1 vs 1.0.0).

**Prevention:**
- Use a semver parsing library (semver for npm-style, maven-version-parser for Maven) for client-side sorting
- Never assume API sort order equals "latest version first"
- Allow server-side `order_by=version` where the API supports it, but verify it's semantic-aware (it isn't always)

**Phase:** Package detail view (Phase 2/3)

---

### Pitfall 13: Multi-Format Package Metadata Divergence

**What goes wrong:** Each package type has different metadata shapes. npm packages have `package.json` metadata, Maven has POM files, PyPI has wheel metadata. The GitLab API `/packages/:id` endpoint returns a generic metadata structure that is sparse for some types. Assuming all package types expose the same fields (description, homepage, author) leads to empty UI states.

**Prevention:**
- Define a normalized internal package metadata model with nullable fields
- Implement per-type metadata adapters that extract available fields from GitLab API responses
- Design UI components to gracefully handle missing metadata (don't show empty "Author:" labels)

**Phase:** Package detail view (Phase 2/3)

---

### Pitfall 14: GitLab CI/CD Tokens Should Not Be Used as PATs

**What goes wrong:** GitLab CI/CD job tokens (`CI_JOB_TOKEN`) can authenticate to the package registry for publishing but are scoped and short-lived. Some implementations accidentally support CI job tokens in the UI auth flow, creating security confusion.

**Prevention:**
- Explicitly reject CI job tokens in the auth flow (they won't work for read operations across projects anyway)
- Document clearly: this UI requires a user PAT or admin PAT, not CI tokens

**Phase:** Authentication design (Phase 1)

---

### Pitfall 15: Assuming Package Names Are URL-Safe

**What goes wrong:** Package names across types contain characters that require URL encoding: npm scoped packages (`@scope/package`), Maven group IDs with dots (`com.example.library`), PyPI packages with hyphens/underscores treated as equivalent. Using package names directly in URL paths without encoding causes 404s or incorrect routing.

**Prevention:**
- Always `encodeURIComponent` package names and group IDs when constructing API URLs
- For Maven: encode `/` separators in group IDs (`.` → `/` in Maven coordinates requires special handling)
- Test with scoped npm packages (`@org/package`) from day one

**Phase:** Package browsing/routing (Phase 2)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Auth setup | OAuth token used for all API calls (Pitfall 1) | PAT-for-API design decision upfront |
| Auth setup | PAT stored client-side (Pitfall 4) | Server-side session with encrypted PAT storage |
| Auth setup | GitLab version not detected (Pitfall 5) | Version check on first connection |
| Auth setup | Self-signed TLS certs (Pitfall 8) | Configurable CA cert via env var |
| Package listing | N+1 API requests (Pitfall 6) | Lazy enrichment, server-side batching |
| Package listing | Pagination wall at 10K (Pitfall 2) | Keyset pagination or server-side filtering |
| Package listing | Group scope confusion (Pitfall 7) | Explicit scope selector in UI |
| Package listing | URL-unsafe package names (Pitfall 15) | encodeURIComponent throughout |
| Package detail | Metadata divergence (Pitfall 13) | Nullable normalized model per type |
| Package detail | Version sort not semantic (Pitfall 12) | Client-side semver sort |
| Docker features | Separate registry API (Pitfall 3) | Distinct Docker adapter |
| Docker features | Registry token expiry (Pitfall 11) | Token refresh middleware |
| Delete/cleanup | Async deletion and GC (Pitfall 9) | "Pending deletion" UI state |
| Bulk operations | Rate limiting (Pitfall 10) | p-queue concurrency limiter with 429 handling |
| CI/CD PAT | Job tokens confused with PATs (Pitfall 14) | Explicit rejection in auth flow |

---

## Confidence Notes

| Pitfall | Confidence | Basis |
|---------|------------|-------|
| OAuth vs PAT scope conflict (1) | HIGH | Well-documented GitLab API behavior |
| 10K pagination offset limit (2) | HIGH | GitLab docs state this explicitly |
| Docker Registry separate API (3) | HIGH | Fundamental Docker Registry spec / GitLab architecture |
| PAT client-side leakage (4) | HIGH | Standard web security principle |
| Version variance on self-hosted (5) | HIGH | Well-known operational reality |
| N+1 requests (6) | HIGH | Directly follows from GitLab API response shape |
| Group/project scoping (7) | HIGH | GitLab data model is well-documented |
| Self-signed TLS (8) | MEDIUM | Common in enterprise; severity depends on customer environment |
| Async GC for Docker delete (9) | MEDIUM | Known GitLab behavior, verify current GC scheduling |
| Rate limiting (10) | MEDIUM | Defaults vary by GitLab version and admin config |
| Registry token TTL (11) | MEDIUM | Docker spec behavior; GitLab-specific TTL needs verification |
| Semver sort order (12) | HIGH | API documentation confirms creation-date default sort |
| Metadata divergence (13) | HIGH | Each package type has different metadata schema |
| CI job tokens (14) | MEDIUM | Scoping behavior needs verification per GitLab version |
| URL encoding (15) | HIGH | npm scoped package URL encoding is a known gotcha |

---

## Sources

- GitLab REST API v4 documentation (knowledge cutoff August 2025) — pagination, authentication, package endpoints
- Docker Registry HTTP API v2 specification (OCI Distribution Spec) — registry auth token model
- GitLab Container Registry documentation — architecture separation from Package Registry
- Next.js security best practices — server-side session, HttpOnly cookies
- GitLab rate limiting documentation — self-hosted default limits, 429 behavior
- GitLab Package Registry changelog — version-specific feature availability
- npm package scoping specification — `@scope/package` URL encoding requirements

**Note:** External verification (WebFetch, WebSearch, Context7) was unavailable in this research session. All MEDIUM confidence findings should be validated against current GitLab documentation before being used as blocking design decisions. HIGH confidence findings are based on fundamental API/protocol specifications unlikely to have changed.
