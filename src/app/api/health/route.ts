import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// Liveness + DB readiness probe for Docker/K8s. Does not call GitLab (that is per-user).
export async function GET() {
  try {
    await ensureSchema();
    await sql`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (e) {
    return NextResponse.json(
      { status: "error", database: e instanceof Error ? e.message : "unavailable" },
      { status: 503 },
    );
  }
}
