/**
 * Provider custom Lumitome (OpenAI-compatible / Anthropic-compatible), disimpan di LUMI_HOME — bukan di proyek.
 *  - $LUMI_HOME/providers.json  (0600): {providers:{<nama>:{type, baseURL, models[], updated}}} — tanpa rahasia
 *  - $LUMI_HOME/credentials.json (0600): {<nama>: "<api key>"} — tidak pernah dicetak/di-log
 *  - override env: LUMI_KEY_<NAMA> (huruf besar, non-alnum → _); untuk nama "9router" juga NINEROUTER_API_KEY
 * Model dideteksi via GET {base}/models (OpenAI: Bearer; Anthropic: x-api-key + anthropic-version, /v1/models).
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
// v0.3.45 (P1-4): preset 9router sekali-klik — nama + tipe + base URL lokal.
// Key TIDAK PERNAH diisi preset (tetap diminta manual); URL lokal adalah default
// yang benar (bukan server jarak jauh).
export const NINEROUTER_PRESET = { name: "9router", type: "openai", baseURL: "http://127.0.0.1:20128/v1" };
export const PROVIDER_PRESETS = { "9router": NINEROUTER_PRESET };
const envName = (n) => `LUMI_KEY_${n.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const writeJ = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); fs.writeFileSync(f + ".tmp", JSON.stringify(o, null, 2) + "\n", { mode: 0o600 }); fs.renameSync(f + ".tmp", f); fs.chmodSync(f, 0o600); };
export const files = (home) => ({ prov: path.join(home, "providers.json"), cred: path.join(home, "credentials.json") });
export function load(home) { return readJ(files(home).prov).providers || {}; }
function keyFor(home, name, env = process.env) {
  return env[envName(name)] || (name === "9router" ? env.NINEROUTER_API_KEY : undefined) || readJ(files(home).cred)[name];
}

/** GET daftar model; mengembalikan id terurut. Error → throw (pesan tanpa key).
 * v0.3.44: `timeoutMs` adalah anggaran TOTAL per provider (bukan per halaman) —
 * paginasi Anthropic yang tadinya bisa 20 halaman x 3 dtk = 60 dtk kini berhenti
 * saat anggaran habis dan MELEMPAR (bukan mengembalikan daftar parsial — daftar
 * parsial akan menimpa cache lengkap di refresh() dan menghilangkan model). */
