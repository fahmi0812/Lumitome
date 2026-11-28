/**
 * Migrasi config dasar Lumitome yang tersalin di $LUMI_HOME/config/opencode.jsonc (Windows tanpa symlink → salinan)
 * serta migrasi variabel legacy SW_9ROUTER_* → LUMI_* pada $LUMI_HOME/env.sh.
 * - compaction.buffer: engine 2.3.0 menerima integer token MAUPUN "10%"
 *   (format persen sejak 2.2.5); buffer persen = bagian jendela konteks yang
 *   disisakan kosong — "10%" berarti auto-compact mulai saat percakapan
 *   mencapai 90% jendela (v0.3.83). Nilai default lama ("20%" dan 20000)
 *   dimigrasikan ke "10%" supaya salinan config lama tetap konsisten
 *   dengan config dasar. Nilai lain (pilihan user) tidak disentuh.
 * - apiKey 9router: {env:NINEROUTER_API_KEY} → {env:LUMI_KEY_9ROUTER} (variabel yang selalu di-set wrapper).
 * - env.sh: export SW_9ROUTER_URL / SW_9ROUTER_KEY → LUMI_9ROUTER_URL / LUMI_KEY_9ROUTER (sisi kiri = saja, komentar & fallback modern utuh).
 * Symlink tidak ditulis (target-nya file sumber paket). Tidak pernah menulis key mentah.
 */
import fs from "node:fs";

export const BUFFER = '"10%"';

export function migrateText(t) {
  return t
    .replace(/("buffer"\s*:\s*)"\s*\d+(?:\.\d+)?\s*%\s*"/g, `$1${BUFFER}`)
    .replace(/("buffer"\s*:\s*)20000\b/g, `$1${BUFFER}`)
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

/**
 * Migrasi env.sh lama (SW_9ROUTER_URL / SW_9ROUTER_KEY) ke LUMI_9ROUTER_URL / LUMI_KEY_9ROUTER.
 * - Baris komentar (# ...) tidak disentuh.
 * - Baris modern (`export LUMI_9ROUTER_URL="${LUMI_9ROUTER_URL:-${SW_9ROUTER_URL:-...}}"`) tidak disentuh.
 * - CRLF/LF dipertahankan dan 100% idempoten.
 */
export function migrateEnvText(t) {
  return String(t).split("\n").map((rawLine) => {
    const hasCr = rawLine.endsWith("\r");
    const line = hasCr ? rawLine.slice(0, -1) : rawLine;
    if (/^\s*#/.test(line)) return rawLine;
    const next = line
      .replace(/(^|[\s;])SW_9ROUTER_URL=(["']?)\$\{SW_9ROUTER_URL:-/g, "$1LUMI_9ROUTER_URL=$2${LUMI_9ROUTER_URL:-") // env-compat-allow
      .replace(/(^|[\s;])SW_9ROUTER_KEY=(["']?)\$\{SW_9ROUTER_KEY:-/g, "$1LUMI_KEY_9ROUTER=$2${LUMI_KEY_9ROUTER:-") // env-compat-allow
      .replace(/(^|[\s;])SW_9ROUTER_URL=/g, "$1LUMI_9ROUTER_URL=") // env-compat-allow
      .replace(/(^|[\s;])SW_9ROUTER_KEY=/g, "$1LUMI_KEY_9ROUTER="); // env-compat-allow
    return hasCr ? next + "\r" : next;
  }).join("\n");
}

/** true bila file diubah. */
export function migrateEnvFile(file) {
  let st; try { st = fs.lstatSync(file); } catch { return false; }
  if (st.isSymbolicLink() || !st.isFile()) return false;
  const t = fs.readFileSync(file, "utf8"), n = migrateEnvText(t);
  if (n === t) return false;
  fs.writeFileSync(file, n);
  return true;
}
