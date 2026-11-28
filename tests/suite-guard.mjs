/** Guard Lumitome + sandbox + tuas env keamanan (P2-3: pecahan tests/suite.mjs).
 *  Dipindah verbatim dari monolith, tanpa mengubah isi tes.
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import { ok, finish } from "./harness.mjs";
import { layer0 } from "../router/layer0-regex.mjs";
import { evaluateDoneGate } from "../harness/done-gate.ts";

// ---------- lumi/fix-v2: guard Lumitome (fail-closed), bwrap, anti-spin, done-gate runtime, parser L1 ----------
{
  const G = await import("../harness/lumi-guard.mjs");
  const SD = await import("../router/skill-db.mjs");
  const W = "/workspace/x";
  const c = (cmd, o = {}) => G.classifyShell(cmd, { workspace: W, headless: true, branch: "feat/a", ...o }).effect;
  ok("guard: baca .env via shell (cat/less/grep/source/cp/glob/subshell) → deny", ["cat .env", "less .env.local", "grep -n KEY .env", "source .env", ". ./.env", "cp .env /tmp/x", "cat .en*", "echo $(cat .env.production)", "bash -c 'cat .env'", "head secrets.env", "cat ~/.ssh/id_rsa"].every((x) => c(x) === "deny"));
  ok("guard: .env.example boleh", c("cat .env.example") === "allow");
  ok("guard: dump env / var key → deny", ["printenv", "env", "env | grep KEY", "echo $NINEROUTER_API_KEY", "cat /proc/self/environ"].every((x) => c(x) === "deny"));
  ok("guard: rm -rf luar workspace / root ws / ~ → deny", ["rm -rf /workspace/other", "rm -rf ..", "rm -rf .", "rm -rf ~/x", "rm -fr /", "find / -delete", "sudo rm -rf build"].every((x) => c(x) === "deny"));
  ok("guard: rm -rf di dalam workspace → allow", c("rm -rf build dist") === "allow");
  ok("guard: push force/lease/+refspec/main/master/--all → deny", ["git push -f origin a", "git push --force origin a", "git push --force-with-lease origin a", "git push origin +a", "git push origin main", "git push origin a:master", "git push origin HEAD:main", "git push --all", "git status && git push origin main", "sh -c \"git push origin master\""].every((x) => c(x) === "deny"));
  ok("guard: push branch lain → ask (interaktif) / deny (headless)", c("git push origin feat/a", { headless: false }) === "ask" && c("git push origin feat/a") === "deny");
  ok("guard: push tanpa refspec dari main → deny", c("git push", { branch: "main", headless: false }) === "deny");
  ok("guard: tier0/1 (edit/test/build/commit) → allow", ["node --test app/", "npm test", "npm run build", "git add -A && git commit -m x", "git checkout -b feat/b", "ls -la"].every((x) => c(x) === "allow"));
  ok("guard: tool file ke .env → deny; .env.example → allow", G.classifyFileTool("read", { path: ".env" }).effect === "deny" && G.classifyFileTool("read", { filePath: "/w/.env.local" }).effect === "deny" && G.classifyFileTool("read", { path: ".env.example" }).effect === "allow");
  const ba = G.bwrapArgs("echo hi", { workspace: process.cwd(), toolDirs: [] });
  ok("bwrap: clearenv + unshare-pid + workspace rw + perintah di akhir", ba.includes("--clearenv") && ba.includes("--unshare-pid") && ba.join(" ").includes(`--bind ${process.cwd()} ${process.cwd()}`) && ba.at(-1) === "echo hi");
  const bc = G.bwrapCommand("echo 'a b'", { workspace: process.cwd(), argsDir: (await import("node:os")).tmpdir() + "/lumi-sbx-test" });
  ok("bwrap: opsi di file --args (tak terlihat pola permission), unwrap = perintah asli", /^bwrap --args 3 /.test(bc) && !bc.includes("--bind") && G.unwrapCommand(bc) === "echo 'a b'");
  const sp = new G.RuntimeSpin({ maxFail: 3, maxRepeat: 4 });
  for (let i = 0; i < 3; i++) { sp.before("shell", { command: "false" }); sp.after("shell", { command: "false" }, false); }
  ok("anti-spin: gagal identik ke-4 → deny (trip)", sp.before("shell", { command: "false" }).effect === "deny" && sp.tripped);
  const sp2 = new G.RuntimeSpin({ maxFail: 3, maxRepeat: 4 });
  let r2; for (let i = 0; i < 5; i++) r2 = sp2.before("read", { path: "a" });
  ok("anti-spin: panggilan identik >4x → deny", r2.effect === "deny");
  const dg = G.doneGateFromJournal([{ kind: "shell", command: "node --test", exit: 1 }, { kind: "shell", command: "ls", exit: 0 }]);
  ok("done-gate runtime: tes terakhir exit 1 → FAIL", dg.ran === 1 && dg.last.exit === 1 && evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: dg.last.exit }).isDone === false);
  // --- v0.3.41 (P0-3): fail-closed — tanpa bukti tes bukan PASS; jurnal tanpa tes membedakan tulis/baca ---
  const noEv = evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], verificationProfile: "STANDARD", facts: [] });
  ok("done-gate: tanpa testCommandExitCode/testsGreen -> bukan PASS (fail-closed, alasan 'tidak ada bukti tes')",
    noEv.isDone === false && noEv.testsPassed === false && /tidak ada bukti tes/i.test(noEv.failureReason || ""));
  ok("done-gate: testsGreen true -> PASS; testsGreen false -> FAIL",
    evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], verificationProfile: "STANDARD", testsGreen: true, facts: ["FACT: tes hijau"] }).isDone === true
    && evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], verificationProfile: "STANDARD", testsGreen: false, facts: [] }).isDone === false);
  ok("done-gate runtime: jurnal tanpa tes + tool tulis selesai -> wrote; hanya baca / tulis gagal -> tidak wrote",
    G.doneGateFromJournal([{ kind: "guard", status: "ok" }, { kind: "tool", tool: "edit", status: "completed" }]).wrote === true
    && G.doneGateFromJournal([{ kind: "tool", tool: "read", status: "completed" }, { kind: "tool", tool: "glob", status: "completed" }]).wrote === false
    && G.doneGateFromJournal([{ kind: "tool", tool: "write", status: "error" }]).wrote === false
    && G.doneGateFromJournal([{ kind: "guard", status: "ok" }]).ran === 0
    && G.doneGateFromJournal([{ kind: "guard", status: "ok" }]).wrote === false);
  ok("L1 parser: JSON biasa, SSE, fence", SD.extractCompletionText('{"choices":[{"message":{"content":"x"}}]}') === "x" && SD.extractCompletionText('data: {"choices":[{"delta":{"content":"{\\"skills\\""}}]}\n\ndata: {"choices":[{"delta":{"content":":[]}"}}]}\n\ndata: [DONE]') === '{"skills":[]}' && SD.parseSelection('```json\n{"skills":["a"],"x":"}"}\n```').skills[0] === "a");
  ok("L1 key: fallback NINEROUTER_API_KEY", (() => { const o = process.env.SW_9ROUTER_KEY, n9 = process.env.NINEROUTER_API_KEY; delete process.env.SW_9ROUTER_KEY; process.env.NINEROUTER_API_KEY ||= "t"; const k = SD.routerKey(); if (o !== undefined) process.env.SW_9ROUTER_KEY = o; if (n9 === undefined) delete process.env.NINEROUTER_API_KEY; else process.env.NINEROUTER_API_KEY = n9; return !!k; })());
  ok("guard v3: daftar NAMA .env (ls/find -name/test/stat) → allow; isi via pipe/xargs/-exec/redirect → deny", ["ls -la .env*", "find . -name '.env*'", "test -f .env && echo ada", "stat .env"].every((x) => c(x) === "allow") && ["ls .env | xargs cat", "find . -name .env -exec cat {} ;", "cat < .env", "ls $(cat .env)"].every((x) => c(x) === "deny"));
  ok("guard v3: glob/list pola .env* → allow; read/grep/edit .env → deny", ["glob", "list"].every((t) => G.classifyFileTool(t, { pattern: "**/.env*" }).effect === "allow") && ["read", "grep", "edit", "write"].every((t) => G.classifyFileTool(t, { path: ".env" }).effect === "deny"));
  const sp3 = new G.RuntimeSpin({ maxFail: 3, maxRepeat: 4 });
  for (let i = 0; i < 3; i++) { sp3.before("shell", { command: "npm test" }); sp3.after("shell", { command: "npm test" }, false); }
  ok("anti-spin v3: setelah trip hanya signature itu yang diblok; tool/aksi lain tetap jalan", sp3.before("shell", { command: "npm test" }).effect === "deny" && sp3.before("edit", { filePath: "a.js" }).effect === "allow" && sp3.before("shell", { command: "npm test -- --grep x" }).effect === "allow");
  ok("done-gate v3: spin diikuti verifikasi lulus → bukan spin; tanpa verifikasi → spin", !G.doneGateFromJournal([{ kind: "spin", reason: "x" }, { kind: "shell", command: "npm test", exit: 0 }]).spin && !!G.doneGateFromJournal([{ kind: "shell", command: "npm test", exit: 0 }, { kind: "spin", reason: "x" }]).spin);
  ok("done-gate v3: exit disamarkan (|| true / set +e) atau output 'not ok' → FAIL", G.doneGateFromJournal([{ kind: "shell", command: "for i in 1 2; do node --test a.mjs || true; done", exit: 0 }]).last.exit !== 0 && G.doneGateFromJournal([{ kind: "shell", command: "npm test", exit: 0, failed_output: true }]).last.exit !== 0 && G.doneGateFromJournal([{ kind: "shell", command: "npm test", exit: 0 }]).last.exit === 0 && G.testOutputFailed("TAP version 13\nnot ok 1 - x") && !G.testOutputFailed("ok 1 - x\n# fail 0"));
  ok("done-gate v3: exit ditimpa perintah sesudah tes (; | & loop) → FAIL; && / redirect → tetap", ["node --test a.mjs > /dev/null; echo x", "npm test | tee o", "npm test &", "for i in 1 2; do npm test; done"].every((c) => G.doneGateFromJournal([{ kind: "shell", command: c, exit: 0 }]).last.exit !== 0) && ["npm test 2>&1", "npm test >o.txt 2>&1 && echo ok", "cd app && npm test"].every((c) => G.doneGateFromJournal([{ kind: "shell", command: c, exit: 0 }]).last.exit === 0));
  ok("router v3: permintaan trading → tidak ada skill; fallbackPick ≤3", SD.TRADING_RE.test("backtest strategi trading saham") && !SD.TRADING_RE.test("analisis laporan keuangan") && SD.fallbackPick([1, 2, 3, 4, 5].map((i) => ({ name: "s" + i, score: 1 / i }))).length === 3);
  ok("layer0: backend/API → coding, keuangan → finance, audit Express tidak dibajak coding", layer0("buat REST API express dengan test").sektor === "coding" && layer0("analisis laporan keuangan").sektor === "finance" && layer0("tolong audit keamanan kode Express").sektor !== "coding");

  // --- v0.3.23: evaluateTool — urutan penegakan tinggal di guard, bisa diuji tanpa engine ---
  const evSp = G.sandboxPaths(W, { home: "/home/u" });
  const ev = (tool, input, o = {}) => G.evaluateTool(tool, input, { workspace: W, sandbox: evSp, tier: "standard", headless: true, ...o });
  ok("evaluateTool: tool di luar SHELL/FILE → allow tanpa urutan", ev("webfetch", { url: "https://x" }).effect === "allow");
  ok("evaluateTool: shell rahasia → deny secret; file .env → deny secret", ev("shell", { command: "cat .env" }).rule === "secret" && ev("read", { path: ".env" }).rule === "secret");
  ok("evaluateTool: closed → tulis deny, baca allow", ev("shell", { command: "ls" }, { closed: "LUMI_GUARD_CLOSED: x" }).effect === "deny" && ev("read", { path: "a.md" }, { closed: "LUMI_GUARD_CLOSED: x" }).effect === "allow");
  ok("evaluateTool: push branch non-headless → ask diteruskan", G.evaluateTool("shell", { command: "git push origin feat/a" }, { workspace: W, sandbox: evSp, tier: "standard", headless: false }).effect === "ask");
  ok("evaluateTool: tulis di luar sandbox → deny sandbox-outside (jalur opt-in: sandbox eksplisit)", ev("shell", { command: "echo x > /etc/passwd" }).rule === "sandbox-outside");
  // v0.3.71: sandbox mati DEFAULT — evaluateTool dengan sandbox:null (jalur
  // plugin normal) mengizinkan baca/tulis di luar folder proyek, seperti
  // OpenCode biasa; rahasia + destruktif + anti-spin TETAP berlaku.
  const evOff = (tool, input, o = {}) => G.evaluateTool(tool, input, { workspace: W, sandbox: null, tier: "standard", headless: true, ...o });
  ok("v0.3.71: sandbox off (default) — baca/tulis di luar proyek diizinkan",
    evOff("read", { path: "/etc/hostname" }).effect === "allow"
    && evOff("write", { filePath: "/tmp/lain/x.txt" }).effect === "allow"
    && evOff("shell", { command: "echo x > /tmp/lain/y.txt" }).effect === "allow"
    && G.classifyFileTool("write", { filePath: "/srv/data/a.txt" }, { workspace: W, sandbox: null }).effect === "allow");
  ok("v0.3.71: sandbox off — rahasia + destruktif TETAP ditolak",
    evOff("read", { path: ".env" }).rule === "secret" && evOff("shell", { command: "rm -rf /" }).rule !== "sandbox-outside"
    && evOff("shell", { command: "rm -rf /" }).effect === "deny" && evOff("read", { path: "~/.ssh/id_rsa" }).rule === "secret");
  // v0.3.71 scope B (koreksi — terbukti live 0371): external_directory ask →
  // ALLOW di semua lapisan, bukan dihapus. Menghapusnya membuat aturan
  // `*_*` deny di frontmatter agent menelan external_directory (engine:
  // aturan eksplisit sesudah wildcard yang menang) → read di luar proyek
  // ditolak "Permission denied: external_directory".
  const extAllow = (f) => { const t = fs.readFileSync(f, "utf8"); return /external_directory/.test(t) && /external_directory[\s\S]{0,160}allow/.test(t) && !/external_directory[\s\S]{0,160}"ask"/.test(t) && !/external_directory[\s\S]{0,160}effect: "ask"/.test(t); };
  ok("v0.3.71: scope B — external_directory = allow (bukan ask/deny) di config/policy",
    extAllow("lumitome/config/opencode.jsonc") && extAllow("opencode.jsonc")
    && extAllow("lumitome/lib/build-config.mjs") && extAllow("scripts/gen-policy.mjs")
    && !/external_directory/.test(fs.readFileSync("scripts/check-opencode.mjs", "utf8")));
  ok("v0.3.71: scope B — file agent hasil generate membawa external_directory allow",
    /external_directory", resource: "\*", effect: allow/.test(fs.readFileSync(".opencode/agents/orchestrator.md", "utf8"))
    && /external_directory", resource: "\*", effect: allow/.test(fs.readFileSync(".opencode/agents/thinking.md", "utf8")));
  const evTmp = (await import("node:os")).tmpdir() + "/lumi-sbx-test";
  ok("evaluateTool: mode bwrap → rewrite, bukan deny", (() => { const r = G.evaluateTool("shell", { command: "echo hi" }, { workspace: process.cwd(), sandbox: G.sandboxPaths(process.cwd(), { home: "/home/u" }), sandboxMode: "bwrap", argsDir: evTmp }); return r.effect === "allow" && /^bwrap --args 3 /.test(r.rewrite.command); })());
  ok("evaluateTool: spin trip lewat urutan (identik >4x → deny spin)", (() => { const s = new G.RuntimeSpin({ maxFail: 3, maxRepeat: 4 }); let r; for (let i = 0; i < 5; i++) r = G.evaluateTool("shell", { command: "echo hi" }, { workspace: W, sandbox: evSp, spin: s }); return r.rule === "spin"; })());
}

