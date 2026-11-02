/**
 * Swanwright v0.1.6 — Skill Query Layer (desain v0.2, fase 1).
 * SQLite (node:sqlite bawaan Node >= 22.5) : FTS5 BM25 + sqlite-vec opsional, RRF, dedup.
 * Sumber kebenaran: router/skills-registry.json + .opencode/skills/* (aktif) + packs/* (nonaktif).
 * Tidak ada dependensi wajib. sqlite-vec = optionalDependency; tanpa itu → BM25-only.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { layer0, KEYWORD_RULES } from "./layer0-regex.mjs";
import { enrichSkill, loadCurated } from "./enrich.mjs";

export const SCHEMA_VERSION = 4;
export const SECTORS = ["coding", "finance", "media", "penulisan", "riset", "security"];
export const DEFAULT_DB = "runtime/skills.db";
export const RRF_K = 60;
export const N_MIN = 16, N_MAX = 32, N_DEFAULT = 24, PICK_MAX = 5;

let _sqlite;
function sqlite() {
  if (_sqlite) return _sqlite;
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (String(w).includes("SQLite") ? undefined : emit.call(process, w, ...a));
  _sqlite = createRequire(import.meta.url)("node:sqlite");
  process.emitWarning = emit;
  return _sqlite;
}

// ---------- parsing ----------
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_\-/]+):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1]; out[key] = kv[2].replace(/^["']|["']$/g, ""); continue; }
    if (key && /^\s+\S/.test(line) && typeof out[key] === "string") out[key] = (out[key] + " " + line.trim()).trim();
  }
  for (const k of Object.keys(out)) if (out[k] === ">" || out[k] === "|") out[k] = "";
  return out;
}
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Teks skill = data tak tepercaya: buang markup/URL, potong ≤300 char (REPORT §3.4). */
export function sanitize(s, max = 300) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/[`*_#>\[\]{}]/g, " ")
    .replace(/\b(ignore|abaikan) (all|semua|previous|sebelumnya)[^.]*\./gi, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------- tokenisasi (ID+EN) ----------
const STOP = new Set(("yang dan di ke dari untuk dengan ini itu atau pada dalam akan bisa tolong buat buatkan saya kami kamu " +
  "agar jadi juga sebuah ada tidak sudah lalu lebih the a an and or of to in for on with is are be this that it my me please " +
  "make use using from by as at into how what can do kasus bantu perlu proyek kerjakan sekarang help need project cara bagaimana " +
  "biar supaya mau ingin minta coba gimana apa").split(/\s+/));
export function tokens(q) {
  return [...new Set(String(q || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t)))].slice(0, 24);
}
export function ftsQuery(q) {
  const t = tokens(q);
  if (!t.length) return null;
  return t.map((w) => (w.length >= 4 ? `"${w}"*` : `"${w}"`)).join(" OR ");
}

// ---------- embedding ----------
/** Provider: "9router" (POST /embeddings, butuh SW_EMBED_MODEL), "hash" (n-gram karakter, leksikal, BUKAN semantik), "none". */
export const EMBED_DIM_HASH = 256;
export function hashEmbed(text, dim = EMBED_DIM_HASH) {
  const v = new Float32Array(dim);
  const s = ` ${tokens(text).join(" ")} `;
  for (let i = 0; i + 3 <= s.length; i++) {
    const h = crypto.createHash("md5").update(s.slice(i, i + 3)).digest();
    const idx = h.readUInt32LE(0) % dim;
    v[idx] += h[4] & 1 ? 1 : -1;
  }
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
}
export function embedProvider() {
  const p = (process.env.SW_EMBED || "auto").toLowerCase();
  if (p === "auto") return process.env.SW_EMBED_MODEL ? "9router" : "none";
  return p;
}
export async function embed(texts, provider = embedProvider()) {
  if (provider === "none") return null;
  if (provider === "hash") return texts.map((t) => hashEmbed(t));
  if (provider === "9router") {
    const base = process.env.SW_9ROUTER_URL || "http://127.0.0.1:20128/v1";
    try {
      const r = await fetch(`${base}/embeddings`, {
        method: "POST", signal: AbortSignal.timeout(Number(process.env.SW_EMBED_TIMEOUT_MS || 15000)),
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SW_9ROUTER_KEY || "9router"}` },
        body: JSON.stringify({ model: process.env.SW_EMBED_MODEL, input: texts }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return j.data.map((d) => Float32Array.from(d.embedding));
    } catch { return null; }
  }
  return null;
}

