import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { migrate } from "./migrate";

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as {
  omborSql?: postgres.Sql;
  omborMigrated?: Promise<void>;
};

// postgres() connects lazily, so a missing DATABASE_URL only fails on first query (not at build time).
export const sql =
  globalForDb.omborSql ??
  postgres(process.env.DATABASE_URL || "postgres://missing-database-url", {
    max: 10,
    onnotice: () => {},
    // Columns are `timestamp` without time zone: pin the session to UTC so now() and JS Dates agree.
    connection: { TimeZone: "UTC" },
  });
if (process.env.NODE_ENV !== "production") globalForDb.omborSql = sql;

export const db = drizzle(sql, { schema });

export function ensureSchema(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return Promise.reject(new Error("DATABASE_URL environment variable is required"));
  }
  globalForDb.omborMigrated ??= migrate(sql).catch((e) => {
    globalForDb.omborMigrated = undefined;
    throw e;
  });
  return globalForDb.omborMigrated;
}
