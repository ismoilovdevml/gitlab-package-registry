// Publish input rules, mirrored from GitLab's own validators (lib/gitlab/regex/packages.rb).
// Safe for client and server components.

import { z } from "zod";

/** Formats Ombor can upload directly from the browser. Everything else needs its native client. */
export const UPLOAD_FORMATS = ["generic", "helm"] as const;
export type UploadFormat = (typeof UPLOAD_FORMATS)[number];

/** Formats that must be published with their own client (they carry metadata GitLab parses). */
export const CLIENT_FORMATS = [
  "npm",
  "maven",
  "pypi",
  "nuget",
  "composer",
  "conan",
  "golang",
  "rubygems",
  "terraform_module",
] as const;
export type ClientFormat = (typeof CLIENT_FORMATS)[number];

export function isUploadFormat(format: string): format is UploadFormat {
  return (UPLOAD_FORMATS as readonly string[]).includes(format);
}

/** GitLab's default generic package limit (application setting `generic_packages_max_file_size`). */
export const GENERIC_MAX_BYTES = 5 * 1024 ** 3;
/** Ombor buffers Helm charts to build the multipart body, so it caps them. */
export const HELM_MAX_BYTES = 50 * 1024 ** 2;
/** GitLab's default `helm_max_file_size` plan limit (admins can raise it). */
export const HELM_GITLAB_DEFAULT_LIMIT = 5 * 1024 ** 2;

export function maxBytesFor(format: UploadFormat): number {
  return format === "helm" ? HELM_MAX_BYTES : GENERIC_MAX_BYTES;
}

// generic_package_name_regex -> maven_file_name_regex: \A[A-Za-z0-9\.\_\-\+]+\z
export const genericNameSchema = z
  .string()
  .trim()
  .min(1, "Package name is required.")
  .max(255, "Package name is too long.")
  .regex(/^[A-Za-z0-9._+-]+$/, "Package name may only contain letters, digits, and . _ - +")
  .refine((v) => v !== "." && v !== "..", "Package name can't be '.' or '..'.");

// generic_package_version_regex -> maven_version_regex: \A(?!.*\.\.)[\w+.-]+\z
export const genericVersionSchema = z
  .string()
  .trim()
  .min(1, "Version is required.")
  .max(255, "Version is too long.")
  .regex(/^[A-Za-z0-9_+.-]+$/, "Version may only contain letters, digits, and . _ - +")
  .refine((v) => !v.includes(".."), "Version can't contain '..'.");

// generic_package_file_name_regex: \A(?!~)(?!@)[A-Za-z0-9\.\_\-\+~@]+(?<!~)(?<!@)\z
export const genericFileNameSchema = z
  .string()
  .min(1, "File name is required.")
  .max(255, "File name is too long.")
  .regex(/^[A-Za-z0-9._+~@-]+$/, "File name may only contain letters, digits, and . _ - + ~ @ (no spaces).")
  .refine((v) => !/^[~@]|[~@]$/.test(v), "File name can't start or end with ~ or @.");

// helm_channel_regex: \A([a-zA-Z0-9](\.|-|_)?){1,255}(?<!\.|-|_)\z
export const helmChannelSchema = z
  .string()
  .trim()
  .min(1, "Channel is required.")
  .max(255, "Channel is too long.")
  .regex(/^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/, "Channel may contain letters, digits, and single . _ - between them.");

export const helmFileNameSchema = z
  .string()
  .min(1, "File name is required.")
  .max(255, "File name is too long.")
  .regex(/\.tgz$/i, "Helm charts must be packaged .tgz files (helm package).");

const projectIdSchema = z.coerce.number({ error: "Pick a target project." }).int().positive("Pick a target project.");

/** Query string accepted by POST /api/publish. */
export const publishRequestSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("generic"),
    projectId: projectIdSchema,
    name: genericNameSchema,
    version: genericVersionSchema,
    fileName: genericFileNameSchema,
  }),
  z.object({
    format: z.literal("helm"),
    projectId: projectIdSchema,
    channel: helmChannelSchema,
    fileName: helmFileNameSchema,
  }),
], { error: "Only Generic files and Helm charts can be uploaded from the browser." });

export type PublishRequest = z.infer<typeof publishRequestSchema>;

/** First validation message for a value, or null when valid. */
export function validationError(schema: z.ZodType, value: unknown): string | null {
  const res = schema.safeParse(value);
  return res.success ? null : (res.error.issues[0]?.message ?? "Invalid value.");
}