// ---------- sqlite-vec (opsional) ----------
export function loadVec(db) {
  try {
    const sv = createRequire(import.meta.url)("sqlite-vec");
    db.loadExtension(sv.getLoadablePath());
    return db.prepare("select vec_version() v").get().v;
  } catch { return null; }
}
export function openDb(file = DEFAULT_DB, { readOnly = false } = {}) {
  const { DatabaseSync } = sqlite();
  const db = new DatabaseSync(file, { readOnly, allowExtension: true });
  db.vecVersion = loadVec(db);
  return db;
}

/** Hint Layer-0 cocok ke nama skill: awalan nama, atau akronim (rea = reverse-engineer-anything). */
export const hintMatch = (name, h) => name.startsWith(h) || name.split("-").map((w) => w[0]).join("") === h;

// ---------- kebijakan sektor (sumber yang sama dgn frontmatter agent) ----------
/** Skill boleh dipakai sektor S bila registry.sektor = S, atau rule Layer-0 sektor S memberi hint yang cocok. */
export function sectorAllowlist(skills) {
  const map = Object.fromEntries(SECTORS.map((s) => [s, new Set()]));
  for (const s of skills) if (map[s.sector]) map[s.sector].add(s.name);
  for (const r of KEYWORD_RULES) {
    if (!map[r.sektor]) continue;
    for (const h of r.skillsHint || []) for (const s of skills) if (hintMatch(s.name, h)) map[r.sektor].add(s.name);
  }
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));
}

// ---------- ingest ----------
export function collectSkills(root = ".") {
  const reg = JSON.parse(fs.readFileSync(path.join(root, "router/skills-registry.json"), "utf8")).skills;
  const regById = new Map(reg.map((s) => [s.id, s]));
  // metadata pack nonaktif: packs/<pack>/registry.json (scripts/gen-registry.mjs); salinan cermin (mirror_of) tidak diindeks
  const mirrors = new Set();
  const pk = path.join(root, "packs");
  if (fs.existsSync(pk)) for (const p of fs.readdirSync(pk)) {
    const f = path.join(pk, p, "registry.json"); if (!fs.existsSync(f)) continue;
    for (const s of JSON.parse(fs.readFileSync(f, "utf8")).skills || []) { if (s.mirror_of) mirrors.add(`${p}/${s.id}`); else if (!regById.has(s.id)) regById.set(s.id, s); }
  }
  const out = [];
  const add = (dir, pack, status) => {
    const md = path.join(dir, "SKILL.md");
    if (!fs.existsSync(md)) return;
    const name = path.basename(dir);
    if (out.some((x) => x.name === name)) return;
    const text = fs.readFileSync(md, "utf8");
    const fm = frontmatter(text);
    const r = regById.get(name) || {};
    out.push({
      name, sector: r.sektor || "misc", pack: pack || null, status,
      description: (fm.description || r.description || "").slice(0, 1024),
      short: r.description || "", triggers: (r.triggers || []).join(" "),
      path: path.relative(root, md), content_sha: sha256(text),
      upstream_url: r.src || null, upstream_sha: r.sha || null, license: r.license || null,
      has_scripts: fs.readdirSync(dir).some((f) => /^(scripts?|bin)$/.test(f) || /\.(sh|py|js|mjs|ts)$/.test(f)) ? 1 : 0,
      original_name: r.original_name || name, requires_consent: r.requires_consent ? 1 : 0,
    });
  };
  const act = path.join(root, ".opencode/skills");
  for (const d of fs.readdirSync(act).sort()) add(path.join(act, d), null, "active");
  const packs = path.join(root, "packs");
  if (fs.existsSync(packs)) for (const p of fs.readdirSync(packs).sort()) {
    const sd = path.join(packs, p, "skills");
    if (!fs.existsSync(sd)) continue;
    for (const d of fs.readdirSync(sd).sort()) if (!mirrors.has(`${p}/${d}`)) add(path.join(sd, d), p, p === "red-team" ? "disabled" : "pack");
  }
  return out;
}
export function sourceHash(root = ".") {
  const skills = collectSkills(root);
  const h = crypto.createHash("sha256");
  h.update(`schema:${SCHEMA_VERSION}|embed:${embedProvider()}|`);
  h.update(fs.readFileSync(path.join(root, "router/skills-registry.json")));
  h.update(fs.readFileSync(path.join(root, "router/layer0-regex.mjs")));
  if (fs.existsSync(path.join(root, "packs"))) for (const p of fs.readdirSync(path.join(root, "packs")).sort()) { const f = path.join(root, "packs", p, "registry.json"); if (fs.existsSync(f)) h.update(fs.readFileSync(f)); }
  for (const f of ["router/skills-aliases.json", "router/enrich.mjs"]) if (fs.existsSync(path.join(root, f))) h.update(fs.readFileSync(path.join(root, f)));
  for (const s of skills) h.update(`${s.name}:${s.status}:${s.content_sha}\n`);
  return { hash: h.digest("hex"), skills };
}

