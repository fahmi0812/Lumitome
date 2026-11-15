#!/usr/bin/env node
/**
 * Terapkan preset peran /subagent (.opencode/lumitome-subagent.json) ke
 * file agent peran (.opencode/agents/{thinking,search,builder,reviewer}.md):
 * tulis ulang baris `model:` tiap file, tanpa menyentuh isi lain.
 *
 * Aturan keras (bukti dari kode, v0.3.61):
 *  - Model HANYA 9router: ID harus `9router/<id>`. Provider/URL lain
 *    ditolak — Lumitome hanya memakai 9router (AGENTS.md; default model
 *    terpin di lumitome/bin/lumitome.mjs; models.dev dimatikan di
 *    build-config.mjs). Jangan pernah menulis model non-9router ke file agent.
 *  - Bila daftar model live bisa dibaca (cache $LUMI_HOME/providers.json),
 *    model yang tidak ada di daftar DITOLAK. Bila cache tidak ada / server
 *    tidak merespons, hanya cek format + peringatan (daftar live tidak
 *    bisa dibuktikan di mesin ini).
 *  - Pilihan model berlaku mulai sesi TUI BERIKUTNYA (konfigurasi agent
 *    dimuat saat TUI dimulai; README: "A running TUI session does not pick
 *    up new models until you restart it"). Jangan klaim berlaku langsung.
 *
 * Pakai: node scripts/apply-subagent-preset.mjs [--preset <path>] [--root <dir>] [--check]
 *   --check: hanya laporkan file yang berbeda dari preset, tanpa menulis (exit 1 bila beda).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROLES = ["thinking", "search", "builder", "reviewer"];
export const MODEL_RE = /^9router\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const DEFAULT_MODEL = "9router/ag/gemini-3.8-flash-high";

/** Daftar model 9router dari cache $LUMI_HOME/providers.json; null bila tidak bisa dibaca. */
export function loadLiveModels(home = process.env.LUMI_HOME || path.join(os.homedir(), ".lumitome")) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(home, "providers.json"), "utf8"));
    const ms = p?.providers?.["9router"]?.models;
    return Array.isArray(ms) ? [...ms].sort() : null;
  } catch { return null; }
}

export function validatePreset(preset, liveModels) {
  const errors = [], warnings = [];
  if (!preset || typeof preset !== "object" || !preset.roles || typeof preset.roles !== "object")
    return { errors: ["preset tidak valid: butuh objek {roles:{...}}"], warnings };
  for (const [role, cfg] of Object.entries(preset.roles)) {
    if (!ROLES.includes(role)) { errors.push(`peran tidak dikenal: '${role}' (yang ada: ${ROLES.join(", ")})`); continue; }
    const m = cfg?.model;
    if (typeof m !== "string" || !MODEL_RE.test(m)) { errors.push(`model peran '${role}' tidak valid: '${m}' (harus 9router/<id>)`); continue; }
    if (liveModels && !liveModels.includes(m.replace(/^9router\//, ""))) errors.push(`model peran '${role}' tidak ada di daftar 9router live: '${m}'`);
  }
  if (!liveModels) warnings.push("daftar model 9router live tidak bisa dibaca (tidak ada providers.json / server tidak merespons) — hanya cek format 9router/");
  return { errors, warnings };
}

/** Terapkan preset ke file agent. Kembali {changed:[file], warnings} — check:true tanpa menulis. */
export function applyPreset({ root = ".", preset, liveModels = null, check = false } = {}) {
  const { errors, warnings } = validatePreset(preset, liveModels);
  if (errors.length) return { changed: [], warnings, errors };
  const changed = [];
  for (const role of ROLES) {
    const cfg = preset.roles[role];
    if (!cfg || cfg.active === false) continue;
    const f = path.join(root, ".opencode", "agents", `${role}.md`);
    const t = fs.readFileSync(f, "utf8");
    const next = t.replace(/^model:.*$/m, `model: ${cfg.model}`);
    if (next === t) continue;
    if (!/^model:/m.test(t)) { errors.push(`file agent '${role}' tidak punya baris model:`); continue; }
    changed.push(f);
    if (!check) fs.writeFileSync(f, next);
  }
  return { changed, warnings, errors };
}

/** CLI: `lumitome subagent-preset [--check]` (dispatch di lumitome/bin/lumitome.mjs)
 * atau langsung `node scripts/apply-subagent-preset.mjs`. Kembali exit code. */
export function cli({ argv = process.argv.slice(2), root = ".", log = console.log, err = (m) => process.stderr.write(m + "\n") } = {}) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const presetPath = val("--preset") || path.join(root, ".opencode", "lumitome-subagent.json");
  const check = argv.includes("--check");
  let preset;
  try { preset = JSON.parse(fs.readFileSync(presetPath, "utf8")); }
  catch (e) { err(`apply-subagent-preset: preset tidak bisa dibaca ${presetPath} (${e.message})`); return 2; }
  const live = loadLiveModels();
  const r = applyPreset({ root, preset, liveModels: live, check });
  for (const w of r.warnings) err(`peringatan: ${w}`);
  if (r.errors.length) { for (const e of r.errors) err(`GAGAL: ${e}`); return 1; }
  if (check) {
    if (r.changed.length) { log(`apply-subagent-preset: STALE ${r.changed.join(", ")} → lumitome subagent-preset`); return 1; }
    log("apply-subagent-preset: OK (file agent = preset)");
  } else {
    log(r.changed.length ? `apply-subagent-preset: tulis ${r.changed.join(", ")} (berlaku mulai sesi TUI berikutnya)` : "apply-subagent-preset: sudah sesuai preset, tidak ada perubahan");
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(cli());
