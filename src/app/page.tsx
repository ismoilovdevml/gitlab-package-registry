import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  if (!(await isSetupComplete())) redirect("/setup");
  if (!(await getSession())) redirect("/login");
  redirect("/dashboard");
}
