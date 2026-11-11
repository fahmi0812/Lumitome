/** Provider + update + auto-refresh + menu provider (P2-3: pecahan tests/suite.mjs).
 *  Dipindah verbatim dari monolith, tanpa mengubah isi tes.
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import cp from "node:child_process";
import { ok, finish } from "./harness.mjs";

{
  // v0.3.2: rules inti dimuat dari config dir Lumitome + update CLI
  const os = await import("node:os"), cp = await import("node:child_process");
  const rdir = "lumitome/rules", files = fs.readdirSync(rdir).filter((f) => f.endsWith(".md"));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(rdir, f)).size, 0);
  ok(`rules inti: ${files.length} file, ${bytes} B (budget ≤ 6000 B ≈ 1.5k token)`, files.length >= 2 && bytes <= 6000 && fs.readFileSync(path.join(rdir, "00-core.md"), "utf8").includes("LUMI-CORE-"));
  ok("config dir Lumitome membawa rules/agents/commands", ["rules", "agents", "commands"].every((n) => fs.existsSync(path.join("lumitome/config", n))) && fs.existsSync("lumitome/config/agents/orchestrator.md"));
  const W = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("buildFinalConfig menyetel instructions dari config dir (bukan proyek)", /finalCfg\.instructions = .*CFG_DIR, "rules"/.test(fs.readFileSync("lumitome/lib/build-config.mjs", "utf8")));
  const U = await import("../lumitome/lib/update.mjs");
  ok("update: cmpVer semver", U.cmpVer("v0.3.10", "0.3.2") > 0 && U.cmpVer("0.3.2", "v0.3.2") === 0 && U.cmpVer("0.2.9", "0.3.0") < 0);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "updtag-")), g = (...a) => cp.execFileSync("git", a, { cwd: tmp, stdio: "pipe" }).toString().trim();
  g("init", "-q"); fs.writeFileSync(path.join(tmp, "a"), "1"); g("add", "a"); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a");
  const c1 = g("rev-parse", "HEAD"); g("tag", "v0.3.1"); g("-c", "user.name=t", "-c", "user.email=t@t", "tag", "-a", "v0.3.10", "-m", "x"); g("tag", "latest");
  const tags = U.remoteTags(tmp);
  ok("update: remoteTags = vX.Y.Z saja, urut semver, tag anotasi di-peel ke commit", tags.map((t) => t.tag).join() === "v0.3.1,v0.3.10" && tags.every((t) => t.sha === c1));
  fs.rmSync(tmp, { recursive: true, force: true });
}

{
  // v0.3.2: provider custom (connect) — deteksi model, file 0600, key tidak di providers.json/config
  const os = await import("node:os"), http = await import("node:http");
  const srv = http.createServer((q, r) => { const oa = q.headers.authorization === "Bearer k1", an = q.headers["x-api-key"] === "k1" && q.headers["anthropic-version"];
    r.setHeader("content-type", "application/json");
    if (q.url === "/v1/models" && oa) return r.end(JSON.stringify({ data: [{ id: "m-b" }, { id: "m-a" }] }));
    if (q.url.startsWith("/an/v1/models") && an) return r.end(JSON.stringify(q.url.includes("after_id") ? { data: [{ id: "c-2" }], has_more: false } : { data: [{ id: "c-1" }], has_more: true, last_id: "c-1" }));
    r.statusCode = 401; r.end("{}"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const PV = await import("../lumitome/lib/providers.mjs"); const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumiprov-"));
  const m1 = await PV.add(home, { name: "oa", type: "openai", baseURL: `${base}/v1`, key: "k1" });
  const m2 = await PV.add(home, { name: "an", type: "anthropic", baseURL: `${base}/an`, key: "k1" });
  let bad = ""; try { await PV.add(home, { name: "x", type: "openai", baseURL: `${base}/v1`, key: "salah" }); } catch (e) { bad = e.message; }
  const F = PV.files(home), mode = (f) => fs.statSync(f).mode & 0o777;
  const frag = PV.opencodeFragment(home, {});
  ok("connect: deteksi model OpenAI (Bearer) & Anthropic (x-api-key, paginasi)", m1.models.join() === "m-a,m-b" && m2.models.join() === "c-1,c-2" && /401/.test(bad));
  ok("connect: providers.json & credentials.json 0600; key tidak di providers.json/config", mode(F.prov) === 0o600 && mode(F.cred) === 0o600 && !fs.readFileSync(F.prov, "utf8").includes("k1") && !JSON.stringify(frag.providers).includes("k1") && frag.env.LUMI_KEY_OA === "k1");
  ok("connect: paket SDK sesuai tipe + model muncul di config", frag.providers.oa.package.includes("openai-compatible") && frag.providers.an.package.includes("anthropic") && frag.providers.an.settings.baseURL.endsWith("/an/v1") && !!frag.providers.an.models["c-2"]);
  ok("connect: env LUMI_KEY_<NAMA> menimpa file; hapus provider", PV.opencodeFragment(home, { LUMI_KEY_OA: "envk" }).env.LUMI_KEY_OA === "envk" && PV.remove(home, "an") && !PV.opencodeFragment(home, {}).providers.an);
  srv.close(); fs.rmSync(home, { recursive: true, force: true });
}

{
  // v0.3.38: 9router auto-refresh — model baru yang ditambah di dashboard 9router
  // harus muncul tanpa `lumitome models --refresh` manual. Seam: PV.autoRefresh +
  // wiring startup di lumitome.mjs (sebelum opencodeFragment) + sidik service.
  const os = await import("node:os"), http = await import("node:http");
  let live = ["ag/old"], up = true;
  const srv = http.createServer((q, r) => { r.setHeader("content-type", "application/json");
    if (!up || q.headers.authorization !== "Bearer k9") { r.statusCode = 503; return r.end("{}"); }
    if (q.url === "/v1/models") return r.end(JSON.stringify({ data: live.map((id) => ({ id })) }));
    r.statusCode = 404; r.end("{}"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const PV = await import("../lumitome/lib/providers.mjs"); const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumi9r-"));
  await PV.add(home, { name: "9router", type: "openai", baseURL: `${base}/v1`, key: "k9" });
  const before = PV.opencodeFragment(home, {});
  // upstream baru ditambah di 9router → GET /models kini mengembalikan model baru
  live = ["ag/old", "ag/new-upstream"];
  // env bersih: tes L1 di atas membocorkan NINEROUTER_API_KEY="t" ke process.env,
  // dan keyFor("9router") mendahulukan env itu atas credentials.json — tanpa env
  // bersih, refresh akan memakai key "t" yang salah dan gagal 503.
  const out = await PV.autoRefresh(home, { env: {} });
  const after = PV.opencodeFragment(home, {});
  ok("9router auto-refresh: model baru dari 9router masuk ke config tanpa refresh manual", before.providers["9router"].models["ag/new-upstream"] === undefined && after.providers["9router"].models["ag/new-upstream"] !== undefined && out["9router"] === 2);
  // 9router mati → auto-refresh tidak throw dan model lama dipertahankan
  up = false; let threw = false; try { await PV.autoRefresh(home, { env: {} }); } catch { threw = true; }
  const kept = PV.opencodeFragment(home, {});
  ok("9router auto-refresh: server mati → tidak throw, model lama dipertahankan", !threw && !!kept.providers["9router"].models["ag/new-upstream"]);
  // opt-out → tidak ada fetch, model tidak berubah
  up = true; live = ["ag/old", "ag/new-upstream", "ag/optout-should-not-appear"];
  await PV.autoRefresh(home, { env: { LUMI_AUTO_REFRESH: "0" } });
  const skipped = PV.opencodeFragment(home, {});
  ok("9router auto-refresh: LUMI_AUTO_REFRESH=0 → tidak fetch, model tidak berubah", skipped.providers["9router"].models["ag/optout-should-not-appear"] === undefined);
  const W = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("9router auto-refresh: startup memanggil autoRefresh sebelum opencodeFragment", /await PV\.autoRefresh\(/.test(W) && W.indexOf("autoRefresh") < W.indexOf("PV.opencodeFragment(ISO_HOME"));
  ok("9router auto-refresh: sidik service ikut berubah bila daftar model berubah", /fingerprint\(\[[\s\S]{0,400}FRAG\.providers/.test(W) || /fingerprint\(\[[\s\S]{0,400}models/.test(W));
  srv.close(); fs.rmSync(home, { recursive: true, force: true });
}

{
  // v0.3.44 (P1-3): startup lebih cepat + diagnosis saat provider mati.
  // TDD: blok ini ditulis dulu — merah sebelum implementasi (modul preflight belum
  // ada, refresh masih sekuensial, detectModels timeout per halaman, stop 3 dtk,
  // codemem "already" selamanya, models --lumitome hanya cache).
  const os = await import("node:os"), http = await import("node:http");
  const PV = await import("../lumitome/lib/providers.mjs");
  const srv = http.createServer((q, r) => {
    r.setHeader("content-type", "application/json");
    if (q.url.startsWith("/slow1/v1/models") || q.url.startsWith("/slow2/v1/models"))
      return setTimeout(() => r.end(JSON.stringify({ data: [{ id: "m1" }] })), 2500);
    if (q.url.startsWith("/pg/v1/models")) { // anthropic: 20 halaman x 400 ms
      const after = new URL(q.url, "http://x").searchParams.get("after_id");
      const n = after ? Number(after.split("-")[1]) + 1 : 1;
      return setTimeout(() => r.end(JSON.stringify({ data: [{ id: `p-${n}` }], has_more: n < 20, last_id: `p-${n}` })), 400);
    }
    if (q.url.startsWith("/grow/v1/models")) return r.end(JSON.stringify({ data: growLive.map((id) => ({ id })) }));
    r.statusCode = 404; r.end("{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumip44-"));
  await PV.add(home, { name: "slow1", type: "openai", baseURL: `${base}/slow1/v1`, key: "k" });
  await PV.add(home, { name: "slow2", type: "openai", baseURL: `${base}/slow2/v1`, key: "k" });
  // (1) refresh PARALEL: 2 provider @2,5 dtk harus selesai jauh di bawah 5 dtk sekuensial
  let t0 = Date.now();
  const out44 = await PV.refresh(home, undefined, { timeoutMs: 3000, env: {} });
  const refreshMs = Date.now() - t0;
  ok("P1-3 (1) refresh paralel: 2 provider lambat @2,5 dtk selesai < 4 dtk, keduanya ter-update",
    refreshMs < 4000 && out44.slow1 === 1 && out44.slow2 === 1);
  // (2) detectModels: timeout TOTAL per provider, paginasi berhenti saat anggaran habis
  // (melempar — daftar parsial tidak boleh menimpa cache lengkap)
  t0 = Date.now();
  let pgErr = "";
  try { await PV.detectModels("anthropic", `${base}/pg`, "k", { timeoutMs: 3000 }); } catch (e) { pgErr = e.message; }
  const pgMs = Date.now() - t0;
  ok("P1-3 (2) detectModels timeout total: 20 halaman x 400 ms berhenti < 5 dtk (throw, cache lama aman)",
    pgMs < 5000 && /timeout total 3000 ms/.test(pgErr));
  // (3) preflight: server mati gagal-cepat tanpa retry; server lambat tetap di-retry
  const PF = await import("../lumitome/lib/preflight.mjs");
  const deadErr = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" }) });
  const slowErr = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  ok("P1-3 (3a) preflight: ECONNREFUSED = mati, TimeoutError = lambat",
    PF.classifyPreflightError(deadErr) === "dead" && PF.classifyPreflightError(slowErr) === "slow");
  let tries = 0;
  const rDead = await PF.preflight({ base: "http://127.0.0.1:1/v1", timeoutMs: 8000, retries: 2,
    fetchImpl: async () => { tries++; throw deadErr; }, sleepImpl: () => Promise.resolve() });
  ok("P1-3 (3b) preflight server mati: 1 percobaan saja, tanpa backoff", !rDead.ok && rDead.kind === "dead" && tries === 1 && rDead.attempts === 1);
  tries = 0;
  const rSlow = await PF.preflight({ base: "http://x/v1", timeoutMs: 8000, retries: 2,
    fetchImpl: async () => { tries++; throw slowErr; }, sleepImpl: () => Promise.resolve() });
  ok("P1-3 (3c) preflight server lambat: tetap 3 percobaan (retry dipertahankan)", !rSlow.ok && rSlow.kind === "slow" && tries === 3 && rSlow.attempts === 3);
  const diag = PF.preflightDiagnosis({ provider: "9router", base: "http://127.0.0.1:1/v1", kind: "dead",
    lastModels: { updated: "2026-11-11T00:00:00.000Z", count: 2 } });
  ok("P1-3 (3d) diagnosis terpandu: base URL + hasil GET /models terakhir + saran perintah + cek 9router",
    /http:\/\/127\.0\.0\.1:1\/v1/.test(diag) && /2026-11-11/.test(diag) && /2 model/.test(diag)
    && /lumitome models --refresh/.test(diag) && /http:\/\/127\.0\.0\.1:20128\/v1\/models/.test(diag));
  // (4) `lumitome models --lumitome` ikut auto-refresh dulu (bukan sekadar cache)
  let growLive = ["g-old"];
  await PV.add(home, { name: "grow", type: "openai", baseURL: `${base}/grow/v1`, key: "k" });
  growLive = ["g-old", "g-new"];
  const logs44 = [];
  await PV.cli({ argv: ["--lumitome"], home, sub: "models", env: {}, log: (m) => logs44.push(m) });
  ok("P1-3 (4) models tanpa flag me-refresh: model baru dari server muncul di daftar",
    logs44.some((l) => l.includes("grow/g-new")));
  // (5) stop() service: tidak menunggu penuh bila service mengabaikan SIGTERM
  const SC = await import("../lumitome/lib/service-ctl.mjs");
  const h44s = fs.mkdtempSync(path.join(os.tmpdir(), "lumip44s-"));
  const svc44 = cp.spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1e3)"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 300));
  fs.mkdirSync(path.join(h44s, "state", "opencode"), { recursive: true });
  fs.writeFileSync(SC.regFile(h44s), JSON.stringify({ pid: svc44.pid, url: "http://127.0.0.1:50003" }));
  t0 = Date.now(); SC.stop(h44s); const stopMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 200));
  ok("P1-3 (5) stop() service bandel: < 2 dtk (bukan 3 dtk) dan proses akhirnya mati",
    stopMs < 2000 && !SC.alive(svc44.pid));
  // (6) codemem: HEAD berubah -> re-index; "running" yang prosesnya sudah mati -> re-index
  const CM = await import("../lumitome/lib/codemem.mjs");
  const h44c = fs.mkdtempSync(path.join(os.tmpdir(), "lumip44c-"));
  fs.mkdirSync(path.join(h44c, "bin")); fs.writeFileSync(CM.cbmBin(h44c), "");
  const repo44 = path.join(h44c, "repo");
  cp.execFileSync("git", ["init", "-q", repo44]);
  cp.execFileSync("git", ["-C", repo44, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "c1"]);
  fs.writeFileSync(path.join(repo44, "package.json"), "{}");
  const fp1 = CM.projectFingerprint(repo44);
  CM.writeIndexState(h44c, repo44, { status: "indexed", finished: Date.now(), fp: fp1 });
  ok("P1-3 (6a) codemem: HEAD sama -> already (tidak re-index sia-sia)",
    CM.maybeAutoIndex({ home: h44c, dir: repo44, env: {}, runner: "/x" }) === "already");
  cp.execFileSync("git", ["-C", repo44, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "c2"]);
  ok("P1-3 (6b) codemem: HEAD berubah -> re-index dimulai",
    CM.maybeAutoIndex({ home: h44c, dir: repo44, env: {}, runner: "/x" }) === "started");
  const fp2 = CM.projectFingerprint(repo44);
  ok("P1-3 (6c) codemem: sidik berubah saat HEAD berubah", fp1 !== null && fp2 !== null && fp1 !== fp2);
  CM.writeIndexState(h44c, repo44, { status: "running", started: Date.now(), pid: 999999 });
  ok("P1-3 (6d) codemem: 'running' yang PID-nya sudah mati -> re-index dimulai (tidak diblokir 30 mnt)",
    CM.maybeAutoIndex({ home: h44c, dir: repo44, env: {}, runner: "/x" }) === "started");
  // (3e) integrasi bin: `lumitome run` + 9router mati -> exit 124, gagal-cepat + diagnosis
  {
    const h44p = fs.mkdtempSync(path.join(os.tmpdir(), "lumip44p-"));
    const stub44 = path.join(h44p, "fake-opencode");
    fs.writeFileSync(stub44, "#!/usr/bin/env node\nprocess.exit(0);\n"); fs.chmodSync(stub44, 0o755);
    fs.writeFileSync(path.join(h44p, "providers.json"), JSON.stringify({ providers: { "9router": { type: "openai", baseURL: "http://127.0.0.1:59998/v1", models: ["m"], updated: "2026-11-11T00:00:00.000Z" } } }));
    fs.writeFileSync(path.join(h44p, "credentials.json"), JSON.stringify({ "9router": "k9" }));
    t0 = Date.now();
    const r44p = cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.resolve("lumitome/bin/lumitome.mjs"), "run", "halo"],
      { encoding: "utf8", timeout: 60000, cwd: h44p,
        env: { ...process.env, HOME: h44p, LUMI_HOME: h44p, LUMI_OPENCODE: stub44, LUMI_WORKSPACE: h44p, LUMI_AUTO_INDEX: "0", NINEROUTER_API_KEY: "fake" } });
    const binMs = Date.now() - t0;
    ok("P1-3 (3e) bin preflight server mati: exit 124, tanpa retry, diagnosis berisi base URL + saran + cek 9router",
      r44p.status === 124 && !/— ulang/.test(r44p.stderr) && /http:\/\/127\.0\.0\.1:59998\/v1/.test(r44p.stderr)
      && /lumitome models --refresh/.test(r44p.stderr) && /http:\/\/127\.0\.0\.1:20128\/v1\/models/.test(r44p.stderr) && binMs < 15000);
    // (8) `lumitome index --refresh` (bin): re-index manual dari subcommand
    const repo44b = path.join(h44p, "repo");
    cp.execFileSync("git", ["init", "-q", repo44b]);
    cp.execFileSync("git", ["-C", repo44b, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "c1"]);
    fs.writeFileSync(path.join(repo44b, "package.json"), "{}");
    fs.mkdirSync(path.join(h44p, "bin")); fs.writeFileSync(CM.cbmBin(h44p), "");
    const r44i = cp.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.resolve("lumitome/bin/lumitome.mjs"), "index", "--refresh"],
      { encoding: "utf8", timeout: 60000, cwd: repo44b,
        env: { ...process.env, HOME: h44p, LUMI_HOME: h44p, LUMI_WORKSPACE: repo44b, LUMI_AUTO_INDEX: "0" } });
    ok("P1-3 (8) bin `lumitome index --refresh`: subcommand ada, re-index dimulai walau LUMI_AUTO_INDEX=0",
      r44i.status === 0 && /index started/.test(r44i.stdout + r44i.stderr));
    fs.rmSync(h44p, { recursive: true, force: true });
  }
  // (7) perintah TUI /refresh-models ada + jujur soal restart
  const cmd44 = fs.readFileSync(".opencode/commands/refresh-models.md", "utf8");
  ok("P1-3 (7) /refresh-models: perintah TUI ada, refresh + minta restart TUI",
    /lumitome models --refresh/.test(cmd44) && /restart|mulai ulang/i.test(cmd44));
  srv.close();
  try { process.kill(svc44.pid, "SIGKILL"); } catch {}
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(h44s, { recursive: true, force: true });
  fs.rmSync(h44c, { recursive: true, force: true });
}

{
  // v0.3.9: menu provider (layar penuh) + input API key tersamar (•), termasuk urutan tombol Windows
  const UI = await import("../lumitome/lib/provider-ui.mjs");
  const P = (s, st) => UI.parseKeys(s, st).map((k) => k.t + (k.v !== undefined ? ":" + k.v : ""));
  ok("ui/keys: Enter CRLF (Windows) = satu enter; \\b (Windows) & DEL = backspace", P("\r\n").join() === "enter" && P("\b\x7f").join() === "backspace,backspace" && P("\r").join() === "enter");
  ok("ui/keys: panah, Tab/Shift+Tab, Del (\\x1b[3~), Esc, Ctrl+C, SS3 (conhost)", P("\x1b[A\x1bOB\t\x1b[Z\x1b[3~\x1b\x03").join() === "up,down,tab,shift-tab,delete,esc,ctrl-c");
  const st0 = { paste: null };
  const pa = [...UI.parseKeys("\x1b[200~sk-ab", st0), ...UI.parseKeys("cd\r\n\x1b[201~", st0)];
  ok("ui/paste: bracketed paste terpecah 2 chunk + CRLF → satu teks tanpa newline", pa.length === 1 && pa[0].t === "paste" && pa[0].v === "sk-abcd");
  ok("ui/paste: paste tanpa bracket (cmd lama) → satu token teks", P("sk-xyz").join() === "paste:sk-xyz");
  let b = ""; for (const k of UI.parseKeys("ab\x1b[200~cd\r\n\x1b[201~\b")) b = UI.maskedStep(b, k).buf;
  ok("ui/masked: ketik + paste + backspace → nilai benar, tampil • per karakter", b === "abc" && UI.mask(b) === "•••" && UI.maskedStep("x", { t: "enter" }).done);
  const st = UI.initState({ a: { models: ["m1", "m2"] } });
  for (const k of UI.parseKeys("\x1b[Z")) UI.reduce(st, k);
  const typeKey = (s) => { for (const k of UI.parseKeys(s)) UI.reduce(st, k); };
  st.focus = "form:name"; typeKey("My9R"); typeKey("\t"); typeKey("http://x/v1"); typeKey("\t"); typeKey("\x1b[200~SECRETKEY\x1b[201~"); typeKey("\b");
  const fr = UI.render(st, 100, 30);
  ok("ui/form: nama huruf kecil, Tab pindah field, key tersamar di layar (tidak tampil teks asli)", st.name === "my9r" && st.baseURL === "http://x/v1" && st.key === "SECRETKE" && fr.includes("••••••••") && !fr.includes("SECRETKE"));
  ok("ui/form: Enter = simpan; Esc = lewati", UI.reduce(st, { t: "enter" })?.save === true && UI.reduce(UI.initState({}), { t: "esc" })?.exit === true);
  const s2 = UI.initState({ a: { models: ["m"] }, b: { models: [] } }); s2.focus = "list:1";
  UI.reduce(s2, { t: "delete" }); const c1 = s2.confirm; const r1 = UI.reduce(s2, { t: "char", v: "y" });
  const s3 = UI.initState({ a: { models: ["m"] } }); s3.focus = "list:0"; UI.reduce(s3, { t: "delete" }); UI.reduce(s3, { t: "char", v: "n" });
  ok("ui/list: Del → konfirmasi → y hapus; tombol lain batal", c1 === "b" && r1?.remove === "b" && s3.confirm === null);
  const f0 = UI.render(UI.initState({ a: { models: ["m1", "m2"] } }), 100, 30);
  ok("ui/render: logo LUMITOME emas, latar hitam, daftar 'N model ×', footer", f0.includes("38;2;201;150;46") && f0.includes("38;2;243;210;122") && f0.includes("48;2;0;0;0") && /a\s+2 model\s+×/.test(f0) && f0.includes("Tab pindah · Enter simpan · Del hapus · Esc lewati") && !/[┌┐└┘│]/.test(f0));
  const W = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("ui/wrapper: `lumitome provider` + menu otomatis saat belum ada provider", W.includes('sub === "provider"') && /if \(!HAS_PROVIDER\)[\s\S]{0,400}providerMenu\(\)/.test(W));
}

{
  // v0.3.10: connect = layar provider; tanpa banner ganda; fallback ASCII untuk konsol Windows non-UTF-8
  const UI = await import("../lumitome/lib/provider-ui.mjs");
  const W = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("connect: di terminal membuka layar provider; --text / non-TTY / flag → mode teks", /sub === "connect" && process\.stdin\.isTTY && process\.stdout\.isTTY && !argv\.includes\("--text"\)[\s\S]{0,200}providerMenu\(\)/.test(W));
  ok("brand: tidak ada banner wrapper sebelum TUI (hanya judul jendela); pesan Windows hanya LUMI_DEBUG", !W.includes("BR.banner(") && W.includes("process.stderr.write(BR.titleSeq())") && /win32" && !env\.LUMI_SANDBOX\) \{ env\.LUMI_SANDBOX = "off"; if \(env\.LUMI_DEBUG\)/.test(fs.readFileSync("lumitome/lib/build-config.mjs", "utf8")));
  ok("ui/glyph: Windows codepage 437/850 tanpa Windows Terminal → ASCII; 65001 / WT / Linux → Unicode", UI.pickGlyphs({}, "win32", 437) === UI.ASCII && UI.pickGlyphs({}, "win32", 850) === UI.ASCII && UI.pickGlyphs({}, "win32", 65001) === UI.UNI && UI.pickGlyphs({ WT_SESSION: "1" }, "win32", 437) === UI.UNI && UI.pickGlyphs({}, "linux", 437) === UI.UNI && UI.pickGlyphs({ LUMI_ASCII: "1" }, "linux") === UI.ASCII);
  const st = UI.initState({ a: { models: ["m"] } }); st.key = "abc"; st.focus = "form:key";
  const fa = UI.render(st, 100, 30, UI.ASCII);
  ok("ui/glyph: mode ASCII → key '***', hapus 'x', tanpa karakter non-ASCII", fa.includes("***") && /1 model\s+x/.test(fa) && !/[^\x00-\x7f]/.test(fa));
  const C = fs.readFileSync("lumitome/bin/cli.mjs", "utf8");
  ok("npm/win: cli.mjs menjalankan wrapper dengan stdio inherit (TTY + raw mode tersedia untuk layar provider)", /spawn\(process\.execPath, \[[^\]]*lumitome\.mjs[^\]]*\], \{ stdio: "inherit"/.test(C));
}

{
  // v0.3.11: timeout provider
  const PVT = await import("../lumitome/lib/providers.mjs");
  const d = PVT.providerTimeouts({});
  ok("timeout: default header 300000, chunk 900000, total 3600000", d.headerTimeout === 300000 && d.chunkTimeout === 900000 && d.timeout === 3600000);
  const o = PVT.providerTimeouts({ LUMI_HEADER_TIMEOUT_MS: "120000", LUMI_IDLE_TIMEOUT_MS: "600000", LUMI_TOTAL_TIMEOUT_MS: "7200000" });
  ok("timeout: env override", o.headerTimeout === 120000 && o.chunkTimeout === 600000 && o.timeout === 7200000);
  const b = PVT.providerTimeouts({ LUMI_HEADER_TIMEOUT_MS: "0", LUMI_IDLE_TIMEOUT_MS: "false", LUMI_TOTAL_TIMEOUT_MS: "-5" });
  ok("timeout: env tidak valid → default (bilangan bulat positif saja)", b.headerTimeout === 300000 && b.chunkTimeout === 900000 && b.timeout === 3600000);
  const WT = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("timeout: 9router + semua provider custom memakai providerTimeouts, tanpa default 60000 lama", /"9router": \{ settings: \{ \.\.\.TIMEOUTS \} \}/.test(fs.readFileSync("lumitome/lib/build-config.mjs", "utf8")) && /\.\.\.p\.settings, \.\.\.TIMEOUTS/.test(fs.readFileSync("lumitome/lib/build-config.mjs", "utf8")) && !/LUMI_IDLE_TIMEOUT_MS \|\| 60000/.test(WT));
}

{
  // v0.3.12: key 9router untuk semua jalur engine (termasuk serve --service) + compaction.buffer + migrasi
  const osm = await import("node:os");
  const PV12 = await import("../lumitome/lib/providers.mjs");
  const CM12 = await import("../lumitome/lib/config-migrate.mjs");
  const h = fs.mkdtempSync(path.join(osm.tmpdir(), "lumi12-"));
  fs.writeFileSync(path.join(h, "providers.json"), JSON.stringify({ providers: { "9router": { type: "openai", baseURL: "http://127.0.0.1:1/v1", models: ["m"] } } }));
  fs.writeFileSync(path.join(h, "credentials.json"), JSON.stringify({ "9router": "k-file" }));
  const f1 = PV12.opencodeFragment(h, {});
  ok("key: credentials.json → LUMI_KEY_9ROUTER dan NINEROUTER_API_KEY (env engine/serve)", f1.env.LUMI_KEY_9ROUTER === "k-file" && f1.env.NINEROUTER_API_KEY === "k-file" && f1.providers["9router"].settings.apiKey === "{env:LUMI_KEY_9ROUTER}");
  const h2 = fs.mkdtempSync(path.join(osm.tmpdir(), "lumi12b-"));
  const f2 = PV12.opencodeFragment(h2, { NINEROUTER_API_KEY: "k-env" });
  ok("key: hanya NINEROUTER_API_KEY di env → LUMI_KEY_9ROUTER ikut di-set", f2.env.LUMI_KEY_9ROUTER === "k-env" && f2.env.NINEROUTER_API_KEY === "k-env");
  ok("key: tanpa key apa pun → tidak ada env key", !("LUMI_KEY_9ROUTER" in PV12.opencodeFragment(h2, {}).env));
  const base = fs.readFileSync("lumitome/config/opencode.jsonc", "utf8");
  const sch = JSON.parse(fs.readFileSync("scripts/schema/opencode-config.schema.json", "utf8")).properties.compaction.properties.buffer;
  const buf = (base.match(/"buffer"\s*:\s*([^,}\s]+)/) || [])[1];
  ok("config dasar: compaction.buffer integer sesuai schema 2.2.4; apiKey 9router = {env:LUMI_KEY_9ROUTER}", sch.type === "integer" && /^\d+$/.test(buf) && Number.isSafeInteger(Number(buf)) && base.includes('"apiKey": "{env:LUMI_KEY_9ROUTER}"') && !base.includes("NINEROUTER_API_KEY"));
  const W12 = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");
  ok("wrapper: env key dari FRAG di-inject untuk semua sub-perintah (serve juga)", /\.\.\.FRAG\.env,/.test(fs.readFileSync("lumitome/lib/build-config.mjs", "utf8")) && /migrateConfigFile/.test(W12) && /migrateConfigFile/.test(fs.readFileSync("lumitome/lib/update.mjs", "utf8")));
  const cf = path.join(h, "opencode.jsonc");
  fs.writeFileSync(cf, '{ "providers": { "9router": { "settings": { "apiKey": "{env:NINEROUTER_API_KEY}" } } },\r\n  "compaction": { "auto": true, "buffer": "20%" } }\r\n');
  const changed = CM12.migrateConfigFile(cf), after = fs.readFileSync(cf, "utf8");
  ok("migrasi: \"20%\" → 20000, env key lama → LUMI_KEY_9ROUTER, CRLF dipertahankan, idempoten", changed && after.includes('"buffer": 20000') && after.includes("{env:LUMI_KEY_9ROUTER}") && after.includes("\r\n") && !CM12.migrateConfigFile(cf));
  ok("migrasi: file tidak ada → aman", CM12.migrateConfigFile(path.join(h, "tidak-ada.jsonc")) === false);
  fs.rmSync(h, { recursive: true, force: true }); fs.rmSync(h2, { recursive: true, force: true });
}

// ---------- v0.3.45 (P1-4): onboarding 9router sekali-klik + error yang membantu ----------
// TDD (mattpocock): tes ini ditulis SEBELUM implementasi — harus MERAH dulu.
{
  const os = await import("node:os"), http = await import("node:http");
  const PV = await import("../lumitome/lib/providers.mjs");
  const UI = await import("../lumitome/lib/provider-ui.mjs");
  let live = ["m-ok"];
  const srv = http.createServer((q, r) => {
    r.setHeader("content-type", "application/json");
    if (q.url === "/v1/models") {
      if (q.headers.authorization !== "Bearer k9") { r.statusCode = 401; return r.end("{}"); }
      return r.end(JSON.stringify({ data: live.map((id) => ({ id })) }));
    }
    if (q.url.startsWith("/e401/")) { r.statusCode = 401; return r.end("{}"); }
    if (q.url.startsWith("/e404/")) { r.statusCode = 404; return r.end("{}"); }
    if (q.url.startsWith("/slow/")) return setTimeout(() => r.end(JSON.stringify({ data: [{ id: "m-slow" }] })), 2000);
    r.statusCode = 404; r.end("{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumip14-"));

  // (1) preset 9router sekali Enter di menu provider
  ok("P1-4 (1a) preset 9router: nama/type/baseURL lokal tetap (bukan server jarak jauh)",
    UI.NINEROUTER_PRESET?.name === "9router" && UI.NINEROUTER_PRESET?.type === "openai"
    && UI.NINEROUTER_PRESET?.baseURL === "http://127.0.0.1:20128/v1");
  const pst = UI.initState({});
  UI.applyPreset(pst);
  ok("P1-4 (1a) applyPreset: isi nama+type+baseURL, fokus pindah ke API key (key TIDAK terisi)",
    pst.name === "9router" && pst.type === 0 && pst.baseURL === "http://127.0.0.1:20128/v1" && pst.key === "" && pst.focus === "form:key");
  const pst2 = UI.initState({}); pst2.focus = "preset:9router";
  const actP = UI.reduce(pst2, { t: "enter" });
  ok("P1-4 (1b) menu: Enter di baris preset mengisi form (bukan simpan), lalu fokus ke key",
    actP?.save !== true && pst2.name === "9router" && pst2.baseURL === "http://127.0.0.1:20128/v1" && pst2.focus === "form:key");
  const frP = UI.render(UI.initState({}), 100, 30);
  ok("P1-4 (1b) menu: baris preset 9router tampil dengan URL lokal",
    /9router \(lokal\)/.test(frP) && frP.includes("http://127.0.0.1:20128/v1"));
  // (1c) --preset 9router di CLI teks: nama/type/baseURL terisi dari preset (key tetap manual)
  {
    process.env.LUMI_P14_KEY = "k9";
    const errs = [];
    const rc = await PV.cli({ argv: ["--preset", "9router", "--key-env", "LUMI_P14_KEY"], home, sub: "connect", env: {}, log: () => {}, err: (m) => errs.push(m) });
    delete process.env.LUMI_P14_KEY;
    ok("P1-4 (1c) CLI --preset 9router: memakai base URL lokal preset (gagal karena 9router tidak jalan di VM, bukan karena preset salah)",
      rc === 1 && /127\.0\.0\.1:20128\/v1/.test(errs.join("\n")));
    const errs2 = [];
    const rc2 = await PV.cli({ argv: ["--preset", "ngawur", "--key-env", "LUMI_P14_KEY"], home, sub: "connect", env: {}, log: () => {}, err: (m) => errs2.push(m) });
    ok("P1-4 (1c) CLI --preset tak dikenal: ditolak (exit 2)",
      rc2 === 2 && /preset tidak dikenal/i.test(errs2.join("\n")));
  }

  // (2) connect dengan 0 model: tersimpan + peringatan (bukan gagal)
  live = [];
  const empty = await PV.add(home, { name: "kosong", type: "openai", baseURL: `${base}/v1`, key: "k9" });
  const saved = PV.load(home);
  ok("P1-4 (2a) connect 0 model: tersimpan dengan models [] + peringatan (bukan throw)",
    Array.isArray(empty.models) && empty.models.length === 0 && typeof empty.warning === "string"
    && /0 model/.test(empty.warning) && /refresh/i.test(empty.warning)
    && Array.isArray(saved.kosong?.models) && saved.kosong.models.length === 0
    && PV.opencodeFragment(home, {}).env.LUMI_KEY_KOSONG === "k9");
  // CLI teks: connect 0 model juga sukses (exit 0) + peringatan di log
  {
    process.env.LUMI_P14_KEY = "k9";
    const logs = [];
    const rcEmpty = await PV.cli({ argv: ["--type", "openai", "--name", "kosong2", "--base-url", `${base}/v1`, "--key-env", "LUMI_P14_KEY"], home, sub: "connect", env: {}, log: (m) => logs.push(m), err: () => {} });
    delete process.env.LUMI_P14_KEY;
    ok("P1-4 (2a) CLI connect 0 model: exit 0 + peringatan di log, provider tersimpan",
      rcEmpty === 0 && /0 model/.test(logs.join("\n")) && Array.isArray(PV.load(home).kosong2?.models));
  }
  live = ["m-ok"];
  await PV.add(home, { name: "tumbuh", type: "openai", baseURL: `${base}/v1`, key: "k9" });
  // server kosong lagi → refresh TIDAK menimpa cache berisi model
  live = [];
  const outEmpty = await PV.refresh(home, "tumbuh", { env: {} });
  ok("P1-4 (2b) refresh 0 model: cache lama dipertahankan (tidak ditimpa daftar kosong)",
    PV.load(home).tumbuh.models.join() === "m-ok" && typeof outEmpty.tumbuh === "string" && /cache lama/i.test(outEmpty.tumbuh));
  // dashboard diisi → auto-refresh mengisi provider yang tadinya kosong
  live = ["m-baru"];
  await PV.autoRefresh(home, { env: {} });
  ok("P1-4 (2b) auto-refresh: provider 0-model terisi begitu dashboard diisi",
    PV.load(home).kosong.models.join() === "m-baru" && PV.load(home).tumbuh.models.join() === "m-baru");

  // (3) pesan error deteksi: 401 vs 404 vs timeout vs koneksi ditolak — berbeda + saran tipe lain
  let e401 = ""; try { await PV.detectModels("openai", `${base}/e401`, "salah", { timeoutMs: 5000 }); } catch (e) { e401 = e.message; }
  let e401an = ""; try { await PV.detectModels("anthropic", `${base}/e401`, "salah", { timeoutMs: 5000 }); } catch (e) { e401an = e.message; }
  let e404 = ""; try { await PV.detectModels("openai", `${base}/e404`, "k", { timeoutMs: 5000 }); } catch (e) { e404 = e.message; }
  let eTo = ""; const t0 = Date.now(); try { await PV.detectModels("openai", `${base}/slow`, "k", { timeoutMs: 500 }); } catch (e) { eTo = e.message; } const toMs = Date.now() - t0;
  let eConn = ""; try { await PV.detectModels("openai", "http://127.0.0.1:59998/v1", "k", { timeoutMs: 3000 }); } catch (e) { eConn = e.message; }
  ok("P1-4 (3a) error 401: menyebut key salah + saran coba tipe lain",
    /401/.test(e401) && /key/i.test(e401) && /coba tipe 'anthropic'/.test(e401)
    && /401/.test(e401an) && /coba tipe 'openai'/.test(e401an));
  ok("P1-4 (3b) error 404: menyebut base URL + saran coba tipe lain",
    /404/.test(e404) && /base URL/i.test(e404) && /coba tipe 'anthropic'/.test(e404));
  ok("P1-4 (3c) timeout: pesan timeout + saran periksa server, berhenti < 2 dtk",
    /timeout/.test(eTo) && /server/i.test(eTo) && toMs < 2000);
  ok("P1-4 (3d) koneksi ditolak: pesan 'tidak bisa terhubung' + base URL (bukan 'fetch failed' mentah)",
    /tidak bisa terhubung/.test(eConn) && /127\.0\.0\.1:59998/.test(eConn) && !/^fetch failed$/.test(eConn));

  // (4) install.sh: fallback tarball bila git tidak ada; pull gagal → WARN ke layar
  const BASH14 = "/bin/bash";
  const sb14 = fs.mkdtempSync(path.join(os.tmpdir(), "lumiinst14-"));
  fs.mkdirSync(path.join(sb14, "tmp"), { recursive: true });
  const bins14 = [];
  const mkBin14 = (exclude = []) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "lumibin14-")); bins14.push(d);
    for (const dir of ["/usr/bin", "/bin"]) { try { for (const f of fs.readdirSync(dir)) { if (exclude.includes(f)) continue; try { fs.symlinkSync(path.join(dir, f), path.join(d, f)); } catch {} } } catch {} } return d; };
  const remoteCopy14 = (name) => { const d = path.join(sb14, name); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync("install.sh", path.join(d, "install.sh")); return d; };
  ok("P1-4 (4) install.sh: fallback tarball (archive/refs/heads/main.tar.gz) + peringatan pull gagal di sumber",
    fs.readFileSync("install.sh", "utf8").includes("archive/refs/heads/main.tar.gz")
    && /git pull gagal/.test(fs.readFileSync("install.sh", "utf8")));
  // (4a) tanpa git + curl stub → tarball diunduh, diekstrak, install.sh hasil ekstrak dieksekusi
  {
    const d = remoteCopy14("remote-tarball");
    const bin = mkBin14(["git", "curl"]);
    const curlLog = path.join(sb14, "curl.log");
    const stub = `#!/bin/bash\nout=""; url=""; prev="";\nfor a in "$@"; do if [ "$prev" = "-o" ]; then out="$a"; fi; prev="$a"; url="$a"; done\necho "$url" >> "${curlLog}"\nstage="$(mktemp -d)"; mkdir -p "$stage/Lumitome-main/scripts"\nprintf '#!/usr/bin/env bash\\necho "TARBALL-INSTALL-OK"\\nexit 0\\n' > "$stage/Lumitome-main/install.sh"\nprintf 'x' > "$stage/Lumitome-main/opencode.jsonc"\nprintf '#!/usr/bin/env bash\\nexit 0\\n' > "$stage/Lumitome-main/scripts/doctor.sh"\nprintf '0.3.45\\n' > "$stage/Lumitome-main/VERSION"\ntar -czf "$out" -C "$stage" Lumitome-main\n`;
    fs.writeFileSync(path.join(bin, "curl"), stub); fs.chmodSync(path.join(bin, "curl"), 0o755);
    const h = path.join(sb14, "h-tarball"); fs.mkdirSync(h, { recursive: true });
    const r = cp.spawnSync(BASH14, [path.join(d, "install.sh")], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: h, LUMI_HOME: path.join(h, ".lumitome"), TMPDIR: path.join(sb14, "tmp"), PATH: bin } });
    const out = r.stdout + r.stderr;
    ok("P1-4 (4a) install tanpa git: fallback tarball via curl → ekstrak + exec install.sh hasil unduhan",
      r.status === 0 && /TARBALL-INSTALL-OK/.test(out) && fs.existsSync(curlLog)
      && fs.readFileSync(curlLog, "utf8").includes("archive/refs/heads/main.tar.gz") && !/butuh 'git'/.test(out));
  }
  // (4b) tanpa git + tanpa curl → gagal jelas, menyebut keduanya
  {
    const d = remoteCopy14("remote-nogit-nocurl");
    const bin = mkBin14(["git", "curl"]);
    const h = path.join(sb14, "h-nogit"); fs.mkdirSync(h, { recursive: true });
    const r = cp.spawnSync(BASH14, [path.join(d, "install.sh")], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: h, LUMI_HOME: path.join(h, ".lumitome"), TMPDIR: path.join(sb14, "tmp"), PATH: bin } });
    const out = r.stdout + r.stderr;
    ok("P1-4 (4b) install tanpa git + tanpa curl: gagal jelas, menyebut git dan curl",
      r.status !== 0 && /FAIL/.test(out) && /butuh 'git'/.test(out) && /curl/.test(out));
  }
  // (4c) git ada, pull gagal (origin mati) → WARN ke layar + lanjut dengan sumber lama
  {
    const d = remoteCopy14("remote-pull");
    const h = path.join(sb14, "h-pull"); fs.mkdirSync(h, { recursive: true });
    const lumiHome = path.join(h, ".lumitome");
    const src = path.join(lumiHome, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(lumiHome, ".lumitome-home"), "");
    cp.execFileSync("git", ["init", "-q", "-b", "main", src]);
    cp.execFileSync("git", ["-C", src, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "c1"]);
    cp.execFileSync("git", ["-C", src, "remote", "add", "origin", path.join(sb14, "tidak-ada.git")]);
    fs.writeFileSync(path.join(src, "install.sh"), "#!/usr/bin/env bash\necho \"PULL-OLD-SRC-OK\"\nexit 0\n");
    const r = cp.spawnSync(BASH14, [path.join(d, "install.sh")], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: h, LUMI_HOME: lumiHome, TMPDIR: path.join(sb14, "tmp") } });
    const out = r.stdout + r.stderr;
    ok("P1-4 (4c) install: git pull gagal -> WARN ke layar + lanjut dengan sumber lama (bukan diam-diam)",
      r.status === 0 && /WARN/.test(out) && /git pull gagal/.test(out) && /PULL-OLD-SRC-OK/.test(out));
  }
  srv.close(); fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(sb14, { recursive: true, force: true });
  for (const b of bins14) fs.rmSync(b, { recursive: true, force: true });
}

finish();
