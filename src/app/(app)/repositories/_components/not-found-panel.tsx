import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ombor/empty-state";
import { routes } from "@/lib/routes";
import { linkButton } from "./link-styles";

/** Shared 404 body for the Repositories routes. GitLab returns 404 both for missing and for inaccessible resources. */
export function RepositoryNotFound({ title, backHref = routes.repositories, backLabel = "Back to repositories" }: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <EmptyState
      icon={<SearchX />}
      title={title}
      description="It doesn't exist, was deleted, or you don't have access to it in GitLab."
      action={
        <Link href={backHref} className={linkButton}>
          {backLabel}
        </Link>
      }
    />
  );
}
