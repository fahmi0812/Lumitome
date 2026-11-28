/**
 * Runtime-Attested Witness (EG-VAR) & features.json Default-FAIL + Tether Invalidation.
 * Hanya runtime host yang menulis witnesses.jsonl & features.json di <ws>/.tmp/session/<session_id>/.
 * Klaim teks ATTESTED(...) dari model tidak pernah diterima sebagai saksi.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value ?? "").digest("hex");
}

export function fileSha256(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    return sha256Hex(buf);
  } catch {
    return null;
  }
}

export function currentGitHead(workspace = process.cwd()) {
  try {
    const out = execFileSync("git", ["-C", path.resolve(workspace), "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || "NO_GIT";
  } catch {
    return "NO_GIT";
  }
}

export function gitChangedFiles(workspace = process.cwd()) {
  try {
    const out = execFileSync("git", ["-C", path.resolve(workspace), "status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
      .map((p) => (p.includes(" -> ") ? p.split(" -> ").pop() : p));
  } catch {
    return [];
  }
}

export function sanitizeSessionId(sessionId = "default") {
  const s = String(sessionId || "default").replace(/[^A-Za-z0-9._-]/g, "_");
  return s || "default";
}

export function sessionDirFor(workspace = process.cwd(), sessionId = "default") {
  return path.join(path.resolve(workspace), ".tmp", "session", sanitizeSessionId(sessionId));
}

export function witnessesFilePath(sessionDir) {
  return path.join(sessionDir, "witnesses.jsonl");
}

export function featuresFilePath(sessionDir) {
  return path.join(sessionDir, "features.json");
}

export function formatAttestedString({ source_id, cmd_sha256, output_sha256, exit_code, git_head_sha }) {
  return `ATTESTED(${source_id},${cmd_sha256},${output_sha256},${exit_code},${git_head_sha})`;
}

/** Bangun record kanonis 5-field ATTESTED. */
export function ATTESTED({
  source_id,
  cmd_sha256,
  output_sha256,
  exit_code,
  git_head_sha,
  derived_from = [],
  ts = new Date().toISOString(),
} = {}) {
  const rec = {
    source_id: String(source_id || ""),
    cmd_sha256: String(cmd_sha256 || ""),
    output_sha256: String(output_sha256 || ""),
    exit_code: typeof exit_code === "number" ? exit_code : Number(exit_code),
    git_head_sha: String(git_head_sha || "NO_GIT"),
    derived_from: Array.isArray(derived_from) ? derived_from : [],
    ts,
  };
  return {
    ...rec,
    attested: formatAttestedString(rec),
  };
}

function normalizeRelPath(workspace, p) {
  const ws = path.resolve(workspace);
  const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(ws, p);
  const rel = path.relative(ws, abs).replaceAll("\\", "/");
  return { abs, rel: rel || path.basename(abs) };
}

export function buildDerivedFrom(workspace, files = []) {
  const seen = new Set();
  const out = [];
  for (const f of files) {
    if (!f) continue;
    const rawPath = typeof f === "string" ? f : f.path;
    if (!rawPath) continue;
    const { abs, rel } = normalizeRelPath(workspace, rawPath);
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push({ path: rel, sha256: fileSha256(abs) });
  }
  return out;
}

export function isValidAttestedRecord(w) {
  if (!w || typeof w !== "object") return false;
  if (typeof w.source_id !== "string" || !w.source_id) return false;
  if (typeof w.cmd_sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(w.cmd_sha256)) return false;
  if (typeof w.output_sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(w.output_sha256)) return false;
  if (typeof w.exit_code !== "number" || !Number.isFinite(w.exit_code)) return false;
  if (typeof w.git_head_sha !== "string" || !w.git_head_sha) return false;
  return true;
}

export function readWitnesses(sessionDir) {
  const f = witnessesFilePath(sessionDir);
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object") out.push(parsed);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export function writeWitnesses(sessionDir, list) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const f = witnessesFilePath(sessionDir);
  const body = list.map((w) => JSON.stringify(w)).join("\n") + (list.length ? "\n" : "");
  fs.writeFileSync(f, body, "utf8");
  return f;
}

