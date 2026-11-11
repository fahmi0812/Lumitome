/**
 * Retrieval L0 v0.3.1 (tanpa jaringan): FTS5 BM25 (unicode61, kolom nama/alias/sinonim/contoh/short/deskripsi)
 * + koreksi typo trigram (Jaccard trigram karakter vs kosakata indeks) + daftar kemiripan trigram
 * + hint Layer-0 → RRF. Menghasilkan kandidat + confidence (margin BM25 top1 vs top2).
 */
import { tokens, rrf, hintMatch, sanitize } from "./skill-db.mjs";

const tri = (w) => { const s = ` ${w} `, out = new Set(); for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3)); return out; };
const jac = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
const VOCAB = new WeakMap();
/** Cache vocab per katalog (source_hash): route() membuka handle DB baru tiap
 * panggilan, jadi cache per-handle (WeakMap) selalu miss dan vocab dibangun
 * ulang tiap route() (~40–60ms). source_hash = kunci kesegaran indeks yang
 * sama dipakai indexState(); hash sama ⇒ isi FTS2 sama ⇒ vocab sama.
 * DB tanpa meta (mis. in-memory di tes) tetap pakai WeakMap per-handle. */
let VOCAB_BY_HASH = null;

/** Kosakata per skill (dari kolom FTS2) + trigram per term; di-cache per katalog. */
function vocab(db) {
  let hash = null;
  try { hash = db.prepare("SELECT v FROM meta WHERE k='source_hash'").get()?.v || null; } catch { hash = null; }
  if (hash) { if (VOCAB_BY_HASH?.hash === hash) return VOCAB_BY_HASH.v; }
  else { const v = VOCAB.get(db); if (v) return v; }
  const rows = db.prepare("SELECT s.name, f.name AS n, f.aliases, f.synonyms, f.examples, f.short FROM skill_fts2 f JOIN skill s ON s.id = f.rowid").all();
  const terms = new Map(), bySkill = new Map();
  for (const r of rows) {
    const ws = new Set(tokens(`${r.n} ${r.aliases} ${r.synonyms} ${r.examples} ${r.short}`.replace(/;/g, " ")).concat(tokens(`${r.n} ${r.aliases}`)));
    const all = new Set(); for (const w of String(`${r.n} ${r.aliases} ${r.synonyms} ${r.short}`).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/)) if (w.length >= 3) all.add(w);
    for (const w of ws) all.add(w);
    bySkill.set(r.name, all);
    for (const w of all) if (!terms.has(w)) terms.set(w, tri(w));
  }
  const v = { terms, bySkill };
  if (hash) VOCAB_BY_HASH = { hash, v }; else VOCAB.set(db, v);
  return v;
}

/** Koreksi token yang tidak ada di kosakata ke term terdekat (Jaccard trigram ≥ th). */
export function correct(db, toks, th = Number(process.env.SW_TRI_TH || 0.45)) {
  const { terms } = vocab(db); const out = [];
  for (const t of toks) {
    if (t.length < 4 || terms.has(t)) continue;
    const tt = tri(t); let best = null, bs = 0;
    for (const [w, wt] of terms) { if (Math.abs(w.length - t.length) > 3) continue; const s = jac(tt, wt); if (s > bs) { bs = s; best = w; } }
    if (best && bs >= th) out.push([t, best, +bs.toFixed(2)]);
  }
  return out;
}

const fq = (ts) => ts.length ? ts.map((w) => (w.length >= 4 ? `"${w}"*` : `"${w}"`)).join(" OR ") : null;

