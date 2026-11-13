#!/usr/bin/env node
/**
 * Sync upstream: re-fetch skill dari SHA ter-pin dan cerminkan SELURUH direktori
 * skill (SKILL.md + references/ + scripts/ + assets/) — bukan hanya SKILL.md.
 *
 * Aturan cermin (ditemukan dari audit 13 Nov 2026 + verifikasi diff cermin vs
 * upstream@pin-lama):
 * - Cermin = salinan upstream apa adanya, DENGAN dua adaptasi lokal:
 *   (a) frontmatter ditulis ulang (description dikutip ulang, blok `metadata:`
 *       berisi swanwright_src/sha/original_id/license_note, dst);
 *   (b) beberapa body diedit sebaris — mis. notfair menulis ulang rujukan
 *       `../../seo/<nama>/WORKFLOW.md` menjadi `./WORKFLOW.md` (tata letak
 *       cermin menaruh WORKFLOW.md di dalam dir skill), dan impeccable
 *       menghapus kunci khusus Claude Code (`user-invocable`, `argument-hint`,
 *       `allowed-tools`) dari frontmatter.
 *   Karena itu sync TIDAK boleh menimpa mentah: tiap file digabung tiga-arah
 *   (base = upstream@pin-lama, current = upstream@pin-baru, other = cermin)
 *   lewat `git merge-file`; SKILL.md dipisah frontmatter (gabung per kunci)
 *   dan body (merge-file). Konflik → file tidak ditulis, skill dilaporkan
 *   `conflict`, dan proses keluar non-zero.
 * - File biner TIDAK PERNAH ditimpa (push konektor menolak non-UTF-8):
 *   biner lama dipertahankan dan dilaporkan di `binariesKept`.
 * - File cermin-saja (mis. LICENSE) dipertahankan; file yang upstream hapus
 *   ikut dihapus HANYA bila cerminnya == upstream-lama (tanpa edit lokal).
 * - Skill yang upstream hapus seluruh direktorinya (mis. notfair gemini /
 *   setup-cms / upgrade) TIDAK dihapus cerminnya — dilewati, pin lama tetap.
 * - Denylist (SYNC_DENYLIST) TIDAK PERNAH di-sync: agents-system (upstream
 *   pensiunkan, penggantinya `deslop` JANGAN diimpor), humanizer blader v4
 *   (melemahkan verifikasi), taste-skill + CanvasAnvil (belum bisa dinilai).
 *
 * Pakai:
 *   node scripts/sync-upstream.mjs                         # rencana (dry-run --all)
 *   node scripts/sync-upstream.mjs --repo o/r --sha <sha> [--dry-run]
 *   node scripts/sync-upstream.mjs --all [--pins router/upstream-pins.json] [--dry-run]
 *   node scripts/sync-upstream.mjs --repo o/r --sha <sha> --only <skill> --stamp-only
 *     # sesudah resolusi konflik manual: hanya stempel pin (menolak bila masih
 *     # ada penanda konflik di file).
 *   --clone-dir <dir> : pakai ulang clone blobless (default: tmpdir, dibersihkan).
 *   --root <dir>      : root repo (default: cwd).
 * Tanpa --dry-run dan tanpa --repo/--all, TIDAK ada yang ditulis.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { frontmatter } from "../router/parse.mjs";

/** Repo yang TIDAK PERNAH di-sync (alasan di header). */
export const SYNC_DENYLIST = new Set([
  "PaulRBerg/agent-skills",
  "blader/humanizer",
  "Leonxlnx/taste-skill",
  "CodingFeng101/CanvasAnvil",
]);

// ---------- util ----------

export function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

/** Daftar file di bawah dir, relatif (POSIX), terurut. */
export function listFiles(dir) {
  const out = [];
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, "");
  return out;
}

const readBuf = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);

// ---------- frontmatter (entri per kunci, sadar skalar blok) ----------

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Pisah teks SKILL.md → { fm, body, hasFm }. fm = blok mentah tanpa pagar. */
export function splitFm(text) {
  const m = FM_RE.exec(text);
  if (!m) return { fm: null, body: text, hasFm: false };
  return { fm: m[1], body: text.slice(m.index + m[0].length), hasFm: true };
}

