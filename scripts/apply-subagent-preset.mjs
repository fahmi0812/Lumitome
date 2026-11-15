#!/usr/bin/env node
/**
 * Terapkan preset peran /subagent (.opencode/lumitome-subagent.json) ke
 * file agent peran (.opencode/agents/{thinking,search,builder,reviewer}.md):
 * tulis ulang baris `model:` tiap file, tanpa menyentuh isi lain — PLUS
 * sinkronkan baris "Mode /subagent saat ini" di
 * `.opencode/agents/orchestrator.md` (v0.3.67): aturan peran di file itu
 * berlaku HANYA bila baris mode menyebut serial/paralel; bila OFF,
 * orchestrator kerja tanpa peran. Tanpa baris ini, aturan peran yang
 * pindah ke orchestrator.md akan berlaku juga saat sistem dimatikan
 * (regresi saklar OFF v0.3.62) — karena orchestrator tidak membaca preset
 * JSON. Baris mode ditulis tiap preset disimpan/diubah (apply, on, off).
 * PLUS (v0.3.68): blok "Konfigurasi aktif" di `.opencode/rules/subagent.md`
 * — mapping peran→model + urutan + mode. Sesi BARU tidak lagi menerima
 * notice injeksi (Fahmi 17:20 WIB); sesi baru membaca konfigurasi dari
 * blok ini saat tugas pertama masuk. Blok ditulis tiap preset
 * disimpan/diubah juga (apply, on, off); --check gagal bila basi.
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
 *   on|off|status: `lumitome subagent-preset on|off` menulis field `enabled`
 *   di preset (saklar global v0.3.62); `status` mencetak ON/OFF. Saat OFF,
 *   apply/--check tidak menulis apa-apa dan exit 0 (sistem dormant).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROLES = ["thinking", "search", "builder", "reviewer"];
export const ROLE_LABELS = { thinking: "Thinking", search: "Search", builder: "Builder", reviewer: "Reviewer" };
/** Format ID model peran: HARUS `9router/<id>`. Ekornya memuat huruf,
 * angka, `.` `_` `/` `-` DAN `:` — daftar live 9router mengembalikan
 * ID gaya OpenRouter dengan sufiks `:free` (mis.
 * `9router/kn/dots-3-note-preview:free`, v0.3.68: validator lama menolak
 * `:` sehingga preset apa pun yang membawa model itu TIDAK BISA disimpan
 * sama sekali). Keanggotaan terhadap daftar live tetap menjadi cek
 * otoritatif bila daftarnya bisa dibaca (validatePreset di bawah);
 * regex ini hanya penjaga format saat offline. Provider selain 9router
 * tetap ditolak (prefix wajib). */
export const MODEL_RE = /^9router\/[A-Za-z0-9][A-Za-z0-9._\/:-]*$/;
export const DEFAULT_MODEL = "9router/ag/gemini-3.8-flash-high";

/** Blok konfigurasi di `.opencode/rules/subagent.md` (v0.3.68) — mapping
 * peran→model + urutan + mode, ditulis otomatis tiap preset disimpan.
 * Sesi BARU tidak lagi menerima pemberitahuan notice (terasa seperti prompt
 * injection — Fahmi 17:20 WIB); sebagai gantinya sesi baru membaca
 * konfigurasi dari file ini saat tugas pertama masuk (bersama aturan
 * delegasi — file ini dibaca orchestrator lewat gerbang butir 11).
 * Penanda HTML agar sinkronisasi bisa mengganti bloknya saja. */
export const RULES_CONFIG_START = "<!-- KONFIG-SUBAGENT -->";
export const RULES_CONFIG_END = "<!-- /KONFIG-SUBAGENT -->";
export function subagentConfigBlock(preset) {
  const mode = !isEnabled(preset) ? "OFF" : (preset?.mode === "paralel" ? "paralel" : "serial");
  const lines = [
    RULES_CONFIG_START,
    "Konfigurasi aktif (ditulis otomatis saat preset disimpan — jangan edit manual):",
    `- Mode: ${mode}. Urutan: thinking → search → builder → reviewer.`,
  ];
  for (const role of ROLES) {
    const m = preset?.roles?.[role]?.model ?? DEFAULT_MODEL;
    lines.push(`- ${ROLE_LABELS[role]}: ${m}`);
  }
  lines.push(RULES_CONFIG_END);
  return lines.join("\n");
}

