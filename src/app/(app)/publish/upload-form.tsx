"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, ExternalLink, FileIcon, Loader2, Terminal, Upload, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CodeBlock, SnippetTabs } from "@/components/ombor/code-block";
import { getFormat } from "@/lib/gitlab/formats";
import { getRegistrySetupSnippets, type InstallContext } from "@/lib/gitlab/install-commands";
import { formatBytes } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { getCliPublishSnippets } from "@/lib/publish/snippets";
import type { ProjectOption, PublishResult } from "@/lib/publish/types";
import {
  CLIENT_FORMATS,
  HELM_GITLAB_DEFAULT_LIMIT,
  genericFileNameSchema,
  genericNameSchema,
  genericVersionSchema,
  helmChannelSchema,
  helmFileNameSchema,
  isUploadFormat,
  maxBytesFor,
  validationError,
  type UploadFormat,
} from "@/lib/publish/validation";
import { ProjectPicker } from "./project-picker";

const FORMAT_HINTS: Record<string, string> = {
  generic: "Any file",
  helm: "Packaged chart (.tgz)",
  npm: "npm publish",
  maven: "mvn deploy / Gradle",
  pypi: "twine upload",
  nuget: "dotnet nuget push",
  composer: "From a git tag",
  conan: "conan upload",
  golang: "From git tags",
  rubygems: "gem push",
  terraform_module: "Module archive",
};
const FORMAT_OPTIONS = ["generic", "helm", ...CLIENT_FORMATS] as const;

type ItemStatus = "queued" | "uploading" | "finishing" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: ItemStatus;
  loaded: number;
  startedAt?: number;
  /** e.g. " · 38 s left", computed in the progress handler. */
  eta?: string;
  error?: string;
  result?: Extract<PublishResult, { ok: true }>;
}

type Phase = "editing" | "uploading" | "done";

function fileError(file: File, format: UploadFormat): string | null {
  if (file.size === 0) return "File is empty.";
  if (file.size > maxBytesFor(format)) return `Larger than the ${formatBytes(maxBytesFor(format))} limit.`;
  return validationError(format === "helm" ? helmFileNameSchema : genericFileNameSchema, file.name);
}

function timeLeft(startedAt: number, loaded: number, total: number): string {
  if (loaded <= 0) return "";
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed < 1) return "";
  const secs = Math.max(0, Math.round((total - loaded) / (loaded / elapsed)));
  if (secs < 60) return ` · ${secs} s left`;
  return ` · ${Math.round(secs / 60)} min left`;
}

