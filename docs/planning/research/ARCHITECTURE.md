# Architecture Patterns

**Domain:** Enterprise Package Registry UI (Next.js, GitLab API v4)
**Researched:** 2026-03-12
**Sources:** Next.js official docs v16.1.6 (verified, current), GitLab API v4 documentation (training data, MEDIUM confidence), domain analysis of Nexus/Artifactory analogues

---

## Recommended Architecture

A full-stack Next.js 16 App Router application acting as a **proxying UI layer** on top of the GitLab Package Registry REST API. The app holds no package data of its own — it is a stateful interface that issues authenticated requests to a self-hosted GitLab instance, caches responses in-memory within a request, and persists only: the user session (encrypted JWT cookie) and application-level audit events (if tracked independently).

```
Browser
  │
  ▼
[Next.js App - single Docker container]
  │
  ├── proxy.ts          ← Route protection (auth guard, session check)
  ├── app/(auth)/       ← Public: /login, /oauth/callback
  ├── app/(app)/        ← Protected: all authenticated UI
  │     ├── layout.tsx  ← Shell: sidebar, nav, theme, user context
  │     ├── dashboard/  ← Registry health, storage, activity overview
  │     ├── packages/   ← Package browser (all registry types)
  │     ├── projects/   ← Multi-project/group browsing
  │     └── admin/      ← Retention policies, audit log, bulk ops
  │
  ├── app/api/          ← Route Handlers (BFF: proxy to GitLab API)
  │     ├── auth/       ← OAuth callback, token exchange, session CRUD
  │     └── gitlab/     ← Proxied GitLab API requests (PAT injected server-side)
  │
  └── lib/
        ├── gitlab/     ← GitLab API client (typed, paginated, error-normalized)
        ├── session/    ← Encrypted session management (jose + httpOnly cookie)
        ├── dal/        ← Data Access Layer (verifySession + typed data fetchers)
        └── auth/       ← OAuth flow helpers
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `proxy.ts` | Optimistic auth guard on every route. Reads session cookie, redirects unauthenticated requests to `/login`. Does NOT hit the database or GitLab API. | Session cookie only |
| `app/(auth)/` route group | Login page, GitLab OAuth initiation, OAuth callback endpoint, PAT creation/storage. Manages the session cookie lifecycle. | GitLab OAuth endpoints, `lib/session`, `lib/auth` |
| `app/(app)/layout.tsx` | Persistent shell: sidebar navigation, top bar with user info, theme provider. Fetches user identity once per render tree. | `lib/dal.verifySession()`, GitLab `/api/v4/user` |
| `app/(app)/dashboard/` | Registry health dashboard, storage usage per project/group, download statistics, recent activity feed. All data fetched server-side with streaming. | `lib/gitlab/stats`, `lib/gitlab/projects` |
| `app/(app)/packages/` | Package browser: list all packages across groups/projects, search, filter by registry type, sort. Package detail view: versions, metadata, README, dependencies, vulnerability info. | `lib/gitlab/packages` |
| `app/(app)/projects/` | Multi-project and multi-group navigation, selecting scope for package browsing. | `lib/gitlab/groups`, `lib/gitlab/projects` |
| `app/(app)/admin/` | Audit log viewer, retention policy configuration, bulk delete operations. Restricted by GitLab role (maintainer/owner only). | `lib/gitlab/audit`, `lib/gitlab/packages` |
| `app/api/auth/` Route Handlers | OAuth exchange (code → access_token → PAT creation), session set/delete. These are the only endpoints that mutate the session cookie. | GitLab OAuth API, `lib/session` |
| `app/api/gitlab/` Route Handlers | BFF (Backend-For-Frontend) proxy: inject stored PAT into requests, forward to GitLab API, normalize errors, handle pagination. Used for client-side mutations (publish, delete, bulk ops). | GitLab REST API v4, `lib/session` (to retrieve PAT) |
| `lib/gitlab/` | Typed GitLab API client. Handles: pagination (cursor-based keyset where supported, offset elsewhere), rate-limit retry, error normalization, response type definitions for all registry types. | GitLab REST API v4 |
| `lib/session/` | Stateless session: encrypts `{ userId, gitlabUserId, patToken, role }` into a signed JWT using `jose`. Sets/reads `httpOnly; Secure; SameSite=lax` cookie. PAT stored encrypted in cookie — no database required. | `next/headers` cookies API |
| `lib/dal/` | Data Access Layer: `verifySession()` cached per render pass, typed data fetcher functions that enforce auth before calling GitLab client. | `lib/session`, `lib/gitlab` |

---

## Data Flow

### Authentication Flow

```
1. User visits /login
2. Click "Login with GitLab" → redirect to GitLab OAuth authorize URL
3. GitLab redirects to /api/auth/callback?code=...
4. Server: exchange code for access_token (OAuth)
5. Server: use access_token to call GitLab API and create a PAT
   (scope: api, read_registry, write_registry)
