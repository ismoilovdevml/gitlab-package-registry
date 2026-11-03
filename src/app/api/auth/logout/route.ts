import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

async function logout(req: NextRequest) {
  const session = await getSession();
  if (session) {
    await logAudit({ action: "auth.logout", targetType: "user", target: session.username });
  }
  await deleteSession();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}

// POST only: a GET logout can be triggered cross-site by an <img> tag.
export const POST = logout;
