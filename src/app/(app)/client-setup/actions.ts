"use server";

import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/dal";
import { errorMessage } from "@/lib/gitlab/errors";

export interface ProjectOption {
  id: number;
  name: string;
  pathWithNamespace: string;
}

const querySchema = z.string().trim().max(100);

/** Read-only: searches projects the user is a member of (for the project picker). */
export async function searchMemberProjects(
  query: string,
): Promise<{ ok: true; projects: ProjectOption[] } | { ok: false; error: string }> {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return { ok: false, error: "Search text is too long" };
  // Outside the try: a signed-out user must get the /login redirect, not an error.
  const { projects } = await getAuthenticatedClient();
  try {
    const res = await projects.listProjects({
      membership: true,
      simple: true,
      archived: false,
      search: parsed.data || undefined,
      order_by: "last_activity_at",
      sort: "desc",
      per_page: 20,
    });
    return {
      ok: true,
      projects: res.data.map((p) => ({ id: p.id, name: p.name, pathWithNamespace: p.path_with_namespace })),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