6. Server: encrypt { userId, gitlabUserId, pat, role } into JWT
7. Server: set httpOnly cookie with encrypted JWT
8. Redirect to /dashboard
9. proxy.ts reads cookie on every subsequent request — validates JWT signature
```

### Package Browse Flow (Server-rendered, cached)

```
Browser → GET /packages?type=npm&group=42
  │
  ▼
Next.js Server Component (packages/page.tsx)
  ├── lib/dal.verifySession()  ← cached, reads cookie
  ├── lib/gitlab.listPackages({ groupId: 42, type: 'npm', page, perPage })
  │     └── GET https://gitlab.example.com/api/v4/groups/42/packages
  │           Authorization: Bearer <PAT from session>
  └── Render package list as RSC (no client JS for initial view)
      └── Suspense boundaries for slow sections (stats, storage)
```

### Mutation Flow (Client-initiated, through BFF)

```
Browser (Client Component) → user clicks "Delete version"
  │
  ▼
POST /api/gitlab/packages/delete
  │   (body: { projectId, packageId, versionId })
  ▼
Route Handler: lib/dal.verifySession() → extract PAT from session
  │
  ▼
DELETE https://gitlab.example.com/api/v4/projects/{id}/packages/{id}
  │     Authorization: Bearer <PAT>
  ▼
Response → revalidate affected route cache → return to client
```

### Multi-Registry Type Handling

```
GitLab returns packages with a `package_type` field.
lib/gitlab/packages.ts normalizes per type:
  - npm: version = package_version, install cmd = "npm install pkg@ver"
  - maven: version = maven_metadata.version, groupId, artifactId
  - pypi: version = pypi_metadata.version
  - docker: version = tag name, layers available via separate endpoint
  - helm: chart.yaml metadata
  - nuget, go, composer, conan, generic: type-specific metadata fields

A PackageTypeRenderer component selects the correct detail component
based on package_type. Each registry type has its own:
  - metadata display schema
  - install/usage command generator
  - version list format
```

---

## Patterns to Follow

### Pattern 1: Data Access Layer (DAL) with session-gated fetchers

Every server-side data fetch goes through `lib/dal/`. No page or component calls `lib/gitlab/` directly without first passing through `verifySession()`.

**Why:** Prevents accidentally exposing data to unauthenticated users, centralizes token injection, and makes security auditable in one place.

```typescript
// lib/dal/packages.ts
import { cache } from 'react'
import { verifySession } from './session'
import { gitlabClient } from '../gitlab/client'

export const getPackages = cache(async (groupId: number, params: PackageQueryParams) => {
  const session = await verifySession() // throws/redirects if invalid
  return gitlabClient(session.pat).packages.list(groupId, params)
})
```

### Pattern 2: Route Groups for Auth Boundary

Use `(auth)` and `(app)` route groups with separate layouts. `(app)/layout.tsx` calls `verifySession()` once and passes identity down. This prevents the shell from rendering for unauthenticated users.

```
app/
  (auth)/
    login/page.tsx
    layout.tsx          ← minimal layout, no sidebar
  (app)/
    layout.tsx          ← full shell, verifySession() here
    dashboard/page.tsx
    packages/page.tsx
