export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/setup";

export default async function RootPage() {
  const setupDone = await isSetupComplete();
  if (!setupDone) {
    redirect("/setup");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  redirect("/dashboard");
}
