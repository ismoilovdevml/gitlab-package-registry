import { getAuthenticatedClient } from "@/lib/dal";
import { PageHeader } from "@/components/ombor/page-header";
import { accessLevelOf } from "@/lib/gitlab/permissions";
import { AccessLevel } from "@/lib/gitlab/types";
import { errorMessage } from "@/lib/gitlab/errors";
import { toProjectOption } from "@/lib/publish/projects";
import type { ProjectOption } from "@/lib/publish/types";
import { PublishWorkspace } from "./publish-workspace";

export const metadata = { title: "Publish" };
export const dynamic = "force-dynamic";

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const { session, gitlabUrl, projects } = await getAuthenticatedClient();

  const presetId = Number(sp.project);
  const [listRes, presetRes] = await Promise.allSettled([
    projects.listProjects({
      membership: true,
      min_access_level: AccessLevel.DEVELOPER,
      simple: true,
      archived: false,
      order_by: "last_activity_at",
      per_page: 20,
    }),
    Number.isInteger(presetId) && presetId > 0 ? projects.getProject(presetId) : Promise.resolve(null),
  ]);

  const initialProjects: ProjectOption[] = listRes.status === "fulfilled" ? listRes.value.data.map(toProjectOption) : [];
  const projectsError = listRes.status === "rejected" ? errorMessage(listRes.reason) : null;

  // Preselect ?project=<id> only when the user can actually publish there.
  let presetProject: ProjectOption | null = null;
  if (presetRes.status === "fulfilled" && presetRes.value && accessLevelOf(presetRes.value) >= AccessLevel.DEVELOPER) {
    presetProject = toProjectOption(presetRes.value);
  }

  return (
    <>
      <PageHeader
        title="Publish a package"
        description="Upload by hand for one-off files, or copy a CI job so every tag publishes automatically."
      />
      <PublishWorkspace
        gitlabUrl={gitlabUrl}
        username={session.username}
        initialProjects={initialProjects}
        projectsError={projectsError}
        presetProject={presetProject}
        initialTab={sp.tab === "ci" ? "ci" : "upload"}
      />
    </>
  );
}
