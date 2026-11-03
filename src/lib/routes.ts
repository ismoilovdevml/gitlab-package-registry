// Canonical app URLs. Safe for client and server components.

export const routes = {
  dashboard: "/dashboard",
  packages: "/packages",
  package: (projectId: number, packageId: number) => `/packages/${projectId}/${packageId}`,
  repositories: "/repositories",
  repository: (projectId: number) => `/repositories/${projectId}`,
  containerRepository: (projectId: number, repositoryId: number) => `/repositories/${projectId}/containers/${repositoryId}`,
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
  publish: "/publish",
  clientSetup: "/client-setup",
  security: "/security",
  cleanup: "/cleanup",
  audit: "/audit",
  users: "/admin/users",
  settings: "/admin/settings",
} as const;
