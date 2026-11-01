/**
 * Swanwright - Root-Cause Gate (RCG), Scope Guard (SCG), & Consent Checkpoint (CCP)
 * Governs post-fix behavior to prevent reckless code expansion (PRD §5.2).
 */

import type { RootCauseCheckResult } from "./io-schema/types.ts";

export interface RootCauseGateInput {
  changedFiles: string[];
  targetModule: string;
  isSymptomFixOnly: boolean;
  symptomExplanation: string;
  otherModulesMatchingPattern: string[];
  isEmergencyOutageMode?: boolean;
}

export function evaluateRootCauseGate(input: RootCauseGateInput): RootCauseCheckResult {
  const isRootCause = !input.isSymptomFixOnly;
  const isSymptomOnly = input.isSymptomFixOnly;

  // Calculate blast radius based on cross-module file changes
  const crossModuleFiles = input.changedFiles.filter(
    (file) => !file.startsWith(input.targetModule)
  );

  let blastRadius: "low" | "medium" | "high" = "low";
  if (crossModuleFiles.length > 5 || input.otherModulesMatchingPattern.length > 3) {
    blastRadius = "high";
  } else if (crossModuleFiles.length > 0 || input.otherModulesMatchingPattern.length > 0) {
    blastRadius = "medium";
  }

  // Consent Checkpoint: If blast radius is medium/high or symptom-only fix suggests cross-module refactor,
  // STOP & ASK the operator. Never broaden changes automatically.
  let requiresOperatorConsent = false;
  if (blastRadius !== "low" || (isSymptomOnly && input.otherModulesMatchingPattern.length > 0)) {
    requiresOperatorConsent = true;
  }

  // In emergency mode, prefer minimal patch and defer broad root-cause fixes
  if (input.isEmergencyOutageMode) {
    requiresOperatorConsent = true;
  }

  return {
    isRootCause,
    isSymptomOnly,
    symptomExplanation: input.symptomExplanation,
    patternFoundInOtherModules: input.otherModulesMatchingPattern,
    blastRadius,
    requiresOperatorConsent,
  };
}
