import type { Page } from "@playwright/test";
import { MOCK_URL } from "./env";

export interface MockFile {
  id: number;
  file_name: string;
  file_sha256: string | null;
  file_sha1: string | null;
  file_md5: string | null;
}

export interface MockPackage {
  id: number;
  name: string;
  version: string;
  package_type: string;
  status: string;
  project_id: number;
  project_path: string;
  created_at: string;
  files: MockFile[];
}

export interface MockContainerRepo {
  id: number;
  project_id: number;
  path: string;
  tags: string[];
}

/** Current state of the mock GitLab (test-only endpoint), so assertions compare against real data. */
export async function mockState(): Promise<{ packages: MockPackage[]; containerRepos: MockContainerRepo[] }> {
  const res = await fetch(`${MOCK_URL}/__state`);
  if (!res.ok) throw new Error(`mock state: ${res.status}`);
  return res.json();
}

/** Live (not deleted) packages. */
export async function livePackages(): Promise<MockPackage[]> {
  return (await mockState()).packages.filter((p) => p.status !== "deleted");
}

export async function findPackage(name: string, version: string): Promise<MockPackage> {
  const pkg = (await mockState()).packages.find((p) => p.name === name && p.version === version);
  if (!pkg) throw new Error(`mock has no package ${name}@${version}`);
  return pkg;
}

/** The main content area (excludes sidebar and top bar). */
export function main(page: Page) {
  return page.locator("main");
}
