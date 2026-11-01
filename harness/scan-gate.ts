/**
 * Swanwright - Scan Gate (CVE + secret) dan Diff-Scope.
 * osv-scanner (lockfile/manifest) + gitleaks (diff/staging).
 * Biner tidak ada → UNRUN (bukan PASS) + instruksi instalasi.
 * FAIL: CVE CRITICAL/HIGH yang punya fix, atau secret apa pun. MEDIUM ke bawah → WARN.
 */
import { spawnSync } from "child_process";

export const PINNED = { osvScanner: "v2.7.0", gitleaks: "v8.30.1" } as const;

export const INSTALL_HINT = {
  "osv-scanner": `osv-scanner ${PINNED.osvScanner} tidak terpasang. Pasang: go install github.com/google/osv-scanner/v2/cmd/osv-scanner@${PINNED.osvScanner}  (atau unduh biner dari https://github.com/google/osv-scanner/releases/tag/${PINNED.osvScanner})`,
  gitleaks: `gitleaks ${PINNED.gitleaks} tidak terpasang. Pasang: go install github.com/zricethezav/gitleaks/v8@${PINNED.gitleaks}  (atau unduh biner dari https://github.com/gitleaks/gitleaks/releases/tag/${PINNED.gitleaks})`,
};

export type ScanStatus = "PASS" | "WARN" | "FAIL" | "UNRUN";
export interface ToolResult { tool: string; status: ScanStatus; findings: string[]; warnings: string[]; note?: string }
export interface ScanGateResult { status: ScanStatus; tools: ToolResult[]; blocks: string[]; warnings: string[] }

export interface ExecResult { status: number | null; stdout: string; stderr: string; error?: unknown }
export type Exec = (cmd: string, args: string[]) => ExecResult;

export const realExec: Exec = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error };
};

function missing(r: ExecResult): boolean {
  return !!r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT";
}

function sevFromScore(score: number): string {
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

/** Parse JSON osv-scanner v2 (`--format json`). */
/** Skill vendored Swanwright (`packs/`, `.opencode/skills/`) bukan dependensi proyek → dilewati. */
export const OSV_SKIP = /(^|\/)(packs|\.opencode\/skills)\//;

export function evaluateOsv(json: any): ToolResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  for (const res of json?.results ?? []) {
    if (OSV_SKIP.test(String(res.source?.path ?? ""))) continue;
    for (const pkg of res.packages ?? []) {
      const name = `${pkg.package?.ecosystem ?? "?"}/${pkg.package?.name ?? "?"}@${pkg.package?.version ?? "?"}`;
      const groupSev = new Map<string, string>();
      for (const g of pkg.groups ?? []) {
        const s = parseFloat(g.max_severity);
        for (const id of g.ids ?? []) if (!Number.isNaN(s)) groupSev.set(id, sevFromScore(s));
      }
      for (const v of pkg.vulnerabilities ?? []) {
        const sev = String(v.database_specific?.severity ?? groupSev.get(v.id) ?? "UNKNOWN").toUpperCase();
        const hasFix = (v.affected ?? []).some((a: any) =>
          (a.ranges ?? []).some((rg: any) => (rg.events ?? []).some((e: any) => e.fixed)));
        const line = `${v.id} ${sev}${hasFix ? " (fix tersedia)" : " (tanpa fix)"} di ${name}`;
        if ((sev === "CRITICAL" || sev === "HIGH") && hasFix) findings.push(line);
        else warnings.push(line);
      }
    }
  }
  return { tool: "osv-scanner", status: findings.length ? "FAIL" : warnings.length ? "WARN" : "PASS", findings, warnings };
}

/** Parse laporan JSON gitleaks (array). Secret apa pun → FAIL. */
export function evaluateGitleaks(json: any): ToolResult {
  const arr = Array.isArray(json) ? json : [];
  const findings = arr.map((f: any) => `${f.RuleID ?? "secret"} di ${f.File ?? "?"}:${f.StartLine ?? "?"}`);
  return { tool: "gitleaks", status: findings.length ? "FAIL" : "PASS", findings, warnings: [] };
}