// ---------- v0.3.16: sandbox gaya Codex: baca $HOME (ro), tulis cwd; rahasia di-mask ----------
{
  const G = await import("../harness/lumi-guard.mjs");
  const os = await import("node:os");
  const H = "/home/u";
  ok("v0.3.19: tidak ada sandbox.json di workspace; trust hidup di luar workspace", G.findProjectRoot === undefined && G.parseSandboxConfig === undefined && G.ROOT_MARKERS === undefined && !fs.readFileSync("harness/lumi-guard.mjs", "utf8").includes("sandbox.json") && !fs.readFileSync("lumitome/config/plugins/lumitome-guard.ts", "utf8").includes("sandbox.json") && !fs.readFileSync("README.md", "utf8").includes("sandbox.json") && G.trustFilePath("/home/u/.lumitome") === "/home/u/.lumitome/trust.json");
  const sp = G.sandboxPaths("/home/u/Documents/projA", { home: H });
  ok("sandboxPaths: read = $HOME + sistem, write = cwd saja", sp.read[0] === H && sp.read.includes("/usr") && sp.write.join() === "/home/u/Documents/projA" && sp.masked.includes("/home/u/.ssh"));
  ok("sandboxPaths: .lumitome/sandbox.json lama diabaikan (tanpa opsi config)", !("config" in sp) && !("errors" in sp));
  ok("pathAccess: cwd write, $HOME read, rahasia masked, luar outside", G.pathAccess("/home/u/Documents/projA/a.py", sp) === "write" && G.pathAccess("/home/u/Downloads/projB/x.txt", sp) === "read" && G.pathAccess("/home/u/.ssh/id_ed25519", sp) === "masked" && G.pathAccess("/home/u/.gnupg/x", sp) === "masked" && G.pathAccess("/home/u/.config/google-chrome/Default/Cookies", sp) === "masked" && G.pathAccess("/srv/x", sp) === "outside" && G.pathAccess("/usr/bin/python3", sp) === "read");
  const fd = (t, i) => G.classifyFileTool(t, i, { workspace: sp.cwd, sandbox: sp });
  ok("file tool: baca projB boleh; tulis projB → LUMI_SANDBOX_OUTSIDE; tulis cwd boleh", fd("read", { filePath: "/home/u/Downloads/projB/x.txt" }).effect === "allow" && fd("grep", { path: "~/Downloads" }).effect === "allow" && /LUMI_SANDBOX_OUTSIDE: tulis/.test(fd("write", { filePath: "/home/u/Downloads/projB/x.txt" }).reason) && fd("edit", { filePath: "a.py" }).effect === "allow" && fd("write", { filePath: "../x" }).effect === "deny");
  ok("file tool: rahasia $HOME (ssh/gnupg/aws/browser/kredensial) → deny secret", ["~/.ssh/id_rsa", "/home/u/.aws/config", "~/.gnupg/pubring.kbx", "~/.mozilla/firefox/p/cookies.sqlite", "~/.lumitome/credentials.json", "~/.local/share/keyrings/login.keyring", "/home/u/Downloads/projB/.env"].every((p) => fd("read", { filePath: p }).rule === "secret"));
  ok("file tool: apply_patch ke luar cwd → deny", fd("apply_patch", { patchText: "*** Begin Patch\n*** Add File: /home/u/Downloads/projB/n.py\n+x\n*** End Patch" }).effect === "deny");
  ok("file tool: di luar $HOME → deny baca; glob/list nama saja tetap boleh", fd("read", { filePath: "/srv/data/a" }).rule === "sandbox-read" && fd("glob", { path: "/srv" }).effect === "allow");
  const so = (c) => G.shellOutsidePaths(c, sp, { home: H });
  ok("shell: tulis ke luar cwd (redirect/tee/cp/mv/touch) → write; baca $HOME → tidak", so("cat ~/Downloads/projB/x > out.txt").length === 0 && so("echo a > ~/Downloads/projB/y")[0]?.kind === "write" && so("cp a.txt ~/Downloads/projB/").length === 1 && so("ls | tee ../log").length === 1 && so("touch ~/x").length === 1 && so("echo x > /dev/null; echo y >/tmp/z; cmd 2>&1").length === 0);
  ok("shell: rahasia $HOME via host (cat/python) → deny secret; ls nama boleh", ["cat ~/.ssh/id_ed25519", "python3 -c \"open('/home/u/.aws/credentials')\"", "cp ~/.gnupg/secring.gpg .", "sqlite3 ~/.config/google-chrome/Default/Cookies"].every((x) => G.classifyShell(x, { workspace: sp.cwd }).rule === "secret") && G.classifyShell("ls ~/.ssh", { workspace: sp.cwd }).effect === "allow" && G.classifyShell("chromium --version", { workspace: sp.cwd }).effect === "allow");
  ok("pesan LUMI_SANDBOX_OUTSIDE tulis menyebut folder kerja, tanpa sandbox.json", /LUMI_SANDBOX_OUTSIDE.*\/home\/u\/Documents\/projA/.test(G.outsideMessage("~/x", sp, "write")) && !/sandbox\.json/.test(G.outsideMessage("~/x", sp, "write")));
  const PG = fs.readFileSync("lumitome/config/plugins/lumitome-guard.ts", "utf8");
  ok("plugin: kebijakan dari buildSandboxScope (tier per sesi); gagal → LUMI_GUARD_CLOSED; urutan di guard.evaluateTool", /buildSandboxScope\(WS/.test(PG) && /LUMI_GUARD_CLOSED: kebijakan sandbox/.test(PG) && /evaluateTool\(tool, e\.input/.test(PG) && /tier: TIER/.test(PG) && /outside\[0\]\.kind/.test(fs.readFileSync("harness/lumi-guard.mjs", "utf8")));
  // v0.3.19: tier sandbox + akar proyek + SSH deploy
  {
    const cp = await import("node:child_process");
    const th = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lumi-tier-home-")));
    const tp = path.join(th, "Bindo", "P13", "Latihan");
    fs.mkdirSync(tp, { recursive: true });
    fs.writeFileSync(path.join(th, "Bindo", "MEMORY.md"), "# memori\n");
    const lh = path.join(th, ".lumitome");
    const o = { home: th, lumiHome: lh, env: {} };
    ok("tier: root terdeteksi dari MEMORY.md 2 tingkat di atas; marker di $HOME diabaikan", G.detectProjectRoot(tp, { home: th }) === path.join(th, "Bindo") && G.detectProjectRoot(path.join(th, "x"), { home: th }) === path.join(th, "x"));
    ok("tier: default standard tanpa file trust; env LUMI_TRUST_TIER menang; tier tak valid → standard", G.resolveTrustTier(tp, o) === "standard" && G.resolveTrustTier(tp, { ...o, env: { LUMI_TRUST_TIER: "strict" } }) === "strict" && G.resolveTrustTier(tp, { ...o, env: { LUMI_TRUST_TIER: "ngawur" } }) === "standard");
    const trust = (args, cwd) => cp.spawnSync(process.execPath, [path.resolve("lumitome/bin/lumitome.mjs"), "trust", ...args], { encoding: "utf8", cwd, env: { ...process.env, LUMI_HOME: lh } });
    const r1 = trust([], tp);
    ok("cli trust: tanpa argumen tampilkan tier + tulis + ssh", r1.status === 0 && r1.stdout.includes("tier: standard") && r1.stdout.includes("MEMORY.md"));
    const r2 = trust(["trusted"], tp);
    const tf = JSON.parse(fs.readFileSync(path.join(lh, "trust.json"), "utf8"));
    ok("cli trust: set tier menulis trust.json 0600", r2.status === 0 && tf.projects[path.join(th, "Bindo")].tier === "trusted" && (fs.statSync(path.join(lh, "trust.json")).mode & 0o777) === 0o600);
    ok("tier: file trust mengangkat tier proyek", G.resolveTrustTier(tp, o) === "trusted");
    const sTru = G.buildSandboxScope(tp, o);
    ok("tier trusted: tulis selebar akar proyek; trust file ter-mask dari agent", sTru.tier === "trusted" && sTru.sp.write[0] === path.join(th, "Bindo") && G.isMasked(path.join(lh, "trust.json"), sTru.sp) && G.classifyFileTool("read", { filePath: path.join(lh, "trust.json") }, { workspace: tp, sandbox: sTru.sp }).effect === "deny" && G.classifyFileTool("write", { filePath: path.join(lh, "trust.json") }, { workspace: tp, sandbox: sTru.sp }).effect === "deny");
    const sStd = G.buildSandboxScope(tp, { ...o, env: { LUMI_TRUST_TIER: "standard" } });
    ok("tier standard: tulis = ws + file MEMORY.md ancestor; file lain di parent tetap tidak", sStd.tier === "standard" && sStd.sp.write.includes(path.join(th, "Bindo", "MEMORY.md")) && sStd.sp.write.includes(tp) && G.pathAccess(path.join(th, "Bindo", "MEMORY.md"), sStd.sp) === "write" && G.pathAccess(path.join(th, "Bindo", "lain.txt"), sStd.sp) === "read");
    const fd2 = (t, i) => G.classifyFileTool(t, i, { workspace: tp, sandbox: sStd.sp });
    ok("tier standard: tulis MEMORY.md ancestor boleh; tulis file parent lain → deny", fd2("write", { filePath: path.join(th, "Bindo", "MEMORY.md") }).effect === "allow" && fd2("write", { filePath: path.join(th, "Bindo", "lain.txt") }).effect === "deny");
    const cs = (cmd, tier) => G.classifyShell(cmd, { workspace: tp, tier, home: th, lumiHome: lh });
    ok("ssh: standard tanpa -i → deny; -i kunci deploy → allow; trusted bebas; -A hanya trusted", cs("ssh deploy@vps", "standard").rule === "ssh-key" && cs("ssh -i ~/.lumitome/deploy-vps deploy@vps", "standard").effect === "allow" && cs("ssh deploy@vps", "trusted").effect === "allow" && cs("ssh -A deploy@vps", "standard").rule === "ssh-agent-forward" && cs("ssh -A deploy@vps", "trusted").effect === "allow");
    ok("ssh: kunci ~/.ssh BOLEH sebagai -i di tier trusted (v0.3.34); nama id_* di luar ~/.ssh tetap deny", cs("ssh -i ~/.ssh/id_ed25519 deploy@vps", "trusted").effect === "allow" && cs("ssh -i ~/.ssh/id_ed25519 deploy@vps", "standard").rule === "secret" && cs("ssh -i ~/.lumitome/id_ed25519 deploy@vps", "trusted").rule === "secret" && cs("ssh -i ~/.lumitome/id_ed25519 deploy@vps", "standard").rule === "secret");
    ok("ssh trusted: -o IdentityFile + scp -i kunci ~/.ssh → allow; standard tetap deny", cs("ssh -o IdentityFile=~/.ssh/id_ed25519 deploy@vps", "trusted").effect === "allow" && cs("scp -i ~/.ssh/id_ed25519 f deploy@vps:/srv/", "trusted").effect === "allow" && cs("scp -i ~/.ssh/id_ed25519 f deploy@vps:/srv/", "standard").rule === "secret");
    ok("ssh trusted: baca/salin kunci tetap deny; perintah remote sentuh kunci/.env tetap deny", cs("cat ~/.ssh/id_ed25519", "trusted").rule === "secret" && cs("cp ~/.ssh/id_ed25519 /tmp/x", "trusted").rule === "secret" && cs("ssh -i ~/.ssh/id_ed25519 deploy@vps 'cat ~/.ssh/id_ed25519'", "trusted").rule === "secret" && cs("ssh -i ~/.ssh/id_ed25519 deploy@vps 'cat .env'", "trusted").rule === "secret");
    ok("ssh trusted: kunci deploy lama tetap allow; -i non-secret di standard deny ssh-key; multi-segmen fail-closed", cs("ssh -i ~/.lumitome/deploy-vps deploy@vps", "trusted").effect === "allow" && cs("ssh -i /etc/passwd deploy@vps", "standard").rule === "ssh-key" && cs("ssh -i ~/.ssh/id_ed25519 deploy@vps uptime; echo ok", "trusted").rule === "secret");
    ok("sudo: tetap deny di semua tier (lokal); remote tidak diatur guard", cs("sudo systemctl restart app", "trusted").rule === "sudo" && cs("sudo -i", "standard").rule === "sudo");
    fs.writeFileSync(path.join(lh, "trust.json"), JSON.stringify({ projects: { [path.join(th, "Bindo")]: { tier: "trusted", write: ["../lain.txt", "/etc/passwd"] } } }));
    const sEx = G.buildSandboxScope(tp, o);
    ok("tier: entri write eksplisit di trust file dipakai (relatif root), di luar $HOME dibuang", sEx.sp.write.includes(path.join(th, "lain.txt")) && !sEx.sp.write.includes("/etc/passwd"));
    // cache pemindaian rahasia: hasil pertama dipakai ulang walau file dihapus; clear → hasil baru
    const cw = path.join(th, "ws"); fs.mkdirSync(cw, { recursive: true });
    fs.writeFileSync(path.join(cw, ".env"), "K=1\n");
    G.clearSecretScanCache();
    const hasMask = (args) => args.some((a, i) => a === "--ro-bind" && args[i + 1] === "/dev/null" && args[i + 2] === path.join(cw, ".env"));
    const a1 = G.bwrapArgs("echo hi", { workspace: cw, home: th, toolDirs: [] });
    fs.rmSync(path.join(cw, ".env"));
    const a2 = G.bwrapArgs("echo hi", { workspace: cw, home: th, toolDirs: [] });
    G.clearSecretScanCache();
    const a3 = G.bwrapArgs("echo hi", { workspace: cw, home: th, toolDirs: [] });
    ok("cache scan: mask .env bertahan setelah file dihapus (cache), hilang setelah clear", hasMask(a1) && hasMask(a2) && !hasMask(a3));
    const r3 = trust(["ngawur"], tp);
    ok("cli trust: tier tak valid → exit 2", r3.status === 2);
    fs.rmSync(th, { recursive: true, force: true });
  }
  // e2e Linux: HOME sementara, projA (~/Documents) dan projB (~/Downloads)
  if (process.platform === "linux" && G.bwrapAvailable() && fs.existsSync("/usr/bin/python3")) {
    const { execFileSync } = await import("node:child_process");
    const run = (cmd) => { try { return execFileSync("bash", ["-c", cmd], { encoding: "utf8" }); } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); } };
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-e2e-home-"));
    const A = path.join(home, "Documents", "projA"), B = path.join(home, "Downloads", "projB");
    fs.mkdirSync(A, { recursive: true }); fs.mkdirSync(B, { recursive: true }); fs.mkdirSync(path.join(home, ".ssh"));
    fs.writeFileSync(path.join(B, "data.txt"), "DATA_B"); fs.writeFileSync(path.join(B, ".env"), "TOKEN=SECRET_B"); fs.writeFileSync(path.join(home, ".ssh", "id_ed25519"), "SECRET_KEY");
    const py = `import os
print('READ_B', open(os.path.expanduser('~/Downloads/projB/data.txt')).read())
try:
  open(os.path.expanduser('~/Downloads/projB/new.txt'),'w').write('x'); print('WRITE_B ok')
except OSError as e: print('WRITE_B', type(e).__name__, e.errno)
open('hasil.txt','w').write('ok'); print('WRITE_A ok')
for f in ['~/.ssh/id_ed25519', '~/Downloads/projB/.env']:
  try: d = open(os.path.expanduser(f)).read(); print('SECRET', f, 'LEAK' if 'SECRET' in d else 'masked-empty')
  except OSError as e: print('SECRET', f, type(e).__name__, e.errno)`;
    fs.writeFileSync(path.join(A, "t.py"), py);
    const spE = G.sandboxPaths(A, { home });
    const out = run(G.bwrapCommand("python3 t.py", { workspace: A, sandbox: spE, argsDir: path.join(os.tmpdir(), "lumi-sbx-e2e") }));
    console.log("  e2e:", out.trim().replace(/\n/g, " | "));
    ok("e2e bwrap: python dari projA membaca projB", /READ_B DATA_B/.test(out));
    ok("e2e bwrap: tulis projB → OSError 30 (read-only), tidak ada file", /WRITE_B OSError 30/.test(out) && !fs.existsSync(path.join(B, "new.txt")));
    ok("e2e bwrap: tulis projA berhasil", /WRITE_A ok/.test(out) && fs.readFileSync(path.join(A, "hasil.txt"), "utf8") === "ok");
    ok("e2e bwrap: ~/.ssh dan projB/.env tidak bocor", /SECRET ~\/\.ssh\/id_ed25519 (FileNotFoundError|PermissionError)/.test(out) && /SECRET ~\/Downloads\/projB\/\.env (masked-empty|PermissionError|FileNotFoundError)/.test(out) && !/LEAK/.test(out));
    // skenario template di folder induk (laporan kuliah): baca ../../Template.docx, tidak bisa menimpanya
    const course = path.join(home, "Kuliyah", "ML IOT"), cwd = path.join(course, "P9", "Latihan");
    fs.mkdirSync(cwd, { recursive: true }); fs.writeFileSync(path.join(course, "Template.docx"), "TEMPLATE");
    fs.writeFileSync(path.join(cwd, "t.py"), "print('READ', open('../../Template.docx').read())\ntry:\n  open('../../Template.docx','a').write('x'); print('WRITE_PARENT ok')\nexcept OSError as e: print('WRITE_PARENT', type(e).__name__, e.errno)\nopen('hasil.txt','w').write('ok'); print('WRITE_CWD ok')");
    const out2 = run(G.bwrapCommand("python3 t.py", { workspace: cwd, sandbox: G.sandboxPaths(cwd, { home }), argsDir: path.join(os.tmpdir(), "lumi-sbx-e2e") }));
    console.log("  e2e template:", out2.trim().replace(/\n/g, " | "));
    ok("e2e template induk: baca ok, tulis induk errno 30, tulis cwd ok", /READ TEMPLATE/.test(out2) && /WRITE_PARENT OSError 30/.test(out2) && /WRITE_CWD ok/.test(out2) && fs.readFileSync(path.join(course, "Template.docx"), "utf8") === "TEMPLATE");
    fs.rmSync(home, { recursive: true, force: true });
  } else console.log("  (e2e bwrap dilewati: bukan Linux/bwrap/python3)");
}

