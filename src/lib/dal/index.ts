import "server-only";

import { verifySession } from "@/lib/session";
import { createGitLabClient } from "@/lib/gitlab/client";
import { createPackageApi } from "@/lib/gitlab/packages";
import { createGroupApi } from "@/lib/gitlab/groups";
import { createProjectApi } from "@/lib/gitlab/projects";
import { getSettings } from "@/lib/setup";
import { cache } from "react";

export const getAuthenticatedClient = cache(async () => {
  const session = await verifySession();
  const settings = await getSettings();

  if (!settings?.gitlabUrl) {
    throw new Error("GitLab is not configured. Please complete setup.");
  }

  const client = createGitLabClient({
    baseUrl: settings.gitlabUrl,
    pat: session.pat,
  });

  return {
    session,
    client,
    packages: createPackageApi(client),
    groups: createGroupApi(client),
    projects: createProjectApi(client),
  };
});

export { verifySession } from "@/lib/session";
