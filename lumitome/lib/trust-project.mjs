/**
 * trust-project — keputusan LUMI_TRUST_PROJECT=1 per sesi (v0.3.43, P1-2).
 * Murni (tanpa fs, tanpa proses): bisa diuji tanpa engine. Yang memakai modul ini
 * (lumitome/bin/lumitome.mjs) yang bertanya ke pengguna + menulis jurnal.
 *
 * Aturan:
 * - `LUMI_TRUST_PROJECT=1` TIDAK PERNAH memberi persetujuan permanen: tidak ada file
 *   persetujuan yang ditulis; yang dicatat hanya baris jurnal per sesi (RUN_ID).
 *   Sesi baru = konfirmasi baru (TTY) atau baris jurnal baru (non-TTY).
 * - TTY: pengguna harus mengetik 'ya' tiap sesi; jawaban lain = ditolak, wrapper berhenti.
 * - Non-TTY (`lumitome run` / pipe / CI): konfirmasi interaktif TIDAK MUNGKIN — ini
 *   keterbatasan yang dicatat jujur, bukan pura-pura ada konfirmasi. Env yang diset
 *   eksplisit tetap jalan, tapi dengan mode "non-tty", peringatan keras di stderr,
 *   dan baris jurnal. Otomasi Fahmi sendiri (deploy headless) tetap jalan.
 */
export function decideTrustProject({ trust, interactive, answer = "" } = {}) {
  if (!trust) return { allowed: false, mode: "off", reason: "LUMI_TRUST_PROJECT tidak diset — config proyek tidak dimuat" };
  if (interactive) {
    if (String(answer).trim() === "ya") {
      return { allowed: true, mode: "confirmed", reason: "dikonfirmasi interaktif oleh pengguna di terminal (jawaban 'ya'); berlaku sesi ini saja" };
    }
    return { allowed: false, mode: "denied", reason: "konfirmasi interaktif ditolak/dibatalkan — config proyek tidak dimuat" };
  }
  return {
    allowed: true,
    mode: "non-tty",
    reason: "non-TTY: tanpa konfirmasi interaktif (bukan terminal, konfirmasi tidak mungkin), lanjut karena env LUMI_TRUST_PROJECT=1 diset eksplisit; dicatat di jurnal, berlaku sesi ini saja",
  };
}

/** Baris jurnal untuk satu sesi trust-project (ditulis wrapper, bukan modul ini). */
export function trustProjectJournalRow({ runId, workspace, mode, reason }) {
  return { kind: "trust-project", runId, workspace, mode, reason };
}
