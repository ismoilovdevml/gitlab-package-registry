import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getAccessToken, verifySession } from "@/lib/session";
import { createGitLabClient } from "@/lib/gitlab/client";
import { createPackageApi } from "@/lib/gitlab/packages";
import { createGroupApi } from "@/lib/gitlab/groups";
import { createProjectApi } from "@/lib/gitlab/projects";
import { createRegistryApi } from "@/lib/gitlab/registry";
import { getSettings } from "@/lib/setup";

/**
 * Per-request GitLab context for the signed-in user. Use from Server Components,
 * Server Actions and Route Handlers. Calls GitLab with the user's own OAuth token,
 * so GitLab enforces that user's permissions on every call.
 */
export const getAuthenticatedClient = cache(async () => {
  const session = await verifySession();
  const settings = await getSettings();
  if (!settings?.gitlabUrl) redirect("/setup");

  const token = await getAccessToken();
  const client = createGitLabClient({ baseUrl: settings.gitlabUrl, token });

  return {
    session,
    gitlabUrl: client.webUrl,
    client,
    packages: createPackageApi(client),
    groups: createGroupApi(client),
    projects: createProjectApi(client),
    registry: createRegistryApi(client),
  };
});

export type GitLabContext = Awaited<ReturnType<typeof getAuthenticatedClient>>;

export { verifySession, requireAdmin } from "@/lib/session";
