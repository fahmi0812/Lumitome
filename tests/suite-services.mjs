/** Service + engine + codemem + update UI + install.sh (P2-3: pecahan tests/suite.mjs).
 *  Dipindah verbatim dari monolith, tanpa mengubah isi tes.
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { ok, okEach, skip, finish } from "./harness.mjs";
import { frontmatter } from "../router/parse.mjs";

{
  // v0.3.3: managed service TUI tidak bentrok dengan `opencode serve --service` milik user (port 49374)
  const os = await import("node:os"), net = await import("node:net"), cp = await import("node:child_process");
  const SP = await import("../lumitome/lib/service-port.mjs");
  const dummy = net.createServer(); const held = await new Promise((r) => { dummy.once("error", () => r(false)); dummy.listen(SP.OPENCODE_DEFAULT_SERVICE_PORT, "127.0.0.1", () => r(true)); });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumisvc-")), cfgDir = path.join(home, "config"), stateHome = path.join(home, "state");
  fs.mkdirSync(cfgDir); fs.writeFileSync(path.join(cfgDir, "service.json"), JSON.stringify({ port: 49374, password: "pw-keep" }));
  const a = await SP.ensureServicePort({ home, cfgDir, stateHome, env: {} });
  const saved = JSON.parse(fs.readFileSync(a.file, "utf8"));
  ok("service: port Lumitome ≠ 49374, disimpan di LUMI_HOME/config/service.json (password dipertahankan, 0600)", a.port !== 49374 && saved.port === a.port && saved.password === "pw-keep" && (fs.statSync(a.file).mode & 0o777) === 0o600);
  const b = await SP.ensureServicePort({ home, cfgDir, stateHome, env: {} });
  ok("service: port stabil antar-jalan; deterministik per LUMI_HOME", b.port === a.port && !b.changed && SP.derivePort(home) === SP.derivePort(home + "/") && SP.derivePort(home) !== SP.derivePort(home + "x"));
  const blocker = net.createServer(); await new Promise((r) => blocker.listen(a.port, "127.0.0.1", r));
  const c = await SP.ensureServicePort({ home, cfgDir, stateHome, env: {} });
  fs.mkdirSync(path.join(stateHome, "opencode"), { recursive: true });
  fs.writeFileSync(path.join(stateHome, "opencode", "service.json"), JSON.stringify({ url: `http://127.0.0.1:${c.port}`, pid: process.pid }));
  const busyOwn = net.createServer(); await new Promise((r) => busyOwn.listen(c.port, "127.0.0.1", r));
  const d = await SP.ensureServicePort({ home, cfgDir, stateHome, env: {} });
  ok("service: port terpakai proses lain → pindah; dipakai service Lumitome sendiri → dipakai ulang", c.port !== a.port && c.port !== 49374 && d.port === c.port);
  blocker.close(); busyOwn.close();
  // integrasi dengan engine asli (bila ada): `lumitome service start` sukses walau 49374 dipakai
  const eng = process.env.LUMI_TEST_ENGINE || [path.join(os.homedir(), ".lumitome", "bin", "opencode")].find((f) => fs.existsSync(f));
  if (eng) {
    const lh = fs.mkdtempSync(path.join(os.tmpdir(), "lumisvc-e2e-"));
    const r = cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "lumitome/bin/lumitome.mjs", "service", "start"], { encoding: "utf8", timeout: 60000, cwd: process.cwd(),
      env: { ...process.env, LUMI_HOME: lh, LUMI_OPENCODE: eng, LUMI_WORKSPACE: lh, NINEROUTER_API_KEY: "" } });
    const port = JSON.parse(fs.readFileSync(path.join(lh, "config", "service.json"), "utf8")).port;
    ok(`service e2e: engine asli 'service start' exit 0 di port sendiri walau 49374 terpakai (held=${held})`, r.status === 0 && !/already in use/.test(r.stderr + r.stdout) && (r.stdout || "").includes(`:${port}`) && port !== 49374);
    fs.rmSync(lh, { recursive: true, force: true });
  } else skip("service e2e (set LUMI_TEST_ENGINE=/path/opencode)");
  if (held) dummy.close(); fs.rmSync(home, { recursive: true, force: true });
}

{
  // v0.3.5: Windows ESM - import() dinamis wajib file:// URL, bukan path mentah (C:\\...)
  const files = ["lumitome/bin/lumitome.mjs", "lumitome/bin/cli.mjs", "lumitome/config/plugins/lumitome-guard.ts"];
  const bad = files.filter((f) => /await import\((path\.join|env\.LUMI_HARNESS \|\|)/.test(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", f), "utf8")));
  ok("win: import() dinamis memakai pathToFileURL (tanpa ERR_UNSUPPORTED_ESM_URL_SCHEME)", bad.length === 0);
}

{
  // v0.3.3: paket npm & logika path Windows
  const EN = await import("../lumitome/lib/engine.mjs");
  const wh = EN.lumiHome({}, path.win32, "C:\\Users\\Fahmi");
  ok("npm/win: LUMI_HOME = %USERPROFILE%\\.lumitome; engine = bin\\opencode.exe", wh === "C:\\Users\\Fahmi\\.lumitome" && EN.engineBin(wh, "win32") === "C:\\Users\\Fahmi\\.lumitome\\bin\\opencode.exe");
  const w = EN.assetFor("2.4.2", "win32", "x64"), l = EN.assetFor("2.4.2", "linux", "x64"), m = EN.assetFor("2.4.2", "darwin", "arm64");
  ok("npm/engine: aset terpin + SHA256 per platform (win32-x64 zip, linux tar.gz, darwin zip)", EN.OC_VERSION === "2.4.2" && EN.LUMI_ENGINE_TAG === "engine-2.4.2-lumi.1" && w.name === "opencode-windows-x64.zip" && /^[0-9a-f]{64}$/.test(w.sha256) && l.name.endsWith(".tar.gz") && m.name.endsWith(".zip") && w.url.includes("/releases/download/engine-2.4.2-lumi.1/"));
  const wu = EN.assetFor("2.4.2", "win32", "x64", "upstream"), lu = EN.assetFor("2.4.2", "linux", "x64", "upstream");
  ok("npm/engine: LUMI_ENGINE=upstream → aset resmi anomalyco v2.4.2 dengan pin upstream", EN.engineFlavor({ LUMI_ENGINE: "upstream" }) === "upstream" && EN.engineFlavor({}) === "lumi" && wu.url.includes("anomalyco/opencode/releases/download/v2.4.2/") && lu.sha256 === "452912288f934d1771bd5bd0d8611ba3a6adc3db3ac3333c37facf373770ba66" && wu.sha256 !== w.sha256);
  const instSh = fs.readFileSync("install.sh", "utf8");
  ok("npm/engine: semua platform terpin punya build Lumitome + SHA256 (sinkron dengan install.sh)", Object.keys(EN.OC_PINS).every((k) => /^[0-9a-f]{64}$/.test(EN.LUMI_PINS[k]?.[1] || "") && /^[0-9a-f]{64}$/.test(EN.OC_PINS[k]?.[1] || "")) && ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"].every((k) => instSh.includes(EN.LUMI_PINS[k][1]) && instSh.includes(EN.OC_PINS[k][1])) && fs.existsSync("engine/patches/logo.patch"));
  ok("npm/engine: versi lain (upgrade-engine) tetap dari rilis resmi", EN.assetFor("2.4.0", "linux", "x64").url.includes("anomalyco/opencode/releases/download/v2.4.0/"));
  let bad = ""; await EN.installEngine({ home: fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "lumieng-")), log: () => {}, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("palsu").buffer }) }).catch((e) => { bad = e.message; });
  ok("npm/engine: unduhan dengan SHA256 salah ditolak", /SHA256 tidak cocok/.test(bad));
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  ok("npm: package publishable (tidak private), bin lumitome → cli.mjs (node, tanpa bash), postinstall", !pkg.private && pkg.bin.lumitome === "lumitome/bin/cli.mjs" && /postinstall\.mjs/.test(pkg.scripts.postinstall) && fs.readFileSync(pkg.bin.lumitome, "utf8").startsWith("#!/usr/bin/env node"));
  const Wsrc = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("win: wrapper tanpa /proc wajib, tanpa `sleep`/setpriv di Windows, sandbox off + guard tetap", Wsrc.includes("HAS_PROC") && !Wsrc.includes('execFileSync("sleep"') && Wsrc.includes('process.platform === "linux" && (() =>') && fs.readFileSync("lumitome/lib/build-config.mjs", "utf8").includes('env.LUMI_SANDBOX = "off"'));
}

{
  // v0.3.6: codemem global + auto-index + default MCP/agent
  const CM = await import("../lumitome/lib/codemem.mjs"); const osm = await import("node:os");
  ok("cbm: binary di LUMI_HOME/bin (.exe di Windows)", CM.cbmBin("C:\\Users\\F\\.lumitome", "win32") === "C:\\Users\\F\\.lumitome\\bin\\codebase-memory-mcp.exe" && CM.cbmBin("/h/.lumitome", "linux") === "/h/.lumitome/bin/codebase-memory-mcp");
  const keys = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64", "win32-arm64"];
  const inst = fs.readFileSync("install.sh", "utf8");
  ok("cbm: pin 6 platform + SHA256, versi sama dengan install.sh", keys.every((k) => /^[0-9a-f]{64}$/.test(CM.CBM_PINS[k][1])) && inst.includes(`CBM_VERSION=${CM.CBM_VERSION}`) && ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"].every((k) => inst.includes(CM.CBM_PINS[k][1])) && CM.cbmAsset("win32", "x64").name.endsWith("windows-amd64.zip"));
  let bad = ""; await CM.installCbm({ home: fs.mkdtempSync(path.join(osm.tmpdir(), "lumicbm-")), log: () => {}, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer }) }).catch((e) => { bad = e.message; });
  ok("cbm: SHA256 salah ditolak", /SHA256 tidak cocok/.test(bad));
  ok("cbm: MCP codemem = node + shim + path absolut binary; startup 15 s; null bila binary tidak ada", (() => { const d = CM.codememServer("/h", () => true, "/n/node"); return d.command[0] === "/n/node" && d.command[2].endsWith("codemem-mcp-shim.mjs") && d.command[3] === path.join("/h", "bin", process.platform === "win32" ? "codebase-memory-mcp.exe" : "codebase-memory-mcp") && d.timeout.startup === 15000; })() && CM.codememServer("/h", () => false) === null);
  const ex = (set) => (f) => set.some((m) => f.endsWith(m));
  const o = { home: "/home/u", platform: "linux", env: {} };
  ok("auto-index: lewati home/root/sistem/tanpa marker/LUMI_AUTO_INDEX=0", CM.autoIndexSkip("/home/u", { ...o, exists: () => true }) && CM.autoIndexSkip("/", { ...o, exists: () => true }) && CM.autoIndexSkip("/usr/lib", { ...o, exists: () => true }) && CM.autoIndexSkip("/home/u/x", { ...o, exists: () => false }) && CM.autoIndexSkip("/home/u/p", { ...o, env: { LUMI_AUTO_INDEX: "0" }, exists: () => true }));
  ok("auto-index: proyek dengan .git / package.json / go.mod → jalan", ["/.git", "/package.json", "/go.mod", "/Cargo.toml", "/pyproject.toml"].every((m) => CM.autoIndexSkip("/home/u/p", { ...o, exists: ex([m]) }) === null));
  ok("auto-index win: C:\\Windows & home dilewati", !!CM.autoIndexSkip("C:\\Windows\\System32", { home: "C:\\Users\\F", platform: "win32", env: {}, exists: () => true }) && !!CM.autoIndexSkip("c:\\users\\f", { home: "C:\\Users\\F", platform: "win32", env: {}, exists: () => true }));
  const W = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  const BC = fs.readFileSync("lumitome/lib/build-config.mjs", "utf8");
  ok("default MCP = codemem + skills (satu proses, semua sektor)", /DEFAULT_MCP = "codemem,skills"/.test(BC));
  ok("default agent = orchestrator (TUI), build (run headless); LUMI_AGENT menimpa", /default_agent: env\.LUMI_AGENT/.test(BC) && /RUN_AGENT = "build"/.test(BC) && /: "orchestrator" }/.test(BC) && /"default_agent": "orchestrator"/.test(fs.readFileSync("lumitome/config/opencode.jsonc", "utf8")));
  ok("tidak pernah menjalankan `codebase-memory-mcp install`", !/\["install"/.test(fs.readFileSync("lumitome/lib/codemem.mjs", "utf8") + W));
  const orch = fs.readFileSync(".opencode/agents/orchestrator.md", "utf8");
  ok("orchestrator: subagent allow (delegasi di auto mode); deskripsi agent tanpa 'Swanwright'", /action: subagent, resource: "\*", effect: allow/.test(orch) && !fs.readdirSync(".opencode/agents", { recursive: true }).filter((f) => f.endsWith(".md")).some((f) => /^description:.*Swanwright/m.test(fs.readFileSync(path.join(".opencode/agents", f), "utf8"))));
  const gr = (await import("node:child_process")).spawnSync(process.execPath, ["scripts/gen-registry.mjs", "--check"], { encoding: "utf8" });
  const regIds = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8")).skills.map((s) => s.id).sort();
  // Registry == folder aktif + folder pack non-cermin (cermin: <nama>-N dengan
  // swanwright_original_name = <nama> yang sudah ada). Tanpa hardcode jumlah:
  // cek dinamis di validate.mjs juga menegaskan hal yang sama.
  const fmField = (fm, k) => fm?.[k] ?? fm?.metadata?.[k];
  const actFolders = fs.readdirSync(".opencode/skills").filter((d) => fs.existsSync(path.join(".opencode/skills", d, "SKILL.md"))).sort();
  const expectedIds = [...actFolders];
  for (const p of fs.readdirSync("packs").sort()) { const sd = `packs/${p}/skills`; if (!fs.existsSync(sd)) continue;
    const names = fs.readdirSync(sd).filter((d) => fs.existsSync(path.join(sd, d, "SKILL.md"))).sort();
    const known = new Set([...actFolders, ...names]);
    for (const d of names) { const fm = frontmatter(fs.readFileSync(path.join(sd, d, "SKILL.md"), "utf8")) || {};
      const orig = fmField(fm, "swanwright_original_name"); const m = d.match(/^(.+)-(\d+)$/);
      if (!(orig && m && m[1] === orig && known.has(orig))) expectedIds.push(d); } }
  ok("registry == folder aktif+pack non-cermin; gen-registry --check bersih", gr.status === 0 && JSON.stringify(regIds) === JSON.stringify(expectedIds.sort()));
  const SDB = await import("../router/skill-db.mjs");
  // v0.3.82: 61 salinan duplikat (upstream sama dengan folder dasarnya, mis. impeccable-2..25, design-2)
  // dihapus. Cermin yang tersisa (upstream berbeda, mis. tdd-2 dari mattpocock vs tdd dari cursor) tetap
  // disimpan sebagai provenance, tetap tidak diindeks.
  const mirrorsLeft = fs.readdirSync("packs").flatMap((p) => { const f = `packs/${p}/registry.json`; return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).skills.filter((s) => s.mirror_of).map((s) => `${p}/${s.id}`) : []; });
  const indexed = new Set(SDB.collectSkills(".").map((x) => x.name));
  okEach("salinan cermin pack: duplikat dihapus; cermin tersisa tidak diindeks tapi foldernya ada", {
    "impeccable-N / design-2 sudah tidak ada": !fs.existsSync("packs/design-extra/skills/impeccable-2") && !fs.existsSync("packs/design-extra/skills/design-2"),
    "masih ada cermin yang tercatat": mirrorsLeft.length > 0,
    "cermin tersisa punya folder": mirrorsLeft.every((m) => fs.existsSync(`packs/${m.split("/")[0]}/skills/${m.split("/")[1]}/SKILL.md`)),
    "cermin tersisa tidak diindeks": mirrorsLeft.every((m) => !indexed.has(m.split("/")[1])),
  }, mirrorsLeft);
  const Wd = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8"), oc = fs.readFileSync("opencode.jsonc", "utf8");
  ok("drawio: skill aktif terpin SHA + MCP opsional (mati default, versi npx terpin, tidak ikut 'all')", fs.existsSync(".opencode/skills/drawio-diagram/SKILL.md") && /c9dc5f5cc62e7e5a327a62b39027d80033e1548c/.test(fs.readFileSync(".opencode/skills/drawio-diagram/SKILL.md", "utf8")) && /if \(wantMcp\.includes\("drawio"\)\)/.test(fs.readFileSync("lumitome/lib/build-config.mjs", "utf8")) && /"@next-ai-drawio\/mcp-server@0\.4\.15"\s*\],\s*"disabled": true/.test(oc));
  const BR = await import("../lumitome/lib/brand.mjs");
  const brandSvg = fs.readFileSync("assets/brand/logo.svg", "utf8") + fs.readFileSync("assets/brand/generate.py", "utf8");
  ok("brand: palet banner = hex brand kit assets/brand", BR.PALETTE.every((h) => brandSvg.includes(h)));
  ok("brand: NO_COLOR / non-TTY / TERM=dumb → polos tanpa ANSI", BR.colorMode({ NO_COLOR: "1", COLORTERM: "truecolor" }, true) === "none" && BR.colorMode({}, false) === "none" && BR.colorMode({ TERM: "dumb" }, true) === "none" && !/\x1b/.test(BR.banner({ mode: "none" })));
  ok("brand: truecolor (COLORTERM/WT_SESSION) & fallback 256", BR.colorMode({ COLORTERM: "truecolor" }, true) === "truecolor" && BR.colorMode({ WT_SESSION: "x" }, true) === "truecolor" && (process.platform === "win32" || BR.colorMode({ TERM: "xterm-256color" }, true) === "256") && /38;2;255;248;220/.test(BR.banner({ mode: "truecolor" })) && /38;5;\d+m/.test(BR.banner({ mode: "256" })) && !/38;2/.test(BR.banner({ mode: "256" })));
  ok("brand: banner tanpa warna background (aman terang/gelap)", !/\x1b\[(48|4\d)[;m]/.test(BR.banner({ mode: "truecolor" }) + BR.banner({ mode: "256" })));
  ok("brand: judul OSC 0 'Lumitome', karakter kontrol dibuang", BR.titleSeq() === "\x1b]0;Lumitome\x07" && BR.titleSeq("a\x07b") === "\x1b]0;ab\x07");
  const s1 = BR.seedCliConfig({}), s2 = BR.seedCliConfig({ theme: { name: "aura" }, terminal: { title: true }, x: 1 });
  ok("brand: cli.json tanpa seed theme (theme bawaan) + terminal.title:false; pilihan user dihormati", s1.changed && s1.config.theme === undefined && s1.config.terminal.title === false && !s2.changed && s2.config.theme.name === "aura" && s2.config.terminal.title === true);
  const s3 = BR.seedCliConfig({ theme: { name: "lumitome" }, terminal: { title: false } }, { migrated: false }), s4 = BR.seedCliConfig({ theme: { name: "lumitome" }, terminal: { title: false } }, { migrated: true });
  ok("brand: theme lumitome dari v0.3.7 dilepas sekali (hanya logo emas); dipilih lagi setelahnya → dihormati", s3.changed && s3.config.theme === undefined && !s4.changed && s4.config.theme.name === "lumitome");
  const TH = JSON.parse(fs.readFileSync("lumitome/config/themes/lumitome.json", "utf8"));
  const thKeys = ["primary", "text", "textMuted", "background", "border", "syntaxKeyword", "markdownHeading", "diffAdded"];
  ok("theme lumitome: varian dark+light, refs valid, emas brand", thKeys.every((k) => TH.theme[k]?.dark && TH.theme[k]?.light) && Object.values(TH.theme).every((v) => [v.dark, v.light].every((c) => /^#[0-9A-Fa-f]{6}$/.test(c) || c in TH.defs)) && TH.defs.champagne === "#F3D27A" && TH.defs.cornsilk === "#FFF8DC");
  ok("wrapper: themes ditautkan ke OPENCODE_CONFIG_DIR, cli.json di CFG_DIR (bukan ~/.config user), binary engine tidak disentuh", /themes: path\.join\(ROOT, "config", "themes"\)/.test(W) && /cliFile = path\.join\(CFG_DIR, "cli\.json"\)/.test(W) && !/writeFileSync\([^)]*ocBin/.test(W));
  {
    const v = fs.readFileSync("VERSION", "utf8").trim(); const RM = fs.readFileSync("README.md", "utf8");
    const vv = cp.execFileSync(process.execPath, ["lumitome/bin/lumitome.mjs", "--version"], { encoding: "utf8" });
    okEach("versi konsisten (single-source: VERSION)", {
      "VERSION x.y.z": /^\d+\.\d+\.\d+$/.test(v),
      "package.json == VERSION": JSON.parse(fs.readFileSync("package.json", "utf8")).version === v,
      "lumitome --version == VERSION": vv.includes(`lumitome ${v} `),
      "wrapper membaca file VERSION": W.includes('readFileSync(path.join(REPO, "VERSION")'),
      "wrapper tanpa VERSION hardcode": !/const VERSION = "\d+\.\d+\.\d+"/.test(W),
      "install.sh membaca VERSION": inst.includes('cat "$PROJECT/VERSION"'),
      "install.sh tanpa SW_VERSION hardcode": !/SW_VERSION=\d+\.\d+\.\d+/.test(inst),
      "README badge": RM.includes(`version-${v}`),
      "README tarball tag": RM.includes(`refs/tags/v${v}.tar.gz`),
    }, { VERSION: v, version_output: vv.trim() });
  }
  ok("README: Windows npm.ps1 blocked — troubleshooting (Set-ExecutionPolicy + npm.cmd + do-not-paste)", (() => { const RM = fs.readFileSync("README.md", "utf8"); return RM.includes("cannot be loaded because running scripts is disabled") && RM.includes("Set-ExecutionPolicy") && RM.includes("RemoteSigned") && RM.includes("CurrentUser") && RM.includes("npm.cmd install -g") && /do not paste the terminal's output/i.test(RM); })());
}

{
  // v0.3.13: latensi start — plugin tanpa import relatif literal, satu MCP skills, codemem via shim (git saja), service dipakai ulang
  const osm = await import("node:os"); const cp = await import("node:child_process"); const SD = await import("../router/skill-db.mjs");
  const G = fs.readFileSync("lumitome/config/plugins/lumitome-guard.ts", "utf8");
  ok("plugin guard: tanpa import relatif literal (engine tidak memantau folder induk rekursif); workspace = lokasi sesi", !/import\(\s*["'`]\.\.?\//.test(G) && !/["']\.\.\/\.\.\/\.\.\/harness/.test(G) && /ctx\?\.location\?\.directory/.test(G));
  const reqs = [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "penulisan_skill_search", arguments: { query: "laporan magang", k: 3 } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "skill_search", arguments: { query: "laporan magang" } } }];
  const o = cp.execFileSync(process.execPath, ["--no-warnings", "router/skill-search-mcp.mjs", "--sectors", "all"], { input: reqs.map((x) => JSON.stringify(x)).join("\n") + "\n" }).toString().trim().split("\n").map((l) => JSON.parse(l));
  const names = o.find((m) => m.id === 2).result.tools.map((t) => t.name);
  const pen = new Set(SD.sectorAllowlist(SD.collectSkills().filter((x) => x.status === "active")).penulisan);
  const r3 = o.find((m) => m.id === 3).result.structuredContent;
  ok("MCP skills (satu proses): 6 tool <sektor>_skill_search, read-only", names.sort().join() === ["coding", "finance", "media", "penulisan", "riset", "security"].map((x) => `${x}_skill_search`).sort().join() && o.find((m) => m.id === 2).result.tools.every((t) => t.annotations.readOnlyHint));
  ok("MCP skills: filter sektor tetap (penulisan → allowlist penulisan saja); nama tool lama ditolak di mode gabungan", r3.sector === "penulisan" && r3.results.length && r3.results.every((x) => pen.has(x.name)) && !!o.find((m) => m.id === 4).error);
  const sec = fs.readFileSync(".opencode/agents/sectors/security.md", "utf8");
  ok("policy agent sektor: allow skills_<sektor>_* saja; tanpa skills-<sektor>; offensive tetap ask", /"skills_security_\*", resource: "\*", effect: allow/.test(sec) && !/skills-security_/.test(sec) && /"skill", resource: "\*offensive\*", effect: ask/.test(sec) && !/skills_coding_/.test(sec));
  const W13 = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  const BC13 = fs.readFileSync("lumitome/lib/build-config.mjs", "utf8");
  ok("wrapper: MCP skills --sectors; nama lama skills-<sektor> di LUMI_MCP diterima", /mcpOverride\.skills = \{[^}]*"--sectors"/.test(BC13) && /wantMcp\.includes\(`skills-\$\{sec\}`\)/.test(BC13));
  ok("figcraft: terdaftar disabled + pin v0.18.1 (sektor media), opt-in eksplisit, bukan all, confinement = WS", (() => { const M = JSON.parse(fs.readFileSync("router/mcp-sectors.json", "utf8")); const OC = fs.readFileSync("opencode.jsonc", "utf8"); return M.servers.figcraft?.default === "disabled" && M.servers.figcraft?.pin === "v0.18.1" && M.sectors.media.includes("figcraft") && /"figcraft": \{\s*[^}]*"disabled": true/.test(OC) && /wantMcp\.includes\("figcraft"\)/.test(BC13) && !/wantMcp\.includes\("all"\)[^;]*figcraft/.test(BC13) && /--automation-read-root", WS, "--automation-write-root", WS/.test(BC13); })());
  // v0.3.60: MCP Blender (ahujasid/mcp-for-blender 2.2.9) — opt-in, mati default,
  // pin uvx ==, sektor media, execute_blender_code = ask (Python arbitrer).
  ok("blender: terdaftar disabled + pin 2.2.9 (sektor media), opt-in eksplisit, bukan all, safe mode OFF default", (() => { const M = JSON.parse(fs.readFileSync("router/mcp-sectors.json", "utf8")); const OC = fs.readFileSync("opencode.jsonc", "utf8"); return M.servers.blender?.default === "disabled" && M.servers.blender?.pin === "mcp-for-blender@2.2.9" && M.sectors.media.includes("blender") && (M.servers.blender?.ask || []).includes("execute_blender_code") && /"blender": \{\s*[^}]*"disabled": true/.test(OC) && /"uvx",\s*"mcp-for-blender==2\.2\.9"/.test(OC) && /wantMcp\.includes\("blender"\)/.test(BC13) && !/wantMcp\.includes\("all"\)[^;]*blender/.test(BC13) && /BLENDER_MCP_SAFE_MODE/.test(BC13); })());
  // v0.3.77: MCP PlatformIO (jl-codes/platformio-mcp 3.1.0) — opt-in, mati default,
  // pin npx 3.1.0, sektor coding, upload/flash-verify = ask.
  ok("platformio: terdaftar disabled + pin 3.1.0 (sektor coding), opt-in eksplisit, bukan all", (() => { const M = JSON.parse(fs.readFileSync("router/mcp-sectors.json", "utf8")); const OC = fs.readFileSync("opencode.jsonc", "utf8"); return M.servers.platformio?.default === "disabled" && M.servers.platformio?.pin === "platformio-mcp@3.1.0" && M.sectors.coding.includes("platformio") && (M.servers.platformio?.ask || []).includes("upload_*") && (M.servers.platformio?.ask || []).includes("agent_flash_monitor_verify") && (M.servers.platformio?.ask || []).includes("reset_server_state") && /"platformio": \{\s*[^}]*"disabled": true/.test(OC) && /"platformio-mcp@3\.1\.0",\s*"serve"/.test(OC) && /wantMcp\.includes\("platformio"\)/.test(BC13) && !/wantMcp\.includes\("all"\)[^;]*platformio/.test(BC13) && /"platformio-mcp@3\.1\.0",\s*"serve"/.test(BC13); })());
  // feat/tableau-mcp: MCP Tableau (tableau/tableau-mcp 6.0.4) — opt-in, mati default,
  // pin npx 6.0.4, sektor riset, publish/delete/update = ask (strip "-" dipertahankan engine 2.3.0).
  ok("tableau: terdaftar disabled + pin 6.0.4 (sektor riset), opt-in eksplisit, bukan all", (() => { const M = JSON.parse(fs.readFileSync("router/mcp-sectors.json", "utf8")); const OC = fs.readFileSync("opencode.jsonc", "utf8"); return M.servers.tableau?.default === "disabled" && M.servers.tableau?.pin === "@tableau/mcp-server@6.0.4" && M.sectors.riset.includes("tableau") && (M.servers.tableau?.ask || []).includes("publish-*") && (M.servers.tableau?.ask || []).includes("request-*-upload") && (M.servers.tableau?.ask || []).includes("delete-*") && (M.servers.tableau?.ask || []).includes("confirm-*") && (M.servers.tableau?.ask || []).includes("update-*") && (M.servers.tableau?.ask || []).includes("move-workbook") && (M.servers.tableau?.ask || []).includes("run-flow") && (M.servers.tableau?.ask || []).includes("revoke-access-token") && (M.servers.tableau?.ask || []).includes("scaffold-data-app") && /"tableau": \{\s*[^}]*"disabled": true/.test(OC) && /"@tableau\/mcp-server@6\.0\.4"/.test(OC) && /wantMcp\.includes\("tableau"\)/.test(BC13) && !/wantMcp\.includes\("all"\)[^;]*tableau/.test(BC13) && /"@tableau\/mcp-server@6\.0\.4"/.test(BC13); })());
  const CM13 = await import("../lumitome/lib/codemem.mjs");
  const ex = (set) => (f) => set.has(f);
  ok("gitRoot: POSIX naik ke induk berisi .git; tanpa .git → null", CM13.gitRoot("/home/u/repo/src/a", { exists: ex(new Set(["/home/u/repo/.git"])), p: path.posix }) === "/home/u/repo" && CM13.gitRoot("/home/u/x", { exists: () => false, p: path.posix }) === null);
  ok("gitRoot: path Windows (spasi, drive)", CM13.gitRoot("C:\\Users\\F\\LAB GITHUB\\p\\1", { exists: ex(new Set(["C:\\Users\\F\\LAB GITHUB\\p\\.git"])), p: path.win32 }) === "C:\\Users\\F\\LAB GITHUB\\p" && CM13.gitRoot("C:\\Users\\F\\x", { exists: () => false, p: path.win32 }) === null);
  const h = fs.mkdtempSync(path.join(osm.tmpdir(), "lumi13-")); fs.mkdirSync(path.join(h, "bin")); fs.writeFileSync(CM13.cbmBin(h), "");
  const ng = path.join(h, "proj"); fs.mkdirSync(ng); fs.writeFileSync(path.join(ng, "package.json"), "{}");
  ok("auto-index: proyek tanpa git dilewati", CM13.maybeAutoIndex({ home: h, dir: ng, env: {}, runner: "/x" }) === "skip:bukan repo git");
  const shimIn = [{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { jsonrpc: "2.0", id: 2, method: "tools/list" }].map((x) => JSON.stringify(x)).join("\n") + "\n";
  const t0 = Date.now();
  const so = cp.execFileSync(process.execPath, ["--no-warnings", CM13.SHIM, CM13.cbmBin(h)], { cwd: ng, input: shimIn, env: { ...process.env, LUMI_HOME: h } }).toString().trim().split("\n").map((l) => JSON.parse(l));
  ok("shim codemem: di luar git → MCP tanpa tool, cepat, binary tidak dijalankan", so.find((m) => m.id === 2).result.tools.length === 0 && Date.now() - t0 < 3000);
  if (process.platform !== "win32") {
    const fake = path.join(h, "bin", "fake-cbm"); fs.writeFileSync(fake, "#!/bin/sh\nread l\necho '{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"serverInfo\":{\"name\":\"fake-cbm\"}}}'\n"); fs.chmodSync(fake, 0o755);
    const gd = path.join(h, "repo", "sub"); fs.mkdirSync(path.join(h, "repo", ".git"), { recursive: true }); fs.mkdirSync(gd);
    const go = cp.execFileSync(process.execPath, ["--no-warnings", CM13.SHIM, fake], { cwd: gd, input: shimIn, env: { ...process.env, LUMI_HOME: h } }).toString();
    ok("shim codemem: di dalam repo git → binary dijalankan (stdio diteruskan)", go.includes("fake-cbm"));
  }
  const SC = await import("../lumitome/lib/service-ctl.mjs");
  ok("service-ctl: tanpa registrasi → tidak jalan; stop aman", !SC.status(h).running && SC.stop(h) === false);
  const svc = cp.spawn(process.execPath, ["-e", "require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{stdio:'ignore'});setInterval(()=>{},1e3)"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 400));
  fs.mkdirSync(path.join(h, "state", "opencode"), { recursive: true }); fs.writeFileSync(SC.regFile(h), JSON.stringify({ pid: svc.pid, url: "http://127.0.0.1:50001" }));
  const prot = SC.protectedPids(h);
  ok("service-ctl: status dari registrasi LUMI_HOME; PID service (+ turunan di Linux) dilindungi dari cleanup", SC.status(h).running && SC.status(h).pid === svc.pid && prot.has(svc.pid) && (process.platform !== "linux" || prot.size >= 2));
  fs.writeFileSync(SC.fpFile(h), JSON.stringify({ fp: "a" }));
  const r1 = SC.ensureFresh(h, "a"), r2 = SC.ensureFresh(h, "b");
  await new Promise((r) => setTimeout(r, 300));
  ok("service-ctl: ensureFresh reuse lalu restart; proses service mati", r1 === "reuse" && r2 === "restart" && !SC.alive(svc.pid) && [...prot].every((p) => !SC.alive(p)));
  ok("wrapper: cleanup & reaper melewati PID service; `service stop|status`; sidik config sebelum TUI", /keep\.has\(Number\(d\)\)/.test(W13) && /\(keep \?\?= keepPids\(\)\)\.has/.test(W13) && /argv\[1\] === "stop" \|\| argv\[1\] === "status"/.test(W13) && /ensureFresh\(HOME, fp\)/.test(W13));
  ok("wrapper: pesan timeout tidak memakai variabel `idle` yang sudah dihapus", !/\$\{idle\}/.test(W13));
  fs.rmSync(h, { recursive: true, force: true });
}

{
  // v0.3.23: buildFinalConfig — rakitan config bisa diuji tanpa engine
  const BC = await import("../lumitome/lib/build-config.mjs");
  const osm = await import("node:os");
  const mk = () => { const h = fs.mkdtempSync(path.join(osm.tmpdir(), "lumibcfg-")); const c = path.join(h, "config"); fs.mkdirSync(c, { recursive: true }); return { h, c }; };
  const base = { REPO: process.cwd(), ROOT: path.join(process.cwd(), "lumitome"), WS: process.cwd(), FRAG: { providers: {}, env: {} }, MODEL: null, HAS_9R_ENV: false, TIMEOUTS: { headerTimeout: 1, chunkTimeout: 2, timeout: 3 }, TRUST: false, argv: [], prompt: "" };
  const { h, c } = mk();
  const env = { LUMI_MCP: "skills", LUMI_ROUTER_L1: "0" };
  const r = await BC.buildFinalConfig({ env, ...base, HOME: h, CFG_DIR: c, JOURNAL: path.join(h, "j.jsonl"), RUN_ID: "t1", sub: "models" });
  ok("buildFinalConfig: update disable, orchestrator, 9router dimatikan tanpa provider, MCP skills saja, deny sudo/push/.env, env terisi", r.finalCfg.update === "disable" && r.finalCfg.default_agent === "orchestrator" && r.finalCfg.disabled_providers?.includes("9router") && r.finalCfg.mcp.servers.skills && !r.finalCfg.mcp.servers.codemem && r.finalCfg.permissions.some((p) => p.resource === "*sudo *") && r.finalCfg.permissions.some((p) => p.action === "read" && p.resource === "*.env") && JSON.parse(env.OPENCODE_CONFIG_CONTENT).update === "disable" && env.OPENCODE_DISABLE_PROJECT_CONFIG === "1" && env.LUMI_WORKSPACE === process.cwd() && r.skillNote === "");
  fs.rmSync(h, { recursive: true, force: true });
  // jalur run: router L0 (L1 mati) membatasi skill yang terlihat + skillNote terisi
  const { h: h2, c: c2 } = mk();
  const env2 = { LUMI_MCP: "skills", LUMI_ROUTER_L1: "0" };
  const r2 = await BC.buildFinalConfig({ env: env2, ...base, HOME: h2, CFG_DIR: c2, JOURNAL: path.join(h2, "j.jsonl"), RUN_ID: "t2", sub: "run", prompt: "buat REST API" });
  ok("buildFinalConfig run: skill router membatasi skill yang terlihat", r2.skillNote.startsWith("skills=") && r2.finalCfg.default_agent === "build" && r2.finalCfg.permissions.some((p) => p.action === "skill" && p.resource === "*" && p.effect === "deny") && r2.finalCfg.permissions.some((p) => p.action === "skill" && p.effect === "allow"));
  fs.rmSync(h2, { recursive: true, force: true });
  // v0.3.55: konsultasi MWG di Maker loopdesign/stitch-ui — npx hanya
  // di-allowlist spesifik untuk MWG, tidak pernah npx telanjang.
  const { h: h3, c: c3 } = mk();
  const env3 = { LUMI_MCP: "skills", LUMI_ROUTER_L1: "0" };
  const r3 = await BC.buildFinalConfig({ env: env3, ...base, HOME: h3, CFG_DIR: c3, JOURNAL: path.join(h3, "j.jsonl"), RUN_ID: "t3", sub: "run", prompt: "buat landing page" });
  ok("buildFinalConfig MWG: shell allow persis 'npx -y modern-web-guidance@latest *'; tanpa allow npx telanjang",
    r3.finalCfg.permissions.some((p) => p.action === "shell" && p.resource === "*npx -y modern-web-guidance@latest *" && p.effect === "allow") &&
    !r3.finalCfg.permissions.some((p) => p.action === "shell" && (p.resource === "*npx *" || p.resource === "npx *") && p.effect === "allow"));
  fs.rmSync(h3, { recursive: true, force: true });
  // v0.3.60: MCP Blender — opt-in eksplisit saja; tidak ikut "all" maupun default.
  const { h: h4, c: c4 } = mk();
  const env4 = { LUMI_MCP: "skills,blender", LUMI_ROUTER_L1: "0" };
  const r4 = await BC.buildFinalConfig({ env: env4, ...base, HOME: h4, CFG_DIR: c4, JOURNAL: path.join(h4, "j.jsonl"), RUN_ID: "t4", sub: "models" });
  ok("buildFinalConfig blender: LUMI_MCP=skills,blender → server uvx terpin + safe mode OFF default",
    JSON.stringify(r4.finalCfg.mcp.servers.blender?.command) === JSON.stringify(["uvx", "mcp-for-blender==2.2.9"]) && r4.finalCfg.mcp.servers.blender?.environment?.BLENDER_MCP_SAFE_MODE === "");
  fs.rmSync(h4, { recursive: true, force: true });
  const { h: h5, c: c5 } = mk();
  const env5 = { LUMI_MCP: "all", LUMI_ROUTER_L1: "0" };
  const r5 = await BC.buildFinalConfig({ env: env5, ...base, HOME: h5, CFG_DIR: c5, JOURNAL: path.join(h5, "j.jsonl"), RUN_ID: "t5", sub: "models" });
  ok("buildFinalConfig blender: LUMI_MCP=all → blender TIDAK ikut (opt-in eksplisit)", !r5.finalCfg.mcp.servers.blender);
  fs.rmSync(h5, { recursive: true, force: true });
  // v0.3.75: MCP Parallel — opt-in eksplisit saja; tidak ikut "all" maupun default; tanpa key = tanpa header (free tier).
  const { h: h6, c: c6 } = mk();
  const env6 = { LUMI_MCP: "skills,parallel", LUMI_ROUTER_L1: "0" };
  const r6 = await BC.buildFinalConfig({ env: env6, ...base, HOME: h6, CFG_DIR: c6, JOURNAL: path.join(h6, "j.jsonl"), RUN_ID: "t6", sub: "models" });
  ok("buildFinalConfig parallel: LUMI_MCP=skills,parallel tanpa key → server remote tanpa header",
    r6.finalCfg.mcp.servers.parallel?.type === "remote" && r6.finalCfg.mcp.servers.parallel?.url === "https://mcp.parallel.ai/mcp" && !r6.finalCfg.mcp.servers.parallel?.headers);
  fs.rmSync(h6, { recursive: true, force: true });
  const { h: h7, c: c7 } = mk();
  const env7 = { LUMI_MCP: "skills,parallel", PARALLEL_API_KEY: "pk-test-jangan-dipakai", LUMI_ROUTER_L1: "0" };
  const r7 = await BC.buildFinalConfig({ env: env7, ...base, HOME: h7, CFG_DIR: c7, JOURNAL: path.join(h7, "j.jsonl"), RUN_ID: "t7", sub: "models" });
  ok("buildFinalConfig parallel: dengan PARALLEL_API_KEY → header Bearer {env:PARALLEL_API_KEY} (nilai key tidak tertulis di config)",
    r7.finalCfg.mcp.servers.parallel?.headers?.Authorization === "Bearer {env:PARALLEL_API_KEY}" && !JSON.stringify(r7.finalCfg).includes("pk-test-jangan-dipakai"));
  fs.rmSync(h7, { recursive: true, force: true });
  const { h: h8, c: c8 } = mk();
  const env8 = { LUMI_MCP: "all", LUMI_ROUTER_L1: "0" };
  const r8 = await BC.buildFinalConfig({ env: env8, ...base, HOME: h8, CFG_DIR: c8, JOURNAL: path.join(h8, "j.jsonl"), RUN_ID: "t8", sub: "models" });
  ok("buildFinalConfig parallel: LUMI_MCP=all → parallel TIDAK ikut (opt-in eksplisit)", !r8.finalCfg.mcp.servers.parallel);
  fs.rmSync(h8, { recursive: true, force: true });
}

{
  // v0.3.25: startup bersih — banner sandbox diam (LUMI_VERBOSE=1 untuk tampil), baris status service engine disaring dari stderr TUI
  const QS = await import("../lumitome/lib/quiet-stderr.mjs");
  ok("quiet-stderr: baris service engine dibuang, baris lain lolos", (() => {
    const a = QS.filterStderr("Starting background server...\nengine hello\n", "");
    const b = QS.filterStderr("Restarting background server (version mismatch)...\n", "");
    return a.out === "engine hello\n" && a.rest === "" && b.out === "" && b.rest === "";
  })());
  ok("quiet-stderr: chunk terbelah di tengah baris tetap dibuang; baris tak lengkap ditahan", (() => {
    const a = QS.filterStderr("Starting back", "");
    const b = QS.filterStderr("ground server...\nlanjut\npar", a.rest);
    return a.out === "" && a.rest === "Starting back" && b.out === "lanjut\n" && b.rest === "par";
  })());
  ok("quiet-stderr: baris yang hanya mengandung teks (bukan sama persis) tetap lolos", QS.filterStderr("x Starting background server...\n", "").out === "x Starting background server...\n");
  const W25 = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("wrapper: banner sandbox hanya bila LUMI_VERBOSE=1; stderr TUI dipipe + disaring bila bukan verbose", /process\.stderr\.isTTY && env\.LUMI_VERBOSE === "1"\)/.test(W25) && /filterErr = sub === "" && env\.LUMI_VERBOSE !== "1"/.test(W25) && /filterErr \? \["inherit", "inherit", "pipe"\]/.test(W25) && /filterStderr\(redact\(b\.toString\(\)\), errBuf\)/.test(W25));
  // smoke test: engine tiruan mencetak baris service → default hilang, verbose muncul
  const osm = await import("node:os");
  const h25 = fs.mkdtempSync(path.join(osm.tmpdir(), "lumiquiet-"));
  const stub = path.join(h25, "fake-opencode");
  fs.writeFileSync(stub, "#!/usr/bin/env node\nprocess.stderr.write('Starting background server...\\n');\nprocess.stderr.write('Restarting background server (version mismatch)...\\n');\nprocess.stderr.write('engine hello\\n');\n");
  fs.chmodSync(stub, 0o755);
  const run25 = (extra) => cp.spawnSync(process.execPath, [path.resolve("lumitome/bin/lumitome.mjs")], { encoding: "utf8", timeout: 60000, cwd: h25,
    env: { ...process.env, HOME: h25, LUMI_HOME: h25, LUMI_OPENCODE: stub, LUMI_WORKSPACE: h25, LUMI_AUTO_INDEX: "0", NINEROUTER_API_KEY: "fake", ...extra } });
  const q1 = run25({});
  ok("quiet TUI: baris service engine hilang, output engine lain lolos (default)", q1.status === 0 && !/Starting background server/.test(q1.stderr) && !/Restarting background server/.test(q1.stderr) && /engine hello/.test(q1.stderr));
  const q2 = run25({ LUMI_VERBOSE: "1" });
  ok("quiet TUI: verbose → baris service engine muncul lagi (filter mati)", q2.status === 0 && /Starting background server/.test(q2.stderr));
  fs.rmSync(h25, { recursive: true, force: true });
}

{
  // v0.3.41 (P0-3): done-gate runtime — `lumitome run` tanpa perintah tes tidak boleh lolos diam-diam.
  // Stub opencode menulis baris jurnal ke $LUMI_JOURNAL (diteruskan build-config ke anak) lalu exit 0.
  const osm41 = await import("node:os");
  const h41 = fs.mkdtempSync(path.join(osm41.tmpdir(), "lumidg41-"));
  const stub41 = path.join(h41, "fake-opencode");
  const run41 = (rows, extra = {}) => {
    fs.writeFileSync(stub41, "#!/usr/bin/env node\nconst fs=require('node:fs');\nfor (const r of " + JSON.stringify(rows) + ") fs.appendFileSync(process.env.LUMI_JOURNAL, JSON.stringify(r)+'\\n');\n");
    fs.chmodSync(stub41, 0o755);
    return cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.resolve("lumitome/bin/lumitome.mjs"), "run", "tolong jelaskan x"],
      { encoding: "utf8", timeout: 60000, cwd: h41,
        env: { ...process.env, HOME: h41, LUMI_HOME: h41, LUMI_OPENCODE: stub41, LUMI_WORKSPACE: h41, LUMI_AUTO_INDEX: "0", LUMI_PREFLIGHT: "0", NINEROUTER_API_KEY: "fake", ...extra } });
  };
  const guardOk41 = { kind: "guard", status: "ok" };
  const r41a = run41([guardOk41]);
  ok("done-gate runtime: run tanpa tes + tanpa tulis -> exit 0 + DONE-GATE SKIP (tugas tanpa kode)",
    r41a.status === 0 && /DONE-GATE SKIP/.test(r41a.stderr));
  const r41b = run41([guardOk41, { kind: "tool", tool: "edit", status: "completed" }]);
  ok("done-gate runtime: run tanpa tes + file diubah -> exit 3 DONE-GATE FAIL",
    r41b.status === 3 && /DONE-GATE FAIL/.test(r41b.stderr));
  const r41c = run41([guardOk41, { kind: "shell", command: "npm test", exit: 0, status: "completed" }]);
  ok("done-gate runtime: run dengan tes hijau -> exit 0 DONE-GATE PASS",
    r41c.status === 0 && /DONE-GATE PASS/.test(r41c.stderr));
  const r41d = run41([guardOk41, { kind: "tool", tool: "edit", status: "completed" }], { LUMI_DONE_GATE: "off" });
  ok("done-gate runtime: LUMI_DONE_GATE=off -> tanpa tes + file diubah tetap exit 0",
    r41d.status === 0 && !/DONE-GATE FAIL/.test(r41d.stderr));
  fs.rmSync(h41, { recursive: true, force: true });
}

{
  // v0.3.14: tampilan update sederhana (spinner satu baris), non-TTY polos, ASCII, error singkat, mode npm
  const osm = await import("node:os");
  const UI = await import("../lumitome/lib/update-ui.mjs");
  const U = await import("../lumitome/lib/update.mjs");
  const sink = (tty = false) => { const o = { buf: "", isTTY: tty, write(s) { o.buf += s; return true; } }; return o; };
  const ESC = /\x1b\[/;
  const o1 = sink(); const u1 = UI.createUI({ out: o1, mode: { tty: false, color: false, ascii: false } });
  u1.logo(); u1.step("Memeriksa"); u1.step("Mengunduh"); u1.done("Selesai — v1.2.3");
  ok("update UI non-TTY: baris polos tanpa ANSI/animasi/logo", o1.buf === "Memeriksa…\nMengunduh…\nSelesai — v1.2.3\n" && !ESC.test(o1.buf));
  const o2 = sink(true); const u2 = UI.createUI({ out: o2, mode: { tty: true, color: true, ascii: false }, interval: 10 });
  u2.logo(); u2.step("Memasang"); await new Promise((r) => setTimeout(r, 60)); u2.done("Selesai — v1.2.3");
  const frames = o2.buf.split("\r\x1b[2K").filter((x) => /Memasang/.test(x));
  ok("update UI TTY: logo emas, spinner braille di satu baris (\\r), baris akhir ✓", o2.buf.includes("\x1b[38;2;201;150;46m█") && frames.length >= 3 && new Set(frames.map((f) => f.replace(/\x1b\[[0-9;?]*m/g, "")[0])).size >= 3 && /✓\x1b\[0m Selesai — v1\.2\.3\n/.test(o2.buf) && o2.buf.endsWith("\x1b[?25h"));
  ok("update UI: hanya logo & glyph berwarna (teks status warna default)", !/\x1b\[38;2;[0-9;]+mMemasang/.test(o2.buf) && !/\x1b\[38;2;[0-9;]+mSelesai/.test(o2.buf));
  ok("update UI ASCII: Windows non-UTF-8 / LUMI_ASCII=1 → glyph ASCII; WT/UTF-8 → Unicode", UI.uiMode({ env: {}, isTTY: true, platform: "win32", codepage: 437 }).ascii && UI.uiMode({ env: { LUMI_ASCII: "1" }, isTTY: true, platform: "linux" }).ascii && !UI.uiMode({ env: { WT_SESSION: "x" }, isTTY: true, platform: "win32", codepage: 437 }).ascii && !UI.uiMode({ env: {}, isTTY: true, platform: "win32", codepage: 65001 }).ascii);
  const o3 = sink(true); const u3 = UI.createUI({ out: o3, mode: { tty: true, color: false, ascii: true }, interval: 10 }); u3.logo(); u3.step("Mengunduh"); await new Promise((r) => setTimeout(r, 30)); u3.done("Selesai");
  ok("update UI ASCII: logo teks, spinner |/-\\, tanpa karakter Unicode", /L U M I T O M E/.test(o3.buf) && /[|/\\-] Mengunduh\.\.\./.test(o3.buf) && /OK Selesai/.test(o3.buf) && !/[^\x00-\x7f]/.test(o3.buf));
  ok("update UI: CI / TERM=dumb → tanpa animasi", !UI.uiMode({ env: { CI: "1" }, isTTY: true }).tty && !UI.uiMode({ env: { TERM: "dumb" }, isTTY: true }).tty);
  const home = fs.mkdtempSync(path.join(osm.tmpdir(), "lumiupd-")); const repo = path.join(home, "src"); fs.mkdirSync(repo);
  const o4 = sink(); const e4 = new Error("fatal: unable to access 'x': Could not resolve host"); e4.detail = "fatal: unable to access 'x': Could not resolve host";
  const r4 = await U.update({ argv: ["--check"], version: "0.3.14", repo, home, env: { LUMI_INSTALL: "npm" }, out: o4, tagsImpl: async () => { throw e4; } });
  ok("update error: satu baris manusiawi + saran, detail teknis tidak di layar tapi di logs/update.log", r4 === 1 && o4.buf === "Memeriksa…\nTidak bisa memeriksa versi terbaru.\nCek koneksi internet, lalu coba lagi.\n" && fs.readFileSync(path.join(home, "logs", "update.log"), "utf8").includes("Could not resolve host"));
  const o5 = sink(); await U.update({ argv: ["--check", "--verbose"], version: "0.3.14", repo, home, env: { LUMI_INSTALL: "npm" }, out: o5, tagsImpl: async () => { throw e4; } });
  ok("update error --verbose: detail ikut tampil", o5.buf.includes("Could not resolve host"));
  ok("update npm-mode: tanpa .git + LUMI_INSTALL=npm / di node_modules → npm; ada .git → git", U.isNpmInstall(repo, { LUMI_INSTALL: "npm" }) && U.isNpmInstall(path.join("C:", "x", "node_modules", "lumitome"), {}, () => false) && !U.isNpmInstall(repo, {}) && !U.isNpmInstall("/r", { LUMI_INSTALL: "npm" }, (f) => f.endsWith(".git")));
  const calls = []; const o6 = sink();
  const r6 = await U.update({ argv: ["--yes"], version: "0.3.14", repo, home, env: { LUMI_INSTALL: "npm" }, out: o6, tagsImpl: async () => [{ tag: "v0.3.15", sha: "a" }], runImpl: async (cmd, args, o) => { calls.push([cmd, ...args]); o.log("npm WARN deprecated noise"); return ""; } });
  ok("update npm-mode: npm install -g tarball tag, noise npm hanya di log, satu baris hasil", r6 === 0 && calls.length === 1 && calls[0][0] === "npm" && calls[0].includes("-g") && calls[0].includes(U.TARBALL("v0.3.15")) && o6.buf.trim().split("\n").pop() === "Selesai — v0.3.15" && !o6.buf.includes("npm WARN") && fs.readFileSync(path.join(home, "logs", "update.log"), "utf8").includes("npm WARN deprecated noise"));
  const o7 = sink(); const r7 = await U.update({ argv: [], version: "0.3.15", repo, home, env: { LUMI_INSTALL: "npm" }, out: o7, tagsImpl: async () => [{ tag: "v0.3.15", sha: "a" }] });
  ok("update: sudah terbaru → satu baris tenang", r7 === 0 && o7.buf.trim().split("\n").pop() === "Sudah versi terbaru — v0.3.15");
  const o8 = sink(); const r8 = await U.update({ argv: [], version: "0.3.14", repo, home, env: { LUMI_INSTALL: "npm" }, out: o8, tagsImpl: async () => [{ tag: "v0.3.15", sha: "a" }] });
  ok("update non-TTY tanpa --yes: berhenti dengan saran --yes", r8 === 1 && o8.buf.includes("lumitome update --yes"));
  // v0.3.39: update tanpa git — fallback GitHub API (port pola 0DayExploit v0.9.2).
  // TDD (mattpocock): tes ini ditulis SEBELUM fix — harus MERAH dulu.
  const gitEnoent = () => Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT", detail: "spawn git ENOENT" });
  const runNoGit = (calls) => async (cmd, args, o) => { calls.push([cmd, ...args]); if (cmd === "git") throw gitEnoent(); o?.log?.(`$ ${cmd} ${args.join(" ")}`); return ""; };
  const releasesLatest = (tag, seen) => async (url) => { seen.push(url); if (!/api\.github\.com\/repos\/fahmi0812\/Lumitome\/releases\/latest/.test(url)) throw new Error(`URL API salah: ${url}`); return { ok: true, status: 200, json: async () => ({ tag_name: tag }) }; };
  const home39 = fs.mkdtempSync(path.join(osm.tmpdir(), "lumiupd39-")); const repo39 = path.join(home39, "src"); fs.mkdirSync(repo39);
  const calls39 = []; const o9 = sink();
  const r9 = await U.update({ argv: ["--yes"], version: "0.3.38", repo: repo39, home: home39, env: { LUMI_INSTALL: "npm" }, out: o9, runImpl: runNoGit(calls39), fetchImpl: releasesLatest("v0.3.39", []) });
  ok("update npm-mode tanpa git: fallback GitHub API, update jalan", r9 === 0 && calls39.filter((c) => c[0] === "git").length === 1 && calls39.find((c) => c[0] === "npm")?.includes(U.TARBALL("v0.3.39")) && o9.buf.trim().split("\n").pop() === "Selesai — v0.3.39");
  const o10 = sink();
  const r10 = await U.update({ argv: ["--check"], version: "0.3.38", repo: repo39, home: home39, env: { LUMI_INSTALL: "npm" }, out: o10, runImpl: runNoGit([]), fetchImpl: async () => { throw new Error("fetch failed"); } });
  ok("update npm-mode tanpa git + API mati: pesan menyebut git, bukan internet", r10 === 1 && /git tidak ditemukan/i.test(o10.buf) && /npm install -g/.test(o10.buf) && !/Cek koneksi internet/.test(o10.buf));
  const seen11 = []; const o11 = sink();
  const r11 = await U.update({ argv: ["--check"], version: "0.3.38", repo: repo39, home: home39, env: {}, out: o11, runImpl: runNoGit([]), fetchImpl: releasesLatest("v0.3.39", seen11) });
  ok("update git-mode tanpa git: gagal jelas, tanpa fallback API", r11 === 1 && /git tidak ditemukan/i.test(o11.buf) && /Git for Windows/i.test(o11.buf) && seen11.length === 0);
  ok("update: parseRepoSlug https/git@/ssh + null non-GitHub", typeof U.parseRepoSlug === "function" && U.parseRepoSlug("https://github.com/fahmi0812/Lumitome.git") === "fahmi0812/Lumitome" && U.parseRepoSlug("https://github.com/fahmi0812/Lumitome") === "fahmi0812/Lumitome" && U.parseRepoSlug("git@github.com:fahmi0812/Lumitome.git") === "fahmi0812/Lumitome" && U.parseRepoSlug("ssh://git@github.com/fahmi0812/Lumitome.git") === "fahmi0812/Lumitome" && U.parseRepoSlug("https://example.com/x/y.git") === null);
  fs.rmSync(home39, { recursive: true, force: true });
  const UPD = fs.readFileSync("lumitome/lib/update.mjs", "utf8");
  ok("update: setelah pasang → migrasi config + stop service LUMI_HOME; engine tidak disentuh", /migrateConfigFile/.test(UPD) && /S\.stop\(home\)/.test(UPD) && !/bin[\\/"', ]+opencode/.test(UPD.replace(/^\s*\*.*$/gm, "")));
  // v0.3.71 (A1b): update mode npm mengganti SELURUH direktori paket —
  // preset repo lama harus selamat ke file user (bukan ikut terhapus).
  {
    const home71 = fs.mkdtempSync(path.join(osm.tmpdir(), "lumiupd71-"));
    const repo71 = path.join(home71, "src"); fs.mkdirSync(path.join(repo71, ".opencode"), { recursive: true });
    const custom = { enabled: true, mode: "serial", roles: {
      thinking: { active: true, model: "9router/kr/claude-opus-5.5", tier: "terkuat" },
      search: { active: true, model: "9router/ag/gemini-3.8-flash", tier: "cepat-murah" },
      builder: { active: true, model: "9router/kr/claude-sonnet-5.5", tier: "menengah-kuat" },
      reviewer: { active: true, model: "9router/kr/claude-opus-5.5", tier: "terkuat" } } };
    fs.writeFileSync(path.join(repo71, ".opencode", "lumitome-subagent.json"), JSON.stringify(custom, null, 2) + "\n");
    const o71 = sink();
    const r71 = await U.update({ argv: ["--yes"], version: "0.3.70", repo: repo71, home: home71, env: { LUMI_INSTALL: "npm" }, out: o71,
      tagsImpl: async () => [{ tag: "v0.3.71", sha: "b" }],
      runImpl: async (cmd, args, o) => { o.log(`$ ${cmd} ${args.join(" ")}`); return ""; } });
    ok("update npm-mode v0.3.71 (A1b): preset repo lama selamat ke file user",
      r71 === 0 && JSON.parse(fs.readFileSync(path.join(home71, "lumitome-subagent.json"), "utf8")).roles.thinking.model === "9router/kr/claude-opus-5.5");
    fs.rmSync(home71, { recursive: true, force: true });
  }
  fs.rmSync(home, { recursive: true, force: true });
}

// ---------- v0.3.30: install.sh tenang — spinner bash, baris polos non-TTY, log file ----------
{
  const osm = await import("node:os");
  const INST = fs.readFileSync("install.sh", "utf8");
  const BASH = "/bin/bash";
  ok("install tenang: 7 langkah berlabel manusiawi + log install.log, tanpa 'N/7' teknis di layar",
    ["Menyiapkan mesin", "Menyiapkan Node", "Menyiapkan codebase-memory", "Menyiapkan uv", "Menyiapkan env", "Menyiapkan proyek", "Menyiapkan launcher"].every((s) => INST.includes(s))
    && INST.includes("logs/install.log") && !/say "1\/7/.test(INST) && !/say "7\/7/.test(INST));
  ok("install tenang: spinner bash murni (braille + ASCII), logo emas dua warna, non-TTY tanpa ANSI",
    INST.includes("⠋") && INST.includes("L U M I") && INST.includes("38;2;%s;%s;%sm") && INST.includes("_gold 201 150 46") && INST.includes("_gold 243 210 122")
    && INST.includes("TERM") && INST.includes('"dumb"') && INST.includes("CI") && INST.includes("_spin_stop"));
  ok("install.sh: bash -n lolos", cp.spawnSync(BASH, ["-n", "install.sh"], { encoding: "utf8" }).status === 0);
  const ESC = /\x1b\[/;
  const sb = fs.mkdtempSync(path.join(osm.tmpdir(), "lumiinst-"));
  fs.mkdirSync(path.join(sb, "tmp"), { recursive: true });
  const runInst = (args, env = {}) => cp.spawnSync(BASH, ["install.sh", ...args], { encoding: "utf8", timeout: 120000, env: { ...process.env, TMPDIR: path.join(sb, "tmp"), ...env } });
  const mkHome = (name) => { const h = path.join(sb, name); fs.mkdirSync(h, { recursive: true }); return h; };
  // (1) --uninstall non-TTY: satu baris hasil, tanpa ANSI/spinner; sentinel user utuh
  const h1 = mkHome("h1");
  fs.mkdirSync(path.join(h1, ".lumitome"), { recursive: true }); fs.writeFileSync(path.join(h1, ".lumitome", ".lumitome-home"), "");
  fs.mkdirSync(path.join(h1, ".local", "bin"), { recursive: true });
  fs.writeFileSync(path.join(h1, ".local", "bin", "lumitome"), "#!/usr/bin/env bash\n# LUMITOME-LAUNCHER\n");
  fs.writeFileSync(path.join(h1, "keep.txt"), "sentinel");
  const u1 = runInst(["--uninstall"], { HOME: h1, LUMI_HOME: path.join(h1, ".lumitome") });
  const u1out = u1.stdout + u1.stderr;
  ok("install --uninstall non-TTY: 'Selesai', tanpa ANSI/spinner, launcher + home terhapus, sentinel utuh",
    u1.status === 0 && /Selesai/.test(u1out) && !ESC.test(u1out) && !/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(u1out)
    && !fs.existsSync(path.join(h1, ".local", "bin", "lumitome")) && !fs.existsSync(path.join(h1, ".lumitome")) && fs.existsSync(path.join(h1, "keep.txt")));
  // (1b) uninstall tidak menyentuh home tanpa marker / launcher bukan milik lumitome
  const h2 = mkHome("h2");
  fs.mkdirSync(path.join(h2, ".lumitome"), { recursive: true }); fs.writeFileSync(path.join(h2, ".lumitome", "punya-user.txt"), "jangan hapus");
  fs.mkdirSync(path.join(h2, ".local", "bin"), { recursive: true });
  fs.writeFileSync(path.join(h2, ".local", "bin", "lumitome"), "#!/usr/bin/env bash\n# bukan launcher lumitome\n");
  const u2 = runInst(["--uninstall"], { HOME: h2, LUMI_HOME: path.join(h2, ".lumitome"), LUMI_FORCE_HOME: "1" });
  ok("install --uninstall: home tanpa marker + launcher asing dibiarkan",
    u2.status === 0 && /Selesai/.test(u2.stdout + u2.stderr) && fs.existsSync(path.join(h2, ".lumitome", "punya-user.txt")) && fs.existsSync(path.join(h2, ".local", "bin", "lumitome")));
  // (2) --dry-run tetap mencetak perintah, tanpa ANSI
  const h3 = mkHome("h3");
  const d1 = runInst(["--dry-run"], { HOME: h3, LUMI_HOME: path.join(h3, ".lumitome") });
  const d1out = d1.stdout + d1.stderr;
  ok("install --dry-run: mencetak perintah (dry-run), tanpa ANSI, exit 0",
    d1.status === 0 && /\(dry-run\)/.test(d1out) && /npm ci/.test(d1out) && !ESC.test(d1out));
  // (4) red-test: curl hilang (PATH tanpa curl) → FAIL + path log, tanpa sisa escape
  const h4 = mkHome("h4");
  const binNoCurl = path.join(sb, "bin");
  fs.mkdirSync(binNoCurl);
  for (const d of ["/usr/bin", "/bin"]) { try { for (const f of fs.readdirSync(d)) { if (f === "curl") continue; const t = path.join(binNoCurl, f); try { fs.symlinkSync(path.join(d, f), t); } catch {} } } catch {} }
  const r1 = runInst([], { HOME: h4, LUMI_HOME: path.join(h4, ".lumitome"), PATH: binNoCurl });
  const r1out = r1.stdout + r1.stderr;
  const logHit = /Log: ([^\n]*install\.log)/.exec(r1out);
  ok("install red-test: curl hilang → exit != 0, FAIL + 'butuh curl' + path log, tanpa escape",
    r1.status !== 0 && /FAIL/.test(r1out) && /butuh 'curl'/.test(r1out) && !!logHit && !ESC.test(r1out)
    && fs.existsSync(logHit[1]) && fs.readFileSync(logHit[1], "utf8").includes("butuh 'curl'"));
  fs.rmSync(sb, { recursive: true, force: true });
}

// ---------- v0.3.31: install.sh tar --no-same-owner + guard (5 titik sejak v0.3.45: + fallback tarball) ----------
{
  const INST31 = fs.readFileSync("install.sh", "utf8");
  const tarLines = INST31.split("\n").filter((l) => l.includes("tar ") && l.includes("-xzf"));
  ok("install tar: --no-same-owner di SEMUA 5 titik ekstraksi + guard (|| die, atau run yang sudah die)",
    tarLines.length === 5 && tarLines.every((l) => l.includes("tar --no-same-owner")) &&
    tarLines.every((l) => l.includes("|| die") || l.includes("run tar")));
}

{
  // v0.3.66: `lumitome upgrade` — cara gampang naikkan engine (tanpa versi/hash).
  // Tanpa argumen: naik ke versi terpin (OC_VERSION) dengan SHA256 terpin di
  // engine.mjs (= install.sh); checksum tetap diverifikasi installEngine.
  // `upgrade-engine <versi> --sha256 ...` tetap jalan manual/lanjutan.
  const EN = await import("../lumitome/lib/engine.mjs");
  const osm = await import("node:os");
  const PIN_LINUX_X64 = "7c9f9ac6c3ad45928c0d9eae019a160cc66a29446044e572dc081285700d6a8c";
  const a = EN.assetFor(EN.OC_VERSION, "linux", "x64");
  ok("upgrade: versi terpin 2.4.2 + SHA256 linux-x64 = pin install.sh (build Lumitome)",
    EN.OC_VERSION === "2.4.2" && EN.LUMI_ENGINE_TAG === "engine-2.4.2-lumi.1" && a.sha256 === PIN_LINUX_X64 && a.url.includes("/releases/download/engine-2.4.2-lumi.1/")
    && fs.readFileSync("install.sh", "utf8").includes(PIN_LINUX_X64));
  let bad = "";
  await EN.installEngine({ home: fs.mkdtempSync(path.join(osm.tmpdir(), "lumiupg-")), log: () => {}, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("palsu").buffer }) }).catch((e) => { bad = e.message; });
  ok("upgrade: installEngine jalur terpin (tanpa sha argumen — persis yang dipakai `lumitome upgrade`) menolak SHA256 salah",
    /SHA256 tidak cocok/.test(bad));
  const W = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("upgrade: wrapper TIDAK lagi memblokir subcommand `upgrade` (hanya `uninstall` yang diblokir); blok `engine` menangani upgrade",
    /if \(sub === "uninstall"\) die\(2/.test(W) && !/sub === "upgrade" \|\| sub === "uninstall"/.test(W)
    && /sub === "engine" \|\| sub === "upgrade-engine" \|\| sub === "upgrade"/.test(W));
  ok("upgrade: `lumitome upgrade` tanpa argumen = versi terpin + SHA terpin + keluar bila sudah terbaru; usage upgrade-engine menyebut jalan gampang; penanda build (.flavor) ikut ke bin/",
    /if \(sub === "upgrade"\) \{/.test(W) && /v = EN\.OC_VERSION/.test(W) && /EN\.assetFor\(v, process\.platform, process\.arch\)/.test(W)
    && /engine sudah versi terbaru/.test(W) && /lumitome upgrade \(cara gampang\)/.test(W)
    && /fs\.copyFileSync\(EN\.flavorFile\(dst\), EN\.flavorFile\(cur\)\)/.test(W));
  // Tes CLI (offline, tanpa unduhan): engine tiruan di LUMI_HOME temp.
  const mkFake = (ver) => {
    const h = fs.mkdtempSync(path.join(osm.tmpdir(), "lumiupg-cli-"));
    fs.mkdirSync(path.join(h, "bin"), { recursive: true });
    const bin = path.join(h, "bin", "opencode");
    fs.writeFileSync(bin, `#!/usr/bin/env node\nif (process.argv.includes("--version")) console.log("opencode v${ver}");\n`);
    fs.chmodSync(bin, 0o755);
    return h;
  };
  const runCli = (home, args, input) => cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.resolve("lumitome/bin/lumitome.mjs"), ...args],
    { encoding: "utf8", timeout: 60000, cwd: home, input, env: { ...process.env, HOME: home, LUMI_HOME: home, SW_HOME: home, LUMI_WORKSPACE: home, LUMI_AUTO_INDEX: "0", NINEROUTER_API_KEY: "" } });
  const hCur = mkFake("2.4.2");
  const rCur = runCli(hCur, ["upgrade"]);
  ok("upgrade CLI: engine sudah 2.4.2 → exit 0, satu baris 'sudah versi terbaru', tanpa unduhan",
    rCur.status === 0 && /engine sudah versi terbaru — v2\.4\.2/.test(rCur.stdout) && !/mengunduh/.test(rCur.stderr + rCur.stdout));
  fs.rmSync(hCur, { recursive: true, force: true });
  const hOld = mkFake("2.3.0");
  const rNo = runCli(hOld, ["upgrade"], "tidak\n");
  ok("upgrade CLI: engine 2.3.0 tanpa --yes + jawab bukan 'ya' → prompt konfirmasi → dibatalkan (exit 1), engine lama dipertahankan, tanpa unduhan",
    rNo.status === 1 && /Ganti engine opencode v2\.3\.0 → v2\.4\.2/.test(rNo.stderr) && /dibatalkan/.test(rNo.stderr + rNo.stdout));
  const rArg = runCli(hOld, ["upgrade", "2.4.2"]);
  ok("upgrade CLI: argumen posisi ditolak (exit 2, usage 'lumitome upgrade [--yes]')",
    rArg.status === 2 && /pakai: lumitome upgrade \[--yes\]/.test(rArg.stderr + rArg.stdout));
  const rUe = runCli(hOld, ["upgrade-engine"]);
  ok("upgrade-engine CLI: tanpa argumen tetap exit 2 + usage menyebut jalan gampang `lumitome upgrade`",
    rUe.status === 2 && /lumitome upgrade \(cara gampang\)/.test(rUe.stderr + rUe.stdout));
  fs.rmSync(hOld, { recursive: true, force: true });
}

// ---------- Wave 1 (T1.1 / T1.3 / T1.4 / T1.6): engineAtLeast, schema 2.3.0 vs 2.4.2, policies, pre-scan, plugins readiness ----------
{
  const EN = await import("../lumitome/lib/engine.mjs");
  const BC = await import("../lumitome/lib/build-config.mjs");
  const SC = await import("../lumitome/lib/service-ctl.mjs");
  const osm = await import("node:os");
  const { createRequire } = await import("node:module");
  const Ajv2020 = createRequire(import.meta.url)("ajv/dist/2020").default;
  const compileSchema = (schemaPath) => {
    const a = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
    for (const f of fs.readdirSync("scripts/schema")) {
      if (!f.endsWith(".json") || f === "opencode-config.schema.json") continue;
      const s = JSON.parse(fs.readFileSync(path.join("scripts/schema", f), "utf8"));
      if (s.$id) a.addSchema(s);
    }
    return a.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
  };
  const val23 = compileSchema("tests/fixtures/opencode-config-2.3.0.schema.json");
  const val24 = compileSchema("scripts/schema/opencode-config.schema.json");

  ok("T1.1 engineAtLeast: perbandingan semver numerik (2.10.0 >= 2.4.2, 2.4.2 >= 2.4.2, 2.3.0 < 2.4.2)",
    EN.ENGINE_MIN_2_4 === "2.4.2"
    && EN.engineAtLeast("2.10.0", EN.ENGINE_MIN_2_4) === true
    && EN.engineAtLeast("2.4.2", EN.ENGINE_MIN_2_4) === true
    && EN.engineAtLeast("2.3.0", EN.ENGINE_MIN_2_4) === false
    && EN.engineAtLeast("invalid", EN.ENGINE_MIN_2_4) === false);

  ok("T1.1 resolveEngineVersion & T1.4 resolveEngineBin: prioritas LUMI_ENGINE_VERSION > installedVersion > OC_VERSION",
    EN.resolveEngineVersion({}) === EN.OC_VERSION
    && EN.resolveEngineVersion({}, { installedVersion: "2.3.0" }) === "2.3.0"
    && EN.resolveEngineVersion({ LUMI_ENGINE_VERSION: "2.4.2" }, { installedVersion: "2.3.0" }) === "2.4.2"
    && EN.resolveEngineVersion({ LUMI_ENGINE_VERSION: "2.4.2" }) === "2.4.2"
    && EN.resolveEngineBin({ env: { LUMI_ENGINE_BIN: "/custom/oc", LUMI_OPENCODE: "/old/oc" }, exists: () => false }) === "/custom/oc"
    && EN.resolveEngineBin({ env: { LUMI_OPENCODE: "/old/oc" }, exists: () => false }) === "/old/oc");

  const ws11 = fs.mkdtempSync(path.join(osm.tmpdir(), "lumi-t11-"));
  const home11 = path.join(ws11, "home");
  fs.mkdirSync(home11, { recursive: true });
  // Deteksi cepat versi engine terpasang: flavor bertag tanpa spawn vs fallback --version
  const detBin = path.join(ws11, "fake-det-oc");
  fs.writeFileSync(detBin, "#!/usr/bin/env node\nconsole.log('opencode v2.3.0');\n");
  fs.chmodSync(detBin, 0o755);
  fs.writeFileSync(EN.flavorFile(detBin), "engine-2.4.2-lumi.1\n");
  const detTagged = EN.detectInstalledEngineVersion({ bin: detBin, env: {} });
  fs.writeFileSync(EN.flavorFile(detBin), "upstream\n");
  const detUpstream = EN.detectInstalledEngineVersion({ bin: detBin, env: {} });
  const detMissing = EN.detectInstalledEngineVersion({ bin: path.join(ws11, "missing-oc"), env: {} });
  ok("transisi aman: detectInstalledEngineVersion baca .flavor bertag tanpa spawn; fallback --version untuk upstream; null bila tidak ada",
    detTagged === "2.4.2" && detUpstream === "2.3.0" && detMissing === null);

  const baseArgs = {
    REPO: process.cwd(),
    ROOT: path.resolve("lumitome"),
    HOME: home11,
    WS: ws11,
    CFG_DIR: path.join(home11, "config"),
    JOURNAL: path.join(home11, "run.jsonl"),
    RUN_ID: "run-t11",
    FRAG: { providers: {}, env: {} },
    MODEL: "9router/ag/gemini-3.8-flash-high",
    HAS_9R_ENV: true,
    TIMEOUTS: { headerTimeout: 300000, chunkTimeout: 900000, timeout: 3600000 },
    TRUST: false,
  };

  // Mode 2.3.0: tanpa field khusus 2.4.2, lolos schema 2.3.0 & 2.4.2
  const r23 = await BC.buildFinalConfig({ ...baseArgs, env: { LUMI_ENGINE_VERSION: "2.3.0" }, sub: "run", prompt: "" });
  const r23Inst = await BC.buildFinalConfig({ ...baseArgs, env: {}, installedEngineVersion: "2.3.0", sub: "run", prompt: "" });
  ok("T1.1 mode 2.3.0 & transisi aman: installedEngineVersion=2.3.0 tanpa key 2.4.2, valid terhadap fixture schema 2.3.0 dan schema 2.4.2",
    r23.finalCfg.compaction.background === undefined
    && r23.finalCfg.experimental.full_codemode === undefined
    && r23.finalCfg.experimental.opencode_api === undefined
    && r23.finalCfg.experimental.part_rows === undefined
    && r23.finalCfg.experimental.subagent_depth === 1
    && Array.isArray(r23.finalCfg.policies) && r23.finalCfg.policies.length > 0
    && val23(r23.finalCfg) === true && val24(r23.finalCfg) === true
    && r23Inst.finalCfg.compaction.background === undefined
    && r23Inst.finalCfg.experimental.full_codemode === undefined
    && r23Inst.finalCfg.experimental.opencode_api === undefined
    && r23Inst.finalCfg.experimental.part_rows === undefined
    && val23(r23Inst.finalCfg) === true && val24(r23Inst.finalCfg) === true);

  // Mode 2.4.2 TUI dengan LUMI_COMPACTION_BACKGROUND=1 vs headless run (plus default OC_VERSION=2.4.2 tanpa installedEngineVersion)
  const r24Tui = await BC.buildFinalConfig({ ...baseArgs, env: { LUMI_ENGINE_VERSION: "2.4.2", LUMI_COMPACTION_BACKGROUND: "1" }, sub: "" });
  const r24Run = await BC.buildFinalConfig({ ...baseArgs, env: { LUMI_ENGINE_VERSION: "2.4.2", LUMI_COMPACTION_BACKGROUND: "1" }, sub: "run", prompt: "" });
  const r24Inst = await BC.buildFinalConfig({ ...baseArgs, env: {}, installedEngineVersion: "2.4.2", sub: "run", prompt: "" });
  const r24Def = await BC.buildFinalConfig({ ...baseArgs, env: {}, sub: "run", prompt: "" });
  ok("T1.1 mode 2.4.2: TUI background=true bila opt-in, run headless selalu background=false + full_codemode/opencode_api/part_rows=false + default/installed 2.4.2 lolos schema 2.4.2",
    r24Tui.finalCfg.compaction.background === true
    && r24Run.finalCfg.compaction.background === false
    && r24Run.finalCfg.experimental.full_codemode === false
    && r24Run.finalCfg.experimental.opencode_api === false
    && r24Run.finalCfg.experimental.part_rows === false
    && r24Inst.finalCfg.compaction.background === false
    && r24Inst.finalCfg.experimental.full_codemode === false
    && r24Def.finalCfg.compaction.background === false
    && r24Def.finalCfg.experimental.full_codemode === false
    && val24(r24Tui.finalCfg) === true && val24(r24Run.finalCfg) === true
    && val24(r24Inst.finalCfg) === true && val24(r24Def.finalCfg) === true);

  // LUMI_PROVIDER_STRICT=1 vs 0
  const pStrict = BC.buildPolicies({ LUMI_PROVIDER_STRICT: "1" }, true);
  const pLoose = BC.buildPolicies({ LUMI_PROVIDER_STRICT: "0" }, true);
  ok("T1.1 buildPolicies: LUMI_PROVIDER_STRICT=1 (deny * lalu allow 9router) vs 0 (izinkan custom provider)",
    pStrict.some((p) => p.action === "provider.use" && p.resource === "*" && p.effect === "deny")
    && pStrict.some((p) => p.action === "provider.use" && p.resource === "9router" && p.effect === "allow")
    && pStrict.some((p) => p.action === "tool.use" && p.resource === "shell:*git push * main" && p.effect === "deny")
    && !pLoose.some((p) => p.action === "provider.use"));

  // Pre-scan LUMI_TRUST_PROJECT=1 dengan blok "policies" di proyek
  const wsPol = path.join(ws11, "proj-with-policies");
  fs.mkdirSync(wsPol, { recursive: true });
  fs.writeFileSync(path.join(wsPol, "opencode.jsonc"), JSON.stringify({ policies: [{ action: "provider.use", resource: "*", effect: "allow" }] }));
  const rTrustPol = await BC.buildFinalConfig({ ...baseArgs, WS: wsPol, env: { LUMI_ENGINE_VERSION: "2.4.2" }, TRUST: true, sub: "run", prompt: "" });
  ok("T1.1 pre-scan LUMI_TRUST_PROJECT=1: proyek memuat blok policies → paksa OPENCODE_DISABLE_PROJECT_CONFIG=1",
    rTrustPol.env.OPENCODE_DISABLE_PROJECT_CONFIG === "1");
  fs.rmSync(ws11, { recursive: true, force: true });

  // T1.3 waitForPluginsReady
  let calls = 0;
  const ready = await SC.waitForPluginsReady("http://127.0.0.1:49999", "Basic x", ["lumitome-guard", "lumitome.subagent"], {
    timeoutMs: 500,
    intervalMs: 1,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls++;
      const status = calls >= 3 ? "active" : "pending";
      return { ok: true, json: async () => ({ data: [{ id: "lumitome-guard", state: { status } }, { id: "lumitome.subagent", state: { status } }] }) };
    },
  });
  const timedOut = await SC.waitForPluginsReady("http://127.0.0.1:49999", "", ["lumitome-guard", "lumitome.subagent"], {
    timeoutMs: 20,
    intervalMs: 5,
    sleepImpl: async (ms) => new Promise((r) => setTimeout(r, ms)),
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ id: "lumitome-guard", state: { status: "active" } }] }) }),
  });
  ok("T1.3 waitForPluginsReady: poll sampai active (3x) → ok; timeout → ok:false + missing menyebut plugin yang belum aktif",
    ready.ok === true && ready.attempts === 3 && timedOut.ok === false && timedOut.missing.includes("lumitome.subagent") && /lumitome\.subagent/.test(timedOut.warning));

  // T1.4 & T1.6 skrip checks
  const DOC = fs.readFileSync("scripts/doctor.sh", "utf8");
  const E2E = fs.readFileSync("scripts/e2e-opencode-v2.sh", "utf8");
  const BAK = fs.readFileSync("scripts/backup-data.sh", "utf8");
  ok("T1.4 & T1.6 skrip: doctor.sh tanpa hardcode v2.3.0 & pakai .tmp; e2e teruskan LUMI_ENGINE_BIN/VERSION; backup-data.sh non-destruktif valid",
    !/v2\.3\.0/.test(DOC) && /mktemp -p "\$ROOT\/\.tmp"/.test(DOC) && /resolveEngineBin/.test(DOC)
    && /LUMI_ENGINE_BIN/.test(E2E) && /LUMI_ENGINE_VERSION/.test(E2E)
    && /service stop/.test(BAK) && /LUMI_XDG_DATA/.test(BAK) && !/rm -rf/.test(BAK)
    && cp.spawnSync("bash", ["-n", "scripts/doctor.sh"]).status === 0
    && cp.spawnSync("bash", ["-n", "scripts/backup-data.sh"]).status === 0);
}

finish();
