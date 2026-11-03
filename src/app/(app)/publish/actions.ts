"use server";

import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { getAuthenticatedClient } from "@/lib/dal";
import { AccessLevel } from "@/lib/gitlab/types";
import { errorMessage } from "@/lib/gitlab/errors";
import { toProjectOption } from "@/lib/publish/projects";
import type { ProjectSearchResult } from "@/lib/publish/types";

const querySchema = z.string().trim().max(100);

/** Projects where the user can publish (Developer+), searched by name/path. Read-only. */
export async function searchPublishProjects(q: string): Promise<ProjectSearchResult> {
  const parsed = querySchema.safeParse(q);
  if (!parsed.success) return { ok: false, error: "Search is too long." };
  try {
    const { projects } = await getAuthenticatedClient();
    const res = await projects.listProjects({
      membership: true,
      min_access_level: AccessLevel.DEVELOPER,
      search: parsed.data || undefined,
      simple: true,
      archived: false,
      order_by: "last_activity_at",
      per_page: 20,
    });
    return { ok: true, projects: res.data.map(toProjectOption) };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}