/**
 * Pecah blok frontmatter menjadi entri top-level [{ key, lines }].
 * Baris lanjutan = baris berindentasi (skalar blok, list, map bersarang).
 * Baris kosong milik entri bila baris non-kosong berikutnya berindentasi.
 */
export function parseFmEntries(block) {
  const lines = String(block).split(/\r?\n/);
  const entries = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = /^([A-Za-z0-9_\-/]+):(\s.*)?$/.exec(line);
    if (kv && !/^\s/.test(line)) {
      cur = { key: kv[1], lines: [line] };
      entries.push(cur);
      continue;
    }
    if (cur) {
      if (/^\s*$/.test(line)) {
        // Baris kosong: milik entri bila baris berikut berindentasi.
        let j = i + 1;
        while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        if (j < lines.length && /^\s/.test(lines[j])) cur.lines.push(line);
      } else {
        cur.lines.push(line);
      }
    }
  }
  return entries;
}

export function serializeFmEntries(entries) {
  return entries.map((e) => e.lines.join("\n")).join("\n");
}

function setMetadataSub(entries, sub, value) {
  let meta = entries.find((e) => e.key === "metadata");
  if (!meta) {
    meta = { key: "metadata", lines: ["metadata:"] };
    entries.push(meta);
  }
  const re = new RegExp(`^  ${sub}:\\s*.*$`);
  const idx = meta.lines.findIndex((l) => re.test(l));
  if (idx >= 0) meta.lines[idx] = `  ${sub}: ${value}`;
  else meta.lines.push(`  ${sub}: ${value}`);
}

/**
 * Stempel src+sha ke blok metadata (buat bloknya bila belum ada).
 * Mempertahankan semua kunci lain apa adanya.
 */
export function stampFrontmatter(text, { src, sha }) {
  const { fm, body, hasFm } = splitFm(text);
  if (!hasFm) return text;
  const entries = parseFmEntries(fm);
  setMetadataSub(entries, "swanwright_src", src);
  setMetadataSub(entries, "swanwright_sha", sha);
  return `---\n${serializeFmEntries(entries)}\n---\n${body}`;
}

/**
 * Gabung frontmatter tiga-arah per kunci:
 * - kunci bersama → nilai upstream-baru (current);
 * - kunci yang cermin hapus (ada di base, tidak di other) → tetap dihapus;
 * - kunci yang cermin tambah (ada di other, tidak di base) → dipertahankan
 *   dari cermin (termasuk seluruh blok `metadata:` — stempel src/sha
 *   dilakukan sesudahnya oleh stampFrontmatter).
 * Urutan: urutan current, lalu kunci tambahan-cermin sesuai urutan other.
 */
export function mergeFrontmatter({ base, current, other }) {
  const b = new Map(parseFmEntries(base).map((e) => [e.key, e]));
  const c = parseFmEntries(current);
  const o = new Map(parseFmEntries(other).map((e) => [e.key, e]));
  const out = [];
  const seen = new Set();
  for (const e of c) {
    if (b.has(e.key) && !o.has(e.key)) continue; // dihapus lokal → tetap hilang
    out.push(e);
    seen.add(e.key);
  }
  for (const e of o.values()) {
    if (!b.has(e.key) && !seen.has(e.key)) { out.push(e); seen.add(e.key); }
  }
  return serializeFmEntries(out);
}

// ---------- merge tiga-arah (git merge-file) ----------

export function defaultMergeRunner(currentFile, baseFile, otherFile) {
  return spawnSync("git", ["merge-file", "-p", "--marker-size=7", currentFile, baseFile, otherFile], { encoding: "utf8" });
}

/**
 * Gabung teks tiga-arah. Kembalikan { text, conflicts }.
 * `runner` bisa diinjeksi di tes (tanda tangan sama dengan defaultMergeRunner).
 */
