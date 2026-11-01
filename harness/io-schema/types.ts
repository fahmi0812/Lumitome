/**
 * SuperQuantumAGI - I/O Schema & Contracts
 * Pure native TypeScript schemas matching PRD §5, §8, §11.
 */

export type SectorID =
  | "orchestration-quality"
  | "coding"
  | "reverse-engineering"
  | "security-pentest"
  | "osint"
  | "motion-media"
  | "data-doc-cad"
  | "research"
  | "writing"
  | "career"
  | "devops-infra-finance";

export type ComplexityTier = "Low" | "High";
export type DispatchMode = "fast-path" | "serial" | "parallel";
export type ProfileTier = "Default" | "Pentest" | "ReAnalysis";
export type QualityObligation = "none" | "post-push";
export type VerificationProfile = "FAST" | "STANDARD" | "UI" | "SECURITY" | "PERFORMANCE" | "RELEASE";
export type GateStatus = "PASS" | "FAIL" | "NOT_CONFIGURED" | "UNRUN";
export type CiStatus = "GREEN" | "RED" | "PENDING" | "NOT_CONFIGURED" | "UNRUN";

export interface Layer0Decision {
  matched: boolean;
  type?: "slash_command" | "keyword_regex";
  command?: string;
  sector?: SectorID;
  complexity?: ComplexityTier;
  profile?: ProfileTier;
  matchedPattern?: string;
  /** Set on push routes. Low complexity does not waive this. */
  qualityObligation?: QualityObligation;
  /** Slash-only manuals must not be selected by keyword regex. */
  slashOnly?: boolean;
}

export interface Layer1TriageOutput {
  sector: SectorID;
  complexity: ComplexityTier;
  profile: ProfileTier;
  /** Named sectors for a parallel plan. Absent means the primary sector only. */
  sectors?: SectorID[];
  intentVsTask: {
    surfaceRequest: string;
    underlyingIntent: string;
    isEmergencyPatch: boolean;
  };
  reasoning: string;
}

export interface DoneGateInput {
  commandExitCode: number;
  expectedArtifacts: string[];
  testCommandExitCode?: number | null;
  testsGreen?: boolean;
  actualArtifactsCheck?: (path: string) => boolean;
  verificationProfile?: VerificationProfile;
  pushRequested?: boolean;
  remoteShaOk?: boolean;
  ciStatus?: CiStatus;
  scannerStatus?: GateStatus;
  releaseGates?: Record<string, GateStatus>;
  /** Ledger rows. Only lines starting with `FACT:` are blocking evidence. */
  facts?: string[];
  /** Sektor executor. `coding` mewajibkan scan-gate (osv-scanner+gitleaks). */
  sector?: string;
  /** Hasil harness/scan-gate.ts. FAIL/UNRUN memblok; WARN hanya peringatan. */
  scanGate?: { status: "PASS" | "WARN" | "FAIL" | "UNRUN"; blocks?: string[]; warnings?: string[] };
  /** Diff-scope: file berubah vs glob scope tugas. Di luar scope → WARN, bukan blok. */
  changedFiles?: string[];
  taskScope?: string[];
  /** FACT drift dari harness/doc-drift.ts; masuk bagian "Doc-Code Drift". */
  docCodeDrift?: string[];
  /** File yang lulus tes sebelum perubahan + alasan perubahan per file (cek rewrite demi dokumen → WARN). */
  passingBefore?: string[];
  changeReasons?: Record<string, string>;
}

export interface DoneGateResult {
  isDone: boolean;
  exitCodeOk: boolean;
  artifactsExist: boolean;
  missingArtifacts: string[];
  testsPassed: boolean;
  remoteShaOk?: boolean;
  ciStatus?: CiStatus;
  verificationProfile?: VerificationProfile;
  failureReason?: string;
  /** Peringatan non-blok (diff-scope, CVE MEDIUM ke bawah). */
  warnings: string[];
  /** Bagian laporan "Doc-Code Drift" (FACT ber-file:baris). */
  docCodeDrift: string[];
}

export interface AntiSpinState {
  taskId: string;
  currentIteration: number;
  maxIterations: 3; // hardcoded max 3 iterations
  consecutiveFailures: number;
  circuitBreakerTripped: boolean;
  history: Array<{
    iteration: number;
    timestamp: number;
    doneResult: DoneGateResult;
  }>;
}

export interface RootCauseCheckResult {
  isRootCause: boolean;
  isSymptomOnly: boolean;
  symptomExplanation: string;
  patternFoundInOtherModules: string[];
  blastRadius: "low" | "medium" | "high";
  requiresOperatorConsent: boolean;
}

export interface PentestConsentVerification {
  valid: boolean;
  reason?: string;
  authorizedBy?: string;
  allowedTargets?: string[];
  disallowedTargets?: string[];
  consentToken?: string;
}