export function recordWitness(sessionDir, {
  workspace = process.cwd(),
  command = "",
  output = "",
  exit_code,
  source_id,
  call_id = null,
  derived_from,
  targetFiles = [],
  git_head_sha,
  masked_exit = false,
  output_failed = false,
  ts = new Date().toISOString(),
} = {}) {
  const existing = readWitnesses(sessionDir);
  const sid = source_id || `w_${String(existing.length + 1).padStart(2, "0")}_${crypto.randomBytes(3).toString("hex")}`;
  const head = git_head_sha ?? currentGitHead(workspace);
  const df = Array.isArray(derived_from)
    ? derived_from.map((d) => (typeof d === "string" ? buildDerivedFrom(workspace, [d])[0] : d)).filter(Boolean)
    : buildDerivedFrom(workspace, [...targetFiles, ...gitChangedFiles(workspace)]);
  const exitNum = typeof exit_code === "number" ? exit_code : Number(exit_code);
  const cmd_sha256 = sha256Hex(String(command).trim());
  const output_sha256 = sha256Hex(String(output));
  const att = ATTESTED({
    source_id: sid,
    cmd_sha256,
    output_sha256,
    exit_code: exitNum,
    git_head_sha: head,
    derived_from: df,
    ts,
  });
  const ok = Number.isFinite(exitNum) && exitNum === 0 && !masked_exit && !output_failed;
  const record = {
    ...att,
    ...(call_id ? { call_id } : {}),
    command: String(command),
    masked_exit: Boolean(masked_exit),
    output_failed: Boolean(output_failed),
    status: ok ? "VALID" : "INVALID",
    created_at: Date.now(),
  };
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.appendFileSync(witnessesFilePath(sessionDir), JSON.stringify(record) + "\n", "utf8");
  return record;
}

