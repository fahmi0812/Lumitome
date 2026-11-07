/**
 * buildFinalConfig — rakitan config final OpenCode + env untuk satu jalan lumitome.
 * Dipisah dari lumitome/bin/lumitome.mjs (v0.3.23, kandidat #4): rakitan config (dari env
 * + file) bisa diuji tanpa menjalankan engine; entry module tinggal dispatch (subcommand,
 * service, branding, spawn/cleanup).
 * Bukan murni matematis: membaca file (projectMcp, router skill) dan menulis process.env
 * yang dibaca router — tapi tidak spawn proses, tidak mengelola service, tidak menyentuh
 * argumen/dispatch. env dimutasi di tempat (seperti kode lama) dan dikembalikan.
 * Param memakai nama yang sama dengan lumitome.mjs, supaya isi fungsi ini pindahan verbatim.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stripJsonc } from "../../router/parse.mjs";

// default: codemem + 4 sektor inti; finance/media hanya via LUMI_MCP=all atau daftar eksplisit
// v0.3.13: satu proses `skills` untuk semua sektor (dulu 4 proses skills-<sektor>); codemem hanya aktif di repo git (shim)
const DEFAULT_MCP = "codemem,skills";
// agent default: orchestrator di TUI; `run` headless tetap build (delegasi orchestrator headless belum terverifikasi live). LUMI_AGENT menimpa
const RUN_AGENT = "build";
const DENY = (r) => ({ action: "shell", resource: r, effect: "deny" });

// Kepercayaan proyek: default config/plugin/agent proyek TIDAK dimuat (repo asing bisa membawa plugin jahat).
function projectMcp(WS, TRUST) {
  if (!TRUST) return {};
  for (const f of ["opencode.jsonc", "opencode.json", ".opencode/opencode.jsonc", ".opencode/opencode.json"]) {
    const p = path.join(WS, f); if (!fs.existsSync(p)) continue;
    try { const c = JSON.parse(stripJsonc(fs.readFileSync(p, "utf8"))); return c.mcp?.servers || {}; } catch { return {}; }
  }
  return {};
}

/**
 * Rakit finalCfg + env. Kembali: { finalCfg, env, skillNote }.
 * prompt: pesan `run` yang sudah diekstrak entry (promptOf) — hanya dipakai saat sub === "run".
 */