// ---------- v0.3.43 (P1-2): perketat tuas env keamanan — VISIBILITAS dulu, bukan blokir ----------
// TDD (mattpocock): tes ini ditulis SEBELUM implementasi — harus MERAH dulu.
{
  const G = await import("../harness/lumi-guard.mjs");
  const TP = await import("../lumitome/lib/trust-project.mjs");
  const osm43 = await import("node:os");
  const cp43 = await import("node:child_process");
  const PG43 = fs.readFileSync("lumitome/config/plugins/lumitome-guard.ts", "utf8");
  const W43 = fs.readFileSync("lumitome/bin/lumitome.mjs", "utf8");

  // (1) LUMI_TRUST_PROJECT=1: konfirmasi interaktif tiap sesi + dicatat di jurnal; non-TTY jujur.
  ok("P1-2 (1): trust-project mati -> tidak diizinkan, mode off",
    TP.decideTrustProject({ trust: false, interactive: true, answer: "ya" }).allowed === false
    && TP.decideTrustProject({ trust: false, interactive: true, answer: "ya" }).mode === "off");
  ok("P1-2 (1): TTY + jawab 'ya' -> diizinkan mode confirmed; jawab lain -> ditolak",
    TP.decideTrustProject({ trust: true, interactive: true, answer: "ya" }).allowed === true
    && TP.decideTrustProject({ trust: true, interactive: true, answer: "ya" }).mode === "confirmed"
    && TP.decideTrustProject({ trust: true, interactive: true, answer: "" }).allowed === false
    && TP.decideTrustProject({ trust: true, interactive: true, answer: "tidak" }).allowed === false);
  ok("P1-2 (1): non-TTY + trust -> diizinkan mode non-tty, alasan jujur (tanpa konfirmasi interaktif)",
    (() => { const d = TP.decideTrustProject({ trust: true, interactive: false, answer: "" }); return d.allowed === true && d.mode === "non-tty" && /non-TTY/i.test(d.reason) && /tanpa konfirmasi/i.test(d.reason); })());
  ok("P1-2 (1): baris jurnal trust-project: kind + runId + workspace + mode + alasan; keputusan murni tanpa fs",
    (() => { const r = TP.trustProjectJournalRow({ runId: "r1", workspace: "/w", mode: "confirmed", reason: "x" }); return r.kind === "trust-project" && r.runId === "r1" && r.workspace === "/w" && r.mode === "confirmed" && typeof r.reason === "string"; })()
    && !/from "node:fs"|require\("node:fs"\)/.test(fs.readFileSync("lumitome/lib/trust-project.mjs", "utf8")));
  ok("P1-2 (1): wrapper mencatat trust-project ke jurnal + tanpa file persetujuan permanen",
    /trustProjectJournalRow/.test(W43) && /jotTrust/.test(W43) && /kind: "trust-project"/.test(fs.readFileSync("lumitome/lib/trust-project.mjs", "utf8")) && !/trust-project-accepted|grant\.json/.test(W43));

  // (2) Tier dari env: sumber dibedakan + peringatan persisten + jurnal.
  const th43 = fs.realpathSync(fs.mkdtempSync(path.join(osm43.tmpdir(), "lumip12-")));
  const tp43 = path.join(th43, "Bindo", "P13");
  fs.mkdirSync(tp43, { recursive: true });
  fs.writeFileSync(path.join(th43, "Bindo", "MEMORY.md"), "# memori\n");
  const lh43 = path.join(th43, ".lumitome");
  const o43 = { home: th43, lumiHome: lh43, env: {} };
  ok("P1-2 (2): resolveTrustTierDetailed: default/file/env dibedakan; env tak valid -> default",
    G.resolveTrustTierDetailed(tp43, o43).tier === "standard" && G.resolveTrustTierDetailed(tp43, o43).source === "default"
    && G.resolveTrustTierDetailed(tp43, { ...o43, env: { LUMI_TRUST_TIER: "strict" } }).source === "env"
    && G.resolveTrustTierDetailed(tp43, { ...o43, env: { LUMI_TRUST_TIER: "strict" } }).tier === "strict"
    && G.resolveTrustTierDetailed(tp43, { ...o43, env: { LUMI_TRUST_TIER: "ngawur" } }).tier === "standard"
    && G.resolveTrustTierDetailed(tp43, { ...o43, env: { LUMI_TRUST_TIER: "ngawur" } }).source === "default"
    && (() => { fs.mkdirSync(lh43, { recursive: true }); fs.writeFileSync(path.join(lh43, "trust.json"), JSON.stringify({ projects: { [path.join(th43, "Bindo")]: "trusted" } })); const d = G.resolveTrustTierDetailed(tp43, o43); fs.rmSync(path.join(lh43, "trust.json")); return d.tier === "trusted" && d.source === "file"; })());
  ok("P1-2 (2): buildSandboxScope membawa tierSource (env/file/default)",
    G.buildSandboxScope(tp43, { ...o43, env: { LUMI_TRUST_TIER: "strict" } }).tierSource === "env"
    && G.buildSandboxScope(tp43, o43).tierSource === "default"
    && (() => { fs.writeFileSync(path.join(lh43, "trust.json"), JSON.stringify({ projects: { [path.join(th43, "Bindo")]: "trusted" } })); const s = G.buildSandboxScope(tp43, o43); fs.rmSync(path.join(lh43, "trust.json")); return s.tierSource === "file" && s.tier === "trusted"; })());
  // v0.3.71: "sandbox-downgraded" DIHAPUS — sandbox off kini default, bukan
  // penurunan; plugin hanya mencatat tier-env + wiring opt-in bwrap.
  ok("P1-2 (2): plugin mencatat tierSource di jurnal; tanpa lagi sandbox-downgraded (off = default)",
    /tierSource/.test(PG43) && /kind: "tier-env"/.test(PG43) && !/kind: "sandbox-downgraded"/.test(PG43)
    && /LUMI_SANDBOX === "bwrap"/.test(PG43) && /sandbox === "bwrap" \? SP : null/.test(PG43));
  ok("P1-2 (2): wrapper memperingatkan tier dari env (bukan file trust)",
    /berasal dari env LUMI_TRUST_TIER/.test(W43));
  {
    const trust43 = (args, cwd, extra = {}) => cp43.spawnSync(process.execPath, [path.resolve("lumitome/bin/lumitome.mjs"), "trust", ...args], { encoding: "utf8", cwd, env: { ...process.env, LUMI_HOME: lh43, ...extra } });
    const rEnv = trust43([], tp43, { LUMI_TRUST_TIER: "strict" });
    const rFile = (() => { fs.writeFileSync(path.join(lh43, "trust.json"), JSON.stringify({ projects: { [path.join(th43, "Bindo")]: "trusted" } })); const r = trust43([], tp43); fs.rmSync(path.join(lh43, "trust.json")); return r; })();
    ok("P1-2 (2): `lumitome trust` menampilkan sumber tier (env vs file trust)",
      rEnv.status === 0 && /tier: strict/.test(rEnv.stdout) && /sumber tier: env/.test(rEnv.stdout)
      && rFile.status === 0 && /tier: trusted/.test(rFile.stdout) && /sumber tier: file trust/.test(rFile.stdout));
  }
  fs.rmSync(th43, { recursive: true, force: true });

  // (3) Tool di luar daftar SHELL/FILE: tetap allow (jangan blokir plugin), tapi tercatat unguarded.
  const evSp43 = G.sandboxPaths(process.cwd(), { home: "/home/u" });
  const ev43 = (t, i, o = {}) => G.evaluateTool(t, i, { workspace: process.cwd(), sandbox: evSp43, tier: "standard", headless: true, ...o });
  ok("P1-2 (3): evaluateTool: webfetch/websearch/task/mcp_* -> allow + unguarded; shell/read tetap terjaga",
    ["webfetch", "websearch", "task", "mcp_github_search"].every((t) => { const r = ev43(t, {}); return r.effect === "allow" && r.unguarded === true; })
    && ev43("shell", { command: "echo hi" }).unguarded !== true && ev43("read", { path: "a.md" }).unguarded !== true);
  ok("P1-2 (3): isGuardedTool: shell/file true, webfetch/task/mcp_* false",
    G.isGuardedTool("shell") === true && G.isGuardedTool("read") === true && G.isGuardedTool("edit") === true
    && G.isGuardedTool("webfetch") === false && G.isGuardedTool("task") === false && G.isGuardedTool("mcp_x_y") === false);
  ok("P1-2 (3): plugin mencatat tool di luar daftar sebagai unguarded di jurnal",
    /kind: "unguarded"/.test(PG43));

  // (4) LUMI_HARNESS hanya boleh menunjuk path di bawah ~/.lumitome/ (atau modul guard bawaan).
  const hp43 = (raw, o = {}) => G.resolveHarnessPath(raw, { home: "/home/u", lumiHome: "/home/u/.lumitome", fallback: "/repo/harness/lumi-guard.mjs", ...o });
  ok("P1-2 (4): resolveHarnessPath: kosong -> fallback; di bawah ~/.lumitome -> ok; /tmp/evil -> tolak + pesan jelas",
    hp43("").ok === true && hp43("").path === "/repo/harness/lumi-guard.mjs"
    && hp43("/home/u/.lumitome/guard.mjs").ok === true
    && hp43("~/.lumitome/guard.mjs").ok === true
    && hp43("/tmp/evil.mjs").ok === false && /hanya path di bawah.*\.lumitome/.test(hp43("/tmp/evil.mjs").reason));
  ok("P1-2 (4): resolveHarnessPath: fallback bawaan ok; lolos lewat .. dan relatif -> tolak; symlink ke luar -> tolak",
    hp43("/repo/harness/lumi-guard.mjs").ok === true
    && hp43("/home/u/.lumitome/../evil.mjs").ok === false
    && hp43("../evil.mjs").ok === false
    && (() => { const d = fs.mkdtempSync(path.join(osm43.tmpdir(), "lumihp-")); const lh = path.join(d, ".lumitome"); fs.mkdirSync(lh, { recursive: true }); const evil = path.join(d, "evil.mjs"); fs.writeFileSync(evil, "export default {};"); const link = path.join(lh, "link.mjs"); fs.symlinkSync(evil, link); const r = G.resolveHarnessPath(link, { home: d, lumiHome: lh, fallback: "/repo/harness/lumi-guard.mjs" }); fs.rmSync(d, { recursive: true, force: true }); return r.ok === false; })());
  ok("P1-2 (4): plugin menolak LUMI_HARNESS di luar ~/.lumitome dengan LUMI_GUARD_CLOSED",
    /LUMI_HARNESS/.test(PG43) && /ditolak/.test(PG43) && /LUMI_GUARD_CLOSED: LUMI_HARNESS/.test(PG43));

  // Integrasi wrapper (stub opencode): run non-TTY + TRUST + tier env -> jurnal + stderr.
  {
    const h43 = fs.mkdtempSync(path.join(osm43.tmpdir(), "lumip12run-"));
    const stub43 = path.join(h43, "fake-opencode");
    fs.writeFileSync(stub43, "#!/usr/bin/env node\nconst fs=require('node:fs');\nfor (const r of [{kind:\"guard\",status:\"ok\"}]) fs.appendFileSync(process.env.LUMI_JOURNAL, JSON.stringify(r)+'\\n');\n");
    fs.chmodSync(stub43, 0o755);
    const r43 = cp43.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.resolve("lumitome/bin/lumitome.mjs"), "run", "tolong jelaskan x"],
      { encoding: "utf8", timeout: 60000, cwd: h43, input: "",
        env: { ...process.env, HOME: h43, LUMI_HOME: h43, LUMI_OPENCODE: stub43, LUMI_WORKSPACE: h43, LUMI_AUTO_INDEX: "0", LUMI_PREFLIGHT: "0", NINEROUTER_API_KEY: "fake", LUMI_TRUST_PROJECT: "1", LUMI_TRUST_TIER: "trusted" } });
    const rows43 = fs.readdirSync(path.join(h43, "runs")).flatMap((f) => fs.readFileSync(path.join(h43, "runs", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
    ok("P1-2 integrasi: run non-TTY + TRUST=1 + tier env -> jurnal trust-project (non-tty) + tier-env; stderr peringatan keras",
      r43.status === 0
      && rows43.some((r) => r.kind === "trust-project" && r.mode === "non-tty")
      && rows43.some((r) => r.kind === "tier-env" && r.tier === "trusted")
      && /PERINGATAN/.test(r43.stderr) && /non-TTY/.test(r43.stderr) && /berasal dari env LUMI_TRUST_TIER/.test(r43.stderr));
    fs.rmSync(h43, { recursive: true, force: true });
  }
}

// --- v0.3.51: mode auto jadi default (flag --auto engine; deny tetap berlaku) ---
{
  const AM = await import("../lumitome/lib/auto-mode.mjs");
  const G = await import("../harness/lumi-guard.mjs");
  ok("auto-mode: default (tanpa env/flag) = auto aktif, sumber default",
    AM.resolveAutoMode({ env: {}, argv: [] }).auto === true && AM.resolveAutoMode({ env: {}, argv: [] }).source === "default");
  ok("auto-mode: LUMI_AUTO_MODE=0 mematikan; =1 / tidak diset menyalakan",
    AM.resolveAutoMode({ env: { LUMI_AUTO_MODE: "0" }, argv: [] }).auto === false
    && AM.resolveAutoMode({ env: { LUMI_AUTO_MODE: "1" }, argv: [] }).auto === true
    && AM.resolveAutoMode({ env: { LUMI_AUTO_MODE: "false" }, argv: [] }).auto === false
    && AM.resolveAutoMode({ env: { LUMI_AUTO_MODE: "off" }, argv: [] }).auto === false);
  ok("auto-mode: flag --no-auto mematikan dan menang atas env =1",
    AM.resolveAutoMode({ env: {}, argv: ["--no-auto"] }).auto === false
    && AM.resolveAutoMode({ env: { LUMI_AUTO_MODE: "1" }, argv: ["run", "--no-auto", "x"] }).auto === false
    && AM.resolveAutoMode({ env: {}, argv: ["--no-auto"] }).source === "flag");
  ok("auto-mode: stripNoAuto membuang --no-auto, argumen lain utuh",
    JSON.stringify(AM.stripNoAuto(["run", "--no-auto", "kerjakan x"])) === JSON.stringify(["run", "kerjakan x"])
    && JSON.stringify(AM.stripNoAuto(["--no-auto"])) === JSON.stringify([]));
  ok("auto-mode: withAutoFlag menaruh --auto di depan (TUI) / sesudah run, tanpa duplikat",
    JSON.stringify(AM.withAutoFlag([])) === JSON.stringify(["--auto"])
    && JSON.stringify(AM.withAutoFlag(["run", "--standalone", "-m", "m", "x"])) === JSON.stringify(["run", "--auto", "--standalone", "-m", "m", "x"])
    && JSON.stringify(AM.withAutoFlag(["--auto"])) === JSON.stringify(["--auto"]));
  ok("auto-mode (v0.3.53): tidak ada lagi baris status start — autoStartLine dihapus (KISS)",
    typeof AM.autoStartLine === "undefined");
  ok("auto-mode: deny guard TETAP berlaku walau auto default (push main, .env, sudo, rm luar)",
    AM.resolveAutoMode({ env: {}, argv: [] }).auto === true
    && G.classifyShell("git push origin main", { workspace: "/workspace/x", headless: false, branch: "feat/a" }).effect === "deny"
    && G.classifyShell("cat .env", { workspace: "/workspace/x", headless: false }).effect === "deny"
    && G.classifyShell("sudo rm -rf /", { workspace: "/workspace/x", headless: false }).effect === "deny"
    && G.classifyShell("rm -rf /workspace/other", { workspace: "/workspace/x", headless: false }).effect === "deny");
  ok("auto-mode: guard tetap mengembalikan ask untuk push branch (bukan allow) — yang mengubahnya jadi jalan adalah flag --auto engine",
    G.classifyShell("git push origin feat/a", { workspace: "/workspace/x", headless: false, branch: "feat/a" }).effect === "ask"
    && G.classifyShell("git push origin feat/a", { workspace: "/workspace/x", headless: true, branch: "feat/a" }).effect === "deny");
  // Integrasi wrapper (stub opencode): `lumitome run` meneruskan --auto, tanpa baris status mode auto (v0.3.53).
  {
    const osm51 = await import("node:os");
    const cp51 = await import("node:child_process");
    const h51 = fs.mkdtempSync(path.join(osm51.tmpdir(), "lumiauto51-"));
    const stub51 = path.join(h51, "fake-opencode");
    const argvFile = path.join(h51, "argv.json");
    fs.writeFileSync(stub51, "#!/usr/bin/env node\nconst fs=require('node:fs');\nfs.writeFileSync(process.env.LUMI_ARGV_FILE, JSON.stringify(process.argv.slice(2)));\nfor (const r of [{kind:\"guard\",status:\"ok\"}]) fs.appendFileSync(process.env.LUMI_JOURNAL, JSON.stringify(r)+'\\n');\n");
    fs.chmodSync(stub51, 0o755);
    const run51 = (extraEnv, extraArgs = []) => cp51.spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.resolve("lumitome/bin/lumitome.mjs"), "run", ...extraArgs, "tolong jelaskan x"],
      { encoding: "utf8", timeout: 60000, cwd: h51, input: "",
        env: { ...process.env, HOME: h51, LUMI_HOME: h51, LUMI_OPENCODE: stub51, LUMI_WORKSPACE: h51, LUMI_AUTO_INDEX: "0", LUMI_PREFLIGHT: "0", NINEROUTER_API_KEY: "fake", LUMI_ARGV_FILE: argvFile, ...extraEnv } });
    const r51a = run51({});
    const a51a = JSON.parse(fs.readFileSync(argvFile, "utf8"));
    ok("auto-mode integrasi (v0.3.53): `lumitome run` default meneruskan --auto (run --auto ...) tanpa baris status mode auto",
      r51a.status === 0 && a51a[0] === "run" && a51a[1] === "--auto" && !/mode auto/.test(r51a.stderr));
    const r51b = run51({ LUMI_AUTO_MODE: "0" });
    const a51b = JSON.parse(fs.readFileSync(argvFile, "utf8"));
    ok("auto-mode integrasi (v0.3.53): LUMI_AUTO_MODE=0 → tanpa --auto dan tanpa baris status mode auto",
      r51b.status === 0 && !a51b.includes("--auto") && !/mode auto/.test(r51b.stderr));
    const r51c = run51({}, ["--no-auto"]);
    const a51c = JSON.parse(fs.readFileSync(argvFile, "utf8"));
    ok("auto-mode integrasi: flag --no-auto → tanpa --auto dan tanpa --no-auto diteruskan ke engine",
      r51c.status === 0 && !a51c.includes("--auto") && !a51c.includes("--no-auto") && !/mode auto/.test(r51c.stderr));
    fs.rmSync(h51, { recursive: true, force: true });
  }
}

