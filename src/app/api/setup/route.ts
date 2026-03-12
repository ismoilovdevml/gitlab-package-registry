import { NextRequest, NextResponse } from "next/server";
import { saveSetupSettings, isSetupComplete, getSettings } from "@/lib/setup";
import { createGitLabClient } from "@/lib/gitlab/client";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "info") {
    const settings = await getSettings();
    return NextResponse.json({
      gitlabUrl: settings?.gitlabUrl || null,
      setupComplete: settings?.setupComplete || false,
    });
  }

  if (action === "test") {
    const { gitlabUrl } = body;
    if (!gitlabUrl) {
      return NextResponse.json({ ok: false, error: "GitLab URL kiritilmadi" });
    }

    try {
      const client = createGitLabClient({ baseUrl: gitlabUrl, pat: "" });
      const result = await client.testConnection();
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({
        ok: false,
        error: "GitLab serverga ulanib bo'lmadi",
      });
    }
  }

  if (action === "save") {
    const setupDone = await isSetupComplete();
    if (setupDone) {
      return NextResponse.json({
        ok: false,
        error: "Sozlash allaqachon tugallangan",
      });
    }

    const { gitlabUrl, clientId, clientSecret } = body;
    if (!gitlabUrl || !clientId || !clientSecret) {
      return NextResponse.json({
        ok: false,
        error: "Barcha maydonlarni to'ldiring",
      });
    }

    try {
      await saveSetupSettings({ gitlabUrl, clientId, clientSecret });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: e instanceof Error ? e.message : "Saqlashda xatolik",
      });
    }
  }

  return NextResponse.json({ ok: false, error: "Noma'lum amal" }, { status: 400 });
}