/** Sinkronkan blok konfigurasi di `.opencode/rules/subagent.md` dengan
 * preset (v0.3.68). File hilang → peringatan, bukan error (bukan konteks
 * repo penuh — sama seperti syncOrchestratorMode). check:true tanpa menulis.
 * Kembali {changed, warnings, errors}. */
export function syncSubagentRulesConfig({ root = ".", preset, check = false } = {}) {
  const f = path.join(root, ".opencode", "rules", "subagent.md");
  let t;
  try { t = fs.readFileSync(f, "utf8"); }
  catch { return { changed: false, warnings: [`rules/subagent.md tidak ditemukan — blok konfigurasi /subagent tidak ditulis (${f})`], errors: [] }; }
  const block = subagentConfigBlock(preset);
  const start = t.indexOf(RULES_CONFIG_START);
  const end = t.indexOf(RULES_CONFIG_END);
  if (start !== -1 && end !== -1 && end > start) {
    const next = t.slice(0, start) + block + t.slice(end + RULES_CONFIG_END.length);
    if (next === t) return { changed: false, warnings: [], errors: [] };
    if (!check) fs.writeFileSync(f, next);
    return { changed: true, warnings: [], errors: [] };
  }
  const next = `${t.replace(/\n*$/, "\n")}\n${block}\n`;
  if (!check) fs.writeFileSync(f, next);
  return { changed: true, warnings: [], errors: [] };
}

/** Saklar global /subagent (v0.3.62): preset tanpa field `enabled` = ON
 * (backward compatible — preset v0.3.61 tetap jalan). Hanya `false` yang
 * mematikan; nilai non-boolean ditolak validatePreset. */
export function isEnabled(preset) { return preset?.enabled !== false; }

/** Salinan preset dengan field `enabled` diubah (tanpa mutasi argumen). */
export function setEnabled(preset, enabled) { return { ...preset, enabled }; }

/** Daftar model 9router dari cache $LUMI_HOME/providers.json; null bila tidak bisa dibaca. */
export function loadLiveModels(home = process.env.LUMI_HOME || path.join(os.homedir(), ".lumitome")) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(home, "providers.json"), "utf8"));
    const ms = p?.providers?.["9router"]?.models;
    return Array.isArray(ms) ? [...ms].sort() : null;
  } catch { return null; }
}

/**
 * Validasi preset peran/model (v0.3.69: param ketiga `stored` opsional —
 * preset yang SUDAH tersimpan; model tersimpan yang tidak ada di daftar
 * live saat ini TIDAK ditolak, hanya diperingatkan ("dipertahankan") —
 * daftar live bisa sesaat tidak memuat model yang sebenarnya ada (tunnel
 * flaky / model diganti nama), dan menolaknya membuat preset TIDAK BISA
 * disimpan sama sekali walau user hanya mempertahankan pilihannya (bug H2:
 * dialog diam-diam memilih models[0], lalu save menolak model tersimpan).
 * Model BARU (berbeda dari tersimpan) yang tidak ada di live TETAP ditolak
 * — mencegah typo / model yang memang tidak ada. Tanpa `stored`, semua
 * model di luar live ditolak seperti sebelumnya.
 */