// --- Wave 1 (T1.2): execute Code Mode guard, symlink-escape, TCB protection, classifyAction, 2.4.2 output.exitCode & shell-bg ---
{
  const G = await import("../harness/lumi-guard.mjs");
  const { pathToFileURL } = await import("node:url");
  const os = await import("node:os");
  const cp = await import("node:child_process");

  // 1) classifyAction 3-kelas
  ok("T1.2 classifyAction: lookup vs verify vs commit",
    G.classifyAction("read", { filePath: "a.ts" }) === "lookup"
    && G.classifyAction("grep", { pattern: "foo" }) === "lookup"
    && G.classifyAction("shell", { command: "git status" }) === "lookup"
    && G.classifyAction("shell", { command: "npm test" }) === "verify"
    && G.classifyAction("shell", { command: "cd app && npm test" }) === "verify"
    && G.classifyAction("write", { filePath: "a.ts" }) === "commit"
    && G.classifyAction("edit", { filePath: "a.ts" }) === "commit"
    && G.classifyAction("shell", { command: "git commit -m x" }) === "commit"
    && G.classifyAction("execute", { code: 'await Bun.write("a.txt", "1")' }) === "commit");

  // 2) execute Code Mode guard (.env vs .env.example, opencode:///api/, git push main)
  ok("T1.2 execute guard: Bun.file('.env') -> deny execute-policy; .env.example -> allow; opencode:///api/ -> deny",
    G.isGuardedTool("execute") === true
    && (() => { const r = G.evaluateTool("execute", { code: 'await Bun.file(".env").text()' }); return r.effect === "deny" && r.rule === "execute-policy"; })()
    && G.evaluateTool("execute", { code: 'await Bun.file(".env.example").text()' }).effect === "allow"
    && G.evaluateTool("execute", { code: 'await fetch("opencode:///api/session")' }).rule === "execute-policy"
    && G.evaluateTool("execute", { code: 'await $`git push origin main`' }).rule === "execute-policy");

  // 3) symlink-escape (.tmp/x -> ../../.env) + hard-deny TCB + maintainer branch gating
  const root12 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lumi-t12-")));
  try {
    const ws12 = path.join(root12, "ws");
    const lh12 = path.join(root12, ".lumitome");
    fs.mkdirSync(path.join(ws12, ".tmp"), { recursive: true });
    fs.mkdirSync(path.join(ws12, ".git", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(ws12, "harness"), { recursive: true });
    fs.mkdirSync(lh12, { recursive: true });
    fs.writeFileSync(path.join(root12, ".env"), "SECRET=1\n");
    fs.writeFileSync(path.join(ws12, "harness", "lumi-guard.mjs"), "// tcb\n");
    fs.symlinkSync("../../.env", path.join(ws12, ".tmp", "x"));

    ok("T1.2 symlink-escape: .tmp/x -> ../../.env ditolak (symlink-escape)",
      G.evaluateTool("read", { filePath: ".tmp/x" }, { workspace: ws12, home: root12, lumiHome: lh12 }).rule === "symlink-escape"
      && G.evaluateTool("write", { filePath: ".tmp/x", content: "z" }, { workspace: ws12, home: root12, lumiHome: lh12 }).rule === "symlink-escape");

    ok("T1.2 hard-deny TCB: $LUMI_HOME/**, .git/hooks/**, .git/config -> deny tcb-protected",
      G.evaluateTool("write", { filePath: path.join(lh12, "evil.mjs"), content: "x" }, { workspace: ws12, home: root12, lumiHome: lh12 }).rule === "tcb-protected"
      && G.evaluateTool("write", { filePath: ".git/hooks/pre-commit", content: "x" }, { workspace: ws12, home: root12, lumiHome: lh12 }).rule === "tcb-protected"
      && G.evaluateTool("write", { filePath: ".git/config", content: "x" }, { workspace: ws12, home: root12, lumiHome: lh12 }).rule === "tcb-protected");

    // Git repo untuk menguji branch main vs branch baru agen tanpa trust vs maintainer trusted
    const gitWs = path.join(root12, "repo");
    fs.mkdirSync(path.join(gitWs, "harness"), { recursive: true });
    fs.writeFileSync(path.join(gitWs, "harness", "lumi-guard.mjs"), "// tcb\n");
    cp.execFileSync("git", ["-C", gitWs, "init", "-b", "main"], { stdio: "ignore" });
    cp.execFileSync("git", ["-C", gitWs, "config", "user.email", "t@local"], { stdio: "ignore" });
    cp.execFileSync("git", ["-C", gitWs, "config", "user.name", "t"], { stdio: "ignore" });
    cp.execFileSync("git", ["-C", gitWs, "add", "."], { stdio: "ignore" });
    cp.execFileSync("git", ["-C", gitWs, "commit", "-m", "init"], { stdio: "ignore" });

    // Di main bahkan dengan maintainer mode -> DENY
    const rMain = G.evaluateTool("edit", { filePath: "harness/lumi-guard.mjs" }, { workspace: gitWs, home: root12, lumiHome: lh12, env: { LUMI_MAINTAINER_MODE: "1" } });
    // Agen buat branch baru via git switch -c tanpa trust.json trusted & tanpa LUMI_MAINTAINER_MODE=1 -> DENY
    cp.execFileSync("git", ["-C", gitWs, "switch", "-c", "feat/agent-branch"], { stdio: "ignore" });
    const rAgentBranch = G.evaluateTool("edit", { filePath: "harness/lumi-guard.mjs" }, { workspace: gitWs, home: root12, lumiHome: lh12, tier: "standard", tierSource: "default", env: {} });
    // Env LUMI_TRUST_TIER=trusted (tierSource: "env") tanpa trust.json / LUMI_MAINTAINER_MODE -> tetap DENY
    const rEnvTier = G.evaluateTool("edit", { filePath: "harness/lumi-guard.mjs" }, { workspace: gitWs, home: root12, lumiHome: lh12, tier: "trusted", tierSource: "env", env: {} });
    // Maintainer dengan LUMI_MAINTAINER_MODE=1 di branch non-main -> ALLOW
    const rMaintEnv = G.evaluateTool("edit", { filePath: "harness/lumi-guard.mjs" }, { workspace: gitWs, home: root12, lumiHome: lh12, env: { LUMI_MAINTAINER_MODE: "1" } });
    // Maintainer dengan trust.json tier trusted (di luar workspace) di branch non-main -> ALLOW
    fs.writeFileSync(G.trustFilePath(lh12), JSON.stringify({ projects: { [gitWs]: { tier: "trusted" } } }));
    const rTrustJson = G.evaluateTool("edit", { filePath: "harness/lumi-guard.mjs" }, { workspace: gitWs, home: root12, lumiHome: lh12, env: {} });

    ok("T1.2 TCB edit repo: main=DENY, agent switch -c tanpa trust=DENY, env tier=DENY, maintainer/trust.json di non-main=ALLOW",
      rMain.rule === "tcb-protected"
      && rAgentBranch.rule === "tcb-protected"
      && rEnvTier.rule === "tcb-protected"
      && rMaintEnv.effect === "allow"
      && rTrustJson.effect === "allow");
  } finally {
    fs.rmSync(root12, { recursive: true, force: true });
  }

  // 4) Integrasi plugin lumitome-guard.ts: payload execute.after 2.4.2 (exitCode 0/1 & shell-bg) + doneGateFromJournal
  const plugDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-plug12-"));
  try {
    const jFile = path.join(plugDir, "journal.jsonl");
    const prevEnv = {
      LUMI_WORKSPACE: process.env.LUMI_WORKSPACE,
      LUMI_JOURNAL: process.env.LUMI_JOURNAL,
      LUMI_HARNESS: process.env.LUMI_HARNESS,
      LUMI_HOME: process.env.LUMI_HOME,
      LUMI_SANDBOX: process.env.LUMI_SANDBOX,
      LUMI_HEADLESS: process.env.LUMI_HEADLESS,
    };
    process.env.LUMI_WORKSPACE = plugDir;
    process.env.LUMI_JOURNAL = jFile;
    process.env.LUMI_HARNESS = path.resolve("harness/lumi-guard.mjs");
    process.env.LUMI_HOME = path.join(plugDir, ".lumitome");
    process.env.LUMI_SANDBOX = "off";
    process.env.LUMI_HEADLESS = "1";

    let beforeHook, afterHook;
    const guardMod = await import(pathToFileURL(path.resolve("lumitome/config/plugins/lumitome-guard.ts")).href + `?t=${Date.now()}`);
    await guardMod.default.setup({
      location: { directory: plugDir },
      tool: {
        hook(name, fn) {
          if (name === "execute.before") beforeHook = fn;
          if (name === "execute.after") afterHook = fn;
        },
      },
    });

    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }

    // execute.before pada tool execute tetap diawasi
    let execDenied = false;
    try { await beforeHook({ tool: "execute", input: { code: 'await Bun.file(".env").text()' }, id: "c1", codemode: true }); } catch { execDenied = true; }
    // Foreground exitCode: 1 lalu shell-bg running (tidak boleh reset spin!) lalu foreground exitCode: 0
    await afterHook({ tool: "shell", status: "completed", input: { command: "npm test" }, result: { output: { exitCode: 1 } } });
    await afterHook({ tool: "shell", status: "completed", input: { command: "npm test" }, result: { metadata: { status: "running", shellID: "sh_1" }, output: { exitCode: null } } });
    await afterHook({ tool: "shell", status: "completed", input: { command: "npm test" }, result: { output: { exitCode: 0 } } });

    const jRows = fs.readFileSync(jFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const shellRows = jRows.filter((r) => r.kind === "shell");
    const bgRows = jRows.filter((r) => r.kind === "shell-bg");
    const dgBgOnly = G.doneGateFromJournal([{ kind: "tool", tool: "edit", status: "completed" }, ...bgRows]);
    const evBg = evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], ...(dgBgOnly.ran ? { testCommandExitCode: dgBgOnly.last.exit } : {}), facts: dgBgOnly.facts });

    ok("T1.2 lumitome-guard.ts 2.4.2: execute guarded; exitCode 1 -> ok:false; shell-bg -> kind shell-bg & ok:false & UNRUN; exitCode 0 -> ok:true",
      execDenied === true
      && shellRows.length === 2
      && shellRows[0].exit === 1 && shellRows[0].ok === false
      && shellRows[1].exit === 0 && shellRows[1].ok === true
      && bgRows.length === 1 && bgRows[0].exit === null && bgRows[0].ok === false && bgRows[0].shellID === "sh_1"
      && dgBgOnly.ran === 0 && dgBgOnly.bgPending === 1 && evBg.isDone === false);
  } finally {
    fs.rmSync(plugDir, { recursive: true, force: true });
  }
}

