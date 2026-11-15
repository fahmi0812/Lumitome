// flow.mjs — logika murni (tanpa I/O) untuk popup /subagent (v0.3.63).
// Dipakai TUI plugin (Bun) dan tes Node — JANGAN impor node:fs di sini
// (path ada di paths.mjs, dipakai bagian server saja).
export const ROLES = ["thinking", "search", "builder", "reviewer"];

export const ROLE_LABELS = {
  thinking: "Thinking",
  search: "Search",
  builder: "Build",
  reviewer: "Review",
};

export const ROLE_TIERS = {
  thinking: "terkuat",
  search: "cepat-murah",
  builder: "menengah-kuat",
  reviewer: "terkuat",
};

export const ROLE_DESC = {
  thinking: "Perencana — pecah tugas, tanya bila perlu",
  search: "Pencari — kumpulkan konteks, baca kode/dokumen",
  builder: "Pelaksana — implementasi per tiket + tes",
  reviewer: "Pemeriksa — verifikasi kerja Build sebelum DONE",
};

export const DEFAULT_MODEL = "9router/ag/gemini-3.8-flash-high";

/** Perintah yang dikenali plugin dari argumen sesudah `/subagent`. */
export const COMMANDS = ["off", "on", "status", "tabel", "table", "pilih"];

/**
 * Pecah argumen slash: kata pertama bisa jadi perintah, sisanya tugas.
 * `pilih` = paksa alur pilih berurutan (Stage A); `tabel`/`table` = tabel
 * satu-layar (Stage B). Tanpa perintah → alur default (Stage A) + tugas.
 */
export function parseSubagentArgs(input) {
  const text = String(input ?? "").trim();
  if (!text) return { command: undefined, task: "" };
  const first = text.split(/\s+/, 1)[0].toLowerCase();
  if (COMMANDS.includes(first)) {
    return { command: first === "table" ? "tabel" : first, task: text.slice(first.length).trim() };
  }
  return { command: undefined, task: text };
}

/**
 * Saring daftar model mentah ke ID 9router yang valid saja.
 * - hanya string diawali "9router/" (provider lain / URL lain ditolak)
 * - buang duplikat, urutkan alfabetis (deterministik)
 * - kosong → [DEFAULT_MODEL] (fallback terpin, tetap 9router)
 */
export function filterNineRouterModels(models) {
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(models) ? models : []) {
    if (typeof m !== "string" || !m.startsWith("9router/")) continue;
    const id = m.trim();
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) return [DEFAULT_MODEL];
  return out.sort();
}

/** Preset aktif? Field hilang = aktif (kompatibel ke belakang, v0.3.62). */
export function isEnabled(preset) {
  return preset?.enabled !== false;
}

/**
 * Bolehkan penyimpanan preset? Menolak ON-menimpa-OFF: bila preset yang
 * tersimpan sedang OFF (dimatikan dari TUI/sesi lain) dan preset baru
 * menyalakannya lagi, tolak — yang mematikan harus menyalakan eksplisit
 * lewat `/subagent on` / setEnabled. Mencegah balapan dua TUI yang
 * tanpa sengaja menghidupkan kembali sistem yang baru dimatikan.
 */
export function canSavePreset(current, next) {
  if (!isEnabled(current) && isEnabled(next)) {
    return { ok: false, reason: "sistem /subagent sedang OFF — nyalakan dulu dengan /subagent on" };
  }
  return { ok: true, reason: "" };
}

/** Peran yang aktif di preset. */
export function activeRoles(preset) {
  return ROLES.filter((r) => preset?.roles?.[r]?.active !== false);
}

/** Semua peran aktif? */
export function allActive(preset) {
  return ROLES.every((r) => preset?.roles?.[r]?.active !== false);
}

/**
 * Bangun preset baru dari preset lama + pilihan dialog.
 * $comment + enabled dipertahankan; tier per peran tetap (bukan pilihan bebas).
 * v0.3.65: keempat peran SELALU aktif — tidak ada lagi toggle per peran,
 * jadi `active` selalu true untuk semua peran (pilihan dialog hanya model + mode).
 */
export function buildPreset(base, { models, mode }) {
  const next = {
    ...(base?.$comment !== undefined ? { $comment: base.$comment } : {}),
    enabled: isEnabled(base),
    mode: mode === "paralel" ? "paralel" : "serial",
    roles: {},
  };
  for (const role of ROLES) {
    next.roles[role] = {
      active: true,
      model: typeof models?.[role] === "string" && models[role].startsWith("9router/")
        ? models[role]
        : (base?.roles?.[role]?.model ?? DEFAULT_MODEL),
      tier: ROLE_TIERS[role],
    };
  }
  return next;
}