export function validatePreset(preset, liveModels, stored) {
  const errors = [], warnings = [];
  if (!preset || typeof preset !== "object" || !preset.roles || typeof preset.roles !== "object")
    return { errors: ["preset tidak valid: butuh objek {roles:{...}}"], warnings };
  if ("enabled" in preset && typeof preset.enabled !== "boolean")
    return { errors: ["preset tidak valid: 'enabled' harus true/false"], warnings };
  // OFF (v0.3.62): model tidak divalidasi — sistem dormant, isinya tidak
  // dipakai; memaksa validasi saat OFF akan membuat validate gagal hanya
  // karena user mematikan sistem (bug).
  if (preset.enabled === false) return { errors, warnings };
  for (const [role, cfg] of Object.entries(preset.roles)) {
    if (!ROLES.includes(role)) { errors.push(`peran tidak dikenal: '${role}' (yang ada: ${ROLES.join(", ")})`); continue; }
    const m = cfg?.model;
    if (typeof m !== "string" || !MODEL_RE.test(m)) { errors.push(`model peran '${role}' tidak valid: '${m}' (harus 9router/<id>)`); continue; }
    if (liveModels && !liveModels.includes(m.replace(/^9router\//, ""))) {
      if (stored?.roles?.[role]?.model === m) warnings.push(`model peran '${role}' tidak ada di daftar 9router live saat ini — dipertahankan karena sudah tersimpan: '${m}'`);
      else errors.push(`model peran '${role}' tidak ada di daftar 9router live: '${m}'`);
    }
  }
  if (!liveModels) warnings.push("daftar model 9router live tidak bisa dibaca (tidak ada providers.json / server tidak merespons) — hanya cek format 9router/");
  return { errors, warnings };
}

/** Model yang sedang diterapkan di file agent (sumber "tersimpan" untuk
 * grandfathering di jalur CLI — di sana preset JSON di disk adalah preset
 * BARU, jadi model lama dibaca dari baris `model:` file agent). */
export function readAppliedModels(root = ".") {
  const out = {};
  for (const role of ROLES) {
    try {
      const t = fs.readFileSync(path.join(root, ".opencode", "agents", `${role}.md`), "utf8");
      const m = t.match(/^model:\s*(\S+)\s*$/m);
      if (m) out[role] = m[1];
    } catch {}
  }
  return out;
}

/** Baris mode di orchestrator.md — saklar baca untuk orchestrator (v0.3.67).
 * Aturan peran di orchestrator.md berlaku HANYA bila baris ini menyebut
 * serial/paralel; bila OFF, orchestrator kerja tanpa peran. Baris ini
 * ditulis otomatis tiap preset disimpan/diubah — jangan edit manual.
 * Tanpa kata "enabled" (tes v0.3.62: saklar hidup di preset, bukan file ini). */
export const ORCHESTRATOR_MODE_RE = /^Mode \/subagent saat ini: .*$/m;
export function orchestratorModeLine(preset) {
  if (!isEnabled(preset)) return "Mode /subagent saat ini: OFF.";
  return `Mode /subagent saat ini: ${preset?.mode === "paralel" ? "paralel" : "serial"}.`;
}

/** Sinkronkan baris mode di orchestrator.md dengan preset.
 * File hilang (fixture tes yang hanya menyalin file peran) → peringatan,
 * bukan error (bukan konteks repo penuh). check:true tanpa menulis.
 * Kembali {changed, warnings, errors}. */
export function syncOrchestratorMode({ root = ".", preset, check = false } = {}) {
  const f = path.join(root, ".opencode", "agents", "orchestrator.md");
  let t;
  try { t = fs.readFileSync(f, "utf8"); }
  catch { return { changed: false, warnings: [`orchestrator.md tidak ditemukan — baris mode /subagent tidak ditulis (${f})`], errors: [] }; }
  const line = orchestratorModeLine(preset);
  if (ORCHESTRATOR_MODE_RE.test(t)) {
    const next = t.replace(ORCHESTRATOR_MODE_RE, line);
    if (next === t) return { changed: false, warnings: [], errors: [] };
    if (!check) fs.writeFileSync(f, next);
    return { changed: true, warnings: [], errors: [] };
  }
  const next = `${t.replace(/\n*$/, "\n")}\n<!-- MODE-SUBAGENT -->\n${line}\n`;
  if (!check) fs.writeFileSync(f, next);
  return { changed: true, warnings: [], errors: [] };
}

/** Terapkan preset ke file agent. Kembali {changed:[file], modeChanged, configChanged, warnings, errors} — check:true tanpa menulis.
 * Saat OFF (v0.3.62): model peran tidak ditulis — tapi baris mode di
 * orchestrator.md TETAP disinkronkan ke OFF (itu saklar baca yang mematikan
 * aturan peran; tanpa ini orchestrator tetap mendelegasikan ke peran walau
 * sistem dimatikan) — begitu pula blok konfigurasi di rules/subagent.md
 * (v0.3.68: mode OFF tertulis di blok; file rules mengabaikan dirinya
 * sendiri bila baris mode orchestrator OFF). {disabled:true} — --check
 * tetap exit 0 bila tidak ada yang basi (validate tidak boleh gagal hanya
 * karena sistem dimatikan). */
export function applyPreset({ root = ".", preset, liveModels = null, stored, check = false } = {}) {
  // v0.3.69: tanpa `stored` eksplisit, model tersimpan dibaca dari file agent
  // (jalur CLI — preset JSON di disk adalah preset baru).
  const effectiveStored = stored ?? { roles: Object.fromEntries(Object.entries(readAppliedModels(root)).map(([r, m]) => [r, { model: m }])) };
  const { errors, warnings } = validatePreset(preset, liveModels, effectiveStored);
  if (errors.length) return { changed: [], modeChanged: false, configChanged: false, warnings, errors };
  if (!isEnabled(preset)) {
    const m = syncOrchestratorMode({ root, preset, check });
    const c = syncSubagentRulesConfig({ root, preset, check });
    return { changed: [], modeChanged: m.changed, configChanged: c.changed, warnings: [...warnings, ...m.warnings, ...c.warnings], errors: [...errors, ...m.errors, ...c.errors], disabled: true };
  }
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
  const m = syncOrchestratorMode({ root, preset, check });
  const c = syncSubagentRulesConfig({ root, preset, check });
  return { changed, modeChanged: m.changed, configChanged: c.changed, warnings: [...warnings, ...m.warnings, ...c.warnings], errors: [...errors, ...m.errors, ...c.errors] };
}

/** CLI: `lumitome subagent-preset [--check]` (dispatch di lumitome/bin/lumitome.mjs)
 * atau langsung `node scripts/apply-subagent-preset.mjs`. Kembali exit code. */
export function cli({ argv = process.argv.slice(2), root = ".", log = console.log, err = (m) => process.stderr.write(m + "\n") } = {}) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const presetPath = val("--preset") || path.join(root, ".opencode", "lumitome-subagent.json");
  const check = argv.includes("--check");
  // Perintah posisi pertama (v0.3.62): on|off|status — lewati nilai --preset.
  const cmd = (() => { for (let i = 0; i < argv.length; i++) { if (argv[i] === "--preset") { i++; continue; } if (!argv[i].startsWith("-")) return argv[i]; } return undefined; })();
  let preset;
  try { preset = JSON.parse(fs.readFileSync(presetPath, "utf8")); }
  catch (e) { err(`apply-subagent-preset: preset tidak bisa dibaca ${presetPath} (${e.message})`); return 2; }
  if (cmd === "on" || cmd === "off") {
    const next = setEnabled(preset, cmd === "on");
    fs.writeFileSync(presetPath, JSON.stringify(next, null, 2) + "\n");
    const m = syncOrchestratorMode({ root, preset: next });
    const c = syncSubagentRulesConfig({ root, preset: next });
    for (const w of [...m.warnings, ...c.warnings]) err(`peringatan: ${w}`);
    log(`apply-subagent-preset: subagent ${cmd === "on" ? "ON" : "OFF"} (preset ${presetPath})`);
    return 0;
  }
  if (cmd === "status") { log(`subagent: ${isEnabled(preset) ? "ON" : "OFF"}`); return 0; }
  if (cmd !== undefined) { err(`apply-subagent-preset: perintah tidak dikenal '${cmd}' (yang ada: on|off|status)`); return 2; }
  const live = loadLiveModels();
  const r = applyPreset({ root, preset, liveModels: live, check });
  for (const w of r.warnings) err(`peringatan: ${w}`);
  if (r.errors.length) { for (const e of r.errors) err(`GAGAL: ${e}`); return 1; }
  if (check) {
    if (r.changed.length || r.modeChanged || r.configChanged) { log(`apply-subagent-preset: STALE ${[...r.changed, ...(r.modeChanged ? ["orchestrator.md (baris mode)"] : []), ...(r.configChanged ? ["rules/subagent.md (blok konfigurasi)"] : [])].join(", ")} → lumitome subagent-preset`); return 1; }
    log("apply-subagent-preset: OK (file agent = preset)");
  } else if (r.disabled) {
    log("apply-subagent-preset: subagent OFF — preset tidak diterapkan (nyalakan: lumitome subagent-preset on)");
  } else {
    const wrote = [...r.changed, ...(r.modeChanged ? ["orchestrator.md (baris mode)"] : []), ...(r.configChanged ? ["rules/subagent.md (blok konfigurasi)"] : [])];
    log(wrote.length ? `apply-subagent-preset: tulis ${wrote.join(", ")} (berlaku mulai sesi TUI berikutnya)` : "apply-subagent-preset: sudah sesuai preset, tidak ada perubahan");
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(cli());
