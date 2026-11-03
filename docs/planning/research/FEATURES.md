# Feature Landscape

**Domain:** Enterprise Package Registry Management UI
**Researched:** 2026-03-12
**Confidence note:** All external research tools (WebSearch, WebFetch, Brave) were unavailable during this session. Findings are based on training knowledge (cutoff August 2025) of Nexus Repository Manager 3.x, JFrog Artifactory OSS/Pro, Harbor 2.x, GitHub Packages, and GitLab Package Registry. Confidence is MEDIUM — core UI patterns in this domain are well-established and stable, but specific version-gated features may have shifted.

---

## Table Stakes

Features users expect from any enterprise package registry UI. Missing = users leave or reject the product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Browse packages by group/project | Primary navigation pattern in every registry (Nexus, Artifactory, Harbor) | Low | Tree or list view; must show all registry types |
| Package search with filters | Nexus and Artifactory both surface a global search with type/format filters; users expect it immediately | Medium | Filter by registry type, project, name, version |
| Package detail view | Every major registry shows name, description, latest version, metadata, publish date, author | Low | Must include version list |
| Version history list | Users expect to see all published versions with timestamps | Low | Sortable by semver or date |
| Download package/version | Fundamental operation — without it the UI is read-only and useless | Low | Must show copy-to-clipboard install commands |
| Install command snippets | Nexus, Artifactory, and GitHub Packages all generate `npm install`, `pip install`, `mvn` snippets on the detail page | Low | High user-value, low effort |
| Delete package / delete version | Required for storage hygiene and governance in enterprise settings | Medium | Needs confirmation dialog; respects GitLab permissions |
| Publish/upload packages via UI | Users migrating from Nexus expect UI-based publish for at least some formats | High | GitLab API supports upload; UI complexity varies per format |
| Multi-project / multi-group browsing | Organizations with 50+ devs span many groups; Nexus shows all repos in one view | Medium | Must aggregate across GitLab group hierarchy |
| GitLab permissions enforcement | In enterprise settings, row-level access control is non-negotiable | High | Must reflect GitLab role (Guest/Reporter/Developer/Maintainer/Owner) |
| Authentication via GitLab OAuth | Any UI that requires separate credentials for a GitLab-hosted registry will be rejected immediately | High | PAT-based API calls behind the scenes |
| Audit log (publish/delete/download) | Required for compliance in regulated industries; Nexus Pro and Artifactory both provide this | Medium | Who did what to which package, when |
| Download statistics per package | Standard in Nexus and Artifactory; required for identifying high-value packages | Medium | Per-version download counts |
| Storage usage per project/group | Storage cost visibility is essential for enterprises paying per-GB; every major registry has this | Medium | Aggregated and per-registry-type views |
| Registry health / status dashboard | Ops teams need to know if the registry is reachable; Nexus provides "system information" panel | Low-Med | Basic: up/down, API reachable, last sync |
| Dark and light theme | Standard UX expectation in 2025+ developer tooling | Low | CSS variable based; easy with shadcn/tailwind |
| Responsive layout (desktop-first, mobile-usable) | Developers do check registries on mobile for quick lookups | Low | Table layout degrades gracefully |
| Docker tag listing and management | Docker is the most-used registry type in enterprises; tag management is core | Medium | Must list tags, show image digest, allow tag deletion |
| README / metadata display | Nexus and GitHub Packages render package README for npm, PyPI; users expect it | Medium | Render Markdown from package metadata or GitLab API |

---

## Differentiators

Features that distinguish this product from Nexus/Artifactory and provide competitive advantage as a GitLab-native UI.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unified cross-format view | Nexus and Artifactory both suffer from siloed views per repository type; a truly unified list across npm/Maven/Docker/PyPI etc. is rare | High | GitLab API returns all package types; UI must normalize display |
| GitLab CI/CD pipeline linkage | Show which pipeline published a specific version; GitLab API exposes pipeline_id on packages | Medium | Deep integration Nexus can never offer |
| GitLab vulnerability data per package | Surface known vulnerabilities for packages that have been scanned by GitLab's dependency scanning | High | Only possible because we're GitLab-native; Nexus requires Sonatype Lifecycle addon (paid) |
| Bulk operations (multi-select delete, cleanup) | Nexus OSS lacks bulk operations; users of large registries demand them and have to script around this | High | Multi-select UI + batch API calls; careful pagination |
| Configurable retention policies via UI | Nexus Pro has "cleanup policies" but they are complex to configure; GitLab API supports deletion but has no native policy engine | Very High | Policy storage outside GitLab (app DB); schedule-based execution |
| Package version comparison (diff) | No major OSS registry UI offers this; useful for reviewing what changed between two package versions | Very High | Requires package-format-specific diffing; defer to v2+ |
| Docker layer inspection | Harbor offers layer inspection; Nexus does not; this is a docker-power-user feature | High | GitLab Container Registry API exposes manifest and layer info |
| Group-level package aggregation dashboard | Show all packages across a GitLab group hierarchy in one view, with group-level storage stats | High | Requires recursive group traversal via GitLab API |
| Copy install command per package manager | Generates exact install command for the user's specific GitLab instance URL (not a generic snippet) | Low | High perceived value, low implementation cost — strong differentiator because Nexus shows generic syntax |
| Personal access token auto-management | Auto-rotate or surface expiring PATs; nobody else does this in the UI | High | Requires storing PAT metadata and surfacing expiry warnings |

