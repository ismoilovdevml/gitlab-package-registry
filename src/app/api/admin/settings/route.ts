import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { getSettings, saveSetupSettings } from "@/lib/setup";

export async function GET() {
  await verifySession();
  const settings = await getSettings();

  return NextResponse.json({
    gitlabUrl: settings?.gitlabUrl || "",
    clientId: settings?.clientId || "",
  });
}

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session.isAdmin) {
    return NextResponse.json(
      { ok: false, error: "Faqat admin uchun" },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { gitlabUrl, clientId, clientSecret } = body;

  if (!gitlabUrl || !clientId) {
    return NextResponse.json({
      ok: false,
      error: "GitLab URL va Client ID talab qilinadi",
    });
  }

  const currentSettings = await getSettings();

  try {
    await saveSetupSettings({
      gitlabUrl,
      clientId,
      clientSecret: clientSecret || currentSettings?.clientSecret || "",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Xatolik",
    });
  }
}
