import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/security/checks";
import { normalizeSeverity, type VulnerabilitySeverity } from "@/lib/security/vulnerabilities";

export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

export const SEVERITY_STYLES: Record<Severity, { badge: string; dot: string; text: string }> = {
  high: { badge: "bg-danger-soft text-destructive", dot: "bg-destructive", text: "text-destructive" },
  medium: { badge: "bg-warning-soft text-warning", dot: "bg-warning", text: "text-warning" },
  low: { badge: "bg-info-soft text-info", dot: "bg-info", text: "text-info" },
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap",
        SEVERITY_STYLES[severity].badge,
        className,
      )}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const VULN_STYLES: Record<VulnerabilitySeverity, string> = {
  critical: "bg-destructive text-white",
  high: "bg-danger-soft text-destructive",
  medium: "bg-warning-soft text-warning",
  low: "bg-info-soft text-info",
  info: "bg-secondary text-muted-foreground",
  unknown: "bg-secondary text-muted-foreground",
};

export function VulnSeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const s = normalizeSeverity(severity);
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap capitalize",
        VULN_STYLES[s],
        className,
      )}
    >
      {s}
    </span>
  );
}
