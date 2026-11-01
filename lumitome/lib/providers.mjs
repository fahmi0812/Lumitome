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
const envName = (n) => `LUMI_KEY_${n.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const writeJ = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); fs.writeFileSync(f + ".tmp", JSON.stringify(o, null, 2) + "\n", { mode: 0o600 }); fs.renameSync(f + ".tmp", f); fs.chmodSync(f, 0o600); };
export const files = (home) => ({ prov: path.join(home, "providers.json"), cred: path.join(home, "credentials.json") });
export function load(home) { return readJ(files(home).prov).providers || {}; }
function keyFor(home, name, env = process.env) {
  return env[envName(name)] || (name === "9router" ? env.NINEROUTER_API_KEY : undefined) || readJ(files(home).cred)[name];
}

/** GET daftar model; mengembalikan id terurut. Error → throw (pesan tanpa key). */
export async function detectModels(type, base, key, { timeoutMs = 15000 } = {}) {
  const b = base.replace(/\/+$/, "");
  const url0 = type === "anthropic" ? (/\/v1$/.test(b) ? `${b}/models` : `${b}/v1/models`) : `${b}/models`;
  const headers = type === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${key}` };
  const ids = []; let url = url0;
  for (let page = 0; page < 20 && url; page++) {
    const r = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`GET ${url0} → HTTP ${r.status}`);
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
  if (!models.length) throw new Error("server tidak mengembalikan model");
  const F = files(home), all = readJ(F.prov); all.providers ||= {};
  all.providers[name] = { type, baseURL: baseURL.replace(/\/+$/, ""), models, updated: new Date().toISOString() };
  const cred = readJ(F.cred); cred[name] = key; writeJ(F.cred, cred); writeJ(F.prov, all);
  return models;
}
export function remove(home, name) {
  const F = files(home), all = readJ(F.prov); if (!all.providers?.[name]) return false;
  delete all.providers[name]; writeJ(F.prov, all);
  const cred = readJ(F.cred); delete cred[name]; writeJ(F.cred, cred); return true;
}
export async function refresh(home, only) {
  const F = files(home), all = readJ(F.prov); const out = {};
  for (const [n, p] of Object.entries(all.providers || {})) {
    if (only && n !== only) continue;
    try { p.models = await detectModels(p.type, p.baseURL, keyFor(home, n)); p.updated = new Date().toISOString(); out[n] = p.models.length; }
    catch (e) { out[n] = `gagal: ${e.message}`; }
  }
  writeJ(F.prov, all); return out;
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
  return { providers, env: penv };
}

// ---------- CLI ----------
function ask(rl, q) { return new Promise((r) => rl.question(q, r)); }
function askHidden(q) {
  return new Promise((resolve) => {
    const out = process.stderr; out.write(q); let buf = "";
    const stdin = process.stdin; const raw = stdin.isTTY; if (raw) stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const on = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") { stdin.removeListener("data", on); if (raw) stdin.setRawMode(false); stdin.pause(); out.write("\n"); return resolve(buf); }
        if (c === "\u0003") { out.write("\n"); process.exit(130); }
        if (c === "\u007f") { buf = buf.slice(0, -1); continue; }
        buf += c;
      }
    };
    stdin.on("data", on);
  });
}

export async function cli({ argv, home, sub, log = console.log, err = (m) => process.stderr.write(m + "\n") }) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; }, flag = (f) => argv.includes(f);
  const list = () => { const ps = load(home); if (!Object.keys(ps).length) { log("belum ada provider custom. Tambah: lumitome connect"); return; }
    for (const [n, p] of Object.entries(ps)) log(`${n}\t${p.type}\t${p.baseURL}\t${p.models.length} model\tkey:${keyFor(home, n) ? "ada" : "TIDAK ADA"}`); };
  if (sub === "models") {
    if (flag("--refresh")) { const r = await refresh(home, val("--refresh")?.startsWith("-") ? undefined : val("--refresh")); for (const [n, v] of Object.entries(r)) log(`${n}: ${v}${typeof v === "number" ? " model" : ""}`); return Object.values(r).some((v) => typeof v !== "number") ? 1 : 0; }
    for (const [n, p] of Object.entries(load(home))) for (const m of p.models) log(`${n}/${m}`); return 0;
  }
  if (flag("--list")) { list(); return 0; }
  if (flag("--remove")) { const n = val("--remove"); const ok = remove(home, n); (ok ? log : err)(ok ? `provider '${n}' dihapus (config + key)` : `provider '${n}' tidak ada`); return ok ? 0 : 1; }
  let type = val("--type"), name = val("--name"), baseURL = val("--base-url"), key;
  if (val("--key-env")) key = process.env[val("--key-env")];
  if (flag("--key-stdin")) key = fs.readFileSync(0, "utf8").trim();
  const interactive = !(type && name && baseURL && key);
  if (interactive) {
    if (!process.stdin.isTTY) { err("connect: non-interaktif butuh --type openai|anthropic --name <n> --base-url <url> (--key-env VAR | --key-stdin)"); return 2; }
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    err("Tambah provider Lumitome\n  1) Custom OpenAI-compatible (9router, OpenRouter, vLLM, LM Studio, Ollama /v1, …)\n  2) Custom Anthropic-compatible\n  (provider bawaan OpenCode: buka `lumitome` lalu ketik /connect)");
    if (!type) { const t = (await ask(rl, "Pilih [1/2]: ")).trim(); type = t === "2" ? "anthropic" : "openai"; }
    if (!name) name = (await ask(rl, "Nama (mis. 9router): ")).trim().toLowerCase();
    if (!baseURL) baseURL = (await ask(rl, type === "anthropic" ? "Base URL (mis. https://api.example.com): " : "Base URL (mis. http://127.0.0.1:20128/v1): ")).trim();
    rl.close();
    if (!key) key = (await askHidden("API key (tidak ditampilkan): ")).trim();
  }
  try {
    const models = await add(home, { name, type, baseURL, key });
    log(`OK: provider '${name}' (${type}) — ${models.length} model terdeteksi. Contoh: ${models.slice(0, 5).map((m) => `${name}/${m}`).join(", ")}${models.length > 5 ? ", …" : ""}`);
    log(`Pilih di TUI lewat /model, atau: lumitome run -m ${name}/${models[0]} "…"`);
    return 0;
  } catch (e) { err(`connect gagal: ${e.message}`); return 1; }
}
