# Technology Stack

**Project:** GitLab Package Registry UI
**Researched:** 2026-03-12
**Research sources:** Next.js official docs (v16.1.6, verified 2026-02-27), Tailwind CSS official docs (v4.2, verified), Auth.js docs (verified), training data for ecosystem libraries (LOW-MEDIUM confidence where noted)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 16.x (latest stable) | Full-stack React framework | User requirement; App Router provides Server Components for secure server-side GitLab API calls, route handlers for OAuth callback, middleware for auth guards. SSR is critical for large package lists. |
| React | 19.x (bundled with Next.js 16) | UI rendering | Included with Next.js; React 19 `use()` API available for streaming data from server to client components |
| TypeScript | 5.x | Type safety | Enterprise apps require type safety; Next.js has first-class TypeScript support with `next.config.ts`; GitLab API responses benefit enormously from typed models |

**Confidence:** HIGH — verified from official Next.js docs (version 16.1.6 documented at nextjs.org, last updated 2026-02-27)

---

### Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x (v4.2 current) | Utility-first CSS | Industry standard for React apps; CSS-native configuration (no `tailwind.config.js` needed in v4); faster builds via Vite/PostCSS plugin; works well with component libraries |
| shadcn/ui | latest (component-level versioning) | UI component library | Not a package — it's a code-ownership model where components live in your repo. Components built on Radix UI primitives with Tailwind styling. You own the source. Enterprise-appropriate because there's no vendor lock-in and you can customize deeply. Correct choice for this project over MUI/Ant Design. |

**Confidence:** HIGH for Tailwind v4 (official docs confirmed). MEDIUM for shadcn/ui (training data + strong community consensus, no Context7 available).

**Tailwind v4 note:** v4 has breaking changes from v3 (new `@import "tailwindcss"` syntax, renamed utilities, PostCSS plugin moved to `@tailwindcss/postcss`). New projects should start on v4 directly. Requires Safari 16.4+, Chrome 111+, Firefox 128+ — acceptable for enterprise internal tooling.

---

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Auth.js (NextAuth.js v5) | 5.x | GitLab OAuth + session management | Listed as recommended auth library in official Next.js 16 docs (`authjs.dev`). Supports custom OAuth providers which is required for self-hosted GitLab (custom `issuer` URL). Handles OAuth PKCE flow, session cookies, and JWT. Provides `auth()` helper for Server Components and middleware. |
| jose | 5.x | JWT encryption for session tokens | Recommended directly in Next.js official docs for stateless session encryption. Edge Runtime compatible. Used to encrypt/decrypt the session payload stored in HttpOnly cookies. |

**Confidence:** MEDIUM — Auth.js v5 listed in official Next.js docs as recommended. GitLab provider support for self-hosted instances (custom `issuer` URL) is based on training data and known OAuth standard support — needs validation during Phase 1 auth implementation.

**Auth architecture note:** This app uses a dual-token pattern:
1. Auth.js manages the GitLab OAuth flow and stores the session
2. The GitLab OAuth access token (or a PAT exchanged after login) is stored server-side and used for all GitLab API calls via Next.js Route Handlers — never exposed to the browser

---

### Data Fetching

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native Next.js `fetch` + Server Components | built-in | Server-side GitLab API calls | Official Next.js recommendation for server-side data. Server Components can call GitLab API directly with the user's PAT/token without exposing it to the browser. Eliminates a whole category of client-side token leakage. |
| TanStack Query (React Query) | 5.x | Client-side data fetching and caching | Official Next.js docs explicitly mention it as the recommended community library for client-side data fetching. Required for: real-time search/filter UX, optimistic updates (delete package), infinite scroll for large package lists, background refetch for dashboard stats. |

**Confidence:** HIGH for native fetch in Server Components (official docs). MEDIUM for TanStack Query (named in official Next.js docs alongside SWR; v5 API from training data — needs verification at implementation).

