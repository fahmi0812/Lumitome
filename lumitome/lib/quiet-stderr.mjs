/**
 * Baris status engine (OpenCode) yang disembunyikan dari stderr TUI agar startup bersih.
 * Engine mencetaknya langsung ke stderr (console.log), bukan lewat logger — `--log-level none`
 * tidak mematikannya (terverifikasi vs engine 2.2.4-lumi.1). Hanya baris eksak ini yang dibuang;
 * baris lain, termasuk error, diteruskan apa adanya.
 */
export const QUIET_ENGINE_LINES = new Set([
  "Starting background server...",
  "Restarting background server (version mismatch)...",
]);

/**
 * Filter berbasis baris (tahan terhadap chunk yang terbelah di tengah baris).
 * @param {string} chunk teks baru (sudah diredaksi bila perlu)
 * @param {string} buf sisa baris tak lengkap dari chunk sebelumnya
 * @returns {{out: string, rest: string}} out = baris lengkap yang boleh diteruskan (dengan \n),
 *   rest = sisa baris tak lengkap untuk chunk berikutnya.
 */
export function filterStderr(chunk, buf = "") {
  const lines = (buf + chunk).split("\n");
  const rest = lines.pop();
  let out = "";
  for (const l of lines) if (!QUIET_ENGINE_LINES.has(l)) out += l + "\n";
  return { out, rest };
}
