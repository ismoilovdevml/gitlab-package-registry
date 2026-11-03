"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { mapLimit } from "@/lib/gitlab/catalog";
import { errorMessage } from "@/lib/gitlab/errors";
import { requireProjectAccess } from "@/lib/gitlab/permissions";
import { AccessLevel } from "@/lib/gitlab/types";

const itemSchema = z.object({
  projectId: z.number().int().positive(),
  packageId: z.number().int().positive(),
  name: z.string().max(500),
  version: z.string().max(255),
  projectPath: z.string().max(500).optional(),
});

const inputSchema = z
  .array(itemSchema)
  .min(1, "Select at least one package.")
  .max(100, "You can delete at most 100 packages at once.");

export type BulkDeleteItem = z.infer<typeof itemSchema>;

export interface BulkDeleteItemResult {
  projectId: number;
  packageId: number;
  name: string;
  version: string;
  ok: boolean;
  error?: string;
}

export type BulkDeleteResult =
  | { ok: true; deleted: number; failed: number; results: BulkDeleteItemResult[] }
  | { ok: false; error: string };

export async function bulkDeletePackages(items: BulkDeleteItem[]): Promise<BulkDeleteResult> {
  const parsed = inputSchema.safeParse(items);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  // Drop duplicate selections of the same package.
  const unique = [...new Map(parsed.data.map((i) => [`${i.projectId}:${i.packageId}`, i])).values()];

  // Outside try: redirects to /login when the session is gone.
  const { client, packages } = await getAuthenticatedClient();

  try {
    // One permission check per project, shared by every item in it (including concurrent ones).
    const access = new Map<number, Promise<void>>();
    const checkAccess = (projectId: number) => {
      let p = access.get(projectId);
      if (!p) {
        p = requireProjectAccess(client, projectId, AccessLevel.MAINTAINER, "delete packages");
        access.set(projectId, p);
      }
      return p;
    };

    const results = await mapLimit(unique, 4, async (item): Promise<BulkDeleteItemResult> => {
      const base = { projectId: item.projectId, packageId: item.packageId, name: item.name, version: item.version };
      let error: string | undefined;
      try {
        await checkAccess(item.projectId);
        await packages.deletePackage(item.projectId, item.packageId);
      } catch (e) {
        error = errorMessage(e);
      }
      await logAudit({
        action: "package.delete",
        targetType: "package",
        target: item.version ? `${item.name}@${item.version}` : item.name,
        projectId: item.projectId,
        projectPath: item.projectPath,
        status: error ? "failure" : "success",
        metadata: { packageId: item.packageId, bulk: true, ...(error ? { error } : {}) },
      });
      return error ? { ...base, ok: false, error } : { ...base, ok: true };
    });

    const deleted = results.filter((r) => r.ok).length;
    const failed = results.length - deleted;

    await logAudit({
      action: "package.bulk_delete",
      targetType: "package",
      target: `${results.length} packages`,
      status: deleted === 0 ? "failure" : "success",
      metadata: {
        requested: results.length,
        deleted,
        failed,
        packages: results.map((r) => ({ projectId: r.projectId, packageId: r.packageId, ok: r.ok })),
      },
    });

    if (deleted > 0) revalidatePath("/packages");
    return { ok: true, deleted, failed, results };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