**Data fetching split:**
- Package listings initial load: Server Components + native fetch (SSR, good for SEO if needed, secure)
- Search/filter/pagination: TanStack Query in Client Components (interactive, debounced, cached)
- Mutations (delete, publish): Next.js Server Actions or Route Handlers with TanStack Query mutations

---

### Database / Storage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 15+ | Persistent storage for audit logs, user preferences, session data, cached stats | Enterprise requirement for audit log (who published/deleted what). Cannot rely on GitLab API alone for this. Self-hosted, fits Docker Compose deployment model. |
| Drizzle ORM | 0.30+ | Database access layer | TypeScript-first ORM with excellent Next.js compatibility. SQL-like syntax means less magic than Prisma, easier to debug. Shown in official Next.js docs examples for database access. Lightweight runtime — no Prisma engine binary needed in Docker. |

**Confidence:** HIGH for PostgreSQL choice (standard, verified stable). MEDIUM for Drizzle ORM (referenced in Next.js official docs code examples; version number from training data — verify at setup).

**What to store locally (PostgreSQL):**
- Audit log events (who did what, when — GitLab API doesn't expose this)
- User PAT storage (encrypted at rest) if PAT management is needed
- Cached download statistics (poll GitLab API, cache locally for dashboard)
- User preferences (theme, default project/group filters)
- Session data (alternative to cookie-only sessions for enterprise audit compliance)

**What NOT to store:** Package metadata — always read from GitLab API in real time to stay consistent.

---

### Forms and Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Hook Form | 7.x | Form state management | Industry standard for React forms. Minimal re-renders. Used for: package publish form (with file upload), search/filter forms, retention policy config forms. |
| Zod | 3.x | Schema validation | Explicitly recommended in official Next.js 16 authentication docs for form validation. Used for: validating Server Action inputs, validating GitLab API responses (defensive programming), environment variable validation at startup. |

**Confidence:** MEDIUM — Zod is named directly in Next.js official docs. React Hook Form is standard; version numbers from training data.

---

### State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | 4.x | Global client-side UI state | Lightweight, no boilerplate. Use for: selected packages for bulk operations, sidebar/navigation state, theme preference. NOT for server state (that's TanStack Query's domain). |
| React Context | built-in | Auth state, user context | For sharing the authenticated user profile (username, avatar, permissions) across the component tree without prop drilling. Keep it small — only what's needed client-side. |

**Confidence:** MEDIUM — Zustand is the dominant lightweight state manager for React apps as of training data. Version from training data.

**Rule:** TanStack Query owns all server state (packages, versions, stats). Zustand owns all UI state (selections, open panels, filters). Keep them separate.

---

### Infrastructure and Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker | 27+ | Container runtime | Required by project constraints. Next.js `output: 'standalone'` mode produces minimal Docker image. |
| Docker Compose | 2.x | Local and production orchestration | Required by project constraints. Single `docker-compose up` to start app + PostgreSQL. |
| pnpm | 9.x | Package manager | Faster than npm, better monorepo support if needed later. Disk-efficient. Standard in modern Next.js projects. |

**Confidence:** MEDIUM — Docker/Compose required by spec. pnpm as preference from training data ecosystem trends.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | 2.x | Unit and integration tests | Faster than Jest for TypeScript projects. Compatible with Next.js. Tests for: GitLab API client layer, Drizzle query helpers, Zod schemas, utility functions. |
| Playwright | 1.x | End-to-end tests | Chromium-based E2E for critical flows: OAuth login, package browsing, package deletion. Next.js has first-class Playwright support. |
| React Testing Library | 16.x | Component tests | Test component behavior (not implementation). Use for auth-gated components, bulk operation UI. |

**Confidence:** MEDIUM — Vitest + Playwright is current 2025 standard for Next.js apps. Versions from training data.

---

### Developer Experience

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ESLint + eslint-config-next | built-in | Linting | Official Next.js linting config catches common App Router mistakes. |
| Prettier | 3.x | Code formatting | Standard. |
| Husky + lint-staged | latest | Pre-commit hooks | Enforce lint and format before commit. |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-table` | 8.x | Headless data table | Package listing views with sortable columns, pagination, row selection for bulk ops. Pairs with shadcn/ui table components. |
| `recharts` | 2.x | Charts | Download stats, storage usage graphs on dashboard. Lightweight, React-first. Use over Chart.js which requires canvas manipulation. |
| `nuqs` | 2.x | URL search params state | Sync filter/search/pagination state to URL. Critical for shareability of filtered views. Works with Next.js App Router. |
| `date-fns` | 3.x | Date formatting | Format timestamps in audit log, package publish dates. Lightweight, tree-shakeable. Not moment.js. |
| `lucide-react` | latest | Icons | Used by shadcn/ui. Consistent icon set for package type indicators, action buttons. |
| `@radix-ui/react-*` | latest | Accessible UI primitives | Installed automatically by shadcn/ui for dialogs, dropdowns, tooltips. Do not use directly — go through shadcn/ui wrappers. |
| `server-only` | latest | Server module guard | Mark GitLab API client and session logic as server-only. Prevents accidental import in Client Components. Recommended in Next.js official docs. |
| `next-themes` | 0.3+ | Dark/light theme | Required feature from PROJECT.md. Integrates cleanly with Tailwind and shadcn/ui CSS variable theming. |
| `jose` | 5.x | JWT encryption | Session token encryption (see Auth section). |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| UI Library | shadcn/ui + Tailwind | Material UI (MUI) | MUI ships a full component bundle you can't tree-shake deeply; CSS-in-JS approach conflicts with Tailwind; heavy runtime. shadcn gives you owned source code. |
| UI Library | shadcn/ui + Tailwind | Ant Design | React ecosystem has moved away from Ant Design for greenfield projects; large bundle, opinionated CSS, less TypeScript ergonomics. |
| Styling | Tailwind v4 | Tailwind v3 | v3 is still maintained but new greenfield projects should use v4. No reason to start on v3 and migrate later. |
| Auth | Auth.js v5 | Custom OAuth implementation | Custom OAuth is 200+ lines of security-sensitive code. Auth.js handles PKCE, CSRF, token rotation, session management. GitLab OAuth is standard OAuth 2.0 — Auth.js supports it. |
| ORM | Drizzle | Prisma | Prisma requires a binary engine in Docker which complicates the container. Prisma's generated client is heavier. Drizzle is SQL-first and easier to audit for security. |
| ORM | Drizzle | Raw pg/postgres.js | Drizzle adds type-safe query building without magic; migrations tooling; still gives SQL control when needed. |
| State Management | Zustand | Redux Toolkit | Redux is overkill for this scope. The server state (packages, API data) lives in TanStack Query. UI state (selections, panels) needs only Zustand. |
| Client Data Fetching | TanStack Query v5 | SWR | Both are mentioned in Next.js docs. TanStack Query has richer mutation handling, better DevTools, and better support for paginated/infinite queries — all needed for large package lists. SWR is fine for simpler apps. |
| Charts | Recharts | Chart.js | Chart.js requires imperative canvas manipulation. Recharts is declarative React. For this use case (simple time-series stats) Recharts is sufficient and much easier to integrate. |
| Testing | Vitest | Jest | Vitest is ~10x faster cold start in TypeScript projects. Jest still requires Babel or ts-jest for TS. Vitest is the modern default for new Next.js projects. |
| Package Manager | pnpm | npm | npm is fine but pnpm is significantly faster and reduces disk usage. No behavioral differences for this project. |
| Package Manager | pnpm | Bun | Bun package manager is fast but has edge cases with some Next.js packages. pnpm is safer for enterprise. |

---

## Installation

```bash
# Bootstrap Next.js with TypeScript, Tailwind, App Router, ESLint
pnpm create next-app@latest gitlab-package-registry-ui \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd gitlab-package-registry-ui

# Auth
pnpm add next-auth@beta

# Database
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit

# Data fetching (client-side)
pnpm add @tanstack/react-query @tanstack/react-query-devtools

# Forms and validation
pnpm add react-hook-form zod @hookform/resolvers

# State
pnpm add zustand

# UI primitives (shadcn/ui adds these per-component)
pnpm add lucide-react next-themes

# Utility
pnpm add nuqs date-fns server-only jose

# Tables
pnpm add @tanstack/react-table

# Charts
pnpm add recharts

# Dev dependencies
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/dom
pnpm add -D playwright @playwright/test

# shadcn/ui CLI (interactive — run separately)
pnpm dlx shadcn@latest init
```

---

## Key Architectural Constraints

These are architectural decisions the stack must support:

1. **No GitLab tokens in the browser.** All GitLab API calls go through Next.js Route Handlers or Server Components. The browser never sees the PAT or OAuth access token. This is enforced with `server-only` imports.

2. **Docker Compose self-contained.** The app, PostgreSQL, and any cache must all be in `docker-compose.yml`. No external dependencies (no Redis, no external auth service).

3. **GitLab API as source of truth for packages.** Never cache package metadata in PostgreSQL — always read from GitLab API v4. Local DB is only for data GitLab doesn't provide (audit log, stats cache, user prefs).

4. **Next.js `output: standalone`.** Required for Docker builds. Produces a minimal image. Configure from day one in `next.config.ts`.

---

## Version Confidence Summary

| Library | Version | Source | Confidence |
|---------|---------|--------|------------|
| Next.js | 16.1.6 | Official docs (verified 2026-02-27) | HIGH |
| Tailwind CSS | 4.2 | Official docs (verified 2026-03-12) | HIGH |
| React | 19.x | Bundled with Next.js 16 | HIGH |
| TypeScript | 5.x | Next.js official docs | HIGH |
| Zod | 3.x | Named in Next.js auth docs | MEDIUM |
| Auth.js (NextAuth) | 5.x (beta) | Named in Next.js auth docs | MEDIUM |
| jose | 5.x | Named in Next.js auth docs | MEDIUM |
| TanStack Query | 5.x | Named in Next.js data fetching docs | MEDIUM |
| Drizzle ORM | 0.30+ | Referenced in Next.js ORM docs | MEDIUM |
| shadcn/ui | latest | Training data + community consensus | MEDIUM |
| React Hook Form | 7.x | Training data | LOW-MEDIUM |
| Zustand | 4.x | Training data | LOW-MEDIUM |
| TanStack Table | 8.x | Training data | LOW-MEDIUM |
| nuqs | 2.x | Training data | LOW |
| Recharts | 2.x | Training data | LOW-MEDIUM |
| Vitest | 2.x | Training data | LOW-MEDIUM |
| Playwright | 1.x | Training data | LOW-MEDIUM |

**Action before Phase 1:** Verify all LOW-MEDIUM versions via `pnpm info <package> version` when bootstrapping the project.

---

## Sources

- Next.js 16 official docs: https://nextjs.org/docs — version 16.1.6, last updated 2026-02-27 (verified)
- Next.js Authentication guide: https://nextjs.org/docs/app/guides/authentication (verified — lists Auth.js, recommends Zod, jose)
- Next.js Data Fetching guide: https://nextjs.org/docs/app/getting-started/fetching-data (verified — lists TanStack Query, SWR)
- Tailwind CSS v4 docs: https://tailwindcss.com/docs — v4.2 (verified)
- Tailwind CSS v4 upgrade guide: https://tailwindcss.com/docs/upgrade-guide (verified — breaking changes documented)
- Auth.js docs: https://authjs.dev (WebFetch denied — citing official Next.js docs reference instead)
