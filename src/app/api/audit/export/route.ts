import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { auditActionInfo } from "@/lib/admin/audit-actions";
import { iterateAuditEntries, parseAuditFilters, type AuditRow } from "@/lib/admin/audit-query";

export const dynamic = "force-dynamic";

const HEADER = [
  "time_utc",
  "actor",
  "actor_name",
  "action",
  "action_label",
  "target_type",
  "target",
  "project_id",
  "project_path",
  "status",
  "ip",
  "metadata",
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(r: AuditRow): string {
  return (
    [
      r.createdAt.toISOString(),
      r.username,
      r.actorName,
      r.action,
      auditActionInfo(r.action).label,
      r.targetType,
      r.target,
      r.projectId,
      r.projectPath,
      r.status,
      r.ip,
      r.metadata,
    ]
      .map(csvCell)
      .join(",") + "\r\n"
  );
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const filters = parseAuditFilters(req.nextUrl.searchParams);
  const scope = { ownUserId: session.isAdmin ? null : session.userId };
  const rows = iterateAuditEntries(filters, scope);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(HEADER.join(",") + "\r\n"));
    },
    async pull(controller) {
      try {
        const { value, done } = await rows.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(value.map(csvRow).join("")));
      } catch (e) {
        console.error("[ombor] audit export failed", e);
        controller.error(e);
      }
    },
    async cancel() {
      await rows.return(undefined);
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ombor-audit-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
