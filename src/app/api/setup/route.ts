import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveSetupSettings, isSetupComplete, getSettings, normalizeGitlabUrl } from "@/lib/setup";
import { createGitLabClient } from "@/lib/gitlab/client";
import { getSession } from "@/lib/session";
import { getRedirectUri } from "@/lib/auth/gitlab-oauth";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("info") }),
  z.object({ action: z.literal("test"), gitlabUrl: z.string().min(1) }),
  z.object({
    action: z.literal("save"),
    gitlabUrl: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;
  const setupDone = await isSetupComplete();

  if (body.action === "info") {
    const settings = await getSettings();
    return NextResponse.json({
      gitlabUrl: settings?.gitlabUrl || null,
      setupComplete: setupDone,
      redirectUri: getRedirectUri(req.url),
    });
  }

  // After setup, only admins may probe URLs (prevents using this endpoint as an open SSRF proxy).
  if (setupDone) {
    const session = await getSession();
    if (!session?.isAdmin) {
      return NextResponse.json({ ok: false, error: "Setup is already complete" }, { status: 403 });
    }
  }

  let gitlabUrl: string;
  try {
    gitlabUrl = normalizeGitlabUrl(body.gitlabUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "Enter a valid URL, e.g. https://gitlab.example.com" });
  }

  if (body.action === "test") {
    const result = await createGitLabClient({ baseUrl: gitlabUrl, token: "" }).testConnection();
    return NextResponse.json(result);
  }

  // action === "save" (first-run only; admins change settings via /admin/settings)
  if (setupDone) {
    return NextResponse.json({ ok: false, error: "Setup is already complete" }, { status: 409 });
  }
  try {
    await saveSetupSettings({ gitlabUrl, clientId: body.clientId, clientSecret: body.clientSecret });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to save settings" });
  }
}
