/**
 * Accessor TUNGGAL preset /subagent (v0.3.71, A1).
 *
 * MASALAH (terbukti, fullcheck §2): preset adalah state mesin yang
 * TER-COMMIT di git (`.opencode/lumitome-subagent.json`, seed = semua
 * gemini sejak v0.3.61), sementara `lumitome update` menukar SELURUH
 * direktori repo dengan clone segar — tiap update mengembalikan preset
 * ke seed gemini, dan watcher tidak bisa menolong (thinking === initial).
 *
 * PERBAIKAN: sumber kebenaran preset pindah ke `$LUMI_HOME` (tidak
 * ter-track, tidak disentuh update):
 *   - file user: `$LUMI_HOME/lumitome-subagent.json`
 *   - file repo `.opencode/lumitome-subagent.json` jadi SEED default saja.
 * Migrasi sekali: bila file user belum ada dan seed ada, seed disalin
 * (atomik) ke file user. Bila file user hilang/rusak, fallback ke seed.
 * `--preset <path>` eksplisit selalu menang (alur tes + validate).
 *
 * Modul ini murni Node (fs/path/os) — dipakai wrapper (Node), CLI
 * apply-subagent-preset (Node), update.mjs (Node), DAN plugin /subagent
 * (Bun, lewat import relatif) — JANGAN tambah dependensi lain.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PRESET_NAME = "lumitome-subagent.json";

/** $LUMI_HOME (sama seperti enforce.mjs lumiHome + loadLiveModels). */
export function resolveLumiHome(env = process.env) {
  return env.LUMI_HOME || path.join(os.homedir(), ".lumitome");
}

/** Path preset milik user (sumber kebenaran sejak v0.3.71). */
export function userPresetPath(home = resolveLumiHome()) {
  return path.join(home, PRESET_NAME);
}

/** Path seed default di repo (dulu satu-satunya lokasi preset). */
export function seedPresetPath(root) {
  return path.join(root, ".opencode", PRESET_NAME);
}

/** Baca + parse satu file preset; null bila tidak ada/rusak (bukan throw). */
export function readPresetFile(p) {
  try {
    const v = JSON.parse(fs.readFileSync(p, "utf8"));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Tulis preset secara atomik (tmp + rename) — tanpa preset setengah tulis. */
export function writePresetFileAtomic(p, preset) {
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(preset, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

/**
 * Migrasi sekali (v0.3.71, A1): file user belum ada + seed ada → salin
 * seed ke file user (atomik). File user yang sudah ada TIDAK PERNAH
 * ditimpa. Kembali { migrated, source, error? } — gagal tidak fatal.
 */
export function migratePreset({ home = resolveLumiHome(), root } = {}) {
  const user = userPresetPath(home);
  if (fs.existsSync(user)) return { migrated: false, source: "user" };
  const seed = seedPresetPath(root);
  if (!fs.existsSync(seed)) return { migrated: false, source: "none" };
  try {
    fs.mkdirSync(home, { recursive: true });
    const tmp = `${user}.tmp-${process.pid}`;
    fs.copyFileSync(seed, tmp);
    fs.renameSync(tmp, user);
    return { migrated: true, source: "seed" };
  } catch (e) {
    return { migrated: false, source: "seed", error: e.message };
  }
}

/**
 * Muat preset efektif. Urutan: path eksplisit → file user (migrasi dulu)
 * → seed repo (fallback bila file user hilang/rusak) → null.
 * Kembali { preset, source: "explicit"|"user"|"seed"|null, migrated, warnings }.
 */
export function loadPreset({ home = resolveLumiHome(), root, explicitPath } = {}) {
  if (explicitPath) {
    const preset = readPresetFile(explicitPath);
    return {
      preset,
      source: preset ? "explicit" : null,
      migrated: false,
      warnings: preset ? [] : [`preset tidak bisa dibaca: ${explicitPath}`],
    };
  }
  const m = migratePreset({ home, root });
  const warnings = [];
  if (m.error) warnings.push(`migrasi preset gagal (${m.error}) — memakai seed repo bila ada`);
  const user = readPresetFile(userPresetPath(home));
  if (user) return { preset: user, source: "user", migrated: m.migrated, warnings };
  const seed = readPresetFile(seedPresetPath(root));
  if (seed) {
    warnings.push("preset user tidak bisa dibaca — memakai seed repo");
    return { preset: seed, source: "seed", migrated: m.migrated, warnings };
  }
  warnings.push("tidak ada preset /subagent (user maupun seed)");
  return { preset: null, source: null, migrated: false, warnings };
}

/** Simpan preset ke file user (atomik). Dipakai savePreset/setEnabled. */
export function saveUserPreset({ home = resolveLumiHome(), preset }) {
  fs.mkdirSync(home, { recursive: true });
  writePresetFileAtomic(userPresetPath(home), preset);
}

/**
 * Tulis preset (objek) ke file user bila file user BELUM ada — no-op
 * bila sudah ada. Dipakai jaring pengaman update (A1b) untuk preset
 * yang dibaca dari repo lama (git) atau di-stash sebelum install (npm).
 */
export function preservePresetObject(preset, home = resolveLumiHome()) {
  const user = userPresetPath(home);
  if (fs.existsSync(user)) return { preserved: false, reason: "file user sudah ada" };
  if (!preset || typeof preset !== "object") return { preserved: false, reason: "tidak ada preset lama" };
  try {
    saveUserPreset({ home, preset });
    return { preserved: true, reason: "preset lama disalin ke file user" };
  } catch (e) {
    return { preserved: false, reason: `gagal menyalin preset lama: ${e.message}` };
  }
}

/**
 * Jaring pengaman update (v0.3.71, A1b): sesudah `lumitome update`
 * menukar direktori repo, preset lama (di repo SEBELUM swap) harus
 * selamat. Bila file user belum ada dan repo lama punya preset, salin
 * isinya ke file user — jadi migrasi di launch berikutnya mengambil
 * nilai LAMA user, bukan seed baru. Bila file user sudah ada → no-op.
 * Kembali { preserved, reason } — gagal tidak fatal (log saja).
 */
export function preservePresetAcrossUpdate({ oldRepo, home = resolveLumiHome() } = {}) {
  const old = readPresetFile(path.join(oldRepo, ".opencode", PRESET_NAME));
  if (!old) return { preserved: false, reason: "repo lama tidak punya preset" };
  return preservePresetObject(old, home);
}
