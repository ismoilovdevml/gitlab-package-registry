# Phase 1: Foundation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Auth, session, and GitLab API client infrastructure. Users can securely log in via GitLab OAuth on a self-hosted instance, session persists across refresh, logout destroys session, and PAT is stored server-side only. Includes first-run setup wizard and admin panel for GitLab configuration.

</domain>

<decisions>
## Implementation Decisions

### Login UX Flow
- GitLab URL is entered on the login page by the user (not hardcoded in .env)
- Login errors shown inline on the login page (not separate error page) — e.g., "GitLab serverga ulanib bo'lmadi", "Ruxsat berilmadi"
- Self-signed TLS certificates must be supported — many self-hosted GitLab instances use self-signed certs

### Session Handling
- Claude's Discretion: Session TTL, remember me checkbox, token expiry handling
- Claude's Discretion: Multi-device session policy

### Configuration & Setup
- OAuth credentials (Client ID/Secret) and GitLab URL stored in PostgreSQL — manageable via admin UI, not just .env
- First-run experience: Setup wizard — step-by-step guide for GitLab URL, OAuth app creation instructions, test connection
- First user to complete setup wizard becomes admin automatically
- Admin panel UI for managing GitLab connection settings (can change without restart)

### Navigation & Landing
- Login redirects to Dashboard page
- Left sidebar navigation (Nexus/Artifactory style) with: Dashboard, Packages, Projects/Groups, Settings/Admin
- Dashboard contains: statistics cards (total packages, downloads, storage), registry status indicator, quick search field, recent packages list

### Claude's Discretion
- Login page visual design (minimal vs branded — user said "sen hal qil")
- Session TTL duration
- Remember me implementation
- Token expiry UX (redirect vs modal)
- Multi-device session limits
- Loading states and skeleton screens
- Exact sidebar design and responsive behavior

</decisions>

<specifics>
## Specific Ideas

- Nexus/Artifactory-style left sidebar navigation — user explicitly chose this pattern
- Setup wizard for first run — user wants guided onboarding, not just .env configuration
- Admin panel for settings — configuration should be changeable without touching environment variables or restarting
- Dashboard as landing page with stats cards, registry health, quick search, and recent packages

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the foundational patterns for the entire app

### Integration Points
- GitLab OAuth API (self-hosted instance)
- GitLab REST API v4 for version detection and connection testing
- PostgreSQL via Drizzle ORM for configuration storage, audit log, user preferences

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-13*
