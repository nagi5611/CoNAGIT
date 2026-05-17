// src/env.ts
/** Return process.env[name] or throw if missing/blank. */
export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    throw new Error(`missing_env:${name}`);
  }
  return v.trim();
}
