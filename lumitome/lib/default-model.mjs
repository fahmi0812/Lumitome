/**
 * Satu sumber model default Lumitome (v0.3.71, A3).
 *
 * DULU literal `9router/ag/gemini-3.8-flash-high` tersebar di 8 situs
 * (wrapper, flow, apply script, prompt, rpc, dua opencode.jsonc, ...):
 * satu situs diubah, tujuh lainnya diam-diam tetap gemini. Kini SEMUA
 * situs kode mengimpor dari sini; kedua file opencode.jsonc (JSONC tidak
 * bisa impor) membawa komentar penanda ke file ini.
 *
 * Ini HANYA fallback terakhir — bila preset /subagent ada, sesi TUI
 * memakai model Thinking dari preset (lihat lumitome/lib/subagent-preset.mjs
 * + bin/lumitome.mjs); default ini tidak boleh dipakai diam-diam bila
 * preset tersedia (A2: kegagalan itu harus bersuara).
 */
export const DEFAULT_MODEL = "9router/ag/gemini-3.8-flash-high";