export function mergeText({ current, base, other, runner = defaultMergeRunner }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumitome-merge-"));
  try {
    const cf = path.join(tmp, "current");
    const bf = path.join(tmp, "base");
    const of = path.join(tmp, "other");
    fs.writeFileSync(cf, current);
    fs.writeFileSync(bf, base);
    fs.writeFileSync(of, other);
    const r = runner(cf, bf, of);
    if (r.status === 0) return { text: r.stdout, conflicts: false };
    if (r.status === 1) return { text: r.stdout, conflicts: true };
    throw new Error(`git merge-file gagal (exit ${r.status}): ${String(r.stderr || "").trim()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Gabung satu file SKILL.md tiga-arah: frontmatter per kunci + body merge-file.
 * Kembalikan { text, conflicts } (text null bila konflik — jangan ditulis).
 */
export function mergeSkillFile({ base, current, other, runner = defaultMergeRunner }) {
  const b = splitFm(base);
  const c = splitFm(current);
  const o = splitFm(other);
  if (!b.hasFm || !c.hasFm || !o.hasFm) {
    // Tanpa frontmatter di salah satu sisi → gabung mentah seutuhnya.
    return mergeText({ current, base, other, runner });
  }
  const fm = mergeFrontmatter({ base: b.fm, current: c.fm, other: o.fm });
  const body = mergeText({ current: c.body, base: b.body, other: o.body, runner });
  if (body.conflicts) return { text: null, conflicts: true };
  return { text: `---\n${fm}\n---\n${body.text}`, conflicts: false };
}

// ---------- penemuan direktori skill ----------

const DIR_PREFERENCE = [
  "skills/",
  "cursor-plugin/skills/",
  "plugin/skills/",
  ".opencode/skills/",
  ".agents/skills/",
  ".agent/skills/",
  ".claude/skills/",
];

/** Semua kandidat dir skill (basename == nama, atau "" untuk SKILL.md di root), terurut preferensi. */
export function discoverSkillDirs(treePaths, skillName) {
  const cands = [];
  for (const p of treePaths) {
    if (p === "SKILL.md") { cands.push(""); continue; }
    if (!p.endsWith("/SKILL.md")) continue;
    const dir = p.slice(0, -"/SKILL.md".length);
    if (dir.split("/").pop() !== skillName) continue;
    cands.push(dir);
  }
  const rank = (d) => {
    if (d === "") return 99;
    for (let i = 0; i < DIR_PREFERENCE.length; i++) if (d.startsWith(DIR_PREFERENCE[i])) return i;
    if (d === skillName) return 50;
    return 60;
  };
  return [...new Set(cands)].sort((a, b) => rank(a) - rank(b));
}

export function discoverSkillDir(treePaths, skillName) {
  return discoverSkillDirs(treePaths, skillName)[0] ?? null;
}

/** Kemiripan baris (Jaccard atas himpunan baris tak-kosong, trim) — untuk memilih salinan terdekat cermin. */
export function lineSimilarity(a, b) {
  const sa = new Set(String(a).split("\n").map((s) => s.trim()).filter(Boolean));
  const sb = new Set(String(b).split("\n").map((s) => s.trim()).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const l of sa) if (sb.has(l)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Pilih dir sumber di antara kandidat: baca SKILL.md tiap kandidat (readSkill),
 * cocokkan frontmatter `name` dengan nama skill, lalu pilih yang bodynya
 * paling mirip cermin (salinan duplikat antar-plugin sering berbeda isinya;
 * yang terdekat cermin = sumber cermin dulu — mis. impeccable berasal dari
 * cursor-plugin, bukan .opencode). Seri → urutan preferensi.
 * Kembalikan { dir, similarity } atau null.
 */
export function pickSourceDir({ candidates, skillName, readSkill, mirrorBody = null }) {
  let best = null;
  for (const dir of candidates) {
    const text = readSkill(dir);
    if (text == null) continue;
    const fm = frontmatter(text);
    if (!fm || fm.__error || String(fm.name || "").trim() !== skillName) continue;
    const sim = mirrorBody == null ? 1 : lineSimilarity(splitFm(text).body, mirrorBody);
    if (!best || sim > best.similarity) best = { dir, similarity: sim };
  }
  return best;
}

// ---------- registry / target ----------

/** Dir cermin untuk satu skill (aktif vs pack). */
export function mirrorDirFor(skill) {
  return skill.pack ? `packs/${skill.pack}/skills/${skill.name}` : `.opencode/skills/${skill.name}`;
}

/** Kelompokkan skill per repo; repo denylist TIDAK PERNAH masuk target. */
export function syncTargets(skills, { repos = null } = {}) {
  const bySrc = new Map();
  for (const s of skills) {
    if (SYNC_DENYLIST.has(s.src)) continue;
    if (repos && !repos.includes(s.src)) continue;
    if (!bySrc.has(s.src)) bySrc.set(s.src, { src: s.src, skills: [] });
    bySrc.get(s.src).skills.push(s);
  }
  return [...bySrc.values()].sort((a, b) => a.src.localeCompare(b.src));
}

/**
 * Keluarkan skill yang dilewati manual (--skip). Dipakai bila satu skill
 * tidak bisa di-sync utuh lewat jalur yang tersedia — mis. cerminnya butuh
 * aset biner baru yang push konektor tolak (hanya UTF-8), sementara teks
 * barunya merujuk aset itu: menulis teks saja merusak cermin di remote.
 * Skill yang dilewati tetap di pin lama sampai ada push berbasis git.
 */
export function applySkips(skills, skipNames) {
  if (!skipNames || skipNames.length === 0) return skills;
  const skip = new Set(skipNames);
  return skills.filter((s) => !skip.has(s.name));
}

// ---------- reconcile direktori ----------

/**
 * Selaraskan destDir dengan stageDir (upstream-baru).
 * - Tanpa baseDir: timpa mentah (dipakai tes + skill baru) — file stage disalin,
 *   file basi di dest dihapus, file cermin-saja dipertahankan.
 * - Dengan baseDir (upstream-lama): gabung tiga-arah per file (SKILL.md pakai
 *   mergeSkillFile; file teks lain mergeText; biner TIDAK PERNAH ditimpa).
 *   File yang upstream hapus ikut dihapus hanya bila cermin == base.
 *   Bila satu file saja konflik, SELURUH dir TIDAK ditulis (atomik per skill)
 *   dan dilaporkan di `conflicts`.
 * Kembalikan { copied, deleted, preserved, written, deletedFiles, kept,
 *   conflicts, binariesKept, unchanged }.
 */
export function reconcileDir({ stageDir, destDir, baseDir = null, preserve = ["LICENSE"], dryRun = false, runner = defaultMergeRunner }) {
  const stageFiles = new Set(listFiles(stageDir));
  const destFiles = new Set(listFiles(destDir));
  const baseFiles = baseDir ? new Set(listFiles(baseDir)) : new Set();
  const result = { copied: 0, deleted: 0, preserved: [], written: [], deletedFiles: [], kept: [], conflicts: [], binariesKept: [], unchanged: [] };
  const write = (rel, buf) => {
    if (dryRun) return;
    const target = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
  };
  const remove = (rel) => {
    if (dryRun) return;
    fs.rmSync(path.join(destDir, rel), { force: true });
  };
  const pruneEmptyDirs = (dir) => {
    if (dryRun) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { const sub = path.join(dir, e.name); pruneEmptyDirs(sub); if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub); }
    }
  };

  // Tahap 1: hitung rencana (tanpa tulis) agar konflik menggagalkan semuanya.
  const plan = { write: [], delete: [], keep: [], conflict: [], binariesKept: [] };
  const all = new Set([...stageFiles, ...destFiles, ...baseFiles]);
  for (const rel of [...all].sort()) {
    const inStage = stageFiles.has(rel);
    const inDest = destFiles.has(rel);
    const inBase = baseFiles.has(rel);
    const stageBuf = inStage ? readBuf(path.join(stageDir, rel)) : null;
    const destBuf = inDest ? readBuf(path.join(destDir, rel)) : null;
    const baseBuf = inBase ? readBuf(path.join(baseDir, rel)) : null;
    if (!inStage && inDest) {
      // Hanya di cermin → pertahankan (LICENSE dkk), kecuali file basi.
      if (baseDir && inBase) {
        // Dihapus upstream: hapus hanya bila cermin tidak mengeditnya.
        if (destBuf.equals(baseBuf)) plan.delete.push(rel);
        else plan.keep.push(rel);
      } else if (!baseDir && !preserve.includes(rel.split("/").pop())) {
        plan.delete.push(rel);
      } else {
        plan.keep.push(rel);
      }
      continue;
    }
    if (!inStage) continue; // hanya di base (tidak di stage/dest) — tidak ada kerja
    if (!inDest) { plan.write.push({ rel, buf: stageBuf }); continue; }
    if (stageBuf.equals(destBuf)) { result.unchanged.push(rel); continue; }
    if (!baseDir) { plan.write.push({ rel, buf: stageBuf }); continue; }
    // Tiga-arah.
    if (!inBase) { plan.keep.push(rel); continue; } // ditambah dua sisi berbeda → simpan cermin, laporkan
    if (stageBuf.equals(baseBuf)) { result.unchanged.push(rel); continue; } // upstream tak berubah → cermin menang
    if (isBinary(stageBuf) || isBinary(destBuf) || isBinary(baseBuf)) {
      plan.binariesKept.push(rel);
      plan.keep.push(rel);
      continue;
    }
    if (destBuf.equals(baseBuf)) { plan.write.push({ rel, buf: stageBuf }); continue; } // cermin tak diedit → ambil upstream
    const current = stageBuf.toString("utf8");
    const base = baseBuf.toString("utf8");
    const other = destBuf.toString("utf8");
    // Normalisasi akhiran baris ke LF sebelum gabung: cermin lama boleh memakai
    // CRLF (mis. .cmd Windows) sementara upstream LF — tanpa ini tiap baris
    // tampak berubah dan selalu konflik. Hasil gabung SELALU LF (upstream):
    // CRLF membuat `git diff --check` gagal (CR dihitung trailing whitespace)
    // sehingga tidak bisa dipertahankan untuk file yang berubah.
    const toLf = (s) => s.replace(/\r\n/g, "\n");
    const merged = rel === "SKILL.md"
      ? mergeSkillFile({ base: toLf(base), current: toLf(current), other: toLf(other), runner })
      : mergeText({ current: toLf(current), base: toLf(base), other: toLf(other), runner });
    if (merged.conflicts || merged.text == null) { plan.conflict.push(rel); continue; }
    plan.write.push({ rel, buf: Buffer.from(merged.text, "utf8") });
  }

  if (plan.conflict.length > 0) {
    result.conflicts = plan.conflict;
    result.kept = [...plan.keep].sort();
    result.binariesKept = plan.binariesKept;
    return result; // atomik: tidak ada yang ditulis
  }
  for (const { rel, buf } of plan.write) { write(rel, buf); result.written.push(rel); }
  for (const rel of plan.delete) { remove(rel); result.deletedFiles.push(rel); }
  if (!dryRun) pruneEmptyDirs(destDir);
  result.copied = result.written.length;
  result.deleted = result.deletedFiles.length;
  result.preserved = [...new Set([...plan.keep, ...result.unchanged.filter((r) => preserve.includes(r.split("/").pop()))])].sort();
  result.kept = [...plan.keep].sort();
  result.binariesKept = plan.binariesKept;
  return result;
}

// ---------- git ----------

export function runGit(args, { cwd }) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gitOk(r, what) {
  if (r.status !== 0) throw new Error(`${what} gagal: ${String(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
  return r.stdout;
}

/** Clone blobless (tanpa checkout); pakai ulang bila dir sudah ada. */
export function cloneBlobless(url, dir) {
  if (fs.existsSync(path.join(dir, ".git"))) return dir;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  gitOk(spawnSync("git", ["clone", "--filter=blob:none", "--no-checkout", url, dir], { encoding: "utf8" }), `clone ${url}`);
  return dir;
}

export function lsTreeFiles(cloneDir, sha) {
  const out = gitOk(runGit(["ls-tree", "-r", sha, "--name-only"], { cwd: cloneDir }), `ls-tree ${sha}`);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function showFile(cloneDir, sha, filePath) {
  const r = runGit(["show", `${sha}:${filePath}`], { cwd: cloneDir });
  return r.status === 0 ? r.stdout : null;
}

/** Daftar file di bawah <dir> pada <sha> (rekursif, name-only). */
export function lsTreeDir(cloneDir, sha, dir) {
  const out = gitOk(runGit(["ls-tree", "-r", sha, "--name-only", dir], { cwd: cloneDir }), `ls-tree ${sha} ${dir}`);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Ambil satu blob sebagai Buffer (aman untuk biner). */
export function fetchFile(cloneDir, sha, filePath) {
  const r = spawnSync("git", ["show", `${sha}:${filePath}`], { cwd: cloneDir, maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git show ${sha}:${filePath} gagal: ${String(r.stderr || "").slice(0, 200)}`);
  return r.stdout; // Buffer
}

/**
 * Salin direktori skill <dir> dari <sha> ke destDir, per file (git show).
 * Alasan: `git archive` pada clone blobless memicu promisor fetch satu pack
 * raksasa untuk repo besar (solidcraft: >200 MB untuk 1 file) — per-file show
 * hanya mengambil blob yang dibutuhkan (terbukti di probe: ~300 show <1 menit).
 * Kembalikan daftar path relatif yang disalin.
 */
export function fetchTreeToDir(cloneDir, sha, dir, destDir) {
  const paths = dir === "" ? ["SKILL.md"] : lsTreeDir(cloneDir, sha, dir);
  const copied = [];
  for (const p of paths) {
    const buf = fetchFile(cloneDir, sha, p);
    const rel = dir === "" ? p : p.slice(dir.length + 1);
    const target = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
    copied.push(rel);
  }
  return copied;
}

/** Verifikasi SHA adalah commit yang ada di upstream (fetch on-demand bila perlu). */
export function verifyCommit(cloneDir, sha) {
  const r = runGit(["cat-file", "-t", `${sha}^{commit}`], { cwd: cloneDir });
  return r.status === 0 && r.stdout.trim() === "commit";
}

// ---------- sync satu repo ----------

export function loadPins(pinsPath) {
  return JSON.parse(fs.readFileSync(pinsPath, "utf8"));
}

// Base 3-way merge = SHA yang TERCERMIN di frontmatter cermin (bukan registry):
// registry sudah bisa mendahului cermin (mis. sesudah gen-registry) sehingga
// base yang salah membuat sync mengira upstream tak berubah (tulis=0).
export function baseShaFor({ mirrorText, skillSha, fallbackSha }) {
  const fm = mirrorText ? frontmatter(mirrorText) : null;
  const sha = fm && !fm.__error ? String(fm.metadata?.swanwright_sha || fm.swanwright_sha || "") : "";
  return sha || skillSha || fallbackSha;
}

export function syncRepo({ root, src, sha, skills, cloneDir, dryRun = false, runner = defaultMergeRunner }) {
  const report = { src, sha, status: "ok", skills: [] };
  if (SYNC_DENYLIST.has(src)) { report.status = "denylisted"; return report; }
  const dirName = src.replace("/", "_");
  const clonePath = path.join(cloneDir, dirName);
  cloneBlobless(`https://github.com/${src}.git`, clonePath);
  if (!verifyCommit(clonePath, sha)) {
    report.status = "bad-sha";
    report.error = `SHA ${sha} bukan commit di upstream ${src}`;
    return report;
  }
  const treePaths = lsTreeFiles(clonePath, sha);
  const oldShas = [...new Set(skills.map((s) => s.sha).filter(Boolean))];
  for (const skill of skills) {
    const srep = { name: skill.name, status: "ok" };
    const mirrorRel = mirrorDirFor(skill);
    const mirrorDir = path.join(root, mirrorRel);
    const mirrorSkill = path.join(mirrorDir, "SKILL.md");
    const mirrorText = fs.existsSync(mirrorSkill) ? fs.readFileSync(mirrorSkill, "utf8") : null;
    const mirrorBody = mirrorText ? splitFm(mirrorText).body : null;
    const candidates = discoverSkillDirs(treePaths, skill.name);
    const picked = pickSourceDir({
      candidates,
      skillName: skill.name,
      mirrorBody,
      readSkill: (d) => showFile(clonePath, sha, d === "" ? "SKILL.md" : `${d}/SKILL.md`),
    });
    if (!picked) {
      // Direktur skill tidak ada di upstream-baru (dihapus upstream) → cermin tetap, pin lama tetap.
      srep.status = "missing-upstream";
      report.skills.push(srep);
      continue;
    }
    srep.sourceDir = picked.dir;
    const oldSha = baseShaFor({ mirrorText, skillSha: skill.sha, fallbackSha: oldShas[0] });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumitome-sync-repo-"));
    try {
      const baseStage = path.join(tmp, "base");
      const newStage = path.join(tmp, "new");
      const srcDir = picked.dir;
      if (oldSha) fetchTreeToDir(clonePath, oldSha, srcDir, baseStage);
      fetchTreeToDir(clonePath, sha, srcDir, newStage);
      const stageBase = baseStage;
      const stageNew = newStage;
      const rec = reconcileDir({
        stageDir: stageNew,
        baseDir: oldSha ? stageBase : null,
        destDir: mirrorDir,
        dryRun,
        runner,
      });
      srep.files = rec;
      if (rec.conflicts.length > 0) {
        srep.status = "conflict";
        report.status = "conflict";
      } else if (!dryRun) {
        // Stempel pin baru ke SKILL.md cermin (idempotent).
        const destSkill = path.join(mirrorDir, "SKILL.md");
        if (fs.existsSync(destSkill)) {
          const stamped = stampFrontmatter(fs.readFileSync(destSkill, "utf8"), { src, sha });
          fs.writeFileSync(destSkill, stamped);
        }
      }
    } catch (e) {
      srep.status = "error";
      srep.error = e.message;
      report.status = "conflict";
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    report.skills.push(srep);
  }
  return report;
}

// ---------- CLI ----------

function parseArgs(argv) {
  const o = { repo: null, sha: null, all: false, pins: null, dryRun: false, cloneDir: null, root: process.cwd(), only: null, stampOnly: false, skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") o.repo = argv[++i];
    else if (a === "--sha") o.sha = argv[++i];
    else if (a === "--all") o.all = true;
    else if (a === "--pins") o.pins = argv[++i];
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--clone-dir") o.cloneDir = argv[++i];
    else if (a === "--root") o.root = argv[++i];
    else if (a === "--only") o.only = argv[++i];
    else if (a === "--skip") o.skip.push(argv[++i]);
    else if (a === "--stamp-only") o.stampOnly = true;
    else if (a === "--help" || a === "-h") { console.log("Pakai: node scripts/sync-upstream.mjs [--repo o/r --sha <sha> | --all [--pins f]] [--dry-run] [--clone-dir d] [--root d] [--only <skill> --stamp-only] [--skip <skill> ...]"); process.exit(0); }
    else throw new Error(`arg tidak dikenal: ${a}`);
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const root = path.resolve(o.root);
  const reg = JSON.parse(fs.readFileSync(path.join(root, "router/skills-registry.json"), "utf8"));
  const cloneDir = o.cloneDir ? path.resolve(o.cloneDir) : fs.mkdtempSync(path.join(os.tmpdir(), "lumitome-sync-clones-"));
  const cleanClones = !o.cloneDir;
  let jobs = [];
  if (o.stampOnly) {
    if (!o.repo || !o.sha || !o.only) throw new Error("--stamp-only butuh --repo, --sha, dan --only <skill>");
    const skill = reg.skills.find((s) => s.src === o.repo && s.name === o.only);
    if (!skill) throw new Error(`skill ${o.only} dari ${o.repo} tidak ada di registry`);
    const destSkill = path.join(root, mirrorDirFor(skill), "SKILL.md");
    const text = fs.readFileSync(destSkill, "utf8");
    if (/^<{7}|^={7}|^>{7}/m.test(text)) throw new Error("masih ada penanda konflik di SKILL.md — selesaikan dulu");
    fs.writeFileSync(destSkill, stampFrontmatter(text, { src: o.repo, sha: o.sha }));
    console.log(`stamped ${o.only} → ${o.sha.slice(0, 12)}`);
    return;
  }
  if (o.repo) {
    if (!o.sha) throw new Error("--repo butuh --sha <sha>");
    jobs = [{ src: o.repo, sha: o.sha }];
  } else if (o.all) {
    const pinsPath = o.pins ? path.resolve(o.pins) : path.join(root, "router/upstream-pins.json");
    const pins = loadPins(pinsPath);
    jobs = Object.entries(pins).map(([src, sha]) => ({ src, sha }));
  } else {
    // Tanpa flag: rencana saja (dry-run --all bila ada pins, kalau tidak tampilkan pin sekarang).
    const pinsPath = path.join(root, "router/upstream-pins.json");
    if (fs.existsSync(pinsPath)) {
      const pins = loadPins(pinsPath);
      jobs = Object.entries(pins).map(([src, sha]) => ({ src, sha }));
      o.dryRun = true;
    } else {
      const bySrc = new Map();
      for (const s of reg.skills) if (s.src && !bySrc.has(s.src)) bySrc.set(s.src, s.sha);
      console.log("Pinned sources:");
      for (const [src, sha] of bySrc) console.log(`  ${src} @ ${sha}`);
      console.log("Jalankan: node scripts/sync-upstream.mjs --repo <owner/repo> --sha <sha> [--dry-run]");
      return;
    }
  }
  const reports = [];
  let failed = false;
  for (const { src, sha } of jobs) {
    if (SYNC_DENYLIST.has(src)) { console.log(`LEWATI (denylist): ${src}`); continue; }
    const allSkills = reg.skills.filter((s) => s.src === src);
    const skipped = allSkills.filter((s) => o.skip.includes(s.name));
    for (const s of skipped) console.log(`LEWATI (--skip): ${s.name} — cermin + pin lama tetap, lihat CHANGELOG`);
    const skills = applySkips(allSkills, o.skip);
    if (o.only) {
      const one = skills.find((s) => s.name === o.only);
      if (!one) throw new Error(`skill ${o.only} tidak ada di ${src}`);
      skills.splice(0, skills.length, one);
    }
    console.log(`\n== ${src} @ ${sha.slice(0, 12)} (${skills.length} skill)${o.dryRun ? " [dry-run]" : ""}`);
    const rep = syncRepo({ root, src, sha, skills, cloneDir, dryRun: o.dryRun });
    for (const s of rep.skills) {
      const f = s.files;
      const sum = f ? `tulis=${f.written?.length ?? f.copied} hapus=${f.deletedFiles?.length ?? f.deleted} konflik=${f.conflicts?.length ?? 0} biner-ditahan=${f.binariesKept?.length ?? 0}` : "";
      console.log(`  ${s.status.padEnd(17)} ${s.name}${s.sourceDir ? ` ← ${s.sourceDir || ""}` : ""} ${sum}`);
      if (s.status === "conflict") failed = true;
    }
    if (rep.status === "bad-sha") { console.log(`  GAGAL: ${rep.error}`); failed = true; }
    reports.push(rep);
  }
  if (cleanClones) fs.rmSync(cloneDir, { recursive: true, force: true });
  if (failed) { console.log("\nAda konflik/SHA buruk — tidak ada yang di-push; selesaikan manual lalu --stamp-only."); process.exitCode = 1; }
  else console.log(o.dryRun ? "\nDry-run selesai (tidak ada yang ditulis)." : "\nSync selesai. Jalankan: npm run skills:registry && npm run validate && npm test");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  try { main(); } catch (e) { console.error(`sync-upstream: ${e.message}`); process.exitCode = 1; }
}
