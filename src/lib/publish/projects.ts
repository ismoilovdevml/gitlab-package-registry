import "server-only";

import type { GitLabProject } from "@/lib/gitlab/types";
import type { ProjectOption } from "./types";

export function toProjectOption(p: GitLabProject): ProjectOption {
  return {
    id: p.id,
    name: p.name,
    pathWithNamespace: p.path_with_namespace,
    groupId: p.namespace?.kind === "group" ? p.namespace.id : null,
    avatarUrl: p.avatar_url,
  };
}
