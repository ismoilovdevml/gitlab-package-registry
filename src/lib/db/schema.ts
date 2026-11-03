import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// NOTE: keep in sync with src/lib/db/migrate.ts (schema is applied at startup).

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  encrypted: boolean("encrypted").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  gitlabUserId: integer("gitlab_user_id").notNull().unique(),
  username: text("username").notNull(),
  name: text("name"),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie value
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token").notNull(), // encrypted
    refreshToken: text("refresh_token"), // encrypted
    tokenExpiresAt: timestamp("token_expires_at"),
    expiresAt: timestamp("expires_at").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    username: text("username"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    target: text("target"),
    projectId: integer("project_id"),
    projectPath: text("project_path"),
    status: text("status").notNull().default("success"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_action_idx").on(t.action),
    index("audit_user_idx").on(t.userId),
  ],
);

export const cleanupPolicies = pgTable("cleanup_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  projectId: integer("project_id").notNull(),
  projectPath: text("project_path").notNull(),
  packageType: text("package_type"), // null = all formats
  namePattern: text("name_pattern"), // regex; null = all names
  keepLatest: integer("keep_latest"), // keep N newest versions per package name
  olderThanDays: integer("older_than_days"), // delete versions older than N days
  enabled: boolean("enabled").notNull().default(true),
  dryRun: boolean("dry_run").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  lastResult: jsonb("last_result"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type CleanupPolicy = typeof cleanupPolicies.$inferSelect;
