// Package format metadata shared by every screen (labels + badge colors from the Ombor design).
// Safe to import from client components.

export type FormatKey =
  | "npm"
  | "maven"
  | "pypi"
  | "nuget"
  | "golang"
  | "composer"
  | "conan"
  | "helm"
  | "generic"
  | "debian"
  | "rubygems"
  | "terraform_module"
  | "ml_model"
  | "container";

export interface FormatInfo {
  key: FormatKey;
  label: string;
  /** Tailwind classes for the format badge (light + dark). */
  badge: string;
  /** Solid color used in charts/bars. */
  color: string;
}

const F = (key: FormatKey, label: string, badge: string, color: string): FormatInfo => ({ key, label, badge, color });

export const FORMATS: Record<FormatKey, FormatInfo> = {
  npm: F("npm", "npm", "bg-[#FDECEC] text-[#A51D24] dark:bg-[#A51D24]/20 dark:text-[#FF8A8F]", "#C4323A"),
  maven: F("maven", "Maven", "bg-[#FFF1E5] text-[#9A4A06] dark:bg-[#9A4A06]/25 dark:text-[#FFB373]", "#C2610C"),
  pypi: F("pypi", "PyPI", "bg-[#E8F0FF] text-[#1A47B0] dark:bg-[#1A47B0]/25 dark:text-[#8FB0FF]", "#2B4FE0"),
  nuget: F("nuget", "NuGet", "bg-[#F1ECFF] text-[#5B32B5] dark:bg-[#5B32B5]/25 dark:text-[#C0A8FF]", "#6D42D0"),
  golang: F("golang", "Go", "bg-[#E3F6F8] text-[#0B6672] dark:bg-[#0B6672]/25 dark:text-[#7BD8E3]", "#0E7C8A"),
  composer: F("composer", "Composer", "bg-[#FFF8DB] text-[#7A5B00] dark:bg-[#7A5B00]/25 dark:text-[#F5D46B]", "#B08400"),
  conan: F("conan", "Conan", "bg-[#E9F5EC] text-[#1B6B3A] dark:bg-[#1B6B3A]/25 dark:text-[#86D9A3]", "#1F8A4C"),
  helm: F("helm", "Helm", "bg-[#E9F5EC] text-[#1B6B3A] dark:bg-[#1B6B3A]/25 dark:text-[#86D9A3]", "#1F8A4C"),
  generic: F("generic", "Generic", "bg-[#EEF0F3] text-[#3A4556] dark:bg-white/10 dark:text-[#C9D1DC]", "#5B6676"),
  debian: F("debian", "Debian", "bg-[#FCE8F1] text-[#9B1F5A] dark:bg-[#9B1F5A]/25 dark:text-[#FF9AC8]", "#C02A70"),
  rubygems: F("rubygems", "RubyGems", "bg-[#FDECEC] text-[#A51D24] dark:bg-[#A51D24]/20 dark:text-[#FF8A8F]", "#B3262E"),
  terraform_module: F("terraform_module", "Terraform", "bg-[#F1ECFF] text-[#5B32B5] dark:bg-[#5B32B5]/25 dark:text-[#C0A8FF]", "#7B42BC"),
  ml_model: F("ml_model", "ML model", "bg-[#EEF0F3] text-[#3A4556] dark:bg-white/10 dark:text-[#C9D1DC]", "#5B6676"),
  container: F("container", "Container", "bg-[#E3F6F8] text-[#0B6672] dark:bg-[#0B6672]/25 dark:text-[#7BD8E3]", "#0E7C8A"),
};

/** Package types the GitLab packages API can filter by (container images live in the registry API). */
export const PACKAGE_TYPES = [
  "npm",
  "maven",
  "pypi",
  "nuget",
  "golang",
  "composer",
  "conan",
  "helm",
  "generic",
  "debian",
  "rubygems",
  "terraform_module",
] as const;

export function getFormat(type: string | null | undefined): FormatInfo {
  return FORMATS[(type || "generic") as FormatKey] ?? { ...FORMATS.generic, key: type as FormatKey, label: type || "unknown" };
}
