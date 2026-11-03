import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getAuthenticatedClient } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { routes } from "@/lib/routes";
import { requireProjectAccess } from "@/lib/gitlab/permissions";
import { AccessLevel } from "@/lib/gitlab/types";
import { GitLabApiError, errorMessage } from "@/lib/gitlab/errors";
import { maxBytesFor, publishRequestSchema, type PublishRequest } from "@/lib/publish/validation";
import type { PublishResult } from "@/lib/publish/types";
import {
  PublishInputError,
  findPackageId,
  postHelmChart,
  putGenericFile,
  readCapped,
  readChartMetadata,
} from "@/lib/publish/gitlab";

// Streams uploads to GitLab; this path is excluded from the proxy matcher, so auth is checked here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

function reply(body: PublishResult, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Cookie auth + POST: reject cross-site callers that slipped past SameSite=Lax. */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const hostHeader = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === hostHeader?.split(",")[0].trim();
  } catch {
    return false;
  }
}

function auditTarget(input: PublishRequest, chart?: { name: string; version: string } | null) {
  if (input.format === "generic") return `${input.name}@${input.version}/${input.fileName}`;
  return chart ? `${chart.name}@${chart.version}` : input.fileName;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return reply({ ok: false, error: "Your session has expired. Sign in again." }, 401);
  if (!isSameOrigin(req)) return reply({ ok: false, error: "Cross-origin uploads are not allowed." }, 403);

  const parsed = publishRequestSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return reply({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload request." }, 400);
  }
  const input = parsed.data;

  if (!req.body) return reply({ ok: false, error: "The file is empty." }, 400);
  const declaredSize = Number(req.headers.get("content-length") || 0);
  if (declaredSize > maxBytesFor(input.format)) {
    return reply({ ok: false, error: "File is larger than the allowed upload size." }, 413);
  }

  let gl: Awaited<ReturnType<typeof getAuthenticatedClient>>;
  try {
    gl = await getAuthenticatedClient();
  } catch (e) {
    if (isRedirect(e)) return reply({ ok: false, error: "Your session has expired. Sign in again." }, 401);
    return reply({ ok: false, error: errorMessage(e) }, 500);
  }

  let projectPath: string | undefined;
  let chart: { name: string; version: string } | null = null;

  try {
    const [, project] = await Promise.all([
      requireProjectAccess(gl.client, input.projectId, AccessLevel.DEVELOPER, "publish packages"),
      gl.projects.getProject(input.projectId).catch(() => null),
    ]);
    projectPath = project?.path_with_namespace;

    let result: PublishResult;

    if (input.format === "generic") {
      const { packageId } = await putGenericFile(gl.client, {
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        fileName: input.fileName,
        body: req.body,
        signal: req.signal,
      });
      const id =
        packageId ??
        (await findPackageId(gl.client, input.projectId, "generic", input.name, input.version).catch(() => null));
      result = {
        ok: true,
        packageUrl: id ? routes.package(input.projectId, id) : undefined,
        packageName: input.name,
        packageVersion: input.version,
      };
    } else {
      const buf = await readCapped(req.body, maxBytesFor("helm"));
      if (buf.length === 0) throw new PublishInputError("The file is empty.");
      chart = readChartMetadata(buf);
      if (!chart) {
        throw new PublishInputError("This .tgz has no <chart>/Chart.yaml with a name and version. Build it with `helm package`.");
      }
      await postHelmChart(gl.client, {
        projectId: input.projectId,
        channel: input.channel,
        fileName: input.fileName,
        chart: buf,
        signal: req.signal,
      });
      // GitLab extracts chart metadata in a background job, so the package may not be listed yet.
      const id = await findPackageId(gl.client, input.projectId, "helm", chart.name, chart.version).catch(() => null);
      result = {
        ok: true,
        packageUrl: id ? routes.package(input.projectId, id) : undefined,
        packageName: chart.name,
        packageVersion: chart.version,
        processing: !id,
      };
    }

    await logAudit({
      action: "package.publish",
      targetType: input.format === "generic" ? "package_file" : "package",
      target: auditTarget(input, chart),
      projectId: input.projectId,
      projectPath,
      status: "success",
      metadata: {
        format: input.format,
        fileName: input.fileName,
        size: declaredSize || undefined,
        channel: input.format === "helm" ? input.channel : undefined,
      },
    });
    return reply(result, 201);
  } catch (e) {
    const aborted = req.signal.aborted || (e instanceof Error && e.name === "AbortError");
    const message = aborted ? "Upload was cancelled." : errorMessage(e);
    await logAudit({
      action: "package.publish",
      targetType: input.format === "generic" ? "package_file" : "package",
      target: auditTarget(input, chart),
      projectId: input.projectId,
      projectPath,
      status: "failure",
      metadata: {
        format: input.format,
        fileName: input.fileName,
        size: declaredSize || undefined,
        channel: input.format === "helm" ? input.channel : undefined,
        error: message,
      },
    });
    const status = aborted ? 499 : e instanceof GitLabApiError ? e.status : 502;
    return reply({ ok: false, error: message }, status >= 400 && status < 600 ? status : 502);
  }
}
