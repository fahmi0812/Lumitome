/** `npm run scan [-- --scope "src/**,tests/**"]` — CVE+secret gate + diff-scope. Exit 1 bila FAIL/UNRUN.
 * P1-1 (v0.3.42):
 * - `--secret-only` — hanya gitleaks (jalur murah sektor non-coding); CVE belum dipindai.
 * - `--mitigations-file <path>` — baris `FACT: mitigasi <ID>: ...` (satu per baris);
 *   CVE CRITICAL/HIGH tanpa fix yang ID-nya disebut di file ini jadi WARN, bukan FAIL. */
import fs from "node:fs";
import { runScanGate, runSecretScanGate, checkDiffScope, gitChangedFiles } from "../harness/scan-gate.ts";

const args = process.argv.slice(2);
const i = args.indexOf("--scope");
const scope = i >= 0 ? String(args[i + 1] ?? "").split(",").filter(Boolean) : [];
const secretOnly = args.includes("--secret-only");
const mi = args.indexOf("--mitigations-file");
const mitigations = mi >= 0 && args[mi + 1]
  ? fs.readFileSync(args[mi + 1], "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
  : [];
const r = secretOnly ? runSecretScanGate(".") : runScanGate(".", undefined, { mitigations });
for (const t of r.tools) {
  console.log(`[${t.status}] ${t.tool}${t.note ? " — " + t.note : ""}`);
  t.findings.forEach((f) => console.log("  BLOK:", f));
}
r.warnings.forEach((w) => console.warn("[WARN]", w));
checkDiffScope(gitChangedFiles(), scope).forEach((w) => console.warn("[WARN]", w));
console.log(`FACT: scan-gate ${r.status} (${secretOnly ? "gitleaks saja (secret-only)" : "osv-scanner+gitleaks"}${mitigations.length ? `, ${mitigations.length} catatan mitigasi` : ""})`);
process.exit(r.status === "FAIL" || r.status === "UNRUN" ? 1 : 0);