// --- Wave 2 (T2.2): Repro-Before-Edit Gate + INVALID_PROBE ---
{
  const RG = await import("../harness/repro-gate.mjs");
  const { pathToFileURL } = await import("node:url");
  const tmpBase = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tmpBase, { recursive: true });
  const ws22 = fs.mkdtempSync(path.join(tmpBase, "w2-t22-"));
  try {
    // 1) Klasifikasi probe: PASS_NO_REPRO, INVALID_PROBE, VALID_REPRO
    ok("T2.2 classifyProbeResult: exit 0 -> PASS_NO_REPRO; 127/126/syntax/ENOENT/ModuleNotFoundError/0 tests -> INVALID_PROBE; AssertionError exit 1 -> VALID_REPRO",
      RG.classifyProbeResult({ command: "npm test", exitCode: 0, output: "1 passed" }).status === "PASS_NO_REPRO"
      && RG.classifyProbeResult({ command: "pytset", exitCode: 127, output: "command not found" }).status === "INVALID_PROBE"
      && RG.classifyProbeResult({ command: "./run.sh", exitCode: 126, output: "permission denied" }).status === "INVALID_PROBE"
      && RG.classifyProbeResult({ command: "node -e '('", exitCode: 2, output: "SyntaxError: Unexpected end of input" }).status === "INVALID_PROBE"
      && RG.classifyProbeResult({ command: "node bad.mjs", exitCode: 1, output: "ENOENT: no such file or directory" }).status === "INVALID_PROBE"
      && RG.classifyProbeResult({ command: "python3 -m pytest", exitCode: 1, output: "ModuleNotFoundError: No module named 'foo'" }).status === "INVALID_PROBE"
      && RG.classifyProbeResult({ command: "node --test", exitCode: 1, output: "0 tests ran" }).status === "INVALID_PROBE"
      && RG.classifyProbeResult({ command: "npm test", exitCode: 1, output: "AssertionError: expected 1 to equal 2" }).status === "VALID_REPRO");

    // 2) bugfix: tolak edit sebelum probe; INVALID_PROBE tetap tolak; PASS_NO_REPRO tetap tolak; VALID_REPRO izinkan edit
    const sid = "ses_bug";
    const rPre = RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: sid });
    RG.recordReproProbe({ workspace: ws22, sessionId: sid, command: "no_such_cmd", exitCode: 127, output: "command not found" });
    const rInv = RG.checkReproBeforeEdit({ tool: "write", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: sid });
    RG.recordReproProbe({ workspace: ws22, sessionId: sid, command: "npm test", exitCode: 0, output: "all ok" });
    const rPassNoRepro = RG.checkReproBeforeEdit({ tool: "patch", input: { patchText: "x" }, taskType: "bugfix", workspace: ws22, sessionId: sid });
    RG.recordReproProbe({ workspace: ws22, sessionId: sid, command: "node --test repro.mjs", exitCode: 1, output: "AssertionError: boom" });
    const rValid = RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: sid });

    ok("T2.2 bugfix repro-gate: pre-probe deny (repro-required) -> invalid-probe deny -> pass-no-repro deny -> valid-repro allow",
      rPre.effect === "deny" && rPre.code === "repro-required"
      && rInv.effect === "deny" && rInv.code === "invalid-probe"
      && rPassNoRepro.effect === "deny" && rPassNoRepro.code === "repro-required"
      && rValid.effect === "allow");

    // 3) Non-bugfix (feature, docs, refactor, general): tidak pernah memblokir edit (nol over-abstention)
    ok("T2.2 non-bugfix (feature, docs, refactor, general): edit langsung diizinkan tanpa repro",
      ["feature", "docs", "docs_config", "refactor", "general"].every((tt) =>
        RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: tt, workspace: ws22, sessionId: "ses_nonbug" }).effect === "allow"));

    // 4) LUMI_REPRO_GATE=0: hanya berlaku di interaktif lokal; ditolak/diabaikan di headless & strictGate (G6/G7)
    ok("T2.2 LUMI_REPRO_GATE=0: bypass interaktif lokal; diabaikan saat headless=true / LUMI_HEADLESS=1 / strictGate=true",
      RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: "ses_f1", env: { LUMI_REPRO_GATE: "0" }, headless: false, strictGate: false }).effect === "allow"
      && RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: "ses_f2", env: { LUMI_REPRO_GATE: "0" }, headless: true }).effect === "deny"
      && RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: "ses_f3", env: { LUMI_REPRO_GATE: "0", LUMI_HEADLESS: "1" } }).effect === "deny"
      && RG.checkReproBeforeEdit({ tool: "edit", input: { filePath: "a.js" }, taskType: "bugfix", workspace: ws22, sessionId: "ses_f4", env: { LUMI_REPRO_GATE: "0" }, strictGate: true }).effect === "deny");

    // 5) Integrasi lumitome-guard.ts dengan LUMI_TASK_TYPE=bugfix
    const prevEnv = { LUMI_WORKSPACE: process.env.LUMI_WORKSPACE, LUMI_HARNESS: process.env.LUMI_HARNESS, LUMI_TASK_TYPE: process.env.LUMI_TASK_TYPE, LUMI_SESSION_ID: process.env.LUMI_SESSION_ID, LUMI_SANDBOX: process.env.LUMI_SANDBOX, LUMI_HEADLESS: process.env.LUMI_HEADLESS };
    try {
      process.env.LUMI_WORKSPACE = ws22;
      process.env.LUMI_HARNESS = path.resolve("harness/lumi-guard.mjs");
      process.env.LUMI_TASK_TYPE = "bugfix";
      process.env.LUMI_SESSION_ID = "ses_plug_repro";
      process.env.LUMI_SANDBOX = "off";
      process.env.LUMI_HEADLESS = "1";
      let beforeH, afterH;
      const gm = await import(pathToFileURL(path.resolve("lumitome/config/plugins/lumitome-guard.ts")).href + `?t=${Date.now()}`);
      await gm.default.setup({
        location: { directory: ws22 },
        tool: { hook(n, fn) { if (n === "execute.before") beforeH = fn; if (n === "execute.after") afterH = fn; } },
      });
      let blockedBefore = false;
      try { await beforeH({ tool: "edit", input: { filePath: "bug.mjs" } }); } catch (e) { blockedBefore = /REPRO_GATE/.test(String(e)); }
      await afterH({ tool: "shell", status: "completed", input: { command: "node --test bug.test.mjs" }, result: { output: { exitCode: 1, output: "AssertionError: fail" } } });
      let allowedAfter = true;
      try { await beforeH({ tool: "edit", input: { filePath: "bug.mjs" } }); } catch { allowedAfter = false; }
      ok("T2.2 integrasi lumitome-guard.ts: bugfix blokir edit sebelum repro, buka setelah VALID_REPRO",
        blockedBefore && allowedAfter);
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  } finally {
    fs.rmSync(ws22, { recursive: true, force: true });
  }
}

