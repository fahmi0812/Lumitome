/**
 * Migrasi config dasar Lumitome yang tersalin di $LUMI_HOME/config/opencode.jsonc (Windows tanpa symlink → salinan).
 * - compaction.buffer: engine 2.2.4 hanya menerima integer token; "20%" (format 2.2.5) diganti BUFFER_TOKENS.
 * - apiKey 9router: {env:NINEROUTER_API_KEY} → {env:LUMI_KEY_9ROUTER} (variabel yang selalu di-set wrapper).
 * Symlink tidak ditulis (target-nya file sumber paket). Tidak pernah menulis key mentah.
 */
import fs from "node:fs";

export const BUFFER_TOKENS = 20000;

export function migrateText(t) {
  return t
    .replace(/("buffer"\s*:\s*)"\s*\d+(?:\.\d+)?\s*%\s*"/g, `$1${BUFFER_TOKENS}`)
    .replace(/\{env:NINEROUTER_API_KEY\}/g, "{env:LUMI_KEY_9ROUTER}");
}

/** true bila file diubah. */
export function migrateConfigFile(file) {
  let st; try { st = fs.lstatSync(file); } catch { return false; }
  if (st.isSymbolicLink() || !st.isFile()) return false;
  const t = fs.readFileSync(file, "utf8"), n = migrateText(t);
  if (n === t) return false;
  fs.writeFileSync(file, n);
  return true;
}
