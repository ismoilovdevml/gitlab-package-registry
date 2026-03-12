"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import type { PackageType } from "@/lib/gitlab/types";

interface PackageFiltersProps {
  currentType?: PackageType;
  currentSearch?: string;
  projectId?: string;
  groupId?: string;
}

export function PackageFilters({
  currentSearch,
  projectId,
  groupId,
}: PackageFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch || "");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (projectId) params.set("project", projectId);
    if (groupId) params.set("group", groupId);
    const qs = params.toString();
    router.push(`/packages${qs ? `?${qs}` : ""}`);
  };

  return (
    <form onSubmit={handleSearch} className="flex gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Paket nomini qidirish..."
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="secondary">
        Qidirish
      </Button>
    </form>
  );
}
