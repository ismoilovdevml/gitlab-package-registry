// Audit action catalog: labels, categories and badge tones. Safe for client and server components.
// Keep in sync with the `AuditAction` union in src/lib/audit.ts.
import type { AuditAction } from "@/lib/audit";
import type { Tone } from "@/components/ombor/status-badge";

export type AuditCategory = "auth" | "package" | "container" | "cleanup" | "settings" | "user";

interface ActionInfo {
  label: string;
  tone: Tone;
}

export const AUDIT_ACTIONS: Record<AuditAction, ActionInfo> = {
  "auth.login": { label: "Signed in", tone: "neutral" },
  "auth.logout": { label: "Signed out", tone: "neutral" },
  "auth.login_failed": { label: "Sign-in failed", tone: "danger" },
  "package.publish": { label: "Published package", tone: "success" },
  "package.delete": { label: "Deleted package", tone: "danger" },
  "package.file_delete": { label: "Deleted package file", tone: "danger" },
  "package.bulk_delete": { label: "Bulk deleted packages", tone: "danger" },
  "container.tag_delete": { label: "Deleted image tag", tone: "danger" },
  "container.repository_delete": { label: "Deleted image repository", tone: "danger" },
  "cleanup.policy_create": { label: "Created cleanup policy", tone: "info" },
  "cleanup.policy_update": { label: "Updated cleanup policy", tone: "warning" },
  "cleanup.policy_delete": { label: "Deleted cleanup policy", tone: "danger" },
  "cleanup.run": { label: "Ran cleanup policy", tone: "info" },
  "settings.update": { label: "Updated settings", tone: "warning" },
  "user.role_change": { label: "Changed user role", tone: "warning" },
  "user.block": { label: "Blocked user", tone: "danger" },
  "user.unblock": { label: "Unblocked user", tone: "success" },
  "user.sessions_revoke": { label: "Revoked sessions", tone: "warning" },
};

export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "auth", label: "Authentication" },
  { id: "package", label: "Packages" },
  { id: "container", label: "Container registry" },
  { id: "cleanup", label: "Cleanup" },
  { id: "settings", label: "Settings" },
  { id: "user", label: "Users" },
];

export const AUDIT_ACTION_NAMES = Object.keys(AUDIT_ACTIONS) as AuditAction[];

/** Actions counted as "deletes" in the audit summary. */
export const DELETE_ACTIONS: AuditAction[] = [
  "package.delete",
  "package.file_delete",
  "package.bulk_delete",
  "container.tag_delete",
  "container.repository_delete",
];

export function actionsInCategory(category: AuditCategory): AuditAction[] {
  return AUDIT_ACTION_NAMES.filter((a) => a.startsWith(`${category}.`));
}

export function auditActionInfo(action: string): ActionInfo {
  return AUDIT_ACTIONS[action as AuditAction] ?? { label: action, tone: "neutral" };
}
