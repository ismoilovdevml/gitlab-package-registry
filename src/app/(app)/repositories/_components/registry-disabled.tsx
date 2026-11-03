import { Ban } from "lucide-react";
import { EmptyState } from "@/components/ombor/empty-state";

/** Friendly panel when GitLab answers 403/404 for a project's package or container registry. */
export function RegistryDisabled({ kind, webUrl }: { kind: "packages" | "container"; webUrl?: string }) {
  const name = kind === "packages" ? "Package registry" : "Container registry";
  return (
    <EmptyState
      className="m-4"
      icon={<Ban />}
      title={`${name} is disabled for this project`}
      description={
        <>
          It&apos;s turned off in the project settings, not available on this GitLab instance, or hidden for your role.
          {webUrl && (
            <>
              {" "}A project Maintainer can enable it under{" "}
              <a href={`${webUrl}/edit`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Settings → General → Visibility, project features, permissions
              </a>
              .
            </>
          )}
        </>
      }
    />
  );
}
