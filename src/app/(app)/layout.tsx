import { verifySession } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar
          username={session.username}
          name={session.name}
          avatarUrl={session.avatarUrl}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
