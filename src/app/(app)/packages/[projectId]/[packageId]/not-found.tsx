import { PackageX } from "lucide-react";
import { EmptyState } from "@/components/ombor/empty-state";
import { routes } from "@/lib/routes";
import { LinkButton } from "./_components/link-button";

export default function PackageNotFound() {
  return (
    <EmptyState
      icon={<PackageX />}
      title="Package not found"
      description="This package version doesn't exist, was deleted, or you don't have access to its project in GitLab."
      action={<LinkButton href={routes.packages}>Back to packages</LinkButton>}
    />
  );
}
