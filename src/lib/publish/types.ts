// Shared publish types. Safe for client and server components.

export interface ProjectOption {
  id: number;
  name: string;
  pathWithNamespace: string;
  /** Namespace id when the project lives in a group (used by group-level snippets such as Composer). */
  groupId: number | null;
  avatarUrl: string | null;
}

export type PublishResult =
  | {
      ok: true;
      /** Ombor package page, when the created package could be resolved. */
      packageUrl?: string;
      packageName?: string;
      packageVersion?: string;
      /** GitLab is still extracting metadata (Helm), so the package may not be listed yet. */
      processing?: boolean;
    }
  | { ok: false; error: string };

export type ProjectSearchResult = { ok: true; projects: ProjectOption[] } | { ok: false; error: string };
