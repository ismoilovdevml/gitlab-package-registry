# GitLab Package Registry UI

## What This Is

Enterprise-grade web UI for GitLab Package Registry that provides a Nexus-like experience for managing packages across all supported registries (npm, Maven, PyPI, Docker, NuGet, Go, Composer, Conan, Helm, Generic). Built for large organizations (50+ users) running self-hosted GitLab instances, authenticated via GitLab OAuth with PAT-based API access.

## Core Value

Teams can visually browse, search, publish, delete, and monitor all GitLab package registry assets from a single unified interface — replacing the missing UI that GitLab doesn't provide.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] GitLab OAuth login with automatic PAT management
- [ ] Browse all package registries (npm, Maven, PyPI, Docker, NuGet, Go, Composer, Conan, Helm, Generic)
- [ ] Package listing with search, filtering, sorting across all registry types
- [ ] Package detail view — versions, metadata, dependencies, README
- [ ] Publish packages via UI (upload)
- [ ] Delete packages and package versions via UI
- [ ] Multi-project and multi-group package browsing
- [ ] User/role-based access control with GitLab permissions sync
- [ ] Audit log — who published, deleted, downloaded what and when
- [ ] Download statistics per package and version
- [ ] Storage usage monitoring per project/group
- [ ] Registry health status dashboard
- [ ] Docker image layer inspection and tag management
- [ ] Vulnerability/dependency info display (from GitLab API if available)
- [ ] Bulk operations — delete multiple versions, cleanup old packages
- [ ] Package version comparison
- [ ] Configurable retention policies via UI
- [ ] Dark/light theme
- [ ] Responsive design for mobile access

### Out of Scope

- Kubernetes/Helm deployment — Docker Compose only for v1
- Custom package proxying/caching (Nexus proxy feature) — not a proxy, just a UI
- CI/CD pipeline integration — focus on registry management, not build automation
- gitlab.com SaaS support — self-hosted GitLab only for v1
- LDAP/SSO direct integration — authentication goes through GitLab OAuth

## Context

- User previously used Sonatype Nexus Repository Manager, switched to GitLab Package Registry but found it lacks a proper management UI
- GitLab Package Registry API is well-documented and supports all registry types
- Target: self-hosted GitLab instances (GitLab CE/EE)
- Organization size: 50+ developers across multiple groups and projects
- All standard package types needed: npm, Maven, PyPI, Docker, plus others supported by GitLab
- Enterprise requirements: audit logging, access control, monitoring, bulk operations

## Constraints

- **Tech Stack**: Next.js (React) full-stack framework — user preference
- **Auth**: GitLab OAuth for login + Personal Access Token for API calls
- **Deployment**: Docker Compose based — simple `docker-compose up`
- **GitLab API**: Must work with self-hosted GitLab REST API (v4)
- **Security**: Enterprise-grade — no stored credentials in plain text, secure token handling

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js full-stack | User preference, SSR benefits for large package lists | — Pending |
| GitLab OAuth + PAT | Secure auth without storing passwords, leverages GitLab permissions | — Pending |
| Docker Compose deployment | Simple ops for self-hosted environments | — Pending |
| Self-hosted GitLab only (v1) | Focused scope, API compatibility guaranteed | — Pending |

---
*Last updated: 2026-03-12 after initialization*