/** Sends the raw file with XHR (fetch has no upload progress) to the streaming route handler. */
function sendFile(
  url: string,
  file: File,
  onProgress: (loaded: number) => void,
  onSent: () => void,
  xhrRef: { current: XMLHttpRequest | null },
): Promise<PublishResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.upload.onload = onSent;
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as PublishResult;
        resolve(body.ok || body.error ? body : { ok: false, error: `Upload failed (HTTP ${xhr.status}).` });
      } catch {
        resolve({ ok: false, error: `Upload failed (HTTP ${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error: the upload was interrupted." });
    xhr.onabort = () => resolve({ ok: false, error: "Upload was cancelled." });
    xhr.send(file);
  });
}

function Step({
  n,
  title,
  description,
  done,
  last,
  children,
}: {
  n: number;
  title: string;
  description?: React.ReactNode;
  done?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3 sm:gap-4" aria-labelledby={`publish-step-${n}`}>
      <div className="flex flex-col items-center" aria-hidden>
        <span
          className={cn(
            "tabular flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
            done ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
          )}
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        {!last && <span className="mt-2 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-3", !last && "pb-6")}>
        <div className="flex flex-col gap-0.5 pt-1">
          <h2 id={`publish-step-${n}`} className="text-sm font-semibold">
            {title}
          </h2>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function UploadForm({
  gitlabUrl,
  username,
  initialProjects,
  projectsError,
  presetProject,
  onShowCi,
}: {
  gitlabUrl: string;
  username: string;
  initialProjects: ProjectOption[];
  projectsError: string | null;
  presetProject: ProjectOption | null;
  onShowCi: (format: string) => void;
}) {
  const [project, setProject] = useState<ProjectOption | null>(presetProject);
  const [format, setFormat] = useState<string>("generic");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [channel, setChannel] = useState("stable");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [phase, setPhase] = useState<Phase>("editing");
  const [dragging, setDragging] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelled = useRef(false);
  const nextId = useRef(0);

  const uploadFormat = isUploadFormat(format) ? format : null;
  const locked = phase !== "editing";
  const formatInfo = getFormat(format);

  const nameError = uploadFormat === "generic" ? validationError(genericNameSchema, name) : null;
  const versionError = uploadFormat === "generic" ? validationError(genericVersionSchema, version) : null;
  const channelError = uploadFormat === "helm" ? validationError(helmChannelSchema, channel) : null;
  const itemErrors = new Map(items.map((i) => [i.id, uploadFormat ? fileError(i.file, uploadFormat) : null]));
  const filesValid = items.length > 0 && [...itemErrors.values()].every((e) => !e);
  const fieldsValid = !nameError && !versionError && !channelError;
  const canPublish = !!project && !!uploadFormat && fieldsValid && filesValid && phase === "editing";
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);

  const ctx: InstallContext | null = project
    ? { gitlabUrl, projectId: project.id, projectPath: project.pathWithNamespace, groupId: project.groupId ?? undefined }
    : null;

  function update(id: string, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addFiles(list: FileList | null) {
    if (!list || locked) return;
    const names = new Set(items.map((i) => i.file.name));
    const added: QueueItem[] = [];
    for (const file of Array.from(list)) {
      if (names.has(file.name)) {
        toast.error(`${file.name} is already in the list.`);
        continue;
      }
      names.add(file.name);
      added.push({ id: `f${nextId.current++}`, file, status: "queued", loaded: 0 });
    }
    if (added.length > 0) setItems((prev) => [...prev, ...added]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function publishUrl(file: File): string {
    const params = new URLSearchParams({ projectId: String(project!.id), format: uploadFormat!, fileName: file.name });
    if (uploadFormat === "generic") {
      params.set("name", name.trim());
      params.set("version", version.trim());
    } else {
      params.set("channel", channel.trim());
    }
    return `/api/publish?${params.toString()}`;
  }

  async function publish(only?: Set<string>) {
    setAttempted(true);
    if (!project || !uploadFormat || !fieldsValid || !filesValid) return;
    cancelled.current = false;
    setPhase("uploading");

    const targets = items.filter((i) => (only ? only.has(i.id) : i.status !== "done"));
    let okCount = 0;
    for (const item of targets) {
      if (cancelled.current) break;
      const startedAt = Date.now();
      update(item.id, { status: "uploading", loaded: 0, startedAt, eta: "", error: undefined });
      const res = await sendFile(
        publishUrl(item.file),
        item.file,
        (loaded) => update(item.id, { loaded, eta: timeLeft(startedAt, loaded, item.file.size) }),
        () => update(item.id, { status: "finishing", loaded: item.file.size }),
        xhrRef,
      );
      xhrRef.current = null;
      if (res.ok) {
        okCount++;
        update(item.id, { status: "done", loaded: item.file.size, result: res });
      } else {
        update(item.id, { status: "error", error: res.error });
      }
    }
    setPhase("done");
    if (okCount > 0) toast.success(`Published ${okCount} file${okCount === 1 ? "" : "s"} to ${project.pathWithNamespace}.`);
  }

  function cancelUpload() {
    cancelled.current = true;
    xhrRef.current?.abort();
  }

  function retryFailed() {
    const failed = new Set(items.filter((i) => i.status === "error" || i.status === "queued").map((i) => i.id));
    void publish(failed);
  }

  function startOver() {
    setItems((prev) => prev.filter((i) => i.status !== "done").map((i) => ({ ...i, status: "queued", loaded: 0, error: undefined })));
    setPhase("editing");
    setAttempted(false);
  }

  const doneItems = items.filter((i) => i.status === "done");
  const failedItems = items.filter((i) => i.status === "error");
  const pendingItems = items.filter((i) => i.status === "queued");
  const packageLinks = [...new Map(doneItems.filter((i) => i.result?.packageUrl).map((i) => [i.result!.packageUrl!, i.result!])).values()];
  const anyProcessing = doneItems.some((i) => i.result?.processing);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[2_1_520px] flex-col rounded-xl border bg-card p-5 sm:p-[22px]">
        <Step n={1} title="Target project" description="Projects where you have the Developer role or higher." done={!!project}>
          <ProjectPicker
            id="publish-project"
            value={project}
            onChange={setProject}
            initialProjects={initialProjects}
            initialError={projectsError}
            disabled={locked}
          />
          {attempted && !project && <FieldError id="project-error" message="Pick a target project." />}
        </Step>

        <Step n={2} title="Format" description="Generic files and Helm charts upload here. Other formats publish with their own client." done={!!project}>
          <div role="radiogroup" aria-label="Package format" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FORMAT_OPTIONS.map((f) => {
              const active = f === format;
              const info = getFormat(f);
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={locked}
                  onClick={() => setFormat(f)}
                  className={cn(
                    "flex min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                    active ? "border-primary bg-accent" : "hover:bg-muted",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                    {info.label}
                    {isUploadFormat(f) ? (
                      <Upload className="size-3.5 shrink-0 text-primary" aria-label="Uploads here" />
                    ) : (
                      <Terminal className="size-3.5 shrink-0 text-muted-foreground" aria-label="Uses its own client" />
                    )}
                  </span>
                  <span className="w-full truncate text-xs text-muted-foreground">{FORMAT_HINTS[f]}</span>
                </button>
              );
            })}
          </div>
        </Step>

        {!uploadFormat ? (
          <Step n={3} title={`Publish with the ${formatInfo.label} client`} last>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {formatInfo.label} packages carry metadata that GitLab reads from the native client&apos;s upload, so Ombor
              can&apos;t publish them from the browser. Point your client at the project, then publish from your terminal
              or a CI job.
            </p>
            {ctx ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-medium">Connect your client</h3>
                  <SnippetTabs key={`setup-${format}`} snippets={getRegistrySetupSnippets(format, ctx)} />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-medium">Publish</h3>
                  <SnippetTabs key={`cli-${format}`} snippets={getCliPublishSnippets(format, ctx)} />
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
                Pick a target project to fill in its registry URL.
              </p>
            )}
            <div>
              <Button type="button" variant="outline" size="lg" onClick={() => onShowCi(format)}>
                Show the CI job instead
              </Button>
            </div>
          </Step>
        ) : (
          <>
            <Step
              n={3}
              title="Package"
              description={
                uploadFormat === "helm"
                  ? "The chart name and version are read from Chart.yaml inside each .tgz."
                  : "Uploading to an existing name and version adds files to it."
              }
              done={uploadFormat === "helm" ? !channelError : !nameError && !versionError}
            >
              {uploadFormat === "generic" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="publish-name">Package name</Label>
                    <Input
                      id="publish-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="my-app"
                      disabled={locked}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={(attempted || name !== "") && !!nameError}
                      aria-describedby="publish-name-error"
                      className="h-10 font-mono"
                    />
                    <FieldError id="publish-name-error" message={attempted || name !== "" ? nameError : null} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="publish-version">Version</Label>
                    <Input
                      id="publish-version"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="1.0.0"
                      disabled={locked}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={(attempted || version !== "") && !!versionError}
                      aria-describedby="publish-version-error"
                      className="h-10 font-mono"
                    />
                    <FieldError id="publish-version-error" message={attempted || version !== "" ? versionError : null} />
                  </div>
                </div>
              ) : (
                <div className="flex max-w-xs flex-col gap-1.5">
                  <Label htmlFor="publish-channel">Helm channel</Label>
                  <Input
                    id="publish-channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    placeholder="stable"
                    disabled={locked}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!channelError}
                    aria-describedby="publish-channel-error"
                    className="h-10 font-mono"
                  />
                  <FieldError id="publish-channel-error" message={channelError} />
                </div>
              )}
            </Step>

            <Step
              n={4}
              title="Files"
              description={
                uploadFormat === "helm"
                  ? `One chart per .tgz, up to ${formatBytes(maxBytesFor("helm"))}. GitLab's default Helm limit is ${formatBytes(HELM_GITLAB_DEFAULT_LIMIT)} unless your admin raised it.`
                  : `Up to ${formatBytes(maxBytesFor("generic"))} per file (GitLab's default limit). Names may use letters, digits and . _ - + ~ @.`
              }
              done={filesValid}
            >
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!locked) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "relative flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
                  locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent/60",
                  dragging ? "border-primary bg-accent" : "border-primary/30 bg-accent/40",
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                  <Upload className="size-[22px]" aria-hidden />
                </span>
                <span className="text-[15px] font-medium">
                  Drop {uploadFormat === "helm" ? "charts" : "files"} here or <span className="text-primary">browse</span>
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {uploadFormat === "helm" ? "Build them with helm package." : "Select several files to add them to the same version."}
                </span>
                <input
                  type="file"
                  multiple
                  accept={uploadFormat === "helm" ? ".tgz,application/gzip" : undefined}
                  disabled={locked}
                  aria-label="Choose files"
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {items.length > 0 && (
                <ul className="flex flex-col gap-2.5" aria-label="Files to publish">
                  {items.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      validation={itemErrors.get(item.id) ?? null}
                      removable={!locked}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </ul>
              )}
              {attempted && items.length === 0 && <FieldError id="files-error" message="Add at least one file." />}
            </Step>

            <Step n={5} title="Publish" last done={phase === "done" && failedItems.length === 0 && doneItems.length > 0}>
              {phase === "done" && (
                <ResultPanel
                  project={project}
                  okCount={doneItems.length}
                  failedCount={failedItems.length}
                  skippedCount={pendingItems.length}
                  packageLinks={packageLinks}
                  anyProcessing={anyProcessing}
                />
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {items.length > 0 && phase === "editing" && (
                  <span className="mr-auto text-[13px] text-muted-foreground">
                    {items.length} file{items.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
                  </span>
                )}
                {phase === "uploading" ? (
                  <Button type="button" variant="outline" size="lg" className="h-10 px-4" onClick={cancelUpload}>
                    Stop upload
                  </Button>
                ) : phase === "done" ? (
                  <>
                    {(failedItems.length > 0 || pendingItems.length > 0) && (
                      <Button type="button" variant="outline" size="lg" className="h-10 px-4" onClick={retryFailed}>
                        Retry {failedItems.length + pendingItems.length} remaining
                      </Button>
                    )}
                    <Button type="button" size="lg" className="h-10 px-4" onClick={startOver}>
                      Publish more files
                    </Button>
                  </>
                ) : (
                  <>
                    <Link href={routes.packages} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
                      Cancel
                    </Link>
                    <Button
                      type="button"
                      size="lg"
                      className="h-10 px-[18px]"
                      disabled={!canPublish}
                      onClick={() => publish()}
                    >
                      Publish {items.length > 0 ? `${items.length} file${items.length === 1 ? "" : "s"}` : ""}
                    </Button>
                  </>
                )}
                {phase === "uploading" && (
                  <Button type="button" size="lg" className="h-10 px-4" disabled>
                    <Loader2 className="animate-spin" /> Publishing…
                  </Button>
                )}
              </div>
            </Step>
          </>
        )}
      </div>

      <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="text-[15px] font-semibold">Before you publish</h2>
          <ul className="flex list-disc flex-col gap-2 pl-[18px] text-[13px] leading-normal text-muted-foreground">
            <li>You need the Developer role on the target project.</li>
            {uploadFormat === "generic" && (
              <li>
                Re-uploading to an existing version adds files to it. Whether a duplicate file name is accepted depends on
                the project&apos;s package registry settings.
              </li>
            )}
            {uploadFormat === "helm" && (
              <li>GitLab indexes charts in a background job, so a new chart can take a moment to appear in the list.</li>
            )}
            {!uploadFormat && <li>Duplicate npm and Maven versions can be rejected by the project&apos;s package settings.</li>}
            <li>Files go straight to GitLab; Ombor doesn&apos;t keep a copy. Every upload is recorded in the audit log.</li>
          </ul>
        </section>
        {uploadFormat && (
          <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-5">
            <h2 className="text-[15px] font-semibold">Same thing with curl</h2>
            <CodeBlock code={curlSnippet({ gitlabUrl, username, project, format: uploadFormat, name, version, channel, fileName: items[0]?.file.name })} />
          </section>
        )}
      </aside>
    </div>
  );
}

function curlSnippet(o: {
  gitlabUrl: string;
  username: string;
  project: ProjectOption | null;
  format: UploadFormat;
  name: string;
  version: string;
  channel: string;
  fileName?: string;
}): string {
  const projectId = o.project ? String(o.project.id) : "<project_id>";
  const base = `${o.gitlabUrl}/api/v4/projects/${projectId}/packages`;
  if (o.format === "helm") {
    const file = o.fileName ?? "my-chart-1.0.0.tgz";
    return `curl --fail-with-body --request POST \\\n  --user ${o.username}:<your_token> \\\n  --form "chart=@${file}" \\\n  "${base}/helm/api/${o.channel.trim() || "stable"}/charts"`;
  }
  const file = o.fileName ?? "<file_name>";
  return `curl --fail-with-body --header "PRIVATE-TOKEN: <your_token>" \\\n  --upload-file ${file} \\\n  "${base}/generic/${o.name.trim() || "<name>"}/${o.version.trim() || "<version>"}/${file}"`;
}

function QueueRow({
  item,
  validation,
  removable,
  onRemove,
}: {
  item: QueueItem;
  validation: string | null;
  removable: boolean;
  onRemove: () => void;
}) {
  const pct = item.file.size > 0 ? Math.min(100, Math.round((item.loaded / item.file.size) * 100)) : 0;
  let status: React.ReactNode;
  let tone = "text-muted-foreground";
  let bar = "bg-primary";
  let width = pct;

  switch (item.status) {
    case "uploading":
      status = `${pct}%${item.eta ?? ""}`;
      tone = "text-foreground";
      break;
    case "finishing":
      status = "Finishing in GitLab…";
      tone = "text-foreground";
      width = 100;
      break;
    case "done":
      status = item.result?.processing ? `Uploaded · ${formatBytes(item.file.size)} · processing` : `Uploaded · ${formatBytes(item.file.size)}`;
      tone = "text-success";
      bar = "bg-success";
      width = 100;
      break;
    case "error":
      status = "Failed";
      tone = "text-destructive";
      bar = "bg-destructive";
      width = 100;
      break;
    default:
      status = validation ? "Can't upload" : `${formatBytes(item.file.size)} · Waiting`;
      tone = validation ? "text-destructive" : "text-muted-foreground";
      width = 0;
  }

  const message = item.status === "error" ? item.error : item.status === "queued" ? validation : null;

  return (
    <li className="flex items-center gap-3 rounded-[10px] border px-3.5 py-3">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {item.status === "done" ? (
          <CheckCircle2 className="size-4 text-success" aria-hidden />
        ) : item.status === "error" || (item.status === "queued" && validation) ? (
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
        ) : (
          <FileIcon className="size-4" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex justify-between gap-2 text-[13px]">
          <span className="truncate font-mono font-medium" title={item.file.name}>
            {item.file.name}
          </span>
          <span className={cn("tabular shrink-0", tone)}>{status}</span>
        </span>
        <span
          role="progressbar"
          aria-label={`${item.file.name} upload progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.status === "queued" ? 0 : width}
          className="block h-[5px] rounded-full bg-muted"
        >
          <span className={cn("block h-[5px] rounded-full transition-[width] duration-200", bar)} style={{ width: `${width}%` }} />
        </span>
        {message && <span className="text-xs break-words text-destructive">{message}</span>}
        {item.status === "done" && item.result?.packageUrl && (
          <Link href={item.result.packageUrl} className="w-fit text-xs font-medium text-primary hover:underline">
            Open {item.result.packageName}@{item.result.packageVersion}
          </Link>
        )}
      </span>
      {removable && (
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.file.name}`} onClick={onRemove} className="text-muted-foreground">
          <X />
        </Button>
      )}
    </li>
  );
}

function ResultPanel({
  project,
  okCount,
  failedCount,
  skippedCount,
  packageLinks,
  anyProcessing,
}: {
  project: ProjectOption | null;
  okCount: number;
  failedCount: number;
  skippedCount: number;
  packageLinks: Extract<PublishResult, { ok: true }>[];
  anyProcessing: boolean;
}) {
  const allOk = okCount > 0 && failedCount === 0 && skippedCount === 0;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 text-sm",
        allOk ? "border-success/30 bg-success-soft" : okCount > 0 ? "border-warning/30 bg-warning-soft" : "border-destructive/30 bg-danger-soft",
      )}
    >
      <p className={cn("font-medium", allOk ? "text-success" : okCount > 0 ? "text-warning" : "text-destructive")}>
        {okCount > 0
          ? `Published ${okCount} file${okCount === 1 ? "" : "s"} to ${project?.pathWithNamespace ?? "the project"}`
          : "Nothing was published"}
        {failedCount > 0 && ` · ${failedCount} failed`}
        {skippedCount > 0 && ` · ${skippedCount} not sent`}
      </p>
      {packageLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {packageLinks.map((p) => (
            <Link key={p.packageUrl} href={p.packageUrl!} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-card")}>
              View {p.packageName}@{p.packageVersion} <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ))}
        </div>
      )}
      {anyProcessing && project && (
        <p className="text-[13px] text-muted-foreground">
          GitLab is still processing {packageLinks.length > 0 ? "some charts" : "the chart"}. It will appear in{" "}
          <Link href={routes.repository(project.id)} className="font-medium text-primary hover:underline">
            the project&apos;s packages
          </Link>{" "}
          shortly.
        </p>
      )}
    </div>
  );
}
