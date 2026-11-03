"use client";

// Client wrapper: `hrefFor` is a function, so it can't be passed from a Server Component.
import { Pagination } from "@/components/ombor/pagination";
import { packagesHref } from "./filters";

export function PackagesPagination({
  page,
  totalPages,
  hasNext,
  query,
}: {
  page: number;
  totalPages: number | null;
  hasNext: boolean;
  /** Current filters as a query string (without page). */
  query: string;
}) {
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      hasNext={hasNext}
      hrefFor={(p) => packagesHref(query, p)}
      className="border-t px-[18px] py-3.5"
    />
  );
}
