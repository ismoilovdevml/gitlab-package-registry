import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/setup";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Set up Ombor" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupComplete()) redirect("/login");
  return <SetupWizard />;
}