// --- Wave 2 (T2.5): Halting Watchdog (progress_delta, N-gram loop, anti-false-positive, dead_ends) ---
{
  const WD = await import("../harness/watchdog.mjs");
  const { pathToFileURL } = await import("node:url");
  const tmpBase = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tmpBase, { recursive: true });
  const ws25 = fs.mkdtempSync(path.join(tmpBase, "w2-t25-"));
  try {
    // 1) Zero-progress streak x3 pada sesi mutasi -> HALT ("zero-progress-streak") + dead_ends.jsonl
    const dog1 = new WD.HaltingWatchdog({ workspace: ws25, sessionId: "ses_zp", persistDeadEnds: true });
    dog1.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    const s1 = dog1.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: "fail 1", snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    const s2 = dog1.recordStep({ tool: "shell", input: { command: "npm test -- a" }, ok: false, exitCode: 1, errorText: "fail 2", snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    const s3 = dog1.recordStep({ tool: "shell", input: { command: "npm test -- b" }, ok: false, exitCode: 1, errorText: "fail 3", snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    const deadFile = WD.deadEndsPath(ws25, "ses_zp");
    const deadRows = fs.existsSync(deadFile) ? fs.readFileSync(deadFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("T2.5 watchdog: progress_delta === 0 x3 pada sesi mutasi -> HALT (zero-progress-streak) + dead_ends.jsonl [FAILED_PATH]",
      s1.verdict === "OK" && s2.verdict === "WARN" && s3.verdict === "HALT" && s3.reason === "zero-progress-streak"
      && deadRows.length > 0 && deadRows.every((r) => r.tag === "[FAILED_PATH]"));

    // 2) N-gram loop: 3-gram berulang >=3x -> HALT ("ngram-loop")
    const dog2 = new WD.HaltingWatchdog({ workspace: ws25, sessionId: "ses_ng3", maxZeroProgressStreak: 99 });
    let v2 = null;
    for (let i = 0; i < 3; i++) {
      dog2.recordStep({ tool: "edit", input: { filePath: "x.ts" }, ok: true, snapshot: { diffHash: `d${i}`, statusHash: "s" } });
      dog2.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: `err ${i}`, snapshot: { diffHash: `d${i}`, statusHash: "s", testStatus: `e${i}` } });
      v2 = dog2.recordStep({ tool: "read", input: { filePath: "x.ts" }, ok: true });
    }
    ok("T2.5 watchdog: 3-gram (tool, normalized_args) berulang >=3x -> HALT (ngram-loop)",
      v2.verdict === "HALT" && v2.reason === "ngram-loop");

    // 3) Osilasi 2-langkah (edit A -> test fail -> edit A -> test fail) -> HALT ("ngram-loop")
    const dog3 = new WD.HaltingWatchdog({ workspace: ws25, sessionId: "ses_ng2", maxZeroProgressStreak: 99 });
    dog3.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "dA", statusHash: "sA" } });
    dog3.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: "fail A", snapshot: { diffHash: "dA", statusHash: "sA", testStatus: "fail" } });
    dog3.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "dB", statusHash: "sB" } });
    const v3 = dog3.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: "fail B", snapshot: { diffHash: "dB", statusHash: "sB", testStatus: "fail" } });
    ok("T2.5 watchdog: osilasi 2-langkah (edit A -> test fail -> edit A -> test fail) -> HALT (ngram-loop)",
      v3.verdict === "HALT" && v3.reason === "ngram-loop");

    // 4) Guard anti-false-positive: sesi riset / baca-kode murni (0 mutasi, lookup berbeda target) TIDAK halt
    const dogResearch = new WD.HaltingWatchdog({ workspace: ws25, sessionId: "ses_read" });
    let vr = null;
    for (const f of ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"]) {
      vr = dogResearch.recordStep({ tool: "read", input: { filePath: f }, ok: true, snapshot: { diffHash: "same", statusHash: "same" } });
    }
    vr = dogResearch.recordStep({ tool: "grep", input: { pattern: "foo" }, ok: true, snapshot: { diffHash: "same", statusHash: "same" } });
    vr = dogResearch.recordStep({ tool: "glob", input: { pattern: "*.mjs" }, ok: true, snapshot: { diffHash: "same", statusHash: "same" } });
    ok("T2.5 anti-false-positive: sesi riset/baca murni (0 mutasi, lookup berbeda) tidak pernah HALT",
      vr.verdict === "OK" && dogResearch.hasMutations === false);

    // 5) Integrasi lumitome-guard.ts: N-gram / error berulang 3x memicu [WATCHDOG_HALT] pada beforeHook
    const prevEnv = { LUMI_WORKSPACE: process.env.LUMI_WORKSPACE, LUMI_HARNESS: process.env.LUMI_HARNESS, LUMI_SESSION_ID: process.env.LUMI_SESSION_ID, LUMI_SANDBOX: process.env.LUMI_SANDBOX };
    try {
      process.env.LUMI_WORKSPACE = ws25;
      process.env.LUMI_HARNESS = path.resolve("harness/lumi-guard.mjs");
      process.env.LUMI_SESSION_ID = "ses_plug_wd";
      process.env.LUMI_SANDBOX = "off";
      let beforeWd, afterWd;
      const gmWd = await import(pathToFileURL(path.resolve("lumitome/config/plugins/lumitome-guard.ts")).href + `?t=${Date.now()}`);
      await gmWd.default.setup({
        location: { directory: ws25 },
        tool: { hook(n, fn) { if (n === "execute.before") beforeWd = fn; if (n === "execute.after") afterWd = fn; } },
      });
      for (let i = 0; i < 3; i++) {
        await afterWd({ tool: "shell", status: "completed", input: { command: `node test${i}.mjs` }, result: { output: { exitCode: 1, output: "TypeError: x is not a function" } } });
      }
      let haltedPlug = false;
      try { await beforeWd({ tool: "shell", input: { command: "echo next" } }); } catch (e) { haltedPlug = /WATCHDOG_HALT/.test(String(e)); }
      ok("T2.5 integrasi lumitome-guard.ts: error identik 3x memicu WATCHDOG_HALT pada execute.before",
        haltedPlug === true);
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }

    // 6) Regresi: workspace non-git dengan 4x edit file berbeda + isi berubah -> tetap OK
    {
      const os25 = await import("node:os");
      const nonGitDir = fs.mkdtempSync(path.join(os25.tmpdir(), "lumi-nongit-wd-"));
      try {
        const dogNonGit = new WD.HaltingWatchdog({ workspace: nonGitDir, sessionId: "ses_nongit" });
        let vNg = null;
        for (let i = 1; i <= 4; i++) {
          const fp = path.join(nonGitDir, `file${i}.mjs`);
          fs.writeFileSync(fp, `export const v = ${i};
`);
          vNg = dogNonGit.recordStep({ tool: "edit", input: { filePath: fp }, ok: true });
        }
        ok("T2.5 regresi: 4x edit file berbeda di workspace non-git tidak false-positive zero-progress-streak",
          vNg.verdict === "OK" && dogNonGit.zeroProgressStreak === 0);
      } finally {
        fs.rmSync(nonGitDir, { recursive: true, force: true });
      }
    }

    // 7) Regresi: serangkaian perintah verifikasi sukses yang berbeda pasca-edit -> tetap OK
    {
      const dogVer = new WD.HaltingWatchdog({ workspace: ws25, sessionId: "ses_verify_seq" });
      dogVer.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "d1", statusHash: "s1" } });
      let vVer = null;
      for (const cmd of ["npm run lint", "npm run validate", "npm run eval", "npm test"]) {
        vVer = dogVer.recordStep({ tool: "shell", input: { command: cmd }, ok: true, exitCode: 0, snapshot: { diffHash: "d1", statusHash: "s1" } });
      }
      ok("T2.5 regresi: 4 perintah verifikasi sukses berbeda beruntun tidak false-positive zero-progress-streak",
        vVer.verdict === "OK" && dogVer.zeroProgressStreak === 0);
    }
  } finally {
    fs.rmSync(ws25, { recursive: true, force: true });
  }
}

finish();
