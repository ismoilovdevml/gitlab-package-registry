# Requirements: GitLab Package Registry UI

**Defined:** 2026-03-12
**Core Value:** Teams can visually browse, search, publish, delete, and monitor all GitLab package registry assets from a single unified interface

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can log in via GitLab OAuth on self-hosted instance
- [ ] **AUTH-02**: PAT is created and stored server-side in encrypted session
- [ ] **AUTH-03**: User session persists across browser refresh
- [ ] **AUTH-04**: User can log out and session is destroyed

### Package Browsing

- [ ] **BRWS-01**: User can browse packages across all groups and projects
- [ ] **BRWS-02**: User can search packages by name with type/project filters
- [ ] **BRWS-03**: User can view package detail — versions, metadata, README
- [ ] **BRWS-04**: User can see install command snippets per package manager
- [ ] **BRWS-05**: User can view download statistics per package/version
- [ ] **BRWS-06**: User can browse all registry types (npm, Maven, PyPI, Docker, NuGet, Go, Composer, Conan, Helm, Generic)

### Docker Registry

- [ ] **DOCK-01**: User can view Docker image tags and digests
- [ ] **DOCK-02**: User can inspect Docker image layers
- [ ] **DOCK-03**: User can delete Docker tags

### Package Management

- [ ] **MGMT-01**: User can delete packages with confirmation dialog
- [ ] **MGMT-02**: User can delete specific package versions
- [ ] **MGMT-03**: User can publish/upload packages via UI
- [ ] **MGMT-04**: User can perform bulk delete operations (multi-select)
- [ ] **MGMT-05**: User can configure retention policies for auto-cleanup
- [ ] **MGMT-06**: GitLab role-based permissions enforced on all write operations

### Monitoring & Compliance

- [ ] **COMP-01**: Audit log records all publish/delete actions with user and timestamp
- [ ] **COMP-02**: Storage usage displayed per project and group
- [ ] **COMP-03**: Registry health/status dashboard shows connectivity and API status
- [ ] **COMP-04**: CI pipeline linkage shows which pipeline published a version

### UI/UX

- [ ] **UIUX-01**: Dark and light theme toggle
- [ ] **UIUX-02**: Responsive layout works on mobile devices
- [ ] **UIUX-03**: Unified cross-format package view across all registry types

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: GitLab vulnerability data display per package (requires GitLab EE scanning)
- **ADV-02**: Package version comparison (diff between versions)
- **ADV-03**: PAT auto-management and expiry warnings
- **ADV-04**: Multi-GitLab-instance aggregation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Package proxying/caching | This is a UI, not a registry server — no Nexus proxy functionality |
| CI/CD pipeline authoring | Registry management only, not a CI platform |
| User/GitLab admin management | GitLab's own admin UI handles this |
| LDAP/SSO direct integration | Auth goes through GitLab OAuth |
| Custom package format support | Only formats GitLab API supports |
| Native mobile app | Web responsive is sufficient for v1 |
| Email/Slack notifications | Users can build alerting on top of audit log |
| Package promotion workflows | Users organize via GitLab groups |
| Kubernetes deployment | Docker Compose only for v1 |
| gitlab.com SaaS support | Self-hosted GitLab only for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| BRWS-01 | Phase 2 | Pending |
| BRWS-02 | Phase 2 | Pending |
| BRWS-03 | Phase 2 | Pending |
| BRWS-04 | Phase 2 | Pending |
| BRWS-05 | Phase 2 | Pending |
| BRWS-06 | Phase 2 | Pending |
| DOCK-01 | Phase 3 | Pending |
| DOCK-02 | Phase 3 | Pending |
| DOCK-03 | Phase 3 | Pending |
| MGMT-01 | Phase 3 | Pending |
| MGMT-02 | Phase 3 | Pending |
| MGMT-03 | Phase 3 | Pending |
| MGMT-04 | Phase 4 | Pending |
| MGMT-05 | Phase 4 | Pending |
| MGMT-06 | Phase 3 | Pending |
| COMP-01 | Phase 4 | Pending |
| COMP-02 | Phase 4 | Pending |
| COMP-03 | Phase 4 | Pending |
| COMP-04 | Phase 4 | Pending |
| UIUX-01 | Phase 4 | Pending |
| UIUX-02 | Phase 2 | Pending |
| UIUX-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-13 after roadmap creation*