export function searchL0(db, prompt, { sectors = [], hints = [], n = 12 } = {}) {
  const t0 = performance.now();
  // TRIAL lepas-dorman: gate dorman KETIGA ada di sini — `s.pack IS NULL` dulu
  // membuat route()/skill-query tidak pernah bisa memilih skill pack walau
  // collectSkills sudah menandainya "active". Dihapus: yang membedakan
  // sekarang hanya status — red-team = "disabled", sisanya "active".
  const base = ["s.status = 'active'", "s.id NOT IN (SELECT src FROM skill_edge WHERE kind='duplicate')"];
  const run = (secs) => {
    const where = [...base], params = [];
    if (secs.length) { where.push(`s.id IN (SELECT skill_id FROM allowed_skill WHERE agent IN (${secs.map(() => "?").join(",")}) AND effect != 'deny')`); params.push(...secs.map((x) => `sectors/${x}`)); }
    const W = where.join(" AND ");
    const st = db.prepare(`SELECT s.name, -bm25(skill_fts2, 10.0, 6.0, 2.0, 2.0, 3.0, 1.0) AS sc FROM skill_fts2 JOIN skill s ON s.id = skill_fts2.rowid WHERE skill_fts2 MATCH ? AND ${W} ORDER BY sc DESC LIMIT 30`);
    const allowed = new Set(db.prepare(`SELECT s.name FROM skill s WHERE ${W}`).all(...params).map((r) => r.name));
    const toks = tokens(prompt);
    const fixes = correct(db, toks);
    const lists = [], weights = [];
    const A = fq(toks) ? st.all(fq(toks), ...params) : [];
    if (A.length) { lists.push(A.map((r, i) => [r.name, i + 1])); weights.push(1.0); }
    const fixedToks = [...new Set([...toks.filter((t) => !fixes.some((f) => f[0] === t)), ...fixes.map((f) => f[1])])];
    const B = fixes.length && fq(fixedToks) ? st.all(fq(fixedToks), ...params) : [];
    if (B.length) { lists.push(B.map((r, i) => [r.name, i + 1])); weights.push(0.9); }
    // kemiripan trigram per skill: Σ_token max Jaccard (≥0.5) ke term skill.
    // Dulu: tri(w) + jac dihitung ulang untuk tiap (skill × token × term).
    // Sekarang: skor per (token, term) dihitung SEKALI per token memakai set
    // trigram yang sudah di-cache di `terms`, lalu tiap skill tinggal lookup.
    // Nilai yang dipakai identik (max yang sama, filter panjang & ambang sama).
    const { bySkill, terms } = vocab(db);
    const qt = toks.filter((t) => t.length >= 4).map((t) => [t, tri(t)]);
    const termScore = qt.map(([t, tt]) => {
      const m = new Map();
      for (const [w, wt] of terms) {
        if (Math.abs(w.length - t.length) > 3) continue;
        const j = w === t ? 1 : jac(tt, wt);
        if (j >= 0.5) m.set(w, j);
      }
      return m;
    });
    const C = [];
    for (const [name, ws] of bySkill) {
      if (!allowed.has(name)) continue; let sc = 0;
      for (const m of termScore) { let best = 0; for (const w of ws) { const j = m.get(w); if (j !== undefined && j > best) best = j; } if (best > 0) sc += best; }
      if (sc > 0) C.push([name, sc]);
    }
    C.sort((a, b) => b[1] - a[1]);
    if (C.length) { lists.push(C.slice(0, 30).map(([nm], i) => [nm, i + 1])); weights.push(Number(process.env.SW_TRI_W || 0.6)); }
    const hl = []; for (const h of hints) for (const nm of allowed) if (hintMatch(nm, h) && !hl.includes(nm)) hl.push(nm);
    if (hl.length) { lists.push(hl.map((nm, i) => [nm, i + 1])); weights.push(1.0); }
    const bm = new Map([...(B.length ? B : []), ...A].map((r) => [r.name, r.sc]));
    for (const r of A) bm.set(r.name, Math.max(bm.get(r.name) || 0, r.sc));
    return { fused: rrf(lists, 60, weights), bm, fixes, lists: lists.length };
  };
  let res = run(sectors), widened = false;
  // v0.3.46 P2-1 §3 — dulu hanya bila fusi kosong. Bila L0 salah sektor tapi
  // kandidatnya lemah (skor fusi rendah DAN BM25 teratas rendah), lebarkan
  // juga: terukur di golden 154, gabungan ambang ini menangkap 56/112 kasus
  // sektor-salah dengan false-widen 9/112 kasus sektor-benar. BM25 saja
  // tidak memisahkan (median sektor-benar 17,3 vs sektor-salah 11,1);
  // skor fusi saja juga tidak (median 0,042 vs 0,026, rentang tumpang tindih).
  // Ambang via env SW_WIDEN_SCORE (0,03) / SW_WIDEN_BM25 (12).
  const weak = (r) => {
    if (!r.fused.length) return true;
    const topScore = r.fused[0][1];
    const topBm = r.bm.get(r.fused[0][0]) || 0;
    return topScore < Number(process.env.SW_WIDEN_SCORE || 0.03) && topBm < Number(process.env.SW_WIDEN_BM25 || 12);
  };
  if (sectors.length && weak(res)) { res = run([]); widened = true; }
  const info = db.prepare("SELECT sector, short, description, requires_consent FROM skill WHERE name = ?");
  const candidates = res.fused.slice(0, n).map(([name, score], i) => { const r = info.get(name); return { rank: i + 1, name, sector: r.sector, score: +score.toFixed(5), bm25: +(res.bm.get(name) || 0).toFixed(3), ask: !!r.requires_consent, description: sanitize(r.short || r.description, 200) }; });
  const b = [...res.bm.values()].sort((x, y) => y - x);
  const conf = b.length ? (b.length > 1 ? 1 - b[1] / b[0] : 1) : 0;
  return { candidates, conf: +conf.toFixed(3), fixes: res.fixes, widened, retr_ms: +(performance.now() - t0).toFixed(2) };
}

/** Pilihan deterministik: top1 + kandidat lain yg skor fusi ≥ ratio×top1 dan BM25 ≥ bmRatio×BM25-top (maks max). */
export function pickL0(cands, { ratio = Number(process.env.SW_PICK_RATIO || 0.85), bmRatio = Number(process.env.SW_PICK_BM || 0.6), max = Number(process.env.SW_FALLBACK_MAX || 3) } = {}) {
  if (!cands.length) return [];
  const top = cands[0], tb = Math.max(...cands.map((c) => c.bm25), 0);
  return [top, ...cands.slice(1).filter((c) => c.score >= top.score * ratio && (tb === 0 || c.bm25 >= tb * bmRatio))].slice(0, max).map((c) => c.name);
}
