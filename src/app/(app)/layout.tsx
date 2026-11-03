import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getSettings } from "@/lib/setup";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  if (!settings) redirect("/setup");
  const session = await verifySession();

  const gitlabHost = new URL(settings.gitlabUrl).host;
  const user = {
    username: session.username,
    name: session.name,
    avatarUrl: session.avatarUrl,
    isAdmin: session.isAdmin,
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} gitlabHost={gitlabHost} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-16 border-b bg-card" />}>
          <TopBar user={user} gitlabHost={gitlabHost} />
        </Suspense>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-7 pb-12 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
