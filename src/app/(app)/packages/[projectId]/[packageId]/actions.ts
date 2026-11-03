"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/gitlab/errors";
import { requireProjectAccess } from "@/lib/gitlab/permissions";
import { AccessLevel } from "@/lib/gitlab/types";
import { routes } from "@/lib/routes";

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const deletePackageSchema = z.object({ projectId: id, packageId: id });
const deleteFileSchema = z.object({ projectId: id, packageId: id, fileId: id });

function revalidatePackagePaths(projectId: number) {
  revalidatePath("/packages", "layout");
  revalidatePath(routes.repository(projectId));
  revalidatePath(routes.dashboard);
}

/** Deletes a package version. Returns where the client should navigate if it was showing that version. */
export async function deletePackage(
  projectId: number,
  packageId: number,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = deletePackageSchema.safeParse({ projectId, packageId });
  if (!parsed.success) return { ok: false, error: "Invalid package reference." };

  const { client, packages, projects } = await getAuthenticatedClient();
  const projectPath = await projects
    .getProject(projectId)
    .then((p) => p.path_with_namespace)
    .catch(() => undefined);
  const fallbackTarget = `package #${packageId}`;

  let pkg;
  try {
    await requireProjectAccess(client, projectId, AccessLevel.MAINTAINER, "delete packages");
    pkg = await packages.getPackage(projectId, packageId);
  } catch (e) {
    await logAudit({
      action: "package.delete",
      targetType: "package",
      target: fallbackTarget,
      projectId,
      projectPath,
      status: "failure",
      metadata: { packageId, error: errorMessage(e) },
    });
    return { ok: false, error: errorMessage(e) };
  }

  const target = `${pkg.name}@${pkg.version}`;
  const metadata = { packageId, name: pkg.name, version: pkg.version, packageType: pkg.package_type };

  try {
    await packages.deletePackage(projectId, packageId);
  } catch (e) {
    await logAudit({
      action: "package.delete",
      targetType: "package",
      target,
      projectId,
      projectPath,
      status: "failure",
      metadata: { ...metadata, error: errorMessage(e) },
    });
    return { ok: false, error: errorMessage(e) };
  }

  await logAudit({ action: "package.delete", targetType: "package", target, projectId, projectPath, metadata });
  revalidatePackagePaths(projectId);

  // Prefer another remaining version of the same package; otherwise the project's package list.
  const remaining = await packages
    .listPackageVersions(projectId, pkg.name, pkg.package_type)
    .then((list) => list.filter((v) => v.id !== packageId && v.status !== "pending_destruction"))
    .catch(() => []);
  const redirectTo = remaining[0]
    ? routes.package(projectId, remaining[0].id)
    : `${routes.packages}?project=${projectId}`;

  return { ok: true, redirectTo };
}

export async function deletePackageFile(projectId: number, packageId: number, fileId: number): Promise<ActionResult> {
  const parsed = deleteFileSchema.safeParse({ projectId, packageId, fileId });
  if (!parsed.success) return { ok: false, error: "Invalid file reference." };

  const { client, packages, projects } = await getAuthenticatedClient();
  const projectPath = await projects
    .getProject(projectId)
    .then((p) => p.path_with_namespace)
    .catch(() => undefined);

  let target = `package #${packageId} / file #${fileId}`;
  let metadata: Record<string, unknown> = { packageId, fileId };

  try {
    await requireProjectAccess(client, projectId, AccessLevel.MAINTAINER, "delete package files");
    const [pkg, files] = await Promise.all([
      packages.getPackage(projectId, packageId),
      packages.getPackageFiles(projectId, packageId),
    ]);
    const file = files.find((f) => f.id === fileId);
    if (!file) throw new Error("This file no longer exists in the package.");
    target = `${pkg.name}@${pkg.version}/${file.file_name}`;
    metadata = {
      ...metadata,
      name: pkg.name,
      version: pkg.version,
      packageType: pkg.package_type,
      fileName: file.file_name,
      size: file.size,
      sha256: file.file_sha256,
    };
    await packages.deletePackageFile(projectId, packageId, fileId);
  } catch (e) {
    await logAudit({
      action: "package.file_delete",
      targetType: "package_file",
      target,
      projectId,
      projectPath,
      status: "failure",
      metadata: { ...metadata, error: errorMessage(e) },
    });
    return { ok: false, error: errorMessage(e) };
  }

  await logAudit({
    action: "package.file_delete",
    targetType: "package_file",
    target,
    projectId,
    projectPath,
    metadata,
  });
  revalidatePath(routes.package(projectId, packageId));
  revalidatePath(routes.repository(projectId));

  return { ok: true };
}
