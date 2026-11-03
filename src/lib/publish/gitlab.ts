import "server-only";

import { gunzipSync } from "node:zlib";
import { buildQuery, type GitLabClient } from "@/lib/gitlab/client";
import { GitLabApiError } from "@/lib/gitlab/errors";
import type { GitLabPackage, PackageType } from "@/lib/gitlab/types";

export class PublishInputError extends GitLabApiError {
  constructor(message: string, status = 400) {
    super(message, status, "PUBLISH_INPUT");
  }
}

/**
 * PUT /projects/:id/packages/generic/:name/:version/:file — streams `body` straight through.
 * `select=package_file` makes GitLab return the file record, which carries `package_id`.
 */
export async function putGenericFile(
  client: GitLabClient,
  input: {
    projectId: number;
    name: string;
    version: string;
    fileName: string;
    body: ReadableStream<Uint8Array>;
    signal?: AbortSignal;
  },
): Promise<{ packageId: number | null }> {
  const path =
    `/projects/${input.projectId}/packages/generic/${encodeURIComponent(input.name)}` +
    `/${encodeURIComponent(input.version)}/${encodeURIComponent(input.fileName)}` +
    buildQuery({ status: "default", select: "package_file" });

  const res = await client.raw(path, {
    method: "PUT",
    body: input.body,
    duplex: "half",
    signal: input.signal,
    headers: { "Content-Type": "application/octet-stream", Accept: "application/json" },
  } as RequestInit);

  const json = (await res.json().catch(() => null)) as { package_id?: number } | null;
  return { packageId: typeof json?.package_id === "number" ? json.package_id : null };
}

/** POST /projects/:id/packages/helm/api/:channel/charts (multipart field `chart`). */
export async function postHelmChart(
  client: GitLabClient,
  input: { projectId: number; channel: string; fileName: string; chart: Buffer; signal?: AbortSignal },
): Promise<void> {
  const form = new FormData();
  form.append("chart", new Blob([new Uint8Array(input.chart)], { type: "application/gzip" }), input.fileName);
  await client.raw(`/projects/${input.projectId}/packages/helm/api/${encodeURIComponent(input.channel)}/charts`, {
    method: "POST",
    body: form,
    signal: input.signal,
  });
}

/** Newest package with this exact name + version (GitLab's package_name filter is fuzzy). */
export async function findPackageId(
  client: GitLabClient,
  projectId: number,
  packageType: PackageType,
  name: string,
  version: string,
): Promise<number | null> {
  const list = await client.request<GitLabPackage[]>(
    `/projects/${projectId}/packages${buildQuery({
      package_type: packageType,
      package_name: name,
      package_version: version,
      order_by: "created_at",
      sort: "desc",
      per_page: 20,
    })}`,
  );
  return list.find((p) => p.name === name && p.version === version)?.id ?? null;
}

/** Reads a request body into memory, failing fast once it exceeds `maxBytes`. */
export async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PublishInputError(`File is larger than the ${Math.round(maxBytes / 1024 ** 2)} MB limit.`, 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function cString(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

function parseChartYaml(text: string): { name: string; version: string } | null {
  const field = (key: string) => {
    const m = text.match(new RegExp(`^${key}:[ \\t]*["']?([^"'#\\s]+)["']?`, "m"));
    return m?.[1] ?? null;
  };
  const name = field("name");
  const version = field("version");
  return name && version ? { name, version } : null;
}

/**
 * Reads `<chart>/Chart.yaml` from a packaged chart (.tgz) to learn its name and version,
 * the same way GitLab does. Returns null when the archive is not a Helm chart.
 */
export function readChartMetadata(tgz: Buffer): { name: string; version: string } | null {
  let tar: Buffer;
  try {
    // Guard against decompression bombs.
    tar = gunzipSync(tgz, { maxOutputLength: 256 * 1024 ** 2 });
  } catch {
    return null;
  }

  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header[0] === 0) break;

    const size = parseInt(cString(header, 124, 12).trim() || "0", 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const isUstar = cString(header, 257, 6).startsWith("ustar");
    const prefix = isUstar ? cString(header, 345, 155) : "";
    const baseName = cString(header, 0, 100);
    const path = longName ?? (prefix ? `${prefix}/${baseName}` : baseName);
    longName = null;

    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);

    if (type === "L") {
      longName = cString(data, 0, data.length);
    } else if (type === "x") {
      const pax = data.toString("utf8").match(/\d+ path=([^\n]+)\n/);
      if (pax) longName = pax[1];
    } else if ((type === "0" || type === "\0" || type === "7") && /^[^/]+\/Chart\.yaml$/.test(path)) {
      return parseChartYaml(data.toString("utf8"));
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}