function safeJson(s: string, fallback: any): any {
  const t = s.trim();
  if (!t) return fallback;
  try { return JSON.parse(t); } catch { return undefined; }
}

export function runOsv(dir: string, exec: Exec = realExec): ToolResult {
  // osv-scanner.toml di root proyek dibaca otomatis (IgnoredVulns + reason).
  const r = exec("osv-scanner", ["scan", "source", "-r", "--format", "json", dir]);
  if (missing(r)) return { tool: "osv-scanner", status: "UNRUN", findings: [], warnings: [], note: INSTALL_HINT["osv-scanner"] };
  if (r.status === 128) return { tool: "osv-scanner", status: "PASS", findings: [], warnings: [], note: "tidak ada lockfile/manifest (exit 128)" };
  const j = safeJson(r.stdout, { results: [] });
  if (j === undefined || (r.status !== 0 && r.status !== 1)) {
    return { tool: "osv-scanner", status: "UNRUN", findings: [], warnings: [], note: `osv-scanner exit ${r.status}: ${r.stderr.slice(0, 300)}` };
  }
  return evaluateOsv(j);
}

export function runGitleaks(dir: string, exec: Exec = realExec): ToolResult {
  // .gitleaks.toml / .gitleaksignore di root dibaca otomatis.
  const all: any[] = [];
  for (const extra of [["--staged"], []]) {
    const r = exec("gitleaks", ["git", "--pre-commit", ...extra, "--redact", "--no-banner", "--exit-code", "0",
      "--report-format", "json", "--report-path", "-", dir]);
    if (missing(r)) return { tool: "gitleaks", status: "UNRUN", findings: [], warnings: [], note: INSTALL_HINT.gitleaks };
    const j = safeJson(r.stdout, []);
    if (r.status !== 0 || j === undefined) {
      return { tool: "gitleaks", status: "UNRUN", findings: [], warnings: [], note: `gitleaks exit ${r.status}: ${r.stderr.slice(0, 300)}` };
    }
    all.push(...j);
  }
  return evaluateGitleaks(all);
}

export function combine(tools: ToolResult[]): ScanGateResult {
  const blocks: string[] = [];
  const warnings: string[] = [];
  for (const t of tools) {
    if (t.status === "FAIL") blocks.push(...t.findings.map((f) => `${t.tool}: ${f}`));
    if (t.status === "UNRUN") blocks.push(`${t.tool} UNRUN: ${t.note ?? ""}`);
    warnings.push(...t.warnings.map((w) => `${t.tool}: ${w}`));
  }
  const status: ScanStatus = tools.some((t) => t.status === "FAIL") ? "FAIL"
    : tools.some((t) => t.status === "UNRUN") ? "UNRUN"
    : warnings.length ? "WARN" : "PASS";
  return { status, tools, blocks, warnings };
}

export function runScanGate(dir = ".", exec: Exec = realExec): ScanGateResult {
  return combine([runOsv(dir, exec), runGitleaks(dir, exec)]);
}

/** Diff-scope: file berubah di luar scope tugas → WARN (bukan blok). */
export function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
  return new RegExp(`^${esc}$`);
}

export function checkDiffScope(changedFiles: string[], taskScope: string[]): string[] {
  if (!taskScope.length) return [];
  const res = taskScope.map(globToRegExp);
  return changedFiles
    .map((f) => f.replace(/^\.\//, ""))
    .filter((f) => !res.some((re) => re.test(f)))
    .map((f) => `diff-scope: ${f} berubah di luar scope tugas`);
}

export function gitChangedFiles(exec: Exec = realExec): string[] {
  const out = new Set<string>();
  for (const args of [["diff", "--name-only"], ["diff", "--name-only", "--cached"], ["ls-files", "--others", "--exclude-standard"]]) {
    const r = exec("git", args);
    if (r.status === 0) r.stdout.split("\n").map((s) => s.trim()).filter(Boolean).forEach((f) => out.add(f));
  }
  return [...out];
}