const DDL = `
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE skill (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sector TEXT NOT NULL, pack TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','pack','disabled','shadowed','quarantined')),
  description TEXT NOT NULL, short TEXT, triggers TEXT, path TEXT NOT NULL, content_sha TEXT NOT NULL,
  upstream_url TEXT, upstream_sha TEXT, license TEXT, has_scripts INTEGER NOT NULL DEFAULT 0,
  trust TEXT NOT NULL DEFAULT 'reviewed', requires_consent INTEGER NOT NULL DEFAULT 0,
  shadowed_by INTEGER REFERENCES skill(id), original_name TEXT);
CREATE INDEX skill_sector ON skill(sector, status);
CREATE VIRTUAL TABLE skill_fts USING fts5(name, triggers, short, description, tokenize='unicode61 remove_diacritics 2');
CREATE VIRTUAL TABLE skill_fts2 USING fts5(name, aliases, synonyms, examples, short, description, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE skill_enrich (skill_id INTEGER PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE agent_policy (agent TEXT, pattern TEXT, effect TEXT CHECK (effect IN ('allow','deny','ask')), priority INTEGER, PRIMARY KEY (agent, pattern));
CREATE TABLE allowed_skill (agent TEXT, skill_id INTEGER REFERENCES skill(id), effect TEXT, PRIMARY KEY (agent, skill_id));
CREATE TABLE skill_edge (src INTEGER, dst INTEGER, kind TEXT CHECK (kind IN ('duplicate','shadows','complements','conflicts')), weight REAL, PRIMARY KEY (src, dst, kind));
CREATE TABLE IF NOT EXISTS route_log (
  id INTEGER PRIMARY KEY, ts TEXT, session TEXT, task_hash TEXT, l0_sector TEXT, l0_explicit TEXT,
  candidates TEXT, picked TEXT, loaded TEXT, l1_model TEXT, l1_status TEXT, l1_ms INTEGER, retr_ms INTEGER,
  gate_fact INTEGER, gate_judgment INTEGER, scan_ok INTEGER, user_feedback INTEGER);
`;

