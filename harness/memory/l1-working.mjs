/**
 * L1 Working Memory (M3 / T3.1 + T3.2):
 * 4 artefak kanonis di <ws>/.tmp/session/<session_id>/:
 *   1. goal.md
 *   2. features.json (Default-FAIL: passes=false, status="PENDING")
 *   3. progress.md
 *   4. dead_ends.jsonl (tag wajib "[FAILED_PATH]")
 * Seluruh teks melewati strip <think> + secret scrubbing sebelum ditulis ke disk.
 */
import fs from "node:fs";
import path from "node:path";
import { scrubSecrets } from "../context-budget.mjs";

export function sanitizeSessionId(sessionId = "default") {
  const s = String(sessionId || "default").replace(/[^A-Za-z0-9._-]/g, "_");
  return s || "default";
}

export function l1SessionDir(workspace = process.cwd(), sessionId = "default") {
  return path.join(path.resolve(workspace), ".tmp", "session", sanitizeSessionId(sessionId));
}

export function stripThinkBlocks(text) {
  return String(text ?? "").replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
}

function sanitizeText(text) {
  return scrubSecrets(stripThinkBlocks(text));
}

function sanitizeValue(val) {
  if (typeof val === "string") return sanitizeText(val);
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = sanitizeValue(v);
    return out;
  }
  return val;
}

export function l1ArtifactPaths(workspace = process.cwd(), sessionId = "default") {
  const dir = l1SessionDir(workspace, sessionId);
  return {
    dir,
    goal: path.join(dir, "goal.md"),
    features: path.join(dir, "features.json"),
    progress: path.join(dir, "progress.md"),
    deadEnds: path.join(dir, "dead_ends.jsonl"),
  };
}

export function writeGoal(workspace, sessionId, goalInput) {
  const paths = l1ArtifactPaths(workspace, sessionId);
  fs.mkdirSync(paths.dir, { recursive: true });
  let body = "";
  if (typeof goalInput === "string") {
    body = sanitizeText(goalInput);
  } else if (goalInput && typeof goalInput === "object") {
    const clean = sanitizeValue(goalInput);
    const lines = ["# Goal", ""];
    if (clean.goal) lines.push(clean.goal, "");
    if (Array.isArray(clean.target_files) && clean.target_files.length) {
      lines.push("## Target Files", ...clean.target_files.map((f) => `- ${f}`), "");
    }
    if (Array.isArray(clean.acceptance) && clean.acceptance.length) {
      lines.push("## Acceptance", ...clean.acceptance.map((a) => `- ${a}`), "");
    }
    if (clean.task_type) lines.push(`task_type: ${clean.task_type}`);
    body = lines.join("\n").trim();
  }
  const content = (body || "# Goal") + "\n";
  fs.writeFileSync(paths.goal, content, "utf8");
  return { path: paths.goal, content };
}

export function initL1Features(workspace, sessionId, items = [], { taskId = "", overwrite = false } = {}) {
  const paths = l1ArtifactPaths(workspace, sessionId);
  fs.mkdirSync(paths.dir, { recursive: true });
  if (!overwrite && fs.existsSync(paths.features)) {
    try {
      return JSON.parse(fs.readFileSync(paths.features, "utf8"));
    } catch {
      // rewrite if corrupt
    }
  }
  const features = (Array.isArray(items) ? items : []).map((item, idx) => {
    const raw = typeof item === "string" ? { description: item } : (item || {});
    const clean = sanitizeValue(raw);
    return {
      id: clean.id ? String(clean.id) : `F-${String(idx + 1).padStart(2, "0")}`,
      description: String(clean.description || ""),
      passes: false,
      status: "PENDING",
      witness_id: null,
      derived_from: Array.isArray(clean.derived_from) ? clean.derived_from : [],
    };
  });
  const doc = {
    version: 1,
    session_id: sanitizeSessionId(sessionId),
    task_id: taskId ? String(taskId) : `t_${sanitizeSessionId(sessionId)}`,
    features,
  };
  fs.writeFileSync(paths.features, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return doc;
}

export function writeProgress(workspace, sessionId, progressInput) {
  const paths = l1ArtifactPaths(workspace, sessionId);
  fs.mkdirSync(paths.dir, { recursive: true });
  let body = "";
  if (typeof progressInput === "string") {
    body = sanitizeText(progressInput);
  } else if (progressInput && typeof progressInput === "object") {
    const clean = sanitizeValue(progressInput);
    const lines = ["# Progress", ""];
    if (clean.status) lines.push(`status: ${clean.status}`);
    if (clean.currentStep) lines.push(`current_step: ${clean.currentStep}`);
    if (Array.isArray(clean.completed) && clean.completed.length) {
      lines.push("", "## Completed", ...clean.completed.map((c) => `- ${c}`));
    }
    if (Array.isArray(clean.next) && clean.next.length) {
      lines.push("", "## Next", ...clean.next.map((n) => `- ${n}`));
    }
    body = lines.join("\n").trim();
  }
  const content = (body || "# Progress") + "\n";
  fs.writeFileSync(paths.progress, content, "utf8");
  return { path: paths.progress, content };
}

export function appendDeadEnd(workspace, sessionId, entry = {}) {
  const paths = l1ArtifactPaths(workspace, sessionId);
  fs.mkdirSync(paths.dir, { recursive: true });
  const clean = sanitizeValue(entry);
  const row = {
    ts: clean.ts || new Date().toISOString(),
    tag: "[FAILED_PATH]",
    cmd_or_action: String(clean.cmd_or_action ?? clean.action ?? clean.command ?? ""),
    error_sig: String(clean.error_sig ?? clean.error ?? ""),
    reason: String(clean.reason ?? ""),
    derived_from: Array.isArray(clean.derived_from) ? clean.derived_from : [],
  };
  fs.appendFileSync(paths.deadEnds, JSON.stringify(row) + "\n", "utf8");
  return row;
}

export function readL1State(workspace, sessionId) {
  const paths = l1ArtifactPaths(workspace, sessionId);
  const readOpt = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  let features = null;
  const fRaw = readOpt(paths.features);
  if (fRaw) {
    try { features = JSON.parse(fRaw); } catch { features = null; }
  }
  const dRaw = readOpt(paths.deadEnds);
  const deadEnds = dRaw
    ? dRaw
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        })
        .filter(Boolean)
    : [];
  return {
    sessionDir: paths.dir,
    paths,
    goal: readOpt(paths.goal),
    features,
    progress: readOpt(paths.progress),
    deadEnds,
  };
}