---

## Anti-Features

Features to deliberately NOT build for v1. Scope creep risks or poor fit for this product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Package proxying / caching (Nexus proxy repos) | This product is a UI over GitLab Package Registry — it is explicitly NOT a registry server. Building proxy support requires implementing registry protocol handlers. | Document clearly that the product manages packages already in GitLab; proxy is out of scope permanently |
| CI/CD pipeline authoring or configuration | Nexus Lifecycle and Artifactory Pipelines try to be CI platforms; this product is registry management only | Link to GitLab CI pipeline that published the package, nothing more |
| User creation / GitLab admin management | Creating GitLab users or managing GitLab admin settings belongs in GitLab's own admin UI | Reflect permissions that already exist; never modify them |
| LDAP / SSO direct integration | Auth goes through GitLab OAuth; the GitLab instance handles LDAP/SSO | Surface GitLab auth errors clearly; never bypass GitLab auth |
| Custom package format support (private formats) | GitLab Package Registry only supports its defined formats; adding custom format support requires implementing format-specific parsers | Support only formats GitLab's API surfaces |
| Mobile-first or native mobile app | Enterprise devs use registries on desktop; mobile is nice-to-have but building a native app is a separate product | Ensure responsive layout does not break on mobile, but do not optimize for mobile-first |
| Email/Slack notification system | Alerting infrastructure is a product in itself; v1 has no time budget for it | Log events to audit log; users can build their own alerting on top |
| Package promotion workflows (dev/staging/prod repos) | This is a Nexus Pro / Artifactory concept that maps onto GitLab groups. Too complex for v1. | Users can organize GitLab projects/groups themselves; document the pattern |
| Helm chart testing / validation | CI job responsibility, not registry UI responsibility | Link to CI pipeline |
| Multi-GitLab-instance aggregation | Supporting more than one GitLab instance in a single UI multiplies complexity enormously | Single instance in v1; multi-instance is a v3+ roadmap item |

---

## Feature Dependencies

```
GitLab OAuth + PAT → Everything (no feature works without auth)

GitLab OAuth + PAT → Multi-project browsing
Multi-project browsing → Package listing
Package listing → Search + Filtering
Package listing → Package detail view
Package detail view → Version history
Package detail view → Download statistics
Package detail view → Install command snippets
Package detail view → README display
Package detail view → Vulnerability display (requires GitLab scanning data)

Version history → Delete version
Version history → Bulk operations (delete multiple)
Bulk operations → Configurable retention policies (retention policies execute bulk deletes on a schedule)

GitLab permissions enforcement → Delete package/version (write operations require Maintainer+)
GitLab permissions enforcement → Publish/upload (requires Developer+ role)
GitLab permissions enforcement → Audit log (requires visibility into user identity)

Audit log → Download statistics (both require event tracking layer)

Docker tag listing → Docker layer inspection (layer data requires tag/digest first)

Storage usage → Registry health dashboard (storage is one health metric)
```

---

## MVP Recommendation

The MVP must establish trust with enterprise users migrating from Nexus. That means it must match Nexus OSS's core browsing and management experience on day one, or users will not adopt it.

**Prioritize (must be in MVP):**

1. GitLab OAuth + PAT authentication — without this, nothing works
2. Multi-project / multi-group package browsing — this is the primary use case for 50+ dev orgs
3. Package listing with search and type filters — first thing users do after logging in
4. Package detail view with version history, metadata, README, install commands — replaces the core Nexus browse experience
5. Delete package / delete version with permission check — necessary for storage hygiene
6. Download statistics per package — basic governance requirement
7. Storage usage per project/group — enterprise storage cost visibility
8. Audit log — compliance requirement; cannot defer for regulated industries
9. Docker tag listing and management — Docker is the dominant use case in most orgs
10. Dark/light theme — table stakes for developer tooling in 2025+

**Defer (v2 or later):**

- Publish/upload via UI — complex per-format, users already have CI pipelines; important but not blocker for adoption
- Bulk operations — useful but v1 can defer without losing users
- Configurable retention policies — very high complexity; users can script manual cleanup initially
- Package version comparison — differentiator but niche; v2+
- Docker layer inspection — power user feature; v2+
- Vulnerability display — depends on GitLab scanning data being present; v2+
- GitLab CI pipeline linkage — nice differentiator but v2+
- PAT auto-management — v2+

---

## Sources

- Training knowledge of Nexus Repository Manager 3.x OSS/Pro (Sonatype), confidence MEDIUM
- Training knowledge of JFrog Artifactory OSS/Pro feature set, confidence MEDIUM
- Training knowledge of Harbor 2.x (CNCF container registry), confidence MEDIUM
- Training knowledge of GitHub Packages UI (2024-2025), confidence MEDIUM
- GitLab Package Registry API documentation (v4) — well-documented as of August 2025, confidence HIGH for API capabilities
- Project context from `.planning/PROJECT.md`, confidence HIGH (authoritative)
- No external sources were reachable during this research session (WebSearch, WebFetch, Brave all unavailable)

**Validation recommended:** Before Phase 1 scope is locked, manually verify Nexus OSS 3.x and GitLab Package Registry UI screenshots against this feature list to confirm table stakes categorization.
