/**
 * Halting Watchdog (M6 / T2.5):
 * - Melacak progress_delta per langkah mutasi/verifikasi (git diff + status/output tes + witness/features).
 * - Trigger HALT ("zero-progress-streak") bila progress_delta === 0 selama 3 iterasi berturut-turut pada sesi mutasi.
 * - Trigger HALT ("ngram-loop") bila N-gram (tool, normalized_args) atau output error identik berulang >= 3x
 *   (atau siklus 2-langkah mutasi/gagal berulang >= 2 siklus).
 * - Anti-false-positive: sesi riset / baca-kode murni (0 mutasi, hanya lookup berbeda target) TIDAK pernah halt.
 * - Mencatat dead-end terstruktur ke <ws>/.tmp/session/<session_id>/dead_ends.jsonl (tag "[FAILED_PATH]").
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const LOOKUP_TOOLS = new Set(["read", "glob", "grep", "list", "ls", "webfetch", "websearch", "skill", "todoread"]);
const MUTATING_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);
const SHELL_TOOLS = new Set(["shell", "bash"]);

function sha256(s) {
  return crypto.createHash("sha256").update(String(s ?? "")).digest("hex");
}

export function sanitizeSessionId(sessionId = "default") {
  const s = String(sessionId || "default").replace(/[^A-Za-z0-9._-]/g, "_");
  return s || "default";
}

export function deadEndsPath(workspace = process.cwd(), sessionId = "default") {
  return path.join(path.resolve(workspace), ".tmp", "session", sanitizeSessionId(sessionId), "dead_ends.jsonl");
}

export function normalizeArgs(tool, input = {}) {
  const t = String(tool || "");
  if (SHELL_TOOLS.has(t)) {
    return String(input?.command ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  }
  if (t === "execute") {
    return String(input?.code ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  }
  const target = input?.filePath ?? input?.path ?? input?.file ?? input?.pattern ?? input?.directory ?? input?.query ?? "";
  if (target) return String(target).trim();
  try {
    const keys = Object.keys(input || {}).sort();
    return JSON.stringify(input, keys).slice(0, 200);
  } catch {
    return "";
  }
}

export function normalizeErrorSig(errorText = "", exitCode = null) {
  const raw = String(errorText ?? "").trim();
  const head = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ")
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/g, "<TS>")
    .replace(/:\d+:\d+/g, ":<L>:<C>")
    .slice(0, 240);
  return `${exitCode ?? ""}:${sha256(head).slice(0, 12)}:${head.slice(0, 80)}`;
}

function readGitDiffSnapshot(workspace) {
  try {
    const ws = path.resolve(workspace);
    const diff = execFileSync("git", ["-C", ws, "diff"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const status = execFileSync("git", ["-C", ws, "status", "--porcelain"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    // Sertakan isi file untracked kecil agar mutasi untracked file terdeteksi
    const untrackedHashes = [];
    for (const line of status.split("\n")) {
      if (!line.startsWith("?? ")) continue;
      const rel = line.slice(3).trim();
      if (!rel || rel.startsWith(".tmp/")) continue;
      try {
        const abs = path.join(ws, rel);
        if (fs.statSync(abs).isFile()) {
          untrackedHashes.push(`${rel}:${sha256(fs.readFileSync(abs)).slice(0, 12)}`);
        }
      } catch {}
    }
    return {
      diffHash: sha256(diff),
      statusHash: sha256(status + "|" + untrackedHashes.sort().join(",")),
      hasGit: true,
    };
  } catch {
    return { diffHash: "no-git", statusHash: "no-git", hasGit: false };
  }
}

export function computeProgressFingerprint({
  workspace,
  diffHash,
  statusHash,
  testOutputHash = "",
  testStatus = "",
  validWitnessIds = [],
  passedFeatureIds = [],
} = {}) {
  const gitSnap = (diffHash === undefined || statusHash === undefined) && workspace
    ? readGitDiffSnapshot(workspace)
    : { diffHash: diffHash ?? "", statusHash: statusHash ?? "" };
  const payload = JSON.stringify({
    diffHash: gitSnap.diffHash,
    statusHash: gitSnap.statusHash,
    testOutputHash: String(testOutputHash || ""),
    testStatus: String(testStatus || ""),
    validWitnessIds: [...validWitnessIds].sort(),
    passedFeatureIds: [...passedFeatureIds].sort(),
  });
  return sha256(payload);
}

export function detectOverthinking(text, { env = process.env } = {}) {
  if (String(env?.LUMI_OVERTHINK_GUARD ?? "") === "0") return { overthinking: false, count: 0 };
  const s = String(text ?? "");
  if (!s) return { overthinking: false, count: 0 };
  const matches = s.match(/\b(?:wait,|actually,|on second thought|tunggu,|sebenarnya,|ganti pendekatan|let me reconsider|let's backtrack)\b/gi) || [];
  return { overthinking: matches.length > 2, count: matches.length };
}

function isMutatingCall(tool, input = {}) {
  const t = String(tool || "");
  if (MUTATING_TOOLS.has(t)) return true;
  if (t === "execute") return /\b(?:Bun\.write|writeFile|appendFile|rm|unlink|rename)\b/.test(String(input?.code ?? ""));
  if (SHELL_TOOLS.has(t)) {
    const cmd = String(input?.command ?? "");
    return /(?:>|>>|\b(?:tee|rm|mv|cp|mkdir|touch|sed\s+-i|git\s+(?:commit|checkout|switch|reset|apply))\b)/.test(cmd);
  }
  return false;
}

function isLookupOnlyCall(tool, input = {}) {
  const t = String(tool || "");
  if (LOOKUP_TOOLS.has(t)) return true;
  if (SHELL_TOOLS.has(t)) {
    const cmd = String(input?.command ?? "").trim();
    const bin = path.basename(cmd.split(/\s+/)[0] || "");
    if (/^(ls|cat|head|tail|grep|rg|find|stat|wc|pwd)$/.test(bin) && !/>/.test(cmd)) return true;
    if (bin === "git" && /\bgit\s+(?:status|diff|log|show|branch)\b/.test(cmd)) return true;
  }
  return false;
}

function findRepeatingNgram(window, n) {
  if (window.length < n * 2) return null;
  const counts = new Map();
  for (let i = 0; i <= window.length - n; i++) {
    const slice = window.slice(i, i + n);
    const gram = slice.map((x) => x.sig).join(" -> ");
    const prev = counts.get(gram) || { count: 0, lastEnd: -1, consecutive: 0, hasNonLookup: false, hasFail: false };
    // Hindari hitungan tumpang-tindih pada posisi yang sama
    if (i < prev.lastEnd) continue;
    const isConsecutive = prev.lastEnd === i;
    const hasNonLookup = slice.some((x) => !x.lookupOnly);
    const hasFail = slice.some((x) => x.ok === false);
    const next = {
      count: prev.count + 1,
      lastEnd: i + n,
      consecutive: isConsecutive ? prev.consecutive + 1 : 1,
      hasNonLookup: prev.hasNonLookup || hasNonLookup,
      hasFail: prev.hasFail || hasFail,
    };
    counts.set(gram, next);
  }
  for (const [gram, info] of counts.entries()) {
    // 3-gram (atau 4-gram) berulang >= 3x
    if (n >= 3 && info.count >= 3 && (info.hasNonLookup || info.hasFail)) {
      return { n, gram, count: info.count };
    }
    // Siklus 2-langkah mutasi/gagal berulang >= 2 siklus berturut-turut (edit A -> test fail -> edit A -> test fail)
    if (n === 2 && info.consecutive >= 2 && info.hasNonLookup && info.hasFail) {
      return { n, gram, count: info.consecutive };
    }
  }
  return null;
}

export class HaltingWatchdog {
  constructor({
    workspace = "",
    sessionId = "default",
    maxZeroProgressStreak = 3,
    windowSize = 16,
    persistDeadEnds = false,
  } = {}) {
    this.workspace = workspace;
    this.sessionId = sanitizeSessionId(sessionId);
    this.maxZeroProgressStreak = maxZeroProgressStreak;
    this.windowSize = windowSize;
    this.persistDeadEnds = persistDeadEnds;

    this.hasMutations = false;
    this.zeroProgressStreak = 0;
    this.lastFingerprint = null;
    this.visitedFingerprints = new Set();
    this.window = [];
    this.errorCounts = new Map();
    this.deadEnds = [];
    this.halted = null;
  }

  recordDeadEnd({ cmd_or_action, error_sig = "", reason, derived_from = [] }) {
    const entry = {
      t: new Date().toISOString(),
      tag: "[FAILED_PATH]",
      cmd_or_action: String(cmd_or_action || ""),
      error_sig: String(error_sig || ""),
      reason: String(reason || ""),
      derived_from: Array.isArray(derived_from) ? derived_from : [],
    };
    this.deadEnds.push(entry);
    if (this.persistDeadEnds && this.workspace) {
      try {
        const p = deadEndsPath(this.workspace, this.sessionId);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
      } catch {}
    }
    return entry;
  }

  evaluate() {
    if (this.halted) return this.halted;
    // Cek N-gram repetition (N = 2, 3, 4)
    for (const n of [3, 4, 2]) {
      const hit = findRepeatingNgram(this.window, n);
      if (hit) {
        this.halted = {
          verdict: "HALT",
          reason: "ngram-loop",
          detail: `${hit.n}-gram berulang ${hit.count}x: ${hit.gram}`,
          deadEnds: this.deadEnds,
        };
        this.recordDeadEnd({
          cmd_or_action: hit.gram,
          error_sig: "ngram-loop",
          reason: this.halted.detail,
        });
        return this.halted;
      }
    }
    // Cek error identik berulang >= 3x
    for (const [errSig, count] of this.errorCounts.entries()) {
      if (count >= 3) {
        this.halted = {
          verdict: "HALT",
          reason: "ngram-loop",
          detail: `output error identik berulang ${count}x (${errSig})`,
          deadEnds: this.deadEnds,
        };
        this.recordDeadEnd({
          cmd_or_action: "repeated-error",
          error_sig: errSig,
          reason: this.halted.detail,
        });
        return this.halted;
      }
    }
    // Cek zero-progress streak pada sesi mutasi
    if (this.hasMutations && this.zeroProgressStreak >= this.maxZeroProgressStreak) {
      this.halted = {
        verdict: "HALT",
        reason: "zero-progress-streak",
        detail: `progress_delta === 0 selama ${this.zeroProgressStreak} iterasi berturut-turut`,
        streak: this.zeroProgressStreak,
        lastFingerprint: this.lastFingerprint,
        deadEnds: this.deadEnds,
      };
      this.recordDeadEnd({
        cmd_or_action: "zero-progress",
        error_sig: `fp:${String(this.lastFingerprint || "").slice(0, 12)}`,
        reason: this.halted.detail,
      });
      return this.halted;
    }
    if (this.hasMutations && this.zeroProgressStreak === this.maxZeroProgressStreak - 1) {
      return {
        verdict: "WARN",
        reason: "stagnation-warning",
        detail: `progress_delta === 0 (${this.zeroProgressStreak}/${this.maxZeroProgressStreak}) — ganti pendekatan`,
        streak: this.zeroProgressStreak,
        deadEnds: this.deadEnds,
      };
    }
    return {
      verdict: "OK",
      streak: this.zeroProgressStreak,
      hasMutations: this.hasMutations,
      deadEnds: this.deadEnds,
    };
  }

  beforeStep(tool, input = {}) {
    if (this.halted) return this.halted;
    return this.evaluate();
  }

  /**
   * Catat satu langkah eksekusi tool + evaluasi progress_delta & N-gram.
   * snapshot: opsional override untuk test deterministik ({ diffHash, statusHash, testOutputHash, testStatus, validWitnessIds, passedFeatureIds }).
   */
  recordStep({
    tool,
    input = {},
    ok = true,
    errorText = "",
    exitCode = null,
    snapshot = null,
    mutating,
  } = {}) {
    const t = String(tool || "");
    const norm = normalizeArgs(t, input);
    const sig = `${t}:${norm}`;
    const lookupOnly = mutating === true ? false : isLookupOnlyCall(t, input);
    const didMutate = mutating === true || isMutatingCall(t, input);
    if (didMutate) this.hasMutations = true;

    this.window.push({ tool: t, norm, sig, ok: ok !== false, lookupOnly });
    if (this.window.length > this.windowSize) this.window.shift();

    if (ok === false) {
      const errSig = normalizeErrorSig(errorText || `${t}:${norm}`, exitCode);
      this.errorCounts.set(errSig, (this.errorCounts.get(errSig) || 0) + 1);
      this.recordDeadEnd({
        cmd_or_action: sig,
        error_sig: errSig,
        reason: String(errorText || `exit=${exitCode}`).slice(0, 200),
      });
    }

    // Progress delta hanya dilacak saat sesi sudah bermutasi (anti-false-positive sesi riset/baca murni)
    if (this.hasMutations && !lookupOnly) {
      const fp = snapshot?.fingerprint || computeProgressFingerprint({
        workspace: snapshot ? undefined : this.workspace,
        diffHash: snapshot?.diffHash,
        statusHash: snapshot?.statusHash,
        testOutputHash: snapshot?.testOutputHash ?? "",
        testStatus: snapshot?.testStatus ?? (exitCode !== null ? `exit:${exitCode}` : ok === false ? "fail" : "ok"),
        validWitnessIds: snapshot?.validWitnessIds ?? [],
        passedFeatureIds: snapshot?.passedFeatureIds ?? [],
      });

      if (this.lastFingerprint === null) {
        this.lastFingerprint = fp;
        this.visitedFingerprints.add(fp);
        this.zeroProgressStreak = 0;
      } else {
        const cycled = fp === this.lastFingerprint || (this.visitedFingerprints.has(fp) && ok === false);
        if (cycled) {
          this.zeroProgressStreak += 1;
        } else {
          this.zeroProgressStreak = 0;
          this.visitedFingerprints.add(fp);
        }
        this.lastFingerprint = fp;
      }
    }

    return this.evaluate();
  }
}
