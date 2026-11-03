import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, Boxes, ClipboardCopy, ScrollText, ShieldCheck } from "lucide-react";
import { OmborLogo } from "@/components/layout/logo";
import { getSession } from "@/lib/session";
import { getSettings, isSetupComplete } from "@/lib/setup";
import { routes } from "@/lib/routes";
import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FORMAT_CHIPS = ["npm", "maven", "pypi", "nuget", "go", "composer", "conan", "helm", "generic", "container"];

const VALUE_PROPS = [
  {
    icon: Boxes,
    title: "One catalog for every group",
    text: "Browse packages and container images across all the GitLab groups and projects you can access.",
  },
  {
    icon: ShieldCheck,
    title: "Your GitLab permissions, enforced",
    text: "Every request runs with your own GitLab token, so you only see what GitLab already lets you see.",
  },
  {
    icon: ClipboardCopy,
    title: "Copy-paste client setup",
    text: "Ready-made snippets for npm, Maven, PyPI, NuGet, Helm, Docker and more, filled in for your instance.",
  },
  {
    icon: ScrollText,
    title: "Governance built in",
    text: "Cleanup policies and an audit log of every publish and delete made through Ombor.",
  },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Same-origin relative paths only; never bounce back into the auth/setup flow. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return routes.dashboard;
  if (/^\/(login|setup|api)(\/|\?|$)/.test(value)) return routes.dashboard;
  return value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isSetupComplete())) redirect("/setup");

  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getSession()) redirect(next);

  const settings = await getSettings();
  let gitlabHost: string | null = null;
  try {
    gitlabHost = settings ? new URL(settings.gitlabUrl).host : null;
  } catch {
    gitlabHost = null;
  }

  const error = first(sp.error)?.slice(0, 500);
  const startUrl = `/api/auth/callback?action=login&next=${encodeURIComponent(next)}`;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <section className="order-2 flex min-w-0 flex-col justify-between gap-12 bg-sidebar px-6 py-10 text-white sm:px-10 lg:order-1 lg:flex-[1_1_520px] lg:px-14 lg:py-12">
        <div className="hidden items-center gap-3 lg:flex">
          <OmborLogo className="size-10 rounded-[11px] [&_svg]:size-[22px]" />
          <span className="text-xl font-semibold tracking-[-0.01em]">Ombor</span>
        </div>

        <div className="flex max-w-[520px] flex-col gap-5">
          <h1 className="text-3xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[48px]">
            Every artifact your teams ship, in one place.
          </h1>
          <p className="text-[17px] leading-relaxed text-sidebar-foreground">
            Ombor sits on top of your self-hosted GitLab Package Registry and Container Registry, giving every
            team one place to find, install and manage what they publish.
          </p>
          <ul className="mt-2 grid gap-5 sm:grid-cols-2">
            {VALUE_PROPS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-ring">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-sidebar-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap gap-2">
            {FORMAT_CHIPS.map((f) => (
              <span key={f} className="rounded-[7px] bg-[#172033] px-2.5 py-1.5 font-mono text-xs text-[#D5DCE6]">
                {f}
              </span>
            ))}
          </div>
          {gitlabHost && <span className="text-[13px] text-sidebar-muted">Connected instance · {gitlabHost}</span>}
        </div>
      </section>

      <section className="order-1 flex min-w-0 items-center justify-center px-6 py-12 sm:px-8 lg:order-2 lg:flex-[1_1_440px]">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="flex items-center gap-3 lg:hidden">
            <OmborLogo />
            <span className="text-lg font-semibold tracking-[-0.01em]">Ombor</span>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-[28px] font-semibold tracking-[-0.02em]">Sign in</h2>
            <p className="text-[15px] text-muted-foreground">
              Use your company GitLab account. Your GitLab permissions decide what you can see.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-danger-soft px-3.5 py-3 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium text-destructive">Sign-in failed</p>
                <p className="mt-0.5 break-words text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          <SignInButton href={startUrl} />

          {gitlabHost && (
            <p className="-mt-2 text-center text-[13px] text-muted-foreground">
              You&apos;ll be redirected to <span className="font-mono text-foreground">{gitlabHost}</span>
            </p>
          )}

          <div className="flex items-start gap-2.5 rounded-lg bg-background px-3.5 py-3 text-[13px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <p>Uses your GitLab permissions — Ombor never stores your password.</p>
          </div>

          <p className="text-[13px] text-muted-foreground">
            Trouble signing in? Ask your Ombor administrator, or check that your GitLab account is active.
          </p>
        </div>
      </section>
    </div>
  );
}
