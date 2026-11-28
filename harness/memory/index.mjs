/**
 * Facade terpadu 4-Layer Memory + Monotonic Sticky Taint (M3 / T3.1–T3.3).
 * - L1: <ws>/.tmp/session/<id>/ (working memory 4 artefak)
 * - L2: ${LUMI_HOME:-$HOME/.lumitome}/ledger/ (append-only JSONL + FTS5-BM25)
 * - L3: <ws>/.lumitome/INDEX.md (structural ToC <= 150 baris)
 * - L4: ${LUMI_HOME:-$HOME/.lumitome}/memory/ (facts, rules, sim + taint gate)
 */
import path from "node:path";
import { SessionTaintTracker, isUntrustedTrigger, TAINT_CLEAN, TAINT_TAINTED } from "./taint.mjs";
import {
  l1SessionDir,
  l1ArtifactPaths,
  writeGoal,
  initL1Features,
  writeProgress,
  appendDeadEnd,
  readL1State,
} from "./l1-working.mjs";
import { L2Ledger, resolveLedgerDir, searchLedger } from "./l2-ledger.mjs";
import { generateStructuralIndex } from "./l3-structural.mjs";
import {
  resolveMemoryDir,
  promoteFact,
  promoteRule,
  appendSim,
  readL4,
  pruneExpiredL4,
  compactCleanMemory,
} from "./l4-curated.mjs";

export {
  SessionTaintTracker,
  isUntrustedTrigger,
  TAINT_CLEAN,
  TAINT_TAINTED,
  l1SessionDir,
  l1ArtifactPaths,
  writeGoal,
  initL1Features,
  writeProgress,
  appendDeadEnd,
  readL1State,
  L2Ledger,
  resolveLedgerDir,
  searchLedger,
  generateStructuralIndex,
  resolveMemoryDir,
  promoteFact,
  promoteRule,
  appendSim,
  readL4,
  pruneExpiredL4,
  compactCleanMemory,
};

export function createMemoryFacade({
  workspace = process.cwd(),
  sessionId = "default",
  lumiHome,
  ledgerDir,
  memoryDir,
  env = process.env,
  persistTaint = true,
} = {}) {
  const ws = path.resolve(workspace);
  const sDir = l1SessionDir(ws, sessionId);
  const taint = new SessionTaintTracker({
    sessionId,
    stateFile: persistTaint ? path.join(sDir, "taint-state.json") : null,
  });
  const ledger = new L2Ledger({ lumiHome, ledgerDir, env });
  const effMemDir = resolveMemoryDir({ lumiHome, memoryDir, env });

  return {
    workspace: ws,
    sessionId,
    taint,
    l1: {
      sessionDir: sDir,
      writeGoal: (g) => writeGoal(ws, sessionId, g),
      initFeatures: (items, opts) => initL1Features(ws, sessionId, items, opts),
      writeProgress: (p) => writeProgress(ws, sessionId, p),
      appendDeadEnd: (e) => appendDeadEnd(ws, sessionId, e),
      read: () => readL1State(ws, sessionId),
    },
    l2: {
      ledgerDir: ledger.ledgerDir,
      dbPath: ledger.dbPath,
      appendTurn: (turn) =>
        ledger.appendTurn({
          session_id: sessionId,
          workspace: ws,
          taint_state: taint.taintStateDb,
          ...turn,
        }),
      appendTurns: (turns) =>
        ledger.appendTurns(
          turns.map((t) => ({
            session_id: sessionId,
            workspace: ws,
            taint_state: taint.taintStateDb,
            ...t,
          })),
        ),
      search: (query, opts = {}) => ledger.search(query, { ...opts, env }),
      close: () => ledger.close(),
    },
    l3: {
      generateIndex: (opts) => generateStructuralIndex(ws, opts),
    },
    l4: {
      memoryDir: effMemDir,
      promoteFact: (entry, opts = {}) =>
        promoteFact(entry, { memoryDir: effMemDir, taintTracker: taint, env, ...opts }),
      promoteRule: (entry, opts = {}) =>
        promoteRule(entry, { memoryDir: effMemDir, taintTracker: taint, env, ...opts }),
      appendSim: (entry) => appendSim(entry, { memoryDir: effMemDir, env }),
      read: () => readL4({ memoryDir: effMemDir, env }),
      pruneExpired: (opts = {}) => pruneExpiredL4({ memoryDir: effMemDir, env, ...opts }),
      compact: (opts = {}) => compactCleanMemory({ memoryDir: effMemDir, workspace: ws, env, ...opts }),
    },
    close() {
      ledger.close();
    },
  };
}