/** Ringkasan satu baris preset untuk toast (tanpa janji palsu). */
export function summarizePreset(preset) {
  const active = activeRoles(preset);
  const names = active.map((r) => ROLE_LABELS[r]).join(", ") || "tidak ada peran aktif";
  const modelSet = new Set(active.map((r) => preset.roles[r].model));
  const modelText = modelSet.size === 1 ? [...modelSet][0] : "model berbeda per peran";
  return `${names} • mode ${preset.mode} • ${modelText}`;
}

/** Keadaan awal tabel Stage B dari preset (v0.3.65: tanpa `active` — peran selalu aktif). */
export function tableState(preset) {
  const state = { models: {}, mode: preset?.mode === "paralel" ? "paralel" : "serial" };
  for (const role of ROLES) {
    state.models[role] = preset?.roles?.[role]?.model ?? DEFAULT_MODEL;
  }
  return state;
}

/** Baris tabel: 4 peran + 1 baris mode. */
export const TABLE_ROWS = [...ROLES, "mode"];

/** Pindah fokus tabel (bungkus di ujung, tanpa arah keluar). */
export function moveFocus(focus, delta) {
  const n = TABLE_ROWS.length;
  return ((focus + delta) % n + n) % n;
}

/** Terapkan pilihan model dari dialog bersarang ke keadaan tabel. */
export function applyTableModel(state, role, model) {
  if (!ROLES.includes(role) || typeof model !== "string" || !model.startsWith("9router/")) return state;
  return { ...state, models: { ...state.models, [role]: model } };
}

/**
 * Pecah ID model "provider/id" menjadi { providerID, id } (v0.3.65 — untuk
 * `session.switchModel` yang butuh provider dan id terpisah; pisah di "/"
 * pertama, jadi id boleh mengandung "/" lagi, mis. "kr/claude-opus-5.5-x").
 * Tanpa "/" (atau kosong di salah satu sisi) → null.
 */
export function splitModelId(fullId) {
  if (typeof fullId !== "string") return null;
  const i = fullId.indexOf("/");
  if (i <= 0 || i === fullId.length - 1) return null;
  return { providerID: fullId.slice(0, i), id: fullId.slice(i + 1) };
}

/**
 * Model sesi yang harus dipakai sesudah save (v0.3.65): model peran Thinking,
 * bila Thinking aktif dan modelnya ID 9router yang valid; selain itu null
 * (model sesi TIDAK diubah — mis. Thinking nonaktif di preset lama).
 */
export function thinkingSessionModel(preset) {
  const cfg = preset?.roles?.thinking;
  if (!cfg || cfg.active === false) return null;
  const m = cfg.model;
  if (typeof m !== "string" || !m.startsWith("9router/")) return null;
  return m;
}

/**
 * Retry panggilan RPC (v0.3.64).
 *
 * Plugin dimuat LAZY oleh engine: panggilan RPC pertama bisa datang
 * sebelum registrasi selesai, dan engine menjawab `RPC is unavailable`
 * (HTTP 400). Tanpa retry, `/subagent` langsung gagal dengan toast
 * "Subagent gagal" padahal sepersekian detik kemudian RPC sudah ada.
 * Hanya error itu yang di-retry (maks 3 percobaan, jeda 400 ms);
 * error lain langsung dilempar dengan label method supaya toast
 * menyebut konteksnya (bukan pesan JSON mentah).
 */
export const RPC_UNAVAILABLE_MESSAGE = "RPC is unavailable";
export const RPC_RETRY_ATTEMPTS = 3;
export const RPC_RETRY_DELAY_MS = 400;

export function isRpcUnavailableError(e) {
  return String(e?.message ?? e).includes(RPC_UNAVAILABLE_MESSAGE);
}

export async function callRpcWithRetry(label, fn, opts = {}) {
  const attempts = opts.attempts ?? RPC_RETRY_ATTEMPTS;
  const delayMs = opts.delayMs ?? RPC_RETRY_DELAY_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRpcUnavailableError(e) || attempt === attempts) break;
      await sleep(delayMs);
    }
  }
  throw new Error(`${label}: ${String(last?.message ?? last)}`);
}
