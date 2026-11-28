/**
 * L2 Immutable Episodic Ledger & SQLite FTS5-BM25 RAW-RAG (M3 / T3.2).
 * - Append-only JSONL: ${LUMI_HOME:-$HOME/.lumitome}/ledger/transcripts-YYYY-MM.jsonl
 * - Indeks FTS5-BM25:  ${LUMI_HOME:-$HOME/.lumitome}/ledger/tx_index.sqlite (node:sqlite, WAL)
 * - ZERO penulisan ke folder runtime/ repo (anti-kebocoran tarball npm).
 * - Isolasi taint: hit tainted_external ditandai [TAINTED_EXTERNAL_DATA].
 * - Fallback embedding opsional HANYA bila hasil env-compat LUMI_EMBED_MODEL non-kosong DAN hit FTS5 < 3,
 *   eksklusif ke 9router (http://127.0.0.1:20128/v1/embeddings).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { scrubSecrets } from "../context-budget.mjs";
import {
  resolveCompatLumiHome,
  resolveCompatEmbedModel,
  resolveCompat9RouterUrl,
  resolveCompat9RouterKey,
} from "../../lumitome/lib/env-compat.mjs";

let _sqlite;
function sqlite() {
  if (_sqlite) return _sqlite;
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (String(w).includes("SQLite") ? undefined : emit.call(process, w, ...a));
  _sqlite = createRequire(import.meta.url)("node:sqlite");
  process.emitWarning = emit;
  return _sqlite;
}

export function resolveLedgerDir({ lumiHome, ledgerDir, env = process.env } = {}) {
  if (ledgerDir) return path.resolve(ledgerDir);
  const home = lumiHome ? path.resolve(lumiHome) : resolveCompatLumiHome(env);
  return path.join(home, "ledger");
}

export function ledgerJsonlPath(ledgerDir, ts = new Date().toISOString()) {
  const ym = /^\d{4}-\d{2}/.test(String(ts)) ? String(ts).slice(0, 7) : new Date().toISOString().slice(0, 7);
  return path.join(path.resolve(ledgerDir), `transcripts-${ym}.jsonl`);
}

export function ledgerDbPath(ledgerDir) {
  return path.join(path.resolve(ledgerDir), "tx_index.sqlite");
}

function normalizeTaintState(val) {
  const s = String(val ?? "clean").trim().toLowerCase();
  return s === "tainted" || s === "tainted_external" ? "tainted_external" : "clean";
}

function cleanLedgerText(text) {
  return scrubSecrets(String(text ?? "").replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim());
}

function sanitizeMeta(meta) {
  if (!meta) return null;
  try {
    return JSON.parse(scrubSecrets(JSON.stringify(meta)));
  } catch {
    return null;
  }
}

export function buildLedgerFtsQuery(query, { operator = "OR" } = {}) {
  const words = String(query ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 2);
  const uniq = [...new Set(words)].slice(0, 16);
  if (!uniq.length) return null;
  const sep = operator === "AND" ? " " : " OR ";
  return uniq.map((w) => (w.length >= 4 ? `"${w}"*` : `"${w}"`)).join(sep);
}

export function openLedgerDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync } = sqlite();
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA temp_store=MEMORY;
    CREATE TABLE IF NOT EXISTS episodic_turn (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      session_id TEXT NOT NULL,
      workspace TEXT NOT NULL,
      agent TEXT,
      taint_state TEXT NOT NULL CHECK (taint_state IN ('clean', 'tainted_external')),
      kind TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      meta_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_turn(session_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
      session_id UNINDEXED,
      taint_state UNINDEXED,
      kind,
      raw_text,
      content='episodic_turn',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS episodic_ai AFTER INSERT ON episodic_turn BEGIN
      INSERT INTO episodic_fts(rowid, session_id, taint_state, kind, raw_text)
      VALUES (new.id, new.session_id, new.taint_state, new.kind, new.raw_text);
    END;
  `);
  return db;
}

export class L2Ledger {
  #dir;
  #db;
  #insertStmt;
  #searchStmt;
  #searchSessionStmt;
  #env;

  constructor({ lumiHome, ledgerDir, env = process.env } = {}) {
    this.#env = env;
    this.#dir = resolveLedgerDir({ lumiHome, ledgerDir, env });
    fs.mkdirSync(this.#dir, { recursive: true });
    this.#db = openLedgerDb(ledgerDbPath(this.#dir));
    this.#insertStmt = this.#db.prepare(
      "INSERT INTO episodic_turn (ts, session_id, workspace, agent, taint_state, kind, raw_text, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.#searchStmt = this.#db.prepare(
      `SELECT t.id, t.ts, t.session_id, t.workspace, t.agent, t.taint_state, t.kind, t.raw_text, t.meta_json, episodic_fts.rank AS rank
       FROM episodic_fts
       JOIN episodic_turn t ON t.id = episodic_fts.rowid
       WHERE episodic_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    );
    this.#searchSessionStmt = this.#db.prepare(
      `SELECT t.id, t.ts, t.session_id, t.workspace, t.agent, t.taint_state, t.kind, t.raw_text, t.meta_json, episodic_fts.rank AS rank
       FROM episodic_fts
       JOIN episodic_turn t ON t.id = episodic_fts.rowid
       WHERE episodic_fts MATCH ? AND t.session_id = ?
       ORDER BY rank
       LIMIT ?`,
    );
  }

  get ledgerDir() {
    return this.#dir;
  }

  get dbPath() {
    return ledgerDbPath(this.#dir);
  }

  appendTurns(turns = []) {
    const list = Array.isArray(turns) ? turns : [turns];
    if (!list.length) return { inserted: 0, files: [] };

    const byFile = new Map();
    const prepared = [];

    for (const item of list) {
      const ts = String(item?.ts || new Date().toISOString());
      const sessionId = String(item?.session_id ?? item?.sessionId ?? "default");
      const workspace = String(item?.workspace ?? process.cwd());
      const agent = item?.agent ? String(item.agent) : null;
      const taintState = normalizeTaintState(item?.taint_state ?? item?.taintState ?? item?.taintLevel);
      const kind = String(item?.kind ?? "turn");
      const rawText = cleanLedgerText(item?.raw_text ?? item?.text ?? "");
      const meta = sanitizeMeta(item?.meta ?? item?.meta_json);
      const metaJson = meta ? JSON.stringify(meta) : null;

      const row = { ts, session_id: sessionId, workspace, agent, taint_state: taintState, kind, raw_text: rawText, meta_json: metaJson };
      prepared.push(row);

      const jp = ledgerJsonlPath(this.#dir, ts);
      if (!byFile.has(jp)) byFile.set(jp, []);
      byFile.get(jp).push(JSON.stringify(row));
    }

    this.#db.exec("BEGIN IMMEDIATE");
    try {
      for (const r of prepared) {
        this.#insertStmt.run(r.ts, r.session_id, r.workspace, r.agent, r.taint_state, r.kind, r.raw_text, r.meta_json);
      }
      this.#db.exec("COMMIT");
    } catch (e) {
      try { this.#db.exec("ROLLBACK"); } catch {}
      throw e;
    }

    const files = [];
    for (const [jp, lines] of byFile.entries()) {
      fs.appendFileSync(jp, lines.join("\n") + "\n", "utf8");
      files.push(jp);
    }
    return { inserted: prepared.length, files };
  }

  appendTurn(turn) {
    return this.appendTurns([turn]);
  }

  searchFts(query, { limit = 10, sessionId = null } = {}) {
    const t0 = performance.now();
    const ftsAnd = buildLedgerFtsQuery(query, { operator: "AND" });
    if (!ftsAnd) return { hits: [], ms: Number((performance.now() - t0).toFixed(3)) };
    const ftsOr = buildLedgerFtsQuery(query, { operator: "OR" });
    const lim = Math.max(1, Math.min(100, Number(limit) || 10));
    const runMatch = (fts) => (sessionId
      ? this.#searchSessionStmt.all(fts, String(sessionId), lim)
      : this.#searchStmt.all(fts, lim));
    let rows = runMatch(ftsAnd);
    if (rows.length === 0 && ftsOr && ftsOr !== ftsAnd) {
      rows = runMatch(ftsOr);
    }
    const hits = rows.map((r) => {
      const tainted = r.taint_state === "tainted_external";
      return {
        id: r.id,
        ts: r.ts,
        session_id: r.session_id,
        workspace: r.workspace,
        agent: r.agent,
        taint_state: r.taint_state,
        tainted,
        kind: r.kind,
        raw_text: r.raw_text,
        taggedText: tainted ? `[TAINTED_EXTERNAL_DATA] ${r.raw_text}` : r.raw_text,
        rank: Number(r.rank),
      };
    });
    return { hits, ms: Number((performance.now() - t0).toFixed(3)) };
  }

  async search(query, { limit = 10, sessionId = null, env = this.#env, fetchImpl = fetch } = {}) {
    if (String(env?.LUMI_MEMORY_L2 ?? "1") === "0") {
      return { hits: [], disabled: true, mode: "disabled", ftsCount: 0, vectorFallbackCalled: false, ms: 0 };
    }
    const ftsRes = this.searchFts(query, { limit, sessionId });
    const embedModel = resolveCompatEmbedModel(env);
    let vectorFallbackCalled = false;
    let embedResult = null;

    if (embedModel && String(embedModel).trim() !== "" && ftsRes.hits.length < 3) {
      vectorFallbackCalled = true;
      const base = resolveCompat9RouterUrl(env).replace(/\/+$/, "");
      const key = resolveCompat9RouterKey(env) || "9router";
      try {
        const res = await fetchImpl(`${base}/embeddings`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ model: String(embedModel).trim(), input: String(query ?? "") }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const payload = await res.json();
          embedResult = { ok: true, dim: payload?.data?.[0]?.embedding?.length ?? 0 };
        } else {
          embedResult = { ok: false, status: res.status };
        }
      } catch (e) {
        embedResult = { ok: false, error: String(e?.message ?? e) };
      }
    }

    return {
      hits: ftsRes.hits,
      disabled: false,
      mode: vectorFallbackCalled ? "fts5+embed_fallback" : "fts5",
      ftsCount: ftsRes.hits.length,
      vectorFallbackCalled,
      embedResult,
      ms: ftsRes.ms,
    };
  }

  close() {
    try { this.#db.close(); } catch {}
  }
}

export async function searchLedger(query, { limit = 10, sessionId = null, lumiHome, ledgerDir, env = process.env, fetchImpl = fetch } = {}) {
  const ledger = new L2Ledger({ lumiHome, ledgerDir, env });
  try {
    return await ledger.search(query, { limit, sessionId, env, fetchImpl });
  } finally {
    ledger.close();
  }
}