export function readFeatures(sessionDir) {
  const f = featuresFilePath(sessionDir);
  if (!fs.existsSync(f)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.features)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeFeatures(sessionDir, doc) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const f = featuresFilePath(sessionDir);
  fs.writeFileSync(f, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return f;
}

/**
 * Inisialisasi features.json dengan status default FAIL (tidak pernah default PASS).
 */
export function initFeatures(sessionDir, items = [], { task_id = "t_default", overwrite = false } = {}) {
  if (!overwrite) {
    const cur = readFeatures(sessionDir);
    if (cur) return cur;
  }
  const features = items.map((item, idx) => ({
    id: String(item?.id || `F-${String(idx + 1).padStart(2, "0")}`),
    description: String(item?.description || ""),
    // Invarian Default-FAIL: item baru selalu lahir FAIL/passes:false
    passes: false,
    status: "FAIL",
    witness_id: null,
    git_head_sha: null,
    derived_from: Array.isArray(item?.derived_from) ? item.derived_from : [],
  }));
  const doc = {
    version: 1,
    task_id,
    features,
  };
  writeFeatures(sessionDir, doc);
  return doc;
}

function derivedFromChanged(workspace, derivedFrom = [], changedSet = new Set()) {
  if (!Array.isArray(derivedFrom) || derivedFrom.length === 0) return null;
  for (const d of derivedFrom) {
    if (!d || typeof d.path !== "string") continue;
    const { abs, rel } = normalizeRelPath(workspace, d.path);
    if (changedSet.has(rel) || changedSet.has(d.path) || changedSet.has(abs)) {
      return `file berubah: ${rel}`;
    }
    if (d.sha256 !== undefined) {
      const curHash = fileSha256(abs);
      if (curHash !== d.sha256) {
        return `hash berubah pada ${rel}`;
      }
    }
  }
  return null;
}

/**
 * Transisi feature ke PASS hanya sah bila witness ATTESTED exit_code === 0
 * cocok dengan git_head_sha & hash derived_from saat ini.
 */
export function promoteFeatureWithWitness({
  sessionDir,
  workspace = process.cwd(),
  featureId,
  witnessId,
  currentHeadSha,
} = {}) {
  const doc = readFeatures(sessionDir);
  if (!doc) return { ok: false, reason: "features.json tidak ditemukan" };
  const feat = doc.features.find((f) => f.id === featureId);
  if (!feat) return { ok: false, reason: `feature ${featureId} tidak ditemukan` };

  const witnesses = readWitnesses(sessionDir);
  const w = witnessId
    ? witnesses.find((x) => x.source_id === witnessId)
    : [...witnesses].reverse().find((x) => x.status === "VALID" && x.exit_code === 0);

  if (!w) return { ok: false, reason: "tidak ada runtime witness ATTESTED" };
  if (!isValidAttestedRecord(w)) return { ok: false, reason: "format witness ATTESTED 5-field tidak lengkap" };
  if (w.status !== "VALID" || w.exit_code !== 0 || w.masked_exit || w.output_failed) {
    return { ok: false, reason: `witness ${w.source_id} tidak VALID (status=${w.status}, exit=${w.exit_code})` };
  }

  const head = currentHeadSha ?? currentGitHead(workspace);
  if (w.git_head_sha !== head) {
    return { ok: false, reason: `git_head_sha witness (${w.git_head_sha}) != HEAD saat ini (${head})` };
  }
  const wDrift = derivedFromChanged(workspace, w.derived_from);
  if (wDrift) {
    return { ok: false, reason: `tether drift pada witness ${w.source_id}: ${wDrift}` };
  }
  const fDrift = derivedFromChanged(workspace, feat.derived_from);
  if (fDrift) {
    return { ok: false, reason: `tether drift pada feature ${feat.id}: ${fDrift}` };
  }

  feat.passes = true;
  feat.status = "PASS";
  feat.witness_id = w.source_id;
  feat.git_head_sha = head;
  if (!feat.derived_from?.length && w.derived_from?.length) {
    feat.derived_from = w.derived_from.map((d) => ({ ...d }));
  }
  writeFeatures(sessionDir, doc);
  return { ok: true, feature: feat, witness: w };
}

/**
 * Deteksi tether drift: bila git_head_sha berubah atau hash file pada derived_from berubah,
 * witness VALID otomatis menjadi STALE dan feature yang merujuknya menjadi UNSETTLED (passes: false).
 */
export function invalidateStaleWitnesses({
  sessionDir,
  workspace = process.cwd(),
  changedFiles = [],
  currentHeadSha,
} = {}) {
  const head = currentHeadSha ?? currentGitHead(workspace);
  const changedSet = new Set();
  for (const cf of changedFiles) {
    if (!cf) continue;
    const { abs, rel } = normalizeRelPath(workspace, cf);
    changedSet.add(rel);
    changedSet.add(cf);
    changedSet.add(abs);
  }

  const witnesses = readWitnesses(sessionDir);
  const staleWitnessIds = [];
  let witnessesDirty = false;
  for (const w of witnesses) {
    if (w.status !== "VALID") continue;
    let reason = null;
    if (w.git_head_sha && head && w.git_head_sha !== head) {
      reason = `git_head_sha berubah (${w.git_head_sha} -> ${head})`;
    } else {
      reason = derivedFromChanged(workspace, w.derived_from, changedSet);
    }
    if (reason) {
      w.status = "STALE";
      w.stale_reason = reason;
      w.stale_at = new Date().toISOString();
      staleWitnessIds.push(w.source_id);
      witnessesDirty = true;
    }
  }
  if (witnessesDirty) writeWitnesses(sessionDir, witnesses);

  const doc = readFeatures(sessionDir);
  const unsettledFeatureIds = [];
  let featuresDirty = false;
  if (doc) {
    const byId = new Map(witnesses.map((w) => [w.source_id, w]));
    for (const f of doc.features) {
      if (f.passes === true || f.status === "PASS") {
        const ref = f.witness_id ? byId.get(f.witness_id) : null;
        let reason = null;
        if (!ref) reason = "witness_id tidak ditemukan";
        else if (ref.status !== "VALID") reason = `witness ${ref.source_id} berstatus ${ref.status}`;
        else if (ref.exit_code !== 0) reason = `witness exit_code=${ref.exit_code}`;
        else if (f.git_head_sha && head && f.git_head_sha !== head) reason = `git_head_sha berubah (${f.git_head_sha} -> ${head})`;
        else reason = derivedFromChanged(workspace, f.derived_from, changedSet);

        if (reason) {
          f.passes = false;
          f.status = "UNSETTLED";
          f.unsettled_reason = reason;
          unsettledFeatureIds.push(f.id);
          featuresDirty = true;
        }
      }
    }
    if (featuresDirty) writeFeatures(sessionDir, doc);
  }

  return {
    witnesses,
    features: doc,
    staleWitnessIds,
    unsettledFeatureIds,
    changed: witnessesDirty || featuresDirty,
  };
}
