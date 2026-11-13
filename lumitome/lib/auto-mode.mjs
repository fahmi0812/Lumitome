/**
 * Mode auto Lumitome (v0.3.51) — murni, tanpa I/O, bisa diuji tanpa engine.
 *
 * Mekanisme (bukan emulasi): flag `--auto` bawaan OpenCode v2.2.4 (terverifikasi
 * pada binary terpin: `opencode --help` dan `opencode run --help` sama-sama
 * menampilkan `--auto  Auto-approve permissions that are not explicitly denied`).
 * Dok resmi (open-code.ai/en/docs/permissions): "Start OpenCode with --auto to
 * automatically approve permission requests that are not explicitly denied...
 * Explicit \"deny\" rules are still enforced. Auto mode only changes requests
 * that would otherwise ask for approval." TUI juga menampilkan indikator `auto`
 * di samping nama agent saat aktif.
 *
 * Kenapa Lumitome kehilangan mode auto: wrapper tidak pernah meneruskan --auto,
 * sementara config final Lumitome menambah aturan `ask` yang tidak ada di
 * `opencode` polos (`external_directory` di luar workspace, `git push *`,
 * plus keputusan `ask` plugin guard untuk push branch) — jadi agent berhenti
 * minta konfirmasi. `opencode` polos jalan auto karena default bawaannya
 * permisif (kebanyakan `allow`).
 *
 * Default: auto AKTIF. Opt-out: env LUMI_AUTO_MODE=0 atau flag --no-auto
 * (flag menang atas env). Yang tetap TIDAK auto: semua aturan `deny` —
 * rahasia (.env/kunci/API key), sudo, rm di luar workspace, push
 * main/master/force, dump env — ditegakkan engine + plugin guard, tidak
 * berubah oleh --auto. Satu pengecualian yang dicatat jujur: push branch
 * (yang tadinya `ask` di TUI) ikut ter-auto-approve dalam mode auto,
 * sesuai semantik --auto upstream; di `run` headless push branch tetap
 * `deny` (guard: headless butuh persetujuan manusia).
 */

/** Nilai env yang mematikan / menyalakan mode auto. */
const OFF_VALUES = new Set(["0", "false", "no", "off"]);
const ON_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Tentukan mode auto dari env + argv.
 * Kembali: { auto: boolean, source: "default" | "env" | "flag" }.
 */
export function resolveAutoMode({ env = process.env, argv = [] } = {}) {
  if (argv.includes("--no-auto")) return { auto: false, source: "flag" };
  const raw = String(env.LUMI_AUTO_MODE ?? "").trim().toLowerCase();
  if (OFF_VALUES.has(raw)) return { auto: false, source: "env" };
  if (ON_VALUES.has(raw)) return { auto: true, source: "env" };
  return { auto: true, source: "default" };
}

/** Buang flag --no-auto dari argumen (jangan sampai diteruskan ke engine — engine tidak mengenalnya). */
export function stripNoAuto(argv) {
  return argv.filter((a) => a !== "--no-auto");
}

/**
 * Sisipkan --auto pada posisi yang benar (tanpa duplikat):
 * sesudah "run" untuk `opencode run`, di depan untuk TUI / perintah lain.
 */
export function withAutoFlag(args) {
  if (args.includes("--auto")) return [...args];
  if (args[0] === "run") return ["run", "--auto", ...args.slice(1)];
  return ["--auto", ...args];
}
