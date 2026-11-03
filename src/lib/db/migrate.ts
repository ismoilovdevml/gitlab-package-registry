import "server-only";

import type { Sql } from "postgres";

// Idempotent schema bootstrap, applied once per process at startup (see src/instrumentation.ts).
// Keep in sync with src/lib/db/schema.ts.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
    id serial PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value text NOT NULL,
    encrypted boolean NOT NULL DEFAULT false,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    gitlab_user_id integer NOT NULL UNIQUE,
    username text NOT NULL,
    name text,
    email text,
    avatar_url text,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now(),
    last_login_at timestamp
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token text NOT NULL,
    refresh_token text,
    token_expires_at timestamp,
    expires_at timestamp NOT NULL,
    user_agent text,
    ip text,
    created_at timestamp NOT NULL DEFAULT now(),
    last_seen_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id serial PRIMARY KEY,
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    target text,
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS username text`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_type text`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS project_id integer`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS project_path text`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success'`,
  `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip text`,
  `CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log(action)`,
  `CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_log(user_id)`,
  `CREATE TABLE IF NOT EXISTS cleanup_policies (
    id serial PRIMARY KEY,
    name text NOT NULL,
    project_id integer NOT NULL,
    project_path text NOT NULL,
    package_type text,
    name_pattern text,
    keep_latest integer,
    older_than_days integer,
    enabled boolean NOT NULL DEFAULT true,
    dry_run boolean NOT NULL DEFAULT true,
    last_run_at timestamp,
    last_result jsonb,
    created_by integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
];

export async function migrate(sql: Sql) {
  // Serialize concurrent starts (several replicas) with an advisory lock.
  await sql.begin(async (tx) => {
    await tx.unsafe("SELECT pg_advisory_xact_lock(727274)");
    for (const statement of STATEMENTS) {
      await tx.unsafe(statement);
    }
  });
}
