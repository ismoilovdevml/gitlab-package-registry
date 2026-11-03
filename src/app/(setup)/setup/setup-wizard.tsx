"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
  PlugZap,
} from "lucide-react";
import { OmborLogo } from "@/components/layout/logo";
import { CopyButton } from "@/components/ombor/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Connect GitLab", description: "Instance URL and connection test" },
  { title: "Create OAuth app", description: "Register Ombor in GitLab" },
  { title: "Credentials", description: "Application ID and secret" },
  { title: "Done", description: "Sign in as administrator" },
] as const;

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; version?: string; url: string }
  | { status: "error"; error: string };

type InfoState = { status: "loading" } | { status: "ready"; redirectUri: string } | { status: "error"; redirectUri: string };

interface ApiResult {
  ok?: boolean;
  version?: string;
  error?: string;
}

function normalizeUrl(input: string): { url: string } | { error: string } {
  const value = input.trim().replace(/\/+$/, "");
  if (!value) return { error: "Enter your GitLab URL." };
  if (!/^https?:\/\//i.test(value)) return { error: "Start the URL with https:// (or http://)." };
  try {
    const parsed = new URL(value);
    if (parsed.search || parsed.hash) return { error: "Remove the query string or fragment from the URL." };
    return { url: value };
  } catch {
    return { error: "Enter a valid URL, e.g. https://gitlab.example.com" };
  }
}

async function postSetup(body: Record<string, string>): Promise<{ status: number; data: ApiResult }> {
  const res = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ApiResult;
  return { status: res.status, data };
}

export function SetupWizard() {
  const [step, setStep] = useState(0);

  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const [info, setInfo] = useState<InfoState>({ status: "loading" });

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [credErrors, setCredErrors] = useState<{ clientId?: string; clientSecret?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; alreadyDone?: boolean } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    postSetup({ action: "info" })
      .then(({ data }) => {
        if (cancelled) return;
        const d = data as { setupComplete?: boolean; redirectUri?: string; gitlabUrl?: string | null };
        if (d.setupComplete) {
          window.location.replace("/login");
          return;
        }
        if (d.redirectUri) setInfo({ status: "ready", redirectUri: d.redirectUri });
        else setInfo({ status: "error", redirectUri: `${window.location.origin}/api/auth/callback` });
      })
      .catch(() => {
        if (!cancelled) setInfo({ status: "error", redirectUri: `${window.location.origin}/api/auth/callback` });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Move focus to the new step's heading for keyboard and screen-reader users.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const gitlabUrl = test.status === "ok" ? test.url : "";
  const normalized = normalizeUrl(urlInput);
  const testedCurrent = test.status === "ok" && "url" in normalized && normalized.url === test.url;

  async function runTest(e?: React.FormEvent) {
    e?.preventDefault();
    const n = normalizeUrl(urlInput);
    if ("error" in n) {
      setUrlError(n.error);
      setTest({ status: "idle" });
      return;
    }
    setUrlError(null);
    setTest({ status: "testing" });
    try {
      const { data } = await postSetup({ action: "test", gitlabUrl: n.url });
      if (data.ok) setTest({ status: "ok", version: data.version, url: n.url });
      else setTest({ status: "error", error: data.error || "Couldn't connect to GitLab." });
    } catch {
      setTest({ status: "error", error: "Network error — couldn't reach the Ombor server." });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const id = clientId.trim();
    const secret = clientSecret.trim();
    const errors: typeof credErrors = {};
    if (!id) errors.clientId = "Paste the Application ID from GitLab.";
    else if (/\s/.test(id)) errors.clientId = "The Application ID can't contain spaces.";
    if (!secret) errors.clientSecret = "Paste the Secret from GitLab.";
    else if (/\s/.test(secret)) errors.clientSecret = "The Secret can't contain spaces.";
    setCredErrors(errors);
    if (errors.clientId || errors.clientSecret) return;

    setSaving(true);
    setSaveError(null);
    try {
      const { status, data } = await postSetup({ action: "save", gitlabUrl, clientId: id, clientSecret: secret });
      if (data.ok) {
        setClientSecret("");
        setStep(3);
      } else {
        setSaveError({ message: data.error || "Couldn't save the settings.", alreadyDone: status === 409 || status === 403 });
      }
    } catch {
      setSaveError({ message: "Network error — couldn't reach the Ombor server." });
    } finally {
      setSaving(false);
    }
  }

  const tlsProblem = test.status === "error" && /cert|tls|ssl/i.test(test.error);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col gap-8 bg-sidebar px-6 py-8 text-white sm:px-10 lg:w-[380px] lg:shrink-0 lg:px-12 lg:py-12">
        <div className="flex items-center gap-3">
          <OmborLogo className="size-10 rounded-[11px] [&_svg]:size-[22px]" />
          <span className="text-xl font-semibold tracking-[-0.01em]">Ombor</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] lg:text-[32px] lg:leading-tight">Connect Ombor to GitLab</h1>
          <p className="text-sm leading-relaxed text-sidebar-foreground">
            One-time setup. Ombor signs users in with GitLab OAuth and calls GitLab with each user&apos;s own token.
          </p>
        </div>
        <ol aria-label="Setup progress" className="flex gap-2 lg:flex-col lg:gap-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li
                key={s.title}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex flex-1 items-center gap-3 rounded-lg lg:flex-none lg:px-3 lg:py-2.5",
                  current && "lg:bg-sidebar-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    done && "bg-success text-white",
                    current && "bg-sidebar-primary text-white",
                    !done && !current && "border border-sidebar-border text-sidebar-muted",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                  <span className="sr-only">{done ? " (completed)" : current ? " (current)" : ""}</span>
                </span>
                <span className="hidden min-w-0 flex-col lg:flex">
                  <span className={cn("text-sm font-medium", current || done ? "text-white" : "text-sidebar-foreground")}>
                    {s.title}
                  </span>
                  <span className="text-xs text-sidebar-muted">{s.description}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="hidden text-xs text-sidebar-muted lg:mt-auto lg:block">
          Settings are stored in Ombor&apos;s database; the OAuth secret is encrypted at rest.
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-[600px] rounded-[14px] border bg-card p-5 sm:p-8">
          <p className="mb-1 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
            Step {step + 1} of {STEPS.length}
          </p>

          {step === 0 && (
            <form onSubmit={runTest} noValidate className="flex flex-col gap-6">
              <StepHeading ref={headingRef} title="Connect your GitLab instance">
                Ombor works with self-hosted GitLab (CE or EE). The connection test runs from the Ombor server, so the URL
                must be reachable from there.
              </StepHeading>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gitlab-url">GitLab URL</Label>
                <Input
                  id="gitlab-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  autoFocus
                  placeholder="https://gitlab.example.com"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  aria-invalid={urlError ? true : undefined}
                  aria-describedby="gitlab-url-hint"
                  className="h-11 text-sm"
                />
                <p id="gitlab-url-hint" className={cn("text-xs", urlError ? "text-destructive" : "text-muted-foreground")}>
                  {urlError ?? "The address you open GitLab at, without /api/v4."}
                </p>
                {"url" in normalized && normalized.url.startsWith("http://") && (
                  <p className="text-xs text-warning">Plain HTTP sends OAuth tokens unencrypted — use HTTPS in production.</p>
                )}
              </div>

              <div aria-live="polite">
                {test.status === "ok" && testedCurrent && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-success-soft px-3.5 py-3 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-success">Connected</p>
                      <p className="text-muted-foreground">
                        GitLab version <span className="font-mono text-foreground">{test.version || "unknown"}</span>
                      </p>
                    </div>
                  </div>
                )}
                {test.status === "error" && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-danger-soft px-3.5 py-3 text-sm">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-destructive">Connection failed</p>
                      <p className="break-words text-muted-foreground">{test.error}</p>
                      {tlsProblem ? (
                        <p className="text-muted-foreground">
                          The Ombor server doesn&apos;t trust this GitLab certificate. Mount your internal CA bundle into the
                          container, set <code className="font-mono text-foreground">NODE_EXTRA_CA_CERTS=/path/to/ca.pem</code>,
                          and restart Ombor.
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Check the URL, DNS and firewall rules between the Ombor server and GitLab.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="submit"
                  variant={testedCurrent ? "outline" : "default"}
                  size="lg"
                  className="h-10 px-4"
                  disabled={test.status === "testing"}
                >
                  {test.status === "testing" ? <Loader2 className="animate-spin" /> : <PlugZap />}
                  {test.status === "testing" ? "Testing…" : testedCurrent ? "Test again" : "Test connection"}
                </Button>
                <Button type="button" size="lg" className="h-10 px-4" disabled={!testedCurrent} onClick={() => setStep(1)}>
                  Continue
                  <ArrowRight />
                </Button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <StepHeading ref={headingRef} title="Create an OAuth application in GitLab">
                Register Ombor as an application so users can sign in with their GitLab account.
              </StepHeading>

              <div className="flex flex-col gap-2">
                <a
                  href={`${gitlabUrl}/admin/applications/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Open Admin → Applications
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
                <p className="text-xs text-muted-foreground">
                  Not a GitLab admin? Create it under your user instead:{" "}
                  <a
                    href={`${gitlabUrl}/-/user_settings/applications`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary hover:underline"
                  >
                    {gitlabUrl}/-/user_settings/applications
                  </a>
                  . Instance-wide applications are recommended so the app doesn&apos;t depend on one person&apos;s account.
                </p>
              </div>

              <dl className="divide-y rounded-lg border">
                <Field label="Name" value="Ombor" copy />
                <Field
                  label="Redirect URI"
                  value={info.status === "loading" ? null : info.redirectUri}
                  copy
                  hint={
                    info.status === "error"
                      ? "Couldn't load the redirect URI from the server; this is a best guess from your browser."
                      : "If Ombor runs behind a reverse proxy, set APP_URL so this matches the public address."
                  }
                />
                <Field label="Confidential" value="Yes (checked)" />
                <Field label="Scopes" value="api, read_user" hint="api lets Ombor act with each user's permissions; read_user identifies them." />
                <Field label="Trusted" value="Optional" hint="Admin applications only. Skips the per-user consent screen." />
              </dl>

              <p className="text-sm text-muted-foreground">
                Save the application in GitLab, then copy its <span className="font-medium text-foreground">Application ID</span> and{" "}
                <span className="font-medium text-foreground">Secret</span>. GitLab shows the secret only once.
              </p>

              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" size="lg" className="h-10 px-4" onClick={() => setStep(0)}>
                  <ArrowLeft />
                  Back
                </Button>
                <Button type="button" size="lg" className="h-10 px-4" onClick={() => setStep(2)}>
                  I&apos;ve created it
                  <ArrowRight />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={save} noValidate className="flex flex-col gap-6">
              <StepHeading ref={headingRef} title="Enter the application credentials">
                Ombor uses these to exchange sign-in codes for tokens. They are checked the first time someone signs in.
              </StepHeading>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-id">Application ID</Label>
                  <Input
                    id="client-id"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    aria-invalid={credErrors.clientId ? true : undefined}
                    aria-describedby={credErrors.clientId ? "client-id-error" : undefined}
                    className="h-11 font-mono text-sm"
                  />
                  {credErrors.clientId && (
                    <p id="client-id-error" className="text-xs text-destructive">
                      {credErrors.clientId}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-secret">Secret</Label>
                  <div className="relative">
                    <Input
                      id="client-secret"
                      type={showSecret ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      aria-invalid={credErrors.clientSecret ? true : undefined}
                      aria-describedby={credErrors.clientSecret ? "client-secret-error" : "client-secret-hint"}
                      className="h-11 pr-11 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-1.5 right-1.5"
                      aria-label={showSecret ? "Hide secret" : "Show secret"}
                      onClick={() => setShowSecret((v) => !v)}
                    >
                      {showSecret ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  {credErrors.clientSecret ? (
                    <p id="client-secret-error" className="text-xs text-destructive">
                      {credErrors.clientSecret}
                    </p>
                  ) : (
                    <p id="client-secret-hint" className="text-xs text-muted-foreground">
                      Stored encrypted. It is never sent back to the browser.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  GitLab instance: <span className="font-mono text-foreground">{gitlabUrl}</span>
                </p>
              </div>

              {saveError && (
                <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-danger-soft px-3.5 py-3 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="break-words text-destructive">{saveError.message}</p>
                    {saveError.alreadyDone && (
                      <a href="/login" className="mt-1 inline-block text-primary hover:underline">
                        Go to sign in
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" size="lg" className="h-10 px-4" disabled={saving} onClick={() => setStep(1)}>
                  <ArrowLeft />
                  Back
                </Button>
                <Button type="submit" size="lg" className="h-10 px-4" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}
                  {saving ? "Saving…" : "Save and finish"}
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
              </div>
              <StepHeading ref={headingRef} title="Ombor is connected">
                GitLab at <span className="font-mono text-foreground">{gitlabUrl}</span> is configured.
              </StepHeading>
              <div className="flex items-start gap-2.5 rounded-lg bg-info-soft px-3.5 py-3 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                <p>
                  <span className="font-medium">The first person to sign in becomes the Ombor administrator.</span>{" "}
                  <span className="text-muted-foreground">
                    Sign in now with your own GitLab account; you can promote other admins later under Users &amp; access.
                  </span>
                </p>
              </div>
              <a
                href="/login"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-foreground text-[15px] font-medium text-background hover:opacity-90 sm:w-fit sm:px-6"
              >
                Sign in
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StepHeading({
  title,
  children,
  ref,
}: {
  title: string;
  children: React.ReactNode;
  ref: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 ref={ref} tabIndex={-1} className="text-xl font-semibold tracking-[-0.01em] outline-none sm:text-2xl">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function Field({ label, value, copy, hint }: { label: string; value: string | null; copy?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-32 shrink-0 pt-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {value === null ? (
            <Skeleton className="h-5 w-full max-w-72" />
          ) : (
            <span className="min-w-0 pt-1 font-mono text-sm break-all">{value}</span>
          )}
          {copy && value && <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} className="ml-auto" />}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </dd>
    </div>
  );
}
