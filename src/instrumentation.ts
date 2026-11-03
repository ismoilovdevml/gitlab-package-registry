export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSchema } = await import("@/lib/db");
  await ensureSchema();
  console.log("[ombor] database schema ready");
}