export async function detectModels(type, base, key, { timeoutMs = 15000 } = {}) {
  const b = base.replace(/\/+$/, "");
  const url0 = type === "anthropic" ? (/\/v1$/.test(b) ? `${b}/models` : `${b}/v1/models`) : `${b}/models`;
  const headers = type === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${key}` };
  // v0.3.45 (P1-4): pesan error membedakan penyebab + menyarankan coba tipe lain
  // bila tipe tertukar (header/URL /models berbeda per tipe).
  const other = type === "anthropic" ? "openai" : "anthropic";
  const deadline = Date.now() + timeoutMs;
  const ids = []; let url = url0;
  for (let page = 0; page < 20 && url; page++) {
    const left = deadline - Date.now();
    // v0.3.45: timeout menyebut server tidak merespons + apa yang diperiksa.
    const timeoutMsg = () => `GET ${url0} → timeout total ${timeoutMs} ms habis (paginasi berhenti di halaman ${page + 1}) — server tidak merespons; periksa server berjalan di ${b} dan base URL benar`;
    if (left <= 0) throw new Error(timeoutMsg());
    let r;
    try { r = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(left) }); }
    catch (e) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError") throw new Error(timeoutMsg());
      // v0.3.45: koneksi gagal dibungkus dengan base URL + saran (bukan "fetch failed" mentah).
      throw new Error(`GET ${url0} → tidak bisa terhubung (${e?.cause?.message || e?.message || e}) — periksa server berjalan di ${b} dan base URL benar`);
    }
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error(`GET ${url0} → HTTP ${r.status} (API key ditolak — periksa key; bila server ini tipe '${other}', coba tipe '${other}')`);
      if (r.status === 404) throw new Error(`GET ${url0} → HTTP 404 (endpoint /models tidak ditemukan — periksa base URL; bila tipe tertukar, coba tipe '${other}')`);
      throw new Error(`GET ${url0} → HTTP ${r.status}`);
    }
    const j = await r.json();
    for (const m of j.data || j.models || []) if (m && (m.id || m.name)) ids.push(String(m.id || m.name));
    url = type === "anthropic" && j.has_more && j.last_id ? `${url0}?after_id=${encodeURIComponent(j.last_id)}` : null;
  }
  return [...new Set(ids)].sort();
}

export async function add(home, { name, type, baseURL, key }) {
  if (!NAME_RE.test(name || "")) throw new Error("nama provider: huruf kecil/angka/-, maks 32");
  if (!["openai", "anthropic"].includes(type)) throw new Error("tipe: openai | anthropic");
  if (!/^https?:\/\//.test(baseURL || "")) throw new Error("base URL harus http(s)://");
  if (!key) throw new Error("API key kosong");
  const models = await detectModels(type, baseURL, key);
  // v0.3.45 (P1-4): PERUBAHAN INVARIAN — 0 model BUKAN lagi gagal. Dulu baris ini
  // melempar "server tidak mengembalikan model", jadi 9router yang hidup tapi
  // dashboard-nya masih kosong tidak bisa disimpan sama sekali. Kini provider
  // TERSIMPAN dengan models: [] + peringatan; model masuk lewat auto-refresh
  // begitu dashboard diisi. Mengembalikan { models, warning } (warning null bila ada model).
  const warning = models.length ? null
    : "server tidak mengembalikan model (0 model) — provider tersimpan tanpa model; isi model di dashboard server lalu `lumitome models --refresh` (atau mulai ulang lumitome — auto-refresh akan mengisi daftar)";
  const F = files(home), all = readJ(F.prov); all.providers ||= {};
  all.providers[name] = { type, baseURL: baseURL.replace(/\/+$/, ""), models, updated: new Date().toISOString() };
  const cred = readJ(F.cred); cred[name] = key; writeJ(F.cred, cred); writeJ(F.prov, all);
  return { models, warning };
}
export function remove(home, name) {
  const F = files(home), all = readJ(F.prov); if (!all.providers?.[name]) return false;
  delete all.providers[name]; writeJ(F.prov, all);
  const cred = readJ(F.cred); delete cred[name]; writeJ(F.cred, cred); return true;
}
export async function refresh(home, only, { timeoutMs, env = process.env } = {}) {
  const F = files(home), all = readJ(F.prov); const out = {};
  // v0.3.44: PARALEL per provider (dulu satu per satu — N provider lambat = N x
  // timeout). Anggaran timeout tetap per provider (total, lihat detectModels);
  // gagal per provider -> cache lama, tidak pernah throw.
  await Promise.all(Object.entries(all.providers || {}).map(async ([n, p]) => {
    if (only && n !== only) return;
    try {
      const fresh = await detectModels(p.type, p.baseURL, keyFor(home, n, env), { timeoutMs });
      // v0.3.45 (P1-4): daftar kosong TIDAK menimpa cache (server yang tadinya
      // berisi model lalu menjawab 0 model — dashboard dikosongkan/glitch —
      // tidak boleh menghilangkan model tersimpan; lihat juga timeout total
      // di detectModels yang melempar demi cache). Provider yang memang masih
      // kosong tetap kosong sampai dashboard diisi.
      if (fresh.length) { p.models = fresh; p.updated = new Date().toISOString(); out[n] = fresh.length; }
      else if ((p.models || []).length) out[n] = `gagal: server tidak mengembalikan model (cache lama dipertahankan: ${p.models.length} model)`;
      else out[n] = "gagal: server tidak mengembalikan model (belum ada model tersimpan)";
    }
    catch (e) { out[n] = `gagal: ${e.message}`; }
  }));
  writeJ(F.prov, all); return out;
}

/**
 * Auto-refresh saat startup (v0.3.38): daftar model di providers.json selama ini
 * hanya snapshot saat `connect` — provider baru yang ditambah di dashboard 9router
 * tidak pernah muncul sampai `lumitome models --refresh` manual. Fungsi ini
 * me-refresh semua provider dari GET {base}/models dengan timeout pendek,
 * best-effort: gagal per provider → model lama dipertahankan, tidak pernah throw.
 * Opt-out: LUMI_AUTO_REFRESH=0 atau LUMI_NO_AUTO_REFRESH=1.
 */
export async function autoRefresh(home, { env = process.env, timeoutMs = 3000 } = {}) {
  if (env.LUMI_AUTO_REFRESH === "0" || env.LUMI_NO_AUTO_REFRESH === "1") return {};
  return refresh(home, undefined, { timeoutMs, env });
}

/** Timeout HTTP provider untuk engine (ms, bilangan bulat positif). Nilai env tidak valid → default. */
export const TIMEOUT_DEFAULTS = { headerTimeout: 300000, chunkTimeout: 900000, timeout: 3600000 };
export function providerTimeouts(env = process.env) {
  const n = (v, d) => { const x = Number(v); return Number.isSafeInteger(x) && x > 0 ? x : d; };
  return { headerTimeout: n(env.LUMI_HEADER_TIMEOUT_MS, TIMEOUT_DEFAULTS.headerTimeout),
    chunkTimeout: n(env.LUMI_IDLE_TIMEOUT_MS, TIMEOUT_DEFAULTS.chunkTimeout),
    timeout: n(env.LUMI_TOTAL_TIMEOUT_MS, TIMEOUT_DEFAULTS.timeout) };
}

/** Fragmen config OpenCode + env berisi key (key hanya lewat env proses engine, config memakai {env:...}). */
export function opencodeFragment(home, env = process.env) {
  const providers = {}, penv = {};
  for (const [n, p] of Object.entries(load(home))) {
    const key = keyFor(home, n, env); if (!key) continue;
    const ev = envName(n); penv[ev] = key;
    providers[n] = { name: n, package: p.type === "anthropic" ? "aisdk:@ai-sdk/anthropic" : "aisdk:@ai-sdk/openai-compatible",
      settings: { baseURL: p.type === "anthropic" && !/\/v1$/.test(p.baseURL) ? `${p.baseURL}/v1` : p.baseURL, apiKey: `{env:${ev}}` },
      models: Object.fromEntries(p.models.map((m) => [m, { name: `${m} (${n})` }])) };
  }
  // 9router: wrapper selalu men-set KEDUA nama (config dasar memakai LUMI_KEY_9ROUTER; skrip lama memakai NINEROUTER_API_KEY)
  const k9 = penv.LUMI_KEY_9ROUTER || env.LUMI_KEY_9ROUTER || env.NINEROUTER_API_KEY || readJ(files(home).cred)["9router"];
  if (k9) { penv.LUMI_KEY_9ROUTER = k9; penv.NINEROUTER_API_KEY = k9; }
  return { providers, env: penv };
}

// ---------- CLI ----------
function ask(rl, q) { return new Promise((r) => rl.question(q, r)); }
async function askHidden(q) { const { askMasked } = await import("./provider-ui.mjs"); return askMasked(q); }

export async function cli({ argv, home, sub, env = process.env, log = console.log, err = (m) => process.stderr.write(m + "\n") }) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; }, flag = (f) => argv.includes(f);
  const list = () => { const ps = load(home); if (!Object.keys(ps).length) { log("belum ada provider custom. Tambah: lumitome connect"); return; }
    for (const [n, p] of Object.entries(ps)) log(`${n}\t${p.type}\t${p.baseURL}\t${p.models.length} model\tkey:${keyFor(home, n) ? "ada" : "TIDAK ADA"}`); };
  if (sub === "models") {
    if (flag("--refresh")) { const r = await refresh(home, val("--refresh")?.startsWith("-") ? undefined : val("--refresh"), { env }); for (const [n, v] of Object.entries(r)) log(`${n}: ${v}${typeof v === "number" ? " model" : ""}`); return Object.values(r).some((v) => typeof v !== "number") ? 1 : 0; }
    // v0.3.44: tanpa --refresh pun ikut auto-refresh dulu (best-effort, gagal ->
    // cache lama; opt-out LUMI_AUTO_REFRESH=0 dihormati). Sebelumnya cabang ini
    // hanya mencetak cache — model baru dari server tidak pernah muncul di sini.
    // Catatan: `lumitome models` polos diteruskan ke engine OpenCode, bukan ke sini;
    // jalur itu sudah auto-refresh di startup wrapper sejak v0.3.38.
    await autoRefresh(home, { env });
    for (const [n, p] of Object.entries(load(home))) for (const m of p.models) log(`${n}/${m}`); return 0;
  }
  if (flag("--list")) { list(); return 0; }
  if (flag("--remove")) { const n = val("--remove"); const ok = remove(home, n); (ok ? log : err)(ok ? `provider '${n}' dihapus (config + key)` : `provider '${n}' tidak ada`); return ok ? 0 : 1; }
  let type = val("--type"), name = val("--name"), baseURL = val("--base-url"), key;
  if (val("--preset")) {
    // v0.3.45 (P1-4): --preset 9router mengisi nama/tipe/base URL lokal; flag
    // eksplisit menang atas preset; key tetap manual (--key-env/--key-stdin).
    const preset = PROVIDER_PRESETS[val("--preset")];
    if (!preset) { err(`preset tidak dikenal: '${val("--preset")}' (yang ada: ${Object.keys(PROVIDER_PRESETS).join(", ")})`); return 2; }
    type ??= preset.type; name ??= preset.name; baseURL ??= preset.baseURL;
  }
  if (val("--key-env")) key = process.env[val("--key-env")];
  if (flag("--key-stdin")) key = fs.readFileSync(0, "utf8").trim();
  argv = argv.filter((a) => a !== "--text");
  const interactive = !(type && name && baseURL && key);
  if (interactive) {
    if (!process.stdin.isTTY) { err("connect: non-interaktif butuh --type openai|anthropic --name <n> --base-url <url> (--key-env VAR | --key-stdin)"); return 2; }
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    err("Tambah provider Lumitome\n  1) Custom OpenAI-compatible (9router, OpenRouter, vLLM, LM Studio, Ollama /v1, …)\n  2) Custom Anthropic-compatible\n  (menu layar penuh: lumitome connect / lumitome provider · provider bawaan OpenCode: di TUI ketik /connect)");
    if (!type) { const t = (await ask(rl, "Pilih [1/2]: ")).trim(); type = t === "2" ? "anthropic" : "openai"; }
    if (!name) name = (await ask(rl, "Nama (mis. 9router): ")).trim().toLowerCase();
    if (!baseURL) baseURL = (await ask(rl, type === "anthropic" ? "Base URL (mis. https://api.example.com): " : "Base URL (mis. http://127.0.0.1:20128/v1): ")).trim();
    rl.close();
    if (!key) key = (await askHidden("API key (tampil sebagai •): ")).trim();
  }
  try {
    const { models, warning } = await add(home, { name, type, baseURL, key });
    if (!models.length) { log(`OK: provider '${name}' (${type}) tersimpan tanpa model — ${warning}`); return 0; }
    log(`OK: provider '${name}' (${type}) — ${models.length} model terdeteksi. Contoh: ${models.slice(0, 5).map((m) => `${name}/${m}`).join(", ")}${models.length > 5 ? ", …" : ""}`);
    const pref = models.includes("ag/gemini-3.8-flash-high") ? "ag/gemini-3.8-flash-high" : models[0];
    log(`Pilih di TUI lewat /model, atau: lumitome run -m ${name}/${pref} "…"`);
    return 0;
  } catch (e) { err(`connect gagal: ${e.message}`); return 1; }
}