export async function buildIndex({ root = ".", file = DEFAULT_DB, quiet = false } = {}) {
  const { hash, skills } = sourceHash(root);
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  const target = path.join(root, file), tmp = `${target}.tmp-${process.pid}`;
  fs.rmSync(tmp, { force: true });
  const db = openDb(tmp);
  db.exec(DDL);
  const provider = embedProvider();
  let dim = 0, vectors = null;
  const docs = skills.map((s) => `${s.name.replace(/-/g, " ")} ${s.triggers} ${s.short} ${s.description}`);
  if (provider !== "none") {
    if (!db.vecVersion) { if (!quiet) console.error("WARN: sqlite-vec tidak termuat → BM25-only"); }
    else { vectors = await embed(docs, provider); if (!vectors) { if (!quiet) console.error(`WARN: embedding '${provider}' gagal → BM25-only`); } else dim = vectors[0].length; }
  }
  if (dim) db.exec(`CREATE VIRTUAL TABLE skill_vec USING vec0(embedding float[${dim}])`);
  const ins = db.prepare(`INSERT INTO skill (id,name,sector,pack,status,description,short,triggers,path,content_sha,upstream_url,upstream_sha,license,has_scripts,trust,requires_consent,original_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insF = db.prepare("INSERT INTO skill_fts (rowid,name,triggers,short,description) VALUES (?,?,?,?,?)");
  const curated = loadCurated(root);
  const insF2 = db.prepare("INSERT INTO skill_fts2 (rowid,name,aliases,synonyms,examples,short,description) VALUES (?,?,?,?,?,?,?)");
  const insE = db.prepare("INSERT INTO skill_enrich VALUES (?,?)");
  const insV = dim ? db.prepare("INSERT INTO skill_vec (rowid, embedding) VALUES (?, ?)") : null;
  db.exec("BEGIN");
  skills.forEach((s, i) => {
    const id = i + 1;
    ins.run(id, s.name, s.sector, s.pack, s.status, s.description, s.short, s.triggers, s.path, s.content_sha, s.upstream_url, s.upstream_sha, s.license, s.has_scripts,
      s.status === "disabled" ? "quarantined" : "reviewed", s.requires_consent, s.original_name);
    insF.run(id, s.name.replace(/-/g, " "), s.triggers, sanitize(s.short), sanitize(s.description, 1024));
    if (s.status === "active") {
      const e = enrichSkill(s, curated);
      insE.run(id, JSON.stringify(e));
      insF2.run(id, s.name.replace(/-/g, " "), [...e.aliases_id, ...e.aliases_en, s.triggers].join(" ; "), e.synonyms.join(" "), e.examples.join(" ; "), sanitize(s.short), sanitize(s.description, 1024));
    }
    if (insV) insV.run(BigInt(id), new Uint8Array(vectors[i].buffer));
  });
  // dedup: deskripsi identik (setelah normalisasi) → duplikat; skill aktif = kanonik
  const byDesc = new Map();
  skills.forEach((s, i) => {
    const k = sha256(sanitize(s.description, 1024).toLowerCase());
    if (!byDesc.has(k)) byDesc.set(k, i + 1);
    else db.prepare("INSERT OR IGNORE INTO skill_edge VALUES (?,?,'duplicate',1.0)").run(i + 1, byDesc.get(k));
  });
  const allow = sectorAllowlist(skills.filter((s) => s.status === "active"));
  const insP = db.prepare("INSERT INTO agent_policy VALUES (?,?,?,?)");
  const insA = db.prepare("INSERT INTO allowed_skill VALUES (?,?,?)");
  const idOf = new Map(skills.map((s, i) => [s.name, i + 1]));
  for (const [sec, names] of Object.entries(allow)) {
    const agent = `sectors/${sec}`;
    insP.run(agent, "*", "deny", 0);
    names.forEach((n, j) => { insP.run(agent, n, skills[idOf.get(n) - 1].requires_consent ? "ask" : "allow", j + 1); insA.run(agent, idOf.get(n), skills[idOf.get(n) - 1].requires_consent ? "ask" : "allow"); });
  }
  for (const s of skills) if (s.status === "active") insA.run("orchestrator", idOf.get(s.name), "allow");
  db.prepare("INSERT INTO meta VALUES ('source_hash',?),('schema',?),('embed',?),('dim',?),('vec',?),('built_at',?)")
    .run(hash, String(SCHEMA_VERSION), dim ? provider : "none", String(dim), db.vecVersion || "", new Date().toISOString());
  db.exec("COMMIT");
  // pertahankan route_log lama
  if (fs.existsSync(target)) {
    try {
      db.exec(`ATTACH DATABASE '${target.replace(/'/g, "''")}' AS old`);
      db.exec("INSERT INTO route_log SELECT * FROM old.route_log");
      db.exec("DETACH DATABASE old");
    } catch { /* skema lama tanpa route_log */ }
  }
  db.close();
  fs.renameSync(tmp, target);
  const counts = { active: skills.filter((s) => s.status === "active").length, pack: skills.filter((s) => s.status === "pack").length, disabled: skills.filter((s) => s.status === "disabled").length };
  return { hash, counts, embed: dim ? provider : "none", dim, file: target };
}

