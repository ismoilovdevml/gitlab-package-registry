/** Client-safe view of a cleanup policy row. */
export interface PolicyView {
  id: number;
  name: string;
  projectId: number;
  projectPath: string;
  packageType: string | null;
  namePattern: string | null;
  keepLatest: number | null;
  olderThanDays: number | null;
  enabled: boolean;
  dryRun: boolean;
}
