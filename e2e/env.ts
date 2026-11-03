import path from "node:path";

/** Shared by playwright.config.ts, the global setup and the specs. */
export const MOCK_PORT = 4556;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
export const APP_PORT = 3200;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const DATABASE_URL = process.env.DATABASE_URL || "postgresql://glpr@127.0.0.1:5433/ombor_e2e";
export const AUTH_FILE = path.join(__dirname, ".auth", "admin.json");