export async function buildFinalConfig({ env, REPO, ROOT, HOME, WS, CFG_DIR, JOURNAL, RUN_ID, FRAG, MODEL, HAS_9R_ENV, TIMEOUTS, TRUST, sub, prompt = "" }) {
  const wantMcp = (env.LUMI_MCP ?? DEFAULT_MCP).split(",").map((s) => s.trim()).filter(Boolean);
  const mcpOverride = {};
  for (const [name, def] of Object.entries(projectMcp(WS, TRUST))) {
    const on = wantMcp.includes("all") || wantMcp.includes(name);
    if (!on) mcpOverride[name] = { ...def, disabled: true };
  }
  // MCP skill_search milik Lumitome (path absolut instalasi) → tersedia di proyek mana pun tanpa config proyek
  // tool per sektor: skills_<sektor>_skill_search (agent sektor hanya diizinkan tool sektornya). Nama lama skills-<sektor> di LUMI_MCP tetap diterima.
  const ALL_SECTORS = ["coding", "security", "riset", "penulisan", "finance", "media"];
  const skillSectors = wantMcp.includes("all") || wantMcp.includes("skills") ? ALL_SECTORS : ALL_SECTORS.filter((sec) => wantMcp.includes(`skills-${sec}`));
  if (skillSectors.length) mcpOverride.skills = { type: "local", command: [process.execPath, "--no-warnings", path.join(REPO, "router", "skill-search-mcp.mjs"), "--sectors", skillSectors.join(","), "--root", REPO], timeout: { startup: 30000, catalog: 30000, execution: 30000 } };
  // drawio (next-ai-draw-io, terpin) — opsional, mati default; hanya bila disebut eksplisit di LUMI_MCP (tidak ikut "all")
  if (wantMcp.includes("drawio")) mcpOverride.drawio = { type: "local", command: ["npx", "-y", "@next-ai-drawio/mcp-server@0.4.11"], environment: { BROWSER: env.BROWSER || "" }, timeout: { startup: 120000, catalog: 120000, execution: 120000 } };
  // figcraft (storytold/figcraft, terpin v0.16.0) — opsional, mati default; hanya bila disebut eksplisit di LUMI_MCP (tidak ikut "all")
  if (wantMcp.includes("figcraft")) {
    const FC = env.LUMI_FIGCRAFT_CLI || "figcraft-cli";
    const fcArgs = FC.endsWith(".AppImage") ? ["cli", "mcp"] : ["mcp"];
    mcpOverride.figcraft = { type: "local", command: [FC, ...fcArgs, "--automation-read-root", WS, "--automation-write-root", WS], timeout: { startup: 30000, catalog: 30000, execution: 300000 } };
  }
  // codemem global: binary absolut di LUMI_HOME/bin (bukan PATH, bukan config proyek). Tidak pernah `install`.
  const CM = await import(pathToFileURL(path.join(ROOT, "lib", "codemem.mjs")).href);
  if (wantMcp.includes("all") || wantMcp.includes("codemem")) {
    const def = CM.codememServer(HOME);
    if (def) mcpOverride.codemem = def;
    else if (sub === "" || sub === "run" || env.LUMI_DEBUG) process.stderr.write(`lumitome: codemem dilewati — ${CM.cbmBin(HOME)} belum ada\n`);
  }
  // header 300 s, jeda antar-chunk 900 s, total 1 jam (LUMI_*_TIMEOUT_MS) — TIMEOUTS dihitung entry (dipakai juga retry)
  const finalCfg = {
    update: "disable",
    ...(env.LUMI_AGENT ? { default_agent: env.LUMI_AGENT } : { default_agent: sub === "run" ? RUN_AGENT : "orchestrator" }),
    providers: { "9router": { settings: { ...TIMEOUTS } } },
    ...(Object.keys(mcpOverride).length ? { mcp: { servers: mcpOverride } } : {}),
    // lapis-2 (lapis-1 = plugin guard): deny di akhir rantai → last-match-wins
    permissions: [
      // pola diawali "*" karena string yang dicek OpenCode = `bwrap --args 3 bash -c '<perintah>' …`
      { action: "shell", resource: "*git push *", effect: "ask" },
      // .env: isi ditolak lapis-1 (guard) + di-mask /dev/null oleh bwrap; daftar nama (ls/find/glob) diizinkan
      ...["*id_rsa*", "*id_ed25519*", "*.ssh/*", "*rm -rf /*", "*rm -rf ~*", "*rm -fr /*", "*rm -rf ..*", "*sudo *",
        "*git push *-f*", "*git push *--force*", "*git push *main*", "*git push *master*", "*git push *+*", "*printenv*", "*NINEROUTER_API_KEY*", "*LUMI_KEY_*"].map(DENY),
      { action: "read", resource: "*.env", effect: "deny" }, { action: "read", resource: "*.env.*", effect: "deny" },
      { action: "read", resource: "*.env.example", effect: "allow" }, { action: "read", resource: "*secrets.env", effect: "deny" },
      { action: "read", resource: "*id_rsa*", effect: "deny" }, { action: "read", resource: "*/.ssh/*", effect: "deny" },
      { action: "external_directory", resource: "*", effect: "ask" },
    ],
  };
  // provider custom → config final (key hanya via env {env:LUMI_KEY_*}); timeout berlaku untuk semua provider
  for (const [n, p] of Object.entries(FRAG.providers)) finalCfg.providers[n] = { ...p, settings: { ...p.settings, ...TIMEOUTS } };
  if (MODEL) finalCfg.model = MODEL;
  if (!HAS_9R_ENV && !FRAG.providers["9router"]) finalCfg.disabled_providers = ["9router"];

  // ---------- skill scoping (kurangi prompt sistem): hanya ≤5 skill hasil router yang terlihat ----------
  let skillNote = "";
  // router & DB skill milik harness (REPO), bukan workspace → konsisten di repo mana pun & tidak bisa disuntik proyek
  if (sub === "run" && (env.LUMI_SKILLS ?? "auto") === "auto" && fs.existsSync(path.join(REPO, "runtime", "skills.db")) && fs.existsSync(path.join(REPO, "router", "skill-db.mjs"))) {
    if (prompt) {
      try {
        const SD = await import(pathToFileURL(path.join(REPO, "router", "skill-db.mjs")).href);
        const saved = process.cwd(); process.chdir(REPO);
        // L1 = cadangan: "auto" (default) hanya saat confidence L0 rendah, timeout keras 3 s; "always"/"1"; "0" = mati
        const l1m = String(env.LUMI_ROUTER_L1 ?? "auto"), useL1 = l1m === "0" ? false : (l1m === "always" || l1m === "1") ? "always" : true;
        const r9 = FRAG.providers["9router"];
        if (useL1) process.env.SW_9ROUTER_URL ||= env.LUMI_9ROUTER_URL || r9?.settings.baseURL || "http://127.0.0.1:20128/v1";
        if (useL1 && !process.env.NINEROUTER_API_KEY && r9) process.env.SW_9ROUTER_KEY ||= FRAG.env.LUMI_KEY_9ROUTER;
        process.env.SW_ROUTE_CACHE ||= path.join(HOME, "router-cache.json");
        const r = await SD.route(prompt, { root: REPO, useL1, log: false });
        process.chdir(saved);
        finalCfg.permissions.push({ action: "skill", resource: "*", effect: "deny" }, ...r.picked.map((n) => ({ action: "skill", resource: n, effect: "allow" })));
        skillNote = `skills=${r.picked.join(",") || "-"} (L1=${r.l1.status})`;
      } catch (e) { skillNote = `skill-router gagal (${e.message}); semua skill tetap terlihat`; }
    }
  }
  // rules inti Lumitome dari config dir milik Lumitome (bukan proyek) → aktif di proyek mana pun walau trust off
  finalCfg.instructions = fs.readdirSync(path.join(ROOT, "rules")).filter((f) => f.endsWith(".md")).sort().map((f) => path.join(CFG_DIR, "rules", f));
  // hanya dir binary yang di-bind read-only ke sandbox — BUKAN seluruh LUMI_HOME (berisi jurnal, serve.password, data engine)
  const toolDirs = [env.SW_HOME && path.join(env.SW_HOME, "bin"), path.resolve(path.dirname(process.execPath), "..")].filter((d) => d && path.relative(d, HOME).startsWith(".."));
  Object.assign(env, {
    OPENCODE_CONFIG_DIR: CFG_DIR,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(finalCfg),
    // engine terpin: tanpa cek/unduh update (diverifikasi di v2.2.4: OPENCODE_DISABLE_AUTOUPDATE → "update check skipped")
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: env.LUMI_MODELS_FETCH === "1" ? "" : "1", // tanpa fetch models.dev
    OPENCODE_DISABLE_CLAUDE_CODE: "1", // tidak membaca ~/.claude user
    XDG_DATA_HOME: env.LUMI_XDG_DATA || path.join(HOME, "data"),
    XDG_STATE_HOME: path.join(HOME, "state"), XDG_CACHE_HOME: path.join(HOME, "cache"),
    // isolasi dari instalasi OpenCode user: ~/.config/opencode, ~/.local/share/opencode (auth.json, sesi) tidak dibaca/ditulis
    XDG_CONFIG_HOME: path.join(HOME, "xdg-config"),
    PWD: WS, LUMI_WORKSPACE: WS, LUMI_JOURNAL: JOURNAL, LUMI_RUN_ID: RUN_ID,
    LUMI_HARNESS: path.join(REPO, "harness", "lumi-guard.mjs"),
    LUMI_TOOLDIRS: toolDirs.join(path.delimiter), LUMI_SBX_DIR: path.join(HOME, "sbx"),
    LUMI_9ROUTER_URL: env.LUMI_9ROUTER_URL || "http://127.0.0.1:20128/v1",
    ...FRAG.env,
  });
  // Windows: tidak ada bwrap → sandbox OS mati, tapi guard (deny rules, .env, anti-spin, push main) tetap aktif
  // Windows: tanpa bwrap; guard tetap aktif. Pesan hanya dengan LUMI_DEBUG (layar TUI tidak diawali teks tambahan)
  if (process.platform === "win32" && !env.LUMI_SANDBOX) { env.LUMI_SANDBOX = "off"; if (env.LUMI_DEBUG) process.stderr.write("lumitome: Windows, tanpa sandbox; guard aktif\n"); }
  if (!TRUST) env.OPENCODE_DISABLE_PROJECT_CONFIG = "1";
  env.SW_9ROUTER_URL ||= env.LUMI_9ROUTER_URL; env.SW_9ROUTER_KEY ||= env.NINEROUTER_API_KEY; // config proyek Swanwright
  delete env.OPENCODE_CONFIG;
  return { finalCfg, env, skillNote };
}
