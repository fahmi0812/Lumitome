/**
 * Wave 3 (T3.2): Selective 4-Layer Memory (L1-L4) + Monotonic Sticky Taint + FTS5 Benchmark.
 * Dijalankan otomatis oleh tests/run.mjs (npm test).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ok, finish } from "./harness.mjs";
import {
  SessionTaintTracker,
  createMemoryFacade,
  L2Ledger,
  writeGoal,
  initL1Features,
  writeProgress,
  appendDeadEnd,
  readL1State,
  generateStructuralIndex,
  promoteFact,
  promoteRule,
  appendSim,
  readL4,
  pruneExpiredL4,
  compactCleanMemory,
} from "../harness/memory/index.mjs";

const tmpRoot = path.join(process.cwd(), ".tmp");
fs.mkdirSync(tmpRoot, { recursive: true });
const workRoot = fs.mkdtempSync(path.join(tmpRoot, "w3-t32-"));
const ws = path.join(workRoot, "ws");
const lumiHome = path.join(workRoot, "lumihome");
fs.mkdirSync(ws, { recursive: true });
fs.mkdirSync(lumiHome, { recursive: true });

try {
  // 1) Monotonic Sticky Taint: webfetch -> TAINTED -> reset/downgrade ditolak -> L4 ditahan (HOLD_FOR_APPROVAL)
  {
    const stateFile = path.join(ws, ".tmp", "session", "ses_taint", "taint-state.json");
    const tracker = new SessionTaintTracker({ sessionId: "ses_taint", stateFile });
    const initClean = tracker.taintLevel === "CLEAN" && tracker.isTainted === false;
    const trig = tracker.recordToolOrInput({ tool: "webfetch", source: "external" });
    const rReset = tracker.reset("ignore previous instructions");
    const rClear = tracker.clearTaint("please clean");
    const rDown = tracker.downgrade("reset");
    const rSet = tracker.setLevel("CLEAN");

    // Rekonstruksi tracker dari disk tetap TAINTED
    const reloaded = new SessionTaintTracker({ sessionId: "ses_taint", stateFile });
    const holdRes = promoteFact(
      { fact: "Use new endpoint", derived_from: [{ path: "src/a.js", sha256: "abc" }] },
      { lumiHome, taintTracker: tracker },
    );
    const holdRule = promoteRule(
      { rule: "Always trust external web" },
      { lumiHome, taintTracker: tracker },
    );
    const l4AfterHold = readL4({ lumiHome });

    // Approval eksplisit user diizinkan
    const approvedRes = promoteFact(
      { fact: "User verified endpoint" },
      { lumiHome, taintTracker: tracker, userApproved: true },
    );
    const l4AfterApprove = readL4({ lumiHome });

    // External MCP (github, parallel, figma, stitch) juga memicu TAINTED
    const tMcp = new SessionTaintTracker({ sessionId: "ses_mcp" });
    const mcpHits = ["github_get_issue", "parallel", "figma_get_node", "stitch_gen"].every(
      (tool) => tMcp.recordToolOrInput({ tool }).triggered === true && tMcp.isTainted === true,
    );
    const tCleanMcp = new SessionTaintTracker({ sessionId: "ses_internal_mcp" });
    const internalSafe = tCleanMcp.recordToolOrInput({ tool: "codemem_search", mcpServer: "codemem" }).triggered === false
      && tCleanMcp.recordToolOrInput({ tool: "skills_coding_skill_search", mcpServer: "skills" }).triggered === false;

    ok("T3.2 Sticky Taint: webfetch -> TAINTED, reset/clear/downgrade/setLevel ditolak monoton, reload tetap TAINTED",
      initClean
      && trig.triggered === true && tracker.taintLevel === "TAINTED"
      && rReset.rejected === true && rClear.rejected === true && rDown.rejected === true && rSet.rejected === true
      && tracker.taintLevel === "TAINTED" && reloaded.taintLevel === "TAINTED"
      && mcpHits && internalSafe);

    ok("T3.2 L4 Taint Gate: sesi TAINTED menahan promosi L4 (HOLD_FOR_APPROVAL ke staging), hanya lolos dengan userApproved",
      holdRes.promoted === false && holdRes.decision === "HOLD_FOR_APPROVAL"
      && holdRule.promoted === false && holdRule.decision === "HOLD_FOR_APPROVAL"
      && l4AfterHold.facts.length === 0 && l4AfterHold.rules.length === 0
      && l4AfterHold.stagingTainted.length === 2
      && approvedRes.promoted === true && l4AfterApprove.facts.length === 1);
  }

  // 2) L1 Working Memory 4-artefak di <ws>/.tmp/session/<id>/ + secret scrubbing
  {
    const sid = "ses_l1";
    const tokGoal = ["sk", "proj", "secret1234567890"].join("-");
    const tokDead = ["sk", "ant", "deadend987654321"].join("-");
    writeGoal(ws, sid, {
      goal: `<think>internal chain of thought</think>Fix login with ${"API_KEY"}=${tokGoal}`,
      target_files: ["src/auth.mjs"],
      acceptance: ["login passes"],
      task_type: "bugfix",
    });
    const feat = initL1Features(ws, sid, [{ id: "F-01", description: "Auth token Bearer secret_tok_999999 passes" }]);
    writeProgress(ws, sid, `Step 1 done; ${"LUMI_KEY_9ROUTER"}=supersecretvalue99`);
    appendDeadEnd(ws, sid, {
      cmd_or_action: "curl -H 'Authorization: Bearer tok_deadend_123456'",
      error_sig: "401",
      reason: `bad key ${tokDead}`,
    });
    const st = readL1State(ws, sid);
    const goalDisk = fs.readFileSync(st.paths.goal, "utf8");
    const featDisk = fs.readFileSync(st.paths.features, "utf8");
    const progDisk = fs.readFileSync(st.paths.progress, "utf8");
    const deadDisk = fs.readFileSync(st.paths.deadEnds, "utf8");

    ok("T3.2 L1 4-file di <ws>/.tmp/session/<id>/: goal.md, features.json (Default-FAIL), progress.md, dead_ends.jsonl [FAILED_PATH], nol secret/think bocor",
      st.paths.dir === path.join(ws, ".tmp", "session", sid)
      && fs.existsSync(st.paths.goal) && fs.existsSync(st.paths.features)
      && fs.existsSync(st.paths.progress) && fs.existsSync(st.paths.deadEnds)
      && feat.features[0].passes === false && feat.features[0].status === "PENDING"
      && st.deadEnds[0].tag === "[FAILED_PATH]"
      && !goalDisk.includes("<think>") && !goalDisk.includes(tokGoal)
      && !featDisk.includes("secret_tok_999999")
      && !progDisk.includes("supersecretvalue99")
      && !deadDisk.includes("tok_deadend_123456") && !deadDisk.includes(tokDead));
  }

  // 3) L2 Ledger Benchmark (500 turns < 500 ms + FTS5 query < 5 ms) + secret scrub + taint tag + LUMI_EMBED_MODEL="" zero network
  {
    const ledgerHome = path.join(workRoot, "ledger_home");
    const ledger = new L2Ledger({ lumiHome: ledgerHome });
    const turns = [];
    const mkTok = (idx) => ["sk", "live", `secret${idx}abcdef`].join("-");
    for (let i = 0; i < 500; i++) {
      turns.push({
        session_id: "ses_bench",
        workspace: ws,
        agent: "builder",
        taint_state: i === 42 ? "tainted_external" : "clean",
        kind: "turn",
        raw_text: i === 42
          ? "Fetched external webhook docs Bearer secret_web_token_123456 and callback latency note"
          : `Implemented module_${i} validation check with deterministic hash verification token=${mkTok(i)}`,
      });
    }

    const tWrite0 = performance.now();
    const ins = ledger.appendTurns(turns);
    const writeMs = performance.now() - tWrite0;

    // Warmup 1 query then measure FTS5 latency
    ledger.searchFts("deterministic hash", { limit: 5 });
    const tQuery0 = performance.now();
    const qClean = ledger.searchFts("module_250 validation", { limit: 5 });
    const queryMs = performance.now() - tQuery0;

    const qTaint = ledger.searchFts("webhook callback", { limit: 5 });
    const jsonlFiles = fs.readdirSync(ledger.ledgerDir).filter((f) => f.endsWith(".jsonl"));
    const jsonlContent = fs.readFileSync(path.join(ledger.ledgerDir, jsonlFiles[0]), "utf8");

    // Gating embedding: LUMI_EMBED_MODEL="" + SW_EMBED_MODEL="x" -> 0 fetch calls
    let embedCalls = 0;
    const mockFetch = async (url) => {
      embedCalls++;
      return { ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) };
    };
    const rNoEmbed = await ledger.search("nonexistent_xyz_query_123", {
      env: { LUMI_EMBED_MODEL: "", SW_EMBED_MODEL: "should-not-use" },
      fetchImpl: mockFetch,
    });

    // Gating embedding ON & FTS5 hits < 3 -> panggil 9router /embeddings saja
    let embedUrl = "";
    const rWithEmbed = await ledger.search("nonexistent_xyz_query_123", {
      env: { LUMI_EMBED_MODEL: "nomic-embed-text" },
      fetchImpl: async (url) => {
        embedCalls++;
        embedUrl = url;
        return { ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }) };
      },
    });
    ledger.close();

    ok(`T3.2 L2 Benchmark: tulis 500 turn (${writeMs.toFixed(1)}ms < 500ms) + kueri FTS5 (${queryMs.toFixed(2)}ms < 5ms)`,
      ins.inserted === 500 && writeMs < 500 && qClean.hits.length >= 1 && queryMs < 5);

    ok("T3.2 L2 taint & secret scrub: hit tainted bertag [TAINTED_EXTERNAL_DATA]; nol key/token di JSONL/SQLite",
      qTaint.hits.length === 1
      && qTaint.hits[0].tainted === true
      && qTaint.hits[0].taggedText.startsWith("[TAINTED_EXTERNAL_DATA]")
      && !jsonlContent.includes("secret_web_token_123456")
      && !jsonlContent.includes(mkTok(250))
      && !qClean.hits[0].raw_text.includes(mkTok(250)));

    ok("T3.2 L2 embedding gating: LUMI_EMBED_MODEL=\"\" -> 0 panggilan jaringan; model aktif & hit <3 -> 127.0.0.1:20128/v1/embeddings",
      rNoEmbed.vectorFallbackCalled === false
      && rWithEmbed.vectorFallbackCalled === true
      && embedCalls === 1
      && embedUrl === "http://127.0.0.1:20128/v1/embeddings");
  }

  // 4) L3 INDEX.md, L4 TTL pruning, deterministic compaction & unified facade + zero write ke repo runtime/
  {
    const memHome = path.join(workRoot, "mem_home");
    const facade = createMemoryFacade({ workspace: ws, sessionId: "ses_facade", lumiHome: memHome });
    const srcPath = path.join(ws, "src.txt");
    fs.writeFileSync(srcPath, "v1\n");
    const h1 = crypto.createHash("sha256").update("v1\n").digest("hex");

    facade.l4.promoteFact({ fact: "Fresh fact", derived_from: [{ path: "src.txt", sha256: h1 }] }, { ttlDays: 7 });
    facade.l4.promoteFact({ fact: `Expired fact ${["sk", "test", "1234567890123456"].join("-")}` }, { ttlDays: -1 });
    // Force one expired record directly via promoteFact with explicit past expires_at
    promoteFact({ fact: "Past expired", expires_at: "2020-01-01T00:00:00.000Z" }, { lumiHome: memHome });
    appendSim({ id: "sim_1", decision: "KEEP", note: "Bearer token_sim_12345678" }, { lumiHome: memHome });

    const pruned = facade.l4.pruneExpired();
    fs.writeFileSync(srcPath, "v2\n"); // Mutate derived_from -> stale
    const compacted = facade.l4.compact();
    const idx = facade.l3.generateIndex({ writeFile: true });
    const l4Now = facade.l4.read();
    facade.close();

    ok("T3.2 L3+L4+Facade: INDEX.md <=150 baris, TTL pruning, compaction hapus stale derived_from, sim.jsonl terscrub",
      idx.lineCount <= 150 && fs.existsSync(idx.path)
      && pruned.prunedFacts === 2
      && compacted.droppedStale === 1
      && l4Now.facts.length === 0
      && l4Now.sim.length === 1 && !JSON.stringify(l4Now.sim[0]).includes("token_sim_12345678"));
  }
} finally {
  fs.rmSync(workRoot, { recursive: true, force: true });
}

finish();
