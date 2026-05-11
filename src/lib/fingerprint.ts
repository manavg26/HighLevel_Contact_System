import { createHash } from "node:crypto";

export function stableFingerprint(parts: Record<string, unknown>): string {
  const keys = Object.keys(parts).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[String(k)] = parts[k];
  return createHash("sha256")
    .update(JSON.stringify(ordered))
    .digest("hex");
}
