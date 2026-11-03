"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CI_FORMATS, type CiFormat } from "@/lib/publish/snippets";
import type { ProjectOption } from "@/lib/publish/types";
import { CiPanel } from "./ci-panel";
import { UploadForm } from "./upload-form";

type Tab = "upload" | "ci";

const TRIGGER =
  "h-11 flex-none rounded-none px-3.5 text-sm after:bottom-[-1px]! after:bg-primary! data-active:text-foreground";

export function PublishWorkspace({
  gitlabUrl,
  username,
  initialProjects,
  projectsError,
  presetProject,
  initialTab,
}: {
  gitlabUrl: string;
  username: string;
  initialProjects: ProjectOption[];
  projectsError: string | null;
  presetProject: ProjectOption | null;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ciFormat, setCiFormat] = useState<CiFormat>("npm");

  function showCi(format: string) {
    if ((CI_FORMATS as readonly string[]).includes(format)) setCiFormat(format as CiFormat);
    setTab("ci");
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
      <TabsList variant="line" aria-label="Publish method" className="h-auto! w-full justify-start gap-1 rounded-none border-b p-0">
        <TabsTrigger value="upload" className={TRIGGER}>
          Upload files
        </TabsTrigger>
        <TabsTrigger value="ci" className={TRIGGER}>
          Publish from CI
        </TabsTrigger>
      </TabsList>
      {/* keepMounted so the upload queue survives switching tabs mid-upload */}
      <TabsContent value="upload" keepMounted>
        <UploadForm
          gitlabUrl={gitlabUrl}
          username={username}
          initialProjects={initialProjects}
          projectsError={projectsError}
          presetProject={presetProject}
          onShowCi={showCi}
        />
      </TabsContent>
      <TabsContent value="ci">
        <CiPanel format={ciFormat} onFormatChange={setCiFormat} />
      </TabsContent>
    </Tabs>
  );
}