export function indexState(root = ".", file = DEFAULT_DB) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) return { fresh: false, reason: "missing" };
  const { hash } = sourceHash(root);
  try {
    const db = openDb(target, { readOnly: true });
    const m = Object.fromEntries(db.prepare("SELECT k,v FROM meta").all().map((r) => [r.k, r.v]));
    db.close();
    return { fresh: m.source_hash === hash, reason: m.source_hash === hash ? "ok" : "hash-changed", meta: m };
  } catch (e) { return { fresh: false, reason: String(e.message) }; }
}

// ---------- retrieval ----------
/** RRF: skor = Σ w/(k + rank). Lists = array of {name: rank(1-based)} */
export function rrf(lists, k = RRF_K, weights = []) {
  const score = new Map();
  lists.forEach((l, i) => { for (const [name, rank] of l) score.set(name, (score.get(name) || 0) + (weights[i] ?? 1) / (k + rank)); });
  return [...score.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/**
 * Filter keras SQL (sektor/pack/status/izin) SEBELUM ranking, lalu FTS5 BM25 (+vec) per query → RRF → dedup → top-N.
 * opts: { agent?: "sectors/coding"|"orchestrator", sectors?: [], packs?: [], status?: ["active"], n?, perQuery? }
 */
export async function searchSkills(db, queries, opts = {}) {
  const t0 = performance.now();
  const n = Math.min(N_MAX, Math.max(1, opts.n || N_DEFAULT));
  const perQuery = opts.perQuery || 20;
  const status = opts.status || ["active"];
  const where = [`s.status IN (${status.map(() => "?").join(",")})`];
  const params = [...status];
  if (opts.sectors?.length) {
    // sektor dibatasi lewat allowlist agent sektor (memuat hint lintas-sektor Layer-0)
    where.push(`s.id IN (SELECT skill_id FROM allowed_skill WHERE agent IN (${opts.sectors.map(() => "?").join(",")}) AND effect != 'deny')`);
    params.push(...opts.sectors.map((x) => `sectors/${x}`));
  }
  if (opts.agent) { where.push("s.id IN (SELECT skill_id FROM allowed_skill WHERE agent = ? AND effect != 'deny')"); params.push(opts.agent); }
  if (opts.packs) { where.push(`(s.pack IS NULL OR s.pack IN (${opts.packs.map(() => "?").join(",") || "''"}))`); params.push(...opts.packs); }
  else where.push("s.pack IS NULL");
  where.push("s.id NOT IN (SELECT src FROM skill_edge WHERE kind='duplicate')");
  const W = where.join(" AND ");
  const allowedCount = db.prepare(`SELECT count(*) c FROM skill s WHERE ${W}`).get(...params).c;
  const ftsStmt = db.prepare(`SELECT s.name, bm25(skill_fts, 8.0, 4.0, 2.0, 1.0) AS sc FROM skill_fts JOIN skill s ON s.id = skill_fts.rowid
     WHERE skill_fts MATCH ? AND ${W} ORDER BY sc LIMIT ?`);
  const lists = [], weights = [];
  const vecOn = !!(db.vecVersion && db.prepare("SELECT v FROM meta WHERE k='dim'").get()?.v !== "0");
  const qv = vecOn ? await embed(queries, db.prepare("SELECT v FROM meta WHERE k='embed'").get().v) : null;
  const vecStmt = qv ? db.prepare(`WITH knn AS (SELECT rowid, distance FROM skill_vec WHERE embedding MATCH ? AND k = ?)
     SELECT s.name, knn.distance FROM knn JOIN skill s ON s.id = knn.rowid WHERE ${W} ORDER BY knn.distance`) : null;
  queries.forEach((q, qi) => {
    const fq = ftsQuery(q);
    if (fq) { lists.push(ftsStmt.all(fq, ...params, perQuery).map((r, i) => [r.name, i + 1])); weights.push(1.0); }
    if (vecStmt && qv?.[qi]) {
      const rows = vecStmt.all(new Uint8Array(qv[qi].buffer), 200, ...params).slice(0, perQuery);
      lists.push(rows.map((r, i) => [r.name, i + 1])); weights.push(Number(process.env.SW_VEC_WEIGHT || 0.5));
    }
  });
  // hint Layer-0 (deterministik): nama skill berawalan hint → satu daftar RRF tambahan
  if (opts.hints?.length) {
    const names = db.prepare(`SELECT s.name FROM skill s WHERE ${W} ORDER BY s.name`).all(...params).map((r) => r.name);
    const hl = []; for (const h of opts.hints) for (const nm of names) if (hintMatch(nm, h) && !hl.includes(nm)) hl.push(nm);
    if (hl.length) { lists.push(hl.map((nm, i) => [nm, i + 1])); weights.push(1.0); }
  }
  // pin eksplisit: $nama / skill:nama (tetap tunduk filter izin)
  const pins = [];
  for (const q of queries) for (const m of q.matchAll(/(?:\$|skill:)([a-z0-9]+(?:-[a-z0-9]+)*)/g)) pins.push(m[1]);
  const okPin = pins.filter((p) => db.prepare(`SELECT 1 FROM skill s WHERE s.name = ? AND ${W}`).get(p, ...params));
  const merged = rrf(lists, RRF_K, weights).filter(([nm]) => !okPin.includes(nm));
  const top = [...okPin.map((p) => [p, 1]), ...merged].slice(0, n);
  const info = db.prepare("SELECT name, sector, short, description, requires_consent FROM skill WHERE name = ?");
  const candidates = top.map(([name, score], i) => {
    const r = info.get(name);
    return { rank: i + 1, name, sector: r.sector, score: Number(score.toFixed(5)), pinned: okPin.includes(name), ask: !!r.requires_consent, description: sanitize(r.short || r.description, 200) };
  });
  return { candidates, allowedCount, lists: lists.length, vec: !!vecStmt, retr_ms: Number((performance.now() - t0).toFixed(2)) };
}

/** Query multi: q0 = prompt, q1 = hint Layer-0 (deterministik → tetap 1 panggilan LLM). */
export function buildQueries(prompt, l0 = layer0(prompt)) {
  const qs = [prompt];
  if (l0.skillsHint?.length) qs.push(l0.skillsHint.join(" "));
  return qs;
}

// ---------- Layer-1 select-only (1 panggilan 9router) ----------
export function validateSelection(obj, candidateNames) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.skills)) return { ok: false, error: "bukan JSON {skills:[]}" };
  const set = new Set(candidateNames);
  const skills = [...new Set(obj.skills.filter((s) => typeof s === "string" && set.has(s)))].slice(0, PICK_MAX);
  const confidence = typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0;
  return { ok: true, skills, dropped: obj.skills.length - skills.length, confidence, need_more: !!obj.need_more };
}
/** Ambil teks jawaban dari body JSON biasa ATAU SSE (beberapa router mengabaikan stream:false). */
export function extractCompletionText(body) {
  const t = String(body || "").trim();
  if (t.startsWith("{")) { try { const j = JSON.parse(t); return j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? ""; } catch { /* lanjut SSE */ } }
  let out = "";
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^data:\s*(.*)$/); if (!m || m[1] === "[DONE]") continue;
    try { const d = JSON.parse(m[1]); out += d.choices?.[0]?.delta?.content ?? d.choices?.[0]?.message?.content ?? ""; } catch { /* abaikan baris rusak */ }
  }
  return out;
}
/** Parse JSON seleksi secara toleran: buang ```json fence, ambil objek {...} pertama yang seimbang. */
export function parseSelection(txt) {
  let s = String(txt || "").replace(/```(?:json)?/gi, "").trim();
  const a = s.indexOf("{"); if (a < 0) throw new SyntaxError("tidak ada objek JSON");
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) return JSON.parse(s.slice(a, i + 1));
  }
  throw new SyntaxError("objek JSON tidak tertutup");
}
export function routerKey() { return process.env.SW_9ROUTER_KEY || process.env.NINEROUTER_API_KEY || process.env.LUMI_9ROUTER_KEY || ""; }
export async function selectL1(prompt, candidates, { root = ".", timeoutMs } = {}) {
  const base = process.env.SW_9ROUTER_URL || process.env.LUMI_9ROUTER_URL || "http://127.0.0.1:20128/v1";
  const model = process.env.SW_ROUTER_MODEL || "ag/gemini-3.8-flash-high";
  const key = routerKey();
  if (!key && !/127\.0\.0\.1|localhost/.test(base)) return { status: "no-key", ms: 0, model };
  const sys = fs.readFileSync(path.join(root, "router/layer1-select.md"), "utf8");
  const topk = Number(process.env.SW_L1_TOPK || 12);
  const cands = candidates.slice(0, topk);
  // prompt ringkas: nama + deskripsi ≤90 char, tanpa skor/sektor
  const user = JSON.stringify({ task: sanitize(prompt, 1200), candidates: cands.map((c) => ({ name: c.name, desc: String(c.description || "").slice(0, 90) })) });
  const ckey = sha256(`${model}\n${user}`).slice(0, 32);
  const cfile = process.env.SW_L1_CACHE || path.join(root, "runtime/l1-cache.json");
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(cfile, "utf8")); } catch {}
  if (process.env.SW_L1_CACHE !== "0" && cache[ckey]) return { ...cache[ckey], ms: 0, cached: true };
  const save = (res) => { if (process.env.SW_L1_CACHE === "0" || res.status !== "ok") return res;
    try { cache[ckey] = { ...res }; const ks = Object.keys(cache); for (const k of ks.slice(0, Math.max(0, ks.length - 500))) delete cache[k];
      fs.mkdirSync(path.dirname(cfile), { recursive: true }); fs.writeFileSync(cfile + ".tmp", JSON.stringify(cache), { mode: 0o600 }); fs.renameSync(cfile + ".tmp", cfile); } catch {}
    return res; };
  candidates = cands;
  const t0 = performance.now();
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST", signal: AbortSignal.timeout(timeoutMs || Number(process.env.SW_L1_TIMEOUT_MS || 3000)),
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": "swanwright-router/0.2", authorization: `Bearer ${key || "9router"}` },
      body: JSON.stringify({ model, stream: false, temperature: 0, max_tokens: 400, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
    });
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { status: `http-${r.status}`, ms, model };
    const txt = extractCompletionText(await r.text());
    let obj; try { obj = parseSelection(txt); } catch (e) { return { status: "invalid", ms, model, error: `parse: ${e.message}`, raw: txt.slice(0, 200) }; }
    const v = validateSelection(obj, candidates.map((c) => c.name));
    return v.ok ? save({ status: "ok", ms, model, ...v }) : { status: "invalid", ms, model, error: v.error };
  } catch (e) { return { status: "unavailable", ms: Math.round(performance.now() - t0), model, error: String(e.cause?.code || e.name || e.message) }; }
}

/**
 * Fallback deterministik (tanpa L1): ambil kandidat yang skornya ≥ SW_FALLBACK_RATIO × skor teratas
 * (skor RRF naik bila skill muncul di >1 daftar: FTS multi-query + hint L0), maks SW_FALLBACK_MAX (default 3).
 */
export function fallbackPick(cands, { ratio = Number(process.env.SW_FALLBACK_RATIO || 0), max = Number(process.env.SW_FALLBACK_MAX || 3) } = {}) {
  if (!cands.length) return [];
  const top = cands[0].score || 0;
  return cands.filter((c, i) => i === 0 || c.score >= top * ratio).slice(0, Math.min(max, PICK_MAX)).map((c) => c.name);
}

export const TRADING_RE = /\b(trading|trader|backtest\w*|scalping|forex|sinyal (beli|jual)|signal (buy|sell)|bot (saham|kripto|crypto)|day ?trad\w*)\b/i;

/** Alur penuh: Layer-0 → SQL filter → hybrid → RRF → dedup → top-N → L1 (atau fallback deterministik) → route_log. */
export async function route(prompt, { root = ".", file = DEFAULT_DB, useL1 = true, log = true, n } = {}) {
  const l0 = layer0(prompt);
  const L0 = { hit: l0.hit, sektor: l0.sektor || null, consent: !!l0.requiresConsent };
  // kebijakan: tidak ada skill/MCP trading → permintaan trading tidak memuat skill finance apa pun
  if (TRADING_RE.test(prompt)) return { l0: L0, candidates: [], picked: [], l1: { status: "skipped" }, blocked: "trading", retr_ms: 0, conf: 0 };
  const db = openDb(path.join(root, file));
  const catalog = db.prepare("SELECT v FROM meta WHERE k='source_hash'").get()?.v || "";
  const mode = useL1 === "always" ? "always" : useL1 ? "auto" : "off";
  const ck = `${mode}|${normQuery(prompt)}`;
  const hit = routeCacheGet(ck, catalog);
  if (hit) { db.close(); return { ...hit, l0: L0, cached: true, retr_ms: 0 }; }
  const { searchL0, pickL0 } = await import("./l0.mjs");
  const res = searchL0(db, prompt, { sectors: l0.sektor ? [l0.sektor] : [], hints: l0.skillsHint || [], n: n || 12 });
  const confTh = Number(process.env.SW_L1_CONF || 0.15);
  const low = !res.candidates.length || res.conf < confTh;
  let l1 = { status: "skipped", reason: low ? "no-candidates" : "confident" };
  if (res.candidates.length && (mode === "always" || (mode === "auto" && low))) {
    const tk = Number(process.env.SW_L1_TOPK || 8), ms = Number(process.env.SW_L1_TIMEOUT_MS || 3000);
    let timer; const to = new Promise((r) => { timer = setTimeout(() => r({ status: "timeout", ms }), ms); });
    l1 = await Promise.race([selectL1(prompt, res.candidates.slice(0, tk), { root, timeoutMs: ms }), to]); clearTimeout(timer);
  }
  const picked = l1.status === "ok" && l1.skills.length ? l1.skills : pickL0(res.candidates);
  const out = { l0: L0, candidates: res.candidates, picked, l1, conf: res.conf, fixes: res.fixes, retr_ms: res.retr_ms };
  if (log) {
    db.prepare(`INSERT INTO route_log (ts,session,task_hash,l0_sector,l0_explicit,candidates,picked,loaded,l1_model,l1_status,l1_ms,retr_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(new Date().toISOString(), process.env.SW_SESSION || null, sha256(prompt).slice(0, 16), l0.sektor || null,
      JSON.stringify(l0.skillsHint || []), JSON.stringify(res.candidates.map((c) => ({ n: c.name, s: c.score }))), JSON.stringify(picked), null,
      l1.model || null, l1.status, l1.ms ?? null, Math.round(res.retr_ms));
  }
  db.close();
  // cache hanya hasil final yang stabil (L0 yakin, atau L1 ok); timeout/unavailable tidak di-cache
  if (l1.status === "ok" || l1.status === "skipped") routeCacheSet(ck, catalog, { candidates: out.candidates, picked, l1: { ...l1, ms: 0 }, conf: res.conf, fixes: res.fixes });
  return out;
}

/** Normalisasi query untuk kunci cache: lowercase, tanpa diakritik/tanda baca, spasi tunggal. */
export function normQuery(q) { return String(q).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function routeCacheFile() {
  if (process.env.SW_ROUTE_CACHE) return process.env.SW_ROUTE_CACHE === "0" ? null : process.env.SW_ROUTE_CACHE;
  return process.env.LUMI_HOME ? path.join(process.env.LUMI_HOME, "router-cache.json") : null;
}
function routeCacheRead(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } }
export function routeCacheGet(key, catalog) {
  const f = routeCacheFile(); if (!f) return null;
  const e = routeCacheRead(f)[sha256(key).slice(0, 32)];
  const ttl = Number(process.env.SW_ROUTE_CACHE_TTL_S || 604800) * 1000;
  if (!e || e.catalog !== catalog || Date.now() - e.ts > ttl) return null;
  return e.v;
}
export function routeCacheSet(key, catalog, v) {
  const f = routeCacheFile(); if (!f) return;
  try {
    const c = routeCacheRead(f); const now = Date.now(), ttl = Number(process.env.SW_ROUTE_CACHE_TTL_S || 604800) * 1000;
    for (const [k, e] of Object.entries(c)) if (e.catalog !== catalog || now - e.ts > ttl) delete c[k];
    c[sha256(key).slice(0, 32)] = { ts: now, catalog, v };
    const ks = Object.keys(c); for (const k of ks.slice(0, Math.max(0, ks.length - 1000))) delete c[k];
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + ".tmp", JSON.stringify(c), { mode: 0o600 }); fs.renameSync(f + ".tmp", f);
  } catch {}
}