```

### Pattern 3: Streaming with Suspense for Slow GitLab API Calls

Large package listings and statistics endpoints on GitLab can be slow (pagination, cross-group queries). Wrap slow sections in `<Suspense>` with skeleton fallbacks. Ship the page shell immediately.

```typescript
// packages/page.tsx (Server Component)
export default async function PackagesPage() {
  return (
    <PackagesBrowserShell>
      <Suspense fallback={<PackageListSkeleton />}>
        <PackageList groupId={groupId} filters={filters} />
      </Suspense>
      <Suspense fallback={<StatsSkeleton />}>
        <PackageStats groupId={groupId} />
      </Suspense>
    </PackagesBrowserShell>
  )
}
```

### Pattern 4: Parallel Data Fetching on Package Detail Pages

Package detail pages need: package metadata, version list, README, download stats, vulnerability info. Fetch all in parallel, not sequentially.

```typescript
// packages/[id]/page.tsx
const [pkg, versions, readme, stats] = await Promise.allSettled([
  getPackage(projectId, packageId),
  getPackageVersions(projectId, packageId),
  getPackageReadme(projectId, packageId),
  getPackageStats(projectId, packageId),
])
// allSettled so partial data failure doesn't blank the whole page
```

### Pattern 5: BFF Route Handlers for All Mutations

Client components never call the GitLab API directly. All writes (publish, delete, bulk ops, policy config) go through `/api/gitlab/` Route Handlers. This keeps the PAT server-side only, never in the browser.

```typescript
// app/api/gitlab/packages/[id]/route.ts
export async function DELETE(req: NextRequest, { params }) {
  const session = await verifySession()         // server-side only
  const result = await gitlabClient(session.pat)
    .packages.deleteVersion(params.id)
  revalidatePath('/packages')
  return NextResponse.json(result)
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: PAT in Client-Side State

**What:** Storing or passing the Personal Access Token to Client Components (React state, context, localStorage, URL params).

**Why bad:** The PAT has full API write access. If it reaches the browser, it can be exfiltrated via XSS. The entire security model depends on the PAT staying server-side in an httpOnly cookie.

**Instead:** PAT lives only in the encrypted session cookie, read only by Server Components and Route Handlers via `lib/dal`.

### Anti-Pattern 2: Fetching GitLab API Directly from the Browser

**What:** Creating a GitLab API client in a Client Component and calling `gitlab.example.com` from the user's browser.

**Why bad:** Requires exposing the PAT to the browser (see above). Also causes CORS issues since GitLab self-hosted instances are not configured to allow browser requests from unknown origins.

**Instead:** All GitLab API calls happen server-side (Server Components) or through BFF Route Handlers.

### Anti-Pattern 3: Auth Check Only in Proxy/Middleware

**What:** Relying solely on `proxy.ts` (next.js proxy/middleware) for authorization, doing no checks in Route Handlers or Server Components.

**Why bad:** `proxy.ts` performs only optimistic checks (reads cookie, validates JWT shape). It does not confirm the GitLab token is still valid or that the user still has permission on a given resource. A user whose GitLab access was revoked mid-session would pass the proxy check.

**Instead:** `proxy.ts` handles redirects for clearly unauthenticated requests (no cookie). `lib/dal.verifySession()` provides the authoritative check before every data access. GitLab API errors (401, 403) must be handled and surfaced correctly.

### Anti-Pattern 4: One Monolithic Package List Page

**What:** Building a single page that loads ALL packages across all projects/groups before rendering anything.

**Why bad:** Large GitLab instances with 50+ developers and hundreds of packages will have thousands of package records. Fetching all before render causes timeout and blank-page failures.

**Instead:** Scope queries by group or project (user selects context). Use server-side pagination. Stream results with Suspense. Implement cursor-based pagination where GitLab supports keyset pagination (more performant than offset for large datasets).

### Anti-Pattern 5: Per-Registry-Type Page Routes

**What:** Creating separate route segments like `/packages/npm/`, `/packages/maven/`, etc. with duplicated layout/fetching logic.

**Why bad:** 10+ registry types × 3-4 views each = 30-40+ routes with duplicated code. Adding a new registry type means touching many files.

**Instead:** Single `/packages/` route with a `type` filter parameter. One `PackageTypeRenderer` component that selects the appropriate metadata display component based on `package_type`. Registry-specific behavior is isolated to small type-specific modules in `lib/gitlab/registries/`.

---

## Directory Structure (Recommended)

```
src/
  app/
    (auth)/
      login/
        page.tsx
      oauth/
        callback/
          route.ts        ← GitLab OAuth callback handler
      layout.tsx
    (app)/
      layout.tsx          ← App shell: sidebar, nav, auth guard
      dashboard/
        page.tsx          ← Registry health + storage overview
        loading.tsx
      packages/
        page.tsx          ← Package browser (all types)
        loading.tsx
        [packageId]/
          page.tsx        ← Package detail: versions, metadata, README
          loading.tsx
      projects/
        page.tsx          ← Multi-project/group navigator
      admin/
        audit/
          page.tsx        ← Audit log
        retention/
          page.tsx        ← Retention policies
        bulk/
          page.tsx        ← Bulk operations
    api/
      auth/
        callback/
          route.ts
        logout/
          route.ts
      gitlab/
        packages/
          route.ts        ← List/search packages (proxied)
          [id]/
            route.ts      ← Package CRUD
            versions/
              [versionId]/
                route.ts  ← Version delete
        groups/
          route.ts
        projects/
          route.ts
        stats/
          route.ts
    layout.tsx            ← Root layout (html, body, providers)
    page.tsx              ← Redirect to /dashboard or /login
  lib/
    gitlab/
      client.ts           ← Typed fetch wrapper with PAT injection
      packages.ts         ← Package API methods (list, get, delete, publish)
      groups.ts
      projects.ts
      stats.ts
      audit.ts
      registries/
        npm.ts            ← npm-specific metadata/command helpers
        maven.ts
        docker.ts
        pypi.ts
        (... one per registry type)
    session/
      index.ts            ← encrypt/decrypt JWT, createSession, deleteSession
    dal/
      index.ts            ← verifySession (React cache), typed data fetchers
    auth/
      gitlab-oauth.ts     ← OAuth URL builder, token exchange, PAT creation
  components/
    ui/                   ← Base UI primitives (buttons, tables, modals)
    packages/             ← Package-domain components
      PackageList.tsx     ← Server Component
      PackageTypeRenderer.tsx
      PackageVersionTable.tsx
      PublishDialog.tsx   ← Client Component (mutation)
      BulkDeleteDialog.tsx ← Client Component (mutation)
    layout/
      Sidebar.tsx
      TopBar.tsx
      ThemeProvider.tsx   ← Client Component
  types/
    gitlab.ts             ← GitLab API response types (packages, users, groups)
    session.ts
  proxy.ts                ← Route protection (auth guard)
```

---

## Scalability Considerations

| Concern | At 50 users (target) | At 500 users | Notes |
|---------|---------------------|--------------|-------|
| GitLab API rate limits | Single PAT per user, each user's requests use their own token — no shared rate limit. Unproblematic at 50 users. | May hit per-user rate limits for heavy dashboards. Add request deduplication via React `cache()`. | GitLab rate limits are per-token, not shared across the app. |
| Package listing performance | Paginate at 20-50 per page. Group/project scoping keeps query size bounded. | Same approach scales. Consider server-side search index if GitLab API search is too slow. | GitLab API supports keyset pagination for packages — use it over offset. |
| Session storage | Stateless JWT cookie — zero server state. Scales horizontally. | No change needed. | The encrypted cookie model means no session store, no Redis needed for v1. |
| Concurrent users | Single Next.js process in Docker Compose. Node.js handles concurrent requests well for I/O-bound work. | Add `--max-old-space-size` tuning. Docker Compose can be swapped for a single-replicate container orchestrator without code changes. | Not a concern for 50-user target. |
| Docker image size | Multi-stage build: builder + runtime. Keep runtime stage minimal (no devDependencies). | No change needed. | Target <200MB final image. |

---

## Build Order (Phase Dependencies)

The following sequence respects hard dependencies between components:

1. **Session and Auth infrastructure** (`lib/session`, `lib/auth`, `app/api/auth/`, `proxy.ts`) — Everything else depends on having an authenticated user with a valid PAT. No other feature can be built without this foundation.

2. **GitLab API client and DAL** (`lib/gitlab/client.ts`, `lib/dal/`) — The typed client and data access layer must exist before any page can fetch data.

3. **App shell and navigation** (`app/(app)/layout.tsx`, `components/layout/`) — Pages need a container. The layout reads user identity from the session, so auth must be first.

4. **Package browser (core feature)** (`app/(app)/packages/`, `lib/gitlab/packages.ts`) — The primary value of the product. Depends on auth, client, and shell.

5. **Package detail view** — Depends on the package list (needs package_id, project_id from browse context). Includes version list, metadata, and per-registry-type display.

6. **Multi-project/group navigation** (`app/(app)/projects/`) — Enhances the package browser. Can be built in parallel with package detail.

7. **Dashboard and statistics** (`app/(app)/dashboard/`, `lib/gitlab/stats.ts`) — Nice to have overview. Depends on projects list. Can be deferred after core browse/detail.

8. **Mutations: publish and delete** (`PublishDialog`, `BulkDeleteDialog`, Route Handlers) — Write operations. Depend on package detail view being available (need context of what to delete/publish to).

9. **Admin features** (`app/(app)/admin/`) — Audit log, retention policies, bulk operations. These are enterprise features that depend on knowing the package/project structure well. Build last.

---

## Sources

| Source | Type | Confidence |
|--------|------|------------|
| Next.js official docs v16.1.6, `https://nextjs.org/docs/app/` | Official documentation, verified current (last updated 2026-02-27) | HIGH |
| Next.js App Router: layouts, pages, route groups, data fetching, authentication, proxy.ts | Official documentation | HIGH |
| GitLab Package Registry API v4 (`/api/v4/packages`, `/api/v4/groups/:id/packages`, `/api/v4/projects/:id/packages`) | Training data knowledge of GitLab REST API v4 | MEDIUM — verify specific endpoint shapes and pagination behavior against `https://docs.gitlab.com/ee/api/packages.html` during implementation |
| GitLab OAuth + PAT creation pattern | Training data | MEDIUM — verify scopes required for registry read/write against GitLab docs during auth phase |
| Package registry UI patterns (Nexus, Artifactory, Gitea) | Training data domain analysis | MEDIUM — patterns are stable across tools |
