/**
 * Preflight provider untuk `lumitome run` (v0.3.44, P1-3) — dipindah dari
 * lumitome/bin/lumitome.mjs agar bisa diuji tanpa engine.
 *
 * Bedakan "server mati" dari "server lambat":
 *  - MATI (dead): koneksi ditolak / DNS gagal / host tak terjangkau
 *    (ECONNREFUSED, ENOTFOUND, EHOSTUNREACH) — percobaan pertama langsung
 *    gagal-cepat TANPA retry + backoff: server yang tidak mendengarkan tidak
 *    akan hidup dalam 2-4 detik, dan menunggu hanya menunda diagnosis.
 *    Sebelumnya: 3 percobaan + backoff 2+4 dtk = ~6 dtk untuk refused,
 *    ~30 dtk untuk server yang menggantung.
 *  - LAMBAT (slow): timeout — TETAP di-retry seperti sebelumnya (batas waktu
 *    TIDAK diperpendek: server lambat yang sah tidak boleh dinyatakan mati).
 *  - TAK DIKENAL (unknown): di-retry seperti lambat (konservatif).
 * Diagnosis terpandu (gaya Anthropic Security): base URL, hasil GET /models
 * terakhir dari cache, saran perintah, dan alamat cek 9router.
 */
const DEAD_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"]);
export function classifyPreflightError(e) {
  const code = e?.cause?.code || e?.code;
  if (DEAD_CODES.has(code)) return "dead";
  if (e?.name === "TimeoutError" || code === "ETIMEDOUT") return "slow";
  return "unknown";
}

/** GET {base} sekali; status HTTP apa pun (mis. 401) = server hidup.
 * Return { ok, kind: "dead"|"slow"|"unknown"|null, attempts, ms, error? }.
 * `log` dipanggil tiap percobaan gagal (format baris sama dengan wrapper lama). */
export async function preflight({ base, timeoutMs = 8000, retries = 2, userAgent = "lumitome",
  fetchImpl = fetch, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  const t0 = Date.now();
  for (let i = 0; i <= retries; i++) {
    try {
      await Promise.race([
        fetchImpl(base, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": userAgent } }),
        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), timeoutMs + 250).unref()),
      ]);
      return { ok: true, kind: null, attempts: i + 1, ms: Date.now() - t0 };
    } catch (e) {
      const kind = classifyPreflightError(e);
      log(`lumitome: preflight ${base} gagal (${e.name || e.message}, ${Date.now() - t0} ms)${kind === "dead" ? " — server mati, tanpa retry" : i < retries ? ` — ulang ${i + 1}/${retries}` : ""}`);
      if (kind === "dead") return { ok: false, kind, attempts: i + 1, ms: Date.now() - t0, error: e };
      if (i < retries) await sleepImpl(2000 * 2 ** i);
      else return { ok: false, kind, attempts: i + 1, ms: Date.now() - t0, error: e };
    }
  }
  return { ok: false, kind: "unknown", attempts: retries + 1, ms: Date.now() - t0 };
}

/** Diagnosis terpandu untuk kegagalan preflight. `lastModels` = { updated, count }
 * dari providers.json (GET /models terakhir yang berhasil) atau null. */
export function preflightDiagnosis({ provider, base, kind, lastModels }) {
  const check = provider === "9router" ? "http://127.0.0.1:20128/v1/models" : `${String(base).replace(/\/+$/, "")}/models`;
  const why = kind === "dead" ? "mati (server tidak menerima koneksi)"
    : kind === "slow" ? "lambat (tidak merespons dalam batas waktu)" : "tidak merespons";
  return [
    `lumitome: diagnosis — provider ${provider} ${why}`,
    `  base URL: ${base}`,
    `  GET /models terakhir: ${lastModels?.updated ? `${lastModels.updated} (${lastModels.count ?? "?"} model di cache)` : "belum pernah berhasil"}`,
    `  Periksa: lumitome models --refresh`,
    `  Cek 9router di ${check} (atau base URL provider Anda)`,
  ].join("\n");
}
