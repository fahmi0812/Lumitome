/** `npm run scan [-- --scope "src/**,tests/**"]` — CVE+secret gate + diff-scope. Exit 1 bila FAIL/UNRUN. */
import { runScanGate, checkDiffScope, gitChangedFiles } from "../harness/scan-gate.ts";

const i = process.argv.indexOf("--scope");
const scope = i > 0 ? String(process.argv[i + 1] ?? "").split(",").filter(Boolean) : [];
const r = runScanGate(".");
for (const t of r.tools) {
  console.log(`[${t.status}] ${t.tool}${t.note ? " — " + t.note : ""}`);
  t.findings.forEach((f) => console.log("  BLOK:", f));
}
r.warnings.forEach((w) => console.warn("[WARN]", w));
checkDiffScope(gitChangedFiles(), scope).forEach((w) => console.warn("[WARN]", w));
console.log(`FACT: scan-gate ${r.status} (osv-scanner+gitleaks)`);
process.exit(r.status === "FAIL" || r.status === "UNRUN" ? 1 : 0);
