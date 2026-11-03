# Roadmap: GitLab Package Registry UI

## Overview

Four phases take the project from a blank repo to a full enterprise package management UI. Phase 1 establishes the secure auth foundation (nothing else works without it). Phase 2 builds the core browsing experience — the product's primary value. Phase 3 adds Docker registry support and all write/delete operations guarded by GitLab permissions. Phase 4 completes the enterprise surface: audit log, storage monitoring, registry health, bulk operations, and retention policies.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth, session, and GitLab API client infrastructure
- [ ] **Phase 2: Core Browsing** - Multi-project package browsing, search, filtering, and detail views
- [ ] **Phase 3: Docker, Delete & Permissions** - Docker registry support, all delete/publish operations, GitLab role enforcement
- [ ] **Phase 4: Admin, Compliance & Bulk Ops** - Audit log, storage monitoring, health dashboard, bulk delete, retention policies, theming

## Phase Details

### Phase 1: Foundation
**Goal**: Users can securely log in to the app using their GitLab credentials and the app can make authenticated API calls on their behalf
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can visit the app, click "Log in with GitLab", complete OAuth on their self-hosted instance, and land on the app dashboard
  2. After logging in, a browser refresh keeps the user logged in without re-prompting
  3. User can log out from any page and the session is fully destroyed (no stale cookies)
  4. The GitLab PAT is never visible in the browser — it exists only in the encrypted server-side session
**Plans**: TBD

### Phase 2: Core Browsing
**Goal**: Users can browse, search, and inspect packages across all registry types and all their GitLab groups and projects
**Depends on**: Phase 1
**Requirements**: BRWS-01, BRWS-02, BRWS-03, BRWS-04, BRWS-05, BRWS-06, UIUX-02, UIUX-03
**Success Criteria** (what must be TRUE):
  1. User can navigate across groups and projects and see all packages in a unified list regardless of registry type (npm, Maven, PyPI, NuGet, Go, Composer, Conan, Helm, Generic)
  2. User can search packages by name and filter by registry type and project, with results paginating correctly even for large repositories
  3. User can open a package detail page and see version history, metadata, README, and copy-ready install command snippets for their GitLab instance
  4. User can see download statistics per package and per version on the detail page
  5. The app is usable on a mobile browser (responsive layout, no horizontal scrolling on core screens)
**Plans**: TBD

### Phase 3: Docker, Delete & Permissions
**Goal**: Users can manage Docker images and delete packages/versions, with all write operations gated by their GitLab project role
**Depends on**: Phase 2
**Requirements**: DOCK-01, DOCK-02, DOCK-03, MGMT-01, MGMT-02, MGMT-03, MGMT-06
**Success Criteria** (what must be TRUE):
  1. User can browse Docker repositories, see all tags with digest and size, and delete a Docker tag — and the UI shows "pending GC" state after deletion
  2. User can inspect Docker image layers for a given tag
  3. User can delete a package or a specific version via a confirmation dialog — and the operation is blocked with a clear error if they lack Maintainer-level permissions
  4. User can publish/upload a package via the UI to a target project and registry type
**Plans**: TBD

### Phase 4: Admin, Compliance & Bulk Ops
**Goal**: Enterprise operators can audit all activity, monitor storage and registry health, perform bulk cleanup, and configure automated retention policies
**Depends on**: Phase 3
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, MGMT-04, MGMT-05, UIUX-01
**Success Criteria** (what must be TRUE):
  1. User can view an audit log showing who published, deleted, or downloaded which package at what time, with filtering by user, project, and action type
  2. User can see storage usage broken down by project and group, and identify which projects consume the most registry space
  3. User can view a registry health dashboard showing GitLab API connectivity, container registry status, and whether the current instance's features are detected correctly
  4. User can multi-select package versions and bulk delete them in a single operation with progress feedback
  5. User can define a retention policy for a project (e.g., keep last N versions) and the policy executes automatically
  6. User can toggle between dark and light theme, and the preference persists across sessions
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Core Browsing | 0/TBD | Not started | - |
| 3. Docker, Delete & Permissions | 0/TBD | Not started | - |
| 4. Admin, Compliance & Bulk Ops | 0/TBD | Not started | - |
