/**
 * Swanwright - Unified Done-Gate
 * Deterministic quality gate. A missing check is UNRUN, not PASS.
 * NOT_CONFIGURED counts only as a WAIVER, never as PASS: the FACT row must
 * name the gate, give a reason (`alasan:`) AND evidence (`bukti:` /
 * `perintah:` / `output:` with the command that proves the absence), and the
 * gate records it in `DoneGateResult.waived`, not as passed.
 * Scan is required whenever files changed, in any sector (secret scan first
 * for non-coding); a bare `NOT_CONFIGURED` FACT no longer waives anything.
 * JUDGMENT rows never override a failed or missing FACT.
 */

import * as fs from "fs";
import { checkDiffScope } from "./scan-gate.ts";
import { checkRewriteToDocs } from "./doc-drift.ts";
import type { CiStatus, DoneGateInput, DoneGateResult, GateStatus } from "./io-schema/types.ts";

const RELEASE_ACCOUNTED = ["typecheck", "tests", "build"] as const;

export function factMatches(facts: string[] | undefined, pattern: RegExp): boolean {
  return (facts ?? []).some((line) => {
    const trimmed = line.trim();
    return /^FACT:/i.test(trimmed) && pattern.test(trimmed);
  });
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Waiver NOT_CONFIGURED yang sah (P1-1, v0.3.42): satu baris FACT yang
 * menyebut nama gate + `NOT_CONFIGURED`, berisi alasan (`alasan: ...`) DAN
 * bukti (`bukti:` / `perintah:` / `output:` — perintah yang membuktikan
 * ketiadaan itu, mis. output perintah yang menunjukkan tidak ada CI).
 * FACT telanjang (`FACT: typecheck NOT_CONFIGURED`) TIDAK sah.
 * Mengembalikan { waived, reason } — reason dipakai di `DoneGateResult.waived`.
 */
export function notConfiguredWaiver(
  facts: string[] | undefined,
  names: string | string[],
): { waived: boolean; reason?: string } {
  const list = Array.isArray(names) ? names : [names];
  const line = (facts ?? []).map((l) => l.trim()).find((l) =>
    /^FACT:/i.test(l) && /NOT_CONFIGURED/i.test(l) &&
    list.some((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(l)));
  if (!line) return { waived: false };
  const reasonMatch = line.match(/alasan\s*:\s*(.+)/i);
  const evidence = /(bukti|perintah|output)\s*:\s*\S.{3,}/i.test(line);
  const reason = reasonMatch?.[1]?.split(";")[0]?.trim() ?? "";
  if (reason.length < 4 || !evidence) return { waived: false };
  return { waived: true, reason: reason.slice(0, 80) };
}

function releaseGateStatus(input: DoneGateInput, name: string): GateStatus {
  return input.releaseGates?.[name] ?? "UNRUN";
}

const WAIVER_HINT = "butuh waiver beralasan + bukti perintah (FACT: <gate> NOT_CONFIGURED — alasan: ...; bukti/perintah: <perintah + output>)";

interface GateOutcome { reasons: string[]; waived: string[] }

function pushBlocks(input: DoneGateInput): GateOutcome {
  if (!input.pushRequested) return { reasons: [], waived: [] };
  const reasons: string[] = [];
  const waived: string[] = [];
  const remoteFact = factMatches(input.facts, /remote/i);
  if (input.remoteShaOk !== true || !remoteFact) {
    reasons.push("push requested without a remote SHA FACT");
  }
  if (input.ciStatus === "GREEN") {
    if (!factMatches(input.facts, /\bci\b/i)) {
      reasons.push("CI green is not recorded as a FACT");
    }
  } else if (input.ciStatus === "NOT_CONFIGURED") {
    const w = notConfiguredWaiver(input.facts, "ci");
    if (w.waived) waived.push(`ciStatus NOT_CONFIGURED (waived: ${w.reason})`);
    else if (factMatches(input.facts, /NOT_CONFIGURED/)) reasons.push(`ciStatus NOT_CONFIGURED tanpa waiver sah — ${WAIVER_HINT}`);
    else reasons.push("ciStatus NOT_CONFIGURED is not an explicit FACT");
  } else {
    reasons.push(`ciStatus is ${input.ciStatus ?? "UNRUN"} (expected GREEN or explicit NOT_CONFIGURED)`);
  }
  return { reasons, waived };
}

function releaseBlocks(input: DoneGateInput): GateOutcome {
  if (input.verificationProfile !== "RELEASE") return { reasons: [], waived: [] };
  const reasons: string[] = [];
  const waived: string[] = [];
  const fromGate = input.scanGate ? (input.scanGate.status === "WARN" ? "PASS" : input.scanGate.status) : undefined;
  const scanner = input.releaseGates?.scanner ?? input.scannerStatus ?? fromGate ?? "UNRUN";
  if (scanner === "NOT_CONFIGURED" || scanner === "UNRUN") {
    const w = notConfiguredWaiver(input.facts, ["scanner", "scan"]);
    if (w.waived) waived.push(`RELEASE scanner ${scanner} (waived: ${w.reason})`);
    else if (scanner === "NOT_CONFIGURED" && factMatches(input.facts, /NOT_CONFIGURED.*scan|scan.*NOT_CONFIGURED/i)) reasons.push(`RELEASE scanner NOT_CONFIGURED tanpa waiver sah — ${WAIVER_HINT}`);
    else reasons.push(`RELEASE scanner is ${scanner}`);
  } else if (scanner !== "PASS") {
    reasons.push(`RELEASE scanner is ${scanner}`);
  }
  for (const name of RELEASE_ACCOUNTED) {
    const status = releaseGateStatus(input, name);
    if (status === "PASS") continue;
    if (status === "NOT_CONFIGURED") {
      const w = notConfiguredWaiver(input.facts, name);
      if (w.waived) { waived.push(`${name} NOT_CONFIGURED (waived: ${w.reason})`); continue; }
      reasons.push(`RELEASE gate ${name} is NOT_CONFIGURED tanpa waiver sah — ${WAIVER_HINT}`);
      continue;
    }
    reasons.push(`RELEASE gate ${name} is ${status}`);
  }
  return { reasons, waived };
}

function scanBlocks(input: DoneGateInput): GateOutcome {
  // P1-1 (1): scan wajib bila ada file berubah, di sektor apa pun — bukan hanya coding.
  const changed = input.changedFiles ?? [];
  const required = input.sector === "coding" || input.scanGate !== undefined || changed.length > 0;
  if (!required) return { reasons: [], waived: [] };
  const st = input.scanGate?.status ?? "UNRUN";
  if (st === "PASS" || st === "WARN") {
    if (input.scanGate?.secretOnly && input.sector === "coding") {
      return { reasons: ["scan-gate secret-only tidak cukup untuk sektor coding (butuh CVE+secret penuh)"], waived: [] };
    }
    return { reasons: [], waived: [] };
  }
  if (st === "UNRUN") {
    const w = notConfiguredWaiver(input.facts, "scan");
    if (w.waived) return { reasons: [], waived: [`scan-gate UNRUN (waived: ${w.reason})`] };
    if (factMatches(input.facts, /NOT_CONFIGURED.*scan|scan.*NOT_CONFIGURED/i)) {
      return { reasons: [`scan-gate UNRUN: NOT_CONFIGURED tanpa waiver sah — ${WAIVER_HINT}`], waived: [] };
    }
  }
  const detail = input.scanGate?.blocks?.length ? `: ${input.scanGate.blocks.join(" | ")}` : "";
  return { reasons: [`scan-gate ${st} (UNRUN bukan PASS)${detail}`], waived: [] };
}

/** Guard lapis kedua (P1-1, langkah 3): scan WARN yang masih memuat CVE
 * CRITICAL/HIGH tanpa fix tanpa FACT mitigasi yang menyebut ID-nya -> blok.
 * Menangkap scanGate rakitan tangan / versi lama yang belum mengenal mitigasi. */
function unmitigatedBlocks(input: DoneGateInput): string[] {
  const sg = input.scanGate;
  if (!sg || sg.status === "FAIL" || sg.status === "UNRUN") return [];
  const reasons: string[] = [];
  for (const w of sg.warnings ?? []) {
    if (!/(CRITICAL|HIGH)\b[^|]*tanpa fix/i.test(w)) continue;
    const id = w.match(/(GHSA-[A-Za-z0-9-]+|CVE-\d{4}-\d+)/i)?.[1];
    if (!id) { reasons.push(`CVE CRITICAL/HIGH tanpa fix dan tanpa catatan mitigasi: ${w}`); continue; }
    const mitigated = (input.facts ?? []).some((l) =>
      /^FACT:/i.test(l.trim()) && /mitigasi/i.test(l) && l.toLowerCase().includes(id.toLowerCase()));
    if (!mitigated) reasons.push(`CVE ${id} CRITICAL/HIGH tanpa fix dan tanpa catatan mitigasi (FACT: mitigasi ${id}: <rencana>)`);
  }
  return reasons;
}

export function evaluateDoneGate(input: DoneGateInput): DoneGateResult {
  const exitCodeOk = input.commandExitCode === 0;

  const missingArtifacts: string[] = [];
  for (const artifact of input.expectedArtifacts) {
    if (input.actualArtifactsCheck) {
      if (!input.actualArtifactsCheck(artifact)) {
        missingArtifacts.push(artifact);
      }
    } else {
      try {
        if (!fs.existsSync(artifact)) {
          missingArtifacts.push(artifact);
        } else {
          const stat = fs.statSync(artifact);
          if (stat.size === 0) {
            missingArtifacts.push(`${artifact} (empty file)`);
          }
        }
      } catch {
        missingArtifacts.push(artifact);
      }
    }
  }

  const artifactsExist = missingArtifacts.length === 0;

  // Fail-closed (P0-3): tanpa bukti tes (exit code perintah tes ATAU testsGreen),
  // testsPassed = false — "tidak ada bukti" bukan PASS. Dibedakan dari "tes gagal" di failureReason.
  let testsPassed = false;
  let testsEvidence = false;
  if (input.testCommandExitCode !== undefined && input.testCommandExitCode !== null) {
    testsPassed = input.testCommandExitCode === 0;
    testsEvidence = true;
  } else if (input.testsGreen !== undefined) {
    testsPassed = input.testsGreen;
    testsEvidence = true;
  }

  const push = pushBlocks(input);
  const release = releaseBlocks(input);
  const scan = scanBlocks(input);
  const extra = [...push.reasons, ...release.reasons, ...scan.reasons, ...unmitigatedBlocks(input)];
  const waived = [...push.waived, ...release.waived, ...scan.waived];
  const warnings = [
    ...(input.scanGate?.warnings ?? []),
    ...checkDiffScope(input.changedFiles ?? [], input.taskScope ?? []),
    ...checkRewriteToDocs({ changedFiles: input.changedFiles ?? [], passingBefore: input.passingBefore ?? [], reasons: input.changeReasons }),
    // P1-1 (1): secret-only lolos untuk non-coding, tapi CVE belum dipindai — catat sebagai langkah berikut.
    ...(input.scanGate?.secretOnly && input.sector !== "coding" && (input.scanGate.status === "PASS" || input.scanGate.status === "WARN")
      ? ["scan-gate secret-only: secret scan lolos, CVE scan belum dijalankan untuk sektor non-coding (langkah berikut)"] : []),
    // P1-1 (2): waiver dicatat sebagai waived, bukan passed — terlihat di warnings.
    ...waived.map((w) => `waived: ${w}`),
  ];
  const isDone = exitCodeOk && artifactsExist && testsPassed && extra.length === 0;

  let failureReason: string | undefined;
  if (!isDone) {
    const reasons: string[] = [];
    if (!exitCodeOk) reasons.push(`Command exit code was ${input.commandExitCode} (expected 0)`);
    if (!artifactsExist) reasons.push(`Missing or empty target artifacts: [${missingArtifacts.join(", ")}]`);
    if (!testsPassed) reasons.push(testsEvidence ? "Test suite did not pass (testsGreen is false)" : "Tidak ada bukti tes: testCommandExitCode/testsGreen tidak diisi (UNRUN bukan PASS)");
    reasons.push(...extra);
    failureReason = reasons.join("; ");
  }

  return {
    isDone,
    exitCodeOk,
    artifactsExist,
    missingArtifacts,
    testsPassed,
    remoteShaOk: input.remoteShaOk,
    ciStatus: input.ciStatus as CiStatus | undefined,
    verificationProfile: input.verificationProfile,
    failureReason,
    warnings,
    waived,
    docCodeDrift: (input.docCodeDrift ?? []).filter((l) => /^FACT:/i.test(l.trim())),
  };
}
