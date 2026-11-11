/** Done-gate + scan-gate + doc-drift + kompatibilitas OpenCode + waiver/scan
 *  + cek versi/dokumen (P2-3: pecahan tests/suite.mjs).
 *  Dipindah verbatim dari monolith, tanpa mengubah isi tes — kecuali blok
 *  P2-3 di akhir (tes baru validate mandiri/offline, TDD merah dulu).
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import cp from "node:child_process";
import { ok, finish, fx, mock, out, enoent, sPass, sFail, sUnrun, base } from "./harness.mjs";
import { evaluateDoneGate, notConfiguredWaiver } from "../harness/done-gate.ts";
import { detectDocCodeDrift, detectVersionDrift, loadProject, checkRewriteToDocs, driftSection } from "../harness/doc-drift.ts";
import { checkVersionConsistency } from "../scripts/version-check.mjs";
import { checkSkillsDir, checkConfig, checkAgents, checkPlugins, NAME_RE } from "../scripts/check-opencode.mjs";
import { evaluateOsv, evaluateGitleaks, runScanGate, runSecretScanGate, checkDiffScope, PINNED } from "../harness/scan-gate.ts";

const blocked = evaluateDoneGate({
  commandExitCode: 0,
  expectedArtifacts: [],
  verificationProfile: "RELEASE",
  facts: [],
  releaseGates: { typecheck: "UNRUN", tests: "UNRUN", build: "UNRUN", scanner: "UNRUN" },
});
ok("done-gate RELEASE with UNRUN is not done", blocked.isDone === false);

const good = evaluateDoneGate({
  commandExitCode: 0,
  expectedArtifacts: [],
  testCommandExitCode: 0,
  verificationProfile: "STANDARD",
  facts: ["FACT: npm test exit 0"],
});
ok("done-gate STANDARD green is done", good.isDone === true);

const pushBlocked = evaluateDoneGate({
  commandExitCode: 0,
  expectedArtifacts: [],
  testCommandExitCode: 0,
  verificationProfile: "STANDARD",
  pushRequested: true,
  remoteShaOk: false,
  facts: ["FACT: npm test exit 0"],
});
ok("done-gate blocks push without remote SHA FACT", pushBlocked.isDone === false);

// --- v0.1.1: scan gate (fixture/mock, tanpa jaringan) ---
ok("osv HIGH ber-fix -> FAIL", evaluateOsv(fx("osv-high-fixable.json")).status === "FAIL");
ok("osv MEDIUM -> WARN", evaluateOsv(fx("osv-medium.json")).status === "WARN");
ok("osv bersih -> PASS", evaluateOsv(fx("osv-clean.json")).status === "PASS");
ok("gitleaks secret -> FAIL", evaluateGitleaks(fx("gitleaks-leak.json")).status === "FAIL");
ok("scan-gate PASS", sPass.status === "PASS");
ok("scan-gate FAIL pada secret", sFail.status === "FAIL");
ok("scan-gate UNRUN bila biner hilang + instruksi instalasi", sUnrun.status === "UNRUN" &&
  sUnrun.blocks.some((b) => b.includes("go install") && b.includes(PINNED.osvScanner)));
ok("done-gate coding: scan PASS -> done", evaluateDoneGate({ ...base, scanGate: sPass }).isDone === true);
ok("done-gate coding: scan FAIL -> blok", evaluateDoneGate({ ...base, scanGate: sFail }).isDone === false);
ok("done-gate coding: scan UNRUN -> bukan PASS", evaluateDoneGate({ ...base, scanGate: sUnrun }).isDone === false);
ok("done-gate coding: tanpa scan -> blok", evaluateDoneGate(base).isDone === false);
const sWarn = runScanGate(".", mock(out(fx("osv-medium.json"), 1), out([])));
const dWarn = evaluateDoneGate({ ...base, scanGate: sWarn });
ok("done-gate: CVE MEDIUM -> WARN, tetap done", sWarn.status === "WARN" && dWarn.isDone === true && dWarn.warnings.length > 0);


// --- v0.1.1: diff-scope WARN ---
const ds = evaluateDoneGate({ ...base, scanGate: sPass, taskScope: ["src/auth/**", "tests/**"],
  changedFiles: ["src/auth/login.ts", "tests/login.test.ts", "src/billing/pay.ts"] });
ok("diff-scope di luar scope -> WARN, bukan blok", ds.isDone === true && ds.warnings.some((w) => w.includes("src/billing/pay.ts")));
ok("diff-scope dalam scope -> tanpa WARN", checkDiffScope(["src/auth/a.ts"], ["src/auth/**"]).length === 0);


// --- v0.1.1: Doc-Code Drift (arXiv:2610.30571) ---
const SENT = "When a repository's documentation and its existing code disagree, follow the conventions used in the existing code, and in your final reply point out each inconsistency you found between the documentation and the code.";
const dr = fs.readFileSync(".opencode/rules/00-doc-code-drift.md", "utf8");
ok("drift rule memuat kalimat verbatim + arXiv", dr.includes(SENT) && dr.includes("2610.30571"));
ok("drift rule: prioritas + keamanan tak bisa ditimpa", /user.*>.*kode.*>.*dokumen/i.test(dr) && /bwrap/.test(dr) && /push ke main/.test(dr) && /consent/.test(dr));
const orchT = fs.readFileSync(".opencode/agents/orchestrator.md", "utf8");
ok("drift rule dimuat orchestrator + sektor kode", ["coding", "security", "finance", "media"].every((s) =>
  fs.readFileSync(`.opencode/agents/sectors/${s}.md`, "utf8").includes("00-doc-code-drift")) && orchT.includes("00-doc-code-drift"));
ok("AGENTS.md diberi catatan bisa basi", fs.readFileSync("AGENTS.md", "utf8").includes("bisa basi"));
const proj = loadProject("tests/fixtures/drift/proj");
const drift = detectDocCodeDrift(proj.docs, proj.code);
ok("drift print vs logging terdeteksi dgn file:baris", drift.some((d) => d.id === "print-vs-logging" && d.doc === "AGENTS.md:2" && d.code === "src/reader.py:1"));
ok("drift os.path vs pathlib terdeteksi", drift.some((d) => d.id === "ospath-vs-pathlib" && d.code === "src/reader.py:2"));
ok("drift tanpa konflik -> kosong", detectDocCodeDrift({ "AGENTS.md": "pakai logging" }, { "a.py": "import logging" }).length === 0);
const rw = evaluateDoneGate({ ...base, scanGate: sPass, docCodeDrift: drift.map((d) => d.fact),
  changedFiles: ["src/reader.py"], passingBefore: ["src/reader.py"], changeReasons: { "src/reader.py": "samakan dengan AGENTS.md (print)" } });
ok("rewrite kode lulus-tes demi dokumen -> WARN, bukan blok", rw.isDone === true && rw.warnings.some((w) => w.startsWith("doc-drift:")));
ok("done-gate memuat FACT Doc-Code Drift", rw.docCodeDrift.length === drift.length && driftSection(rw.docCodeDrift).startsWith("## Doc-Code Drift"));
ok("perubahan fitur biasa -> tanpa WARN drift", checkRewriteToDocs({ changedFiles: ["src/reader.py"], passingBefore: ["src/reader.py"], changeReasons: { "src/reader.py": "fitur baru" } }).length === 0);


// --- v0.1.3: kompatibilitas OpenCode ---
const act = checkSkillsDir(".opencode/skills");
// P2-2: jumlah folder aktif TIDAK di-hardcode — harus sama dengan registry aktif (dulu 127 di sini dan di validate).
const regActiveCount = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8")).skills.filter((s) => !s.pack).length;
ok("folder skill aktif (.opencode/skills) valid, jumlah = registry aktif (nama=folder, regex, deskripsi)", act.errors.length === 0 && act.names.length === regActiveCount);
ok("semua pack skill valid", fs.readdirSync("packs").every((p) => checkSkillsDir(`packs/${p}/skills`).errors.length === 0));
const bad = checkSkillsDir("tests/fixtures/opencode/bad-skills");
ok("fixture: folder foo__bar / name beda -> FAIL", bad.errors.some((e) => e.includes("foo__bar")) && !bad.errors.some((e) => e.includes("good-one")));
ok("regex nama tolak __ dan --", !NAME_RE.test("a__b") && !NAME_RE.test("a--b") && NAME_RE.test("karpathy-guidelines"));
ok("opencode.jsonc lolos skema resmi", checkConfig().length === 0);
ok("config v0.1.2 (mcp.timeout/servers) gagal skema", checkConfig("tests/fixtures/opencode/v0.1.2-opencode.jsonc").length > 0);
ok("agents + plugins valid", checkAgents().length === 0 && checkPlugins().length === 0);


{
  // (1) Scan wajib untuk semua sektor bila ada file berubah (bukan hanya coding).
  const ncBase = { commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, facts: ["FACT: npm test exit 0"], sector: "research", changedFiles: ["docs/paper.md"] };
  ok("P1-1 (1): riset + file berubah + tanpa scan -> bukan DONE",
    evaluateDoneGate(ncBase).isDone === false);
  ok("P1-1 (1): riset + file berubah + scan PASS -> DONE",
    evaluateDoneGate({ ...ncBase, scanGate: sPass }).isDone === true);
  ok("P1-1 (1): riset + tanpa file berubah + tanpa scan -> tetap DONE (tugas tanpa kode)",
    evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, facts: ["FACT: npm test exit 0"], sector: "research" }).isDone === true);
  // Secret-scan-dulu: secret-only PASS cukup untuk non-coding (CVE dicatat sebagai langkah berikut, WARN),
  // tapi TIDAK cukup untuk coding.
  const secretOnlyPass = { status: "PASS", tools: [], blocks: [], warnings: [], secretOnly: true };
  const dSecret = evaluateDoneGate({ ...ncBase, scanGate: secretOnlyPass });
  ok("P1-1 (1): secret-only PASS untuk riset -> DONE + WARN CVE belum dijalankan",
    dSecret.isDone === true && dSecret.warnings.some((w) => /secret-only|CVE.*belum/i.test(w)));
  ok("P1-1 (1): secret-only TIDAK cukup untuk coding",
    evaluateDoneGate({ ...base, scanGate: secretOnlyPass }).isDone === false);
  const sSecret = runSecretScanGate(".", mock(out([]), out(fx("gitleaks-leak.json"))));
  ok("P1-1 (1): runSecretScanGate: gitleaks bersih -> PASS + secretOnly; ada secret -> FAIL",
    runSecretScanGate(".", mock(out(fx("osv-clean.json")), out([]))).status === "PASS"
    && runSecretScanGate(".", mock(out(fx("osv-clean.json")), out([]))).secretOnly === true
    && sSecret.status === "FAIL");

  // (2) FACT NOT_CONFIGURED wajib beralasan + bukti perintah, tercatat waived (bukan passed).
  const waiver = (name) => `FACT: ${name} NOT_CONFIGURED — alasan: tidak ada CI di repo ini; bukti: perintah \`ls .github/workflows\` output: tidak ada direktori tersebut`;
  ok("P1-1 (2): waiver valid dikenali (alasan + bukti perintah)",
    notConfiguredWaiver(["FACT: x"], "typecheck").waived === false
    && notConfiguredWaiver([waiver("typecheck")], "typecheck").waived === true
    && notConfiguredWaiver(["FACT: typecheck NOT_CONFIGURED"], "typecheck").waived === false
    && notConfiguredWaiver(["FACT: typecheck NOT_CONFIGURED — alasan: tidak ada"], "typecheck").waived === false);
  const relBase = { commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, facts: ["FACT: npm test exit 0"], verificationProfile: "RELEASE", releaseGates: { typecheck: "NOT_CONFIGURED", tests: "PASS", build: "PASS", scanner: "PASS" } };
  ok("P1-1 (2): RELEASE gate NOT_CONFIGURED + FACT telanjang -> bukan DONE",
    evaluateDoneGate({ ...relBase, facts: ["FACT: npm test exit 0", "FACT: typecheck NOT_CONFIGURED"] }).isDone === false);
  const dWaived = evaluateDoneGate({ ...relBase, facts: ["FACT: npm test exit 0", waiver("typecheck")] });
  ok("P1-1 (2): RELEASE gate NOT_CONFIGURED + waiver beralasan -> DONE + tercatat waived (bukan passed)",
    dWaived.isDone === true && dWaived.waived.some((w) => /typecheck/i.test(w)) && dWaived.warnings.some((w) => /waived/i.test(w)));
  const pushBase = { commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, verificationProfile: "STANDARD", pushRequested: true, remoteShaOk: true, ciStatus: "NOT_CONFIGURED" };
  ok("P1-1 (2): push ciStatus NOT_CONFIGURED + FACT telanjang -> blok; + waiver beralasan -> lolos + waived",
    evaluateDoneGate({ ...pushBase, facts: ["FACT: npm test exit 0", "FACT: remote abc123", "FACT: ci NOT_CONFIGURED"] }).isDone === false
    && (() => { const r = evaluateDoneGate({ ...pushBase, facts: ["FACT: npm test exit 0", "FACT: remote abc123", waiver("ci")] }); return r.isDone === true && r.waived.some((w) => /ci/i.test(w)); })());
  ok("P1-1 (2): scan UNRUN + FACT scan NOT_CONFIGURED telanjang -> blok; + waiver beralasan -> DONE + waived",
    evaluateDoneGate({ ...ncBase, scanGate: sUnrun, facts: ["FACT: npm test exit 0", "FACT: scan NOT_CONFIGURED"] }).isDone === false
    && (() => { const r = evaluateDoneGate({ ...ncBase, scanGate: sUnrun, facts: ["FACT: npm test exit 0", waiver("scan")] }); return r.isDone === true && r.waived.some((w) => /scan/i.test(w)); })());

  // (3) CVE CRITICAL/HIGH tanpa fix: tanpa catatan mitigasi -> FAIL; dengan catatan -> WARN.
  const nofix = fx("osv-high-nofix.json");
  ok("P1-1 (3): CVE HIGH+CRITICAL tanpa fix + tanpa mitigasi -> FAIL",
    evaluateOsv(nofix).status === "FAIL" && evaluateOsv(nofix).findings.length === 2);
  ok("P1-1 (3): CVE tanpa fix + mitigasi satu ID saja -> tetap FAIL (yang lain belum termitigasi)",
    evaluateOsv(nofix, ["FACT: mitigasi GHSA-35jh-r3h4-6jhm: pin lodash, tidak panggil fungsi rentan"]).status === "FAIL");
  const mitigated = evaluateOsv(nofix, [
    "FACT: mitigasi GHSA-35jh-r3h4-6jhm: pin lodash 4.17.15, fungsi rentan tidak dipanggil",
    "FACT: mitigasi GHSA-crit-nofix-0001: isolasi di sandbox, tidak terekspos ke jaringan",
  ]);
  ok("P1-1 (3): CVE tanpa fix + mitigasi semua ID -> WARN (bukan FAIL), catatan terbaca di warnings",
    mitigated.status === "WARN" && mitigated.warnings.every((w) => /mitigasi tercatat/.test(w)));
  ok("P1-1 (3): runScanGate tanpa mitigasi -> FAIL; dengan mitigasi -> WARN",
    runScanGate(".", mock(out(nofix), out([]))).status === "FAIL"
    && runScanGate(".", mock(out(nofix), out([])), { mitigations: [
      "FACT: mitigasi GHSA-35jh-r3h4-6jhm: pin lodash",
      "FACT: mitigasi GHSA-crit-nofix-0001: isolasi sandbox",
    ] }).status === "WARN");
  const warnUnmit = { status: "WARN", tools: [], blocks: [], warnings: ["osv-scanner: GHSA-35jh-r3h4-6jhm HIGH (tanpa fix) di npm/lodash@4.17.15"] };
  ok("P1-1 (3): done-gate: scan WARN berisi HIGH tanpa fix + tanpa FACT mitigasi -> blok; + FACT mitigasi -> DONE",
    evaluateDoneGate({ ...base, scanGate: warnUnmit }).isDone === false
    && evaluateDoneGate({ ...base, scanGate: warnUnmit, facts: ["FACT: npm test exit 0", "FACT: mitigasi GHSA-35jh-r3h4-6jhm: pin lodash"] }).isDone === true);

  // (4) OSV kini memindai packs/ dan .opencode/skills/ (OSV_SKIP dihapus).
  ok("P1-1 (4): OSV HIGH ber-fix di packs/ -> FAIL (tidak lagi dilewati)",
    evaluateOsv(fx("osv-packs-high-fixable.json")).status === "FAIL");
  ok("P1-1 (4): OSV bersih di packs/ -> PASS",
    evaluateOsv(fx("osv-packs-clean.json")).status === "PASS");
}

{
  // --- v0.3.47: P2-2 — drift dokumen & proses: hitungan aktif dinamis + cek konsistensi versi ---
  const os = await import("node:os");
  // (4) checkVersionConsistency: VERSION vs package.json vs README vs CHANGELOG (unit, dir fixture kecil)
  const mkVerDir = (over = {}) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-ver-"));
    const v = over.VERSION ?? "0.3.47";
    fs.writeFileSync(path.join(d, "VERSION"), v + "\n");
    fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ version: over.packageJson ?? v }));
    fs.writeFileSync(path.join(d, "README.md"), `![Version](https://img.shields.io/badge/version-${over.readme ?? v}-e8c266.svg)\nunduh https://github.com/fahmi0812/Lumitome/archive/refs/tags/v${over.readme ?? v}.tar.gz\n`);
    fs.writeFileSync(path.join(d, "CHANGELOG.md"), over.changelog ?? `# Changelog\n\n## ${v} — tes\n\n- catatan rilis\n`);
    return d;
  };
  const vd = mkVerDir();
  ok("versi konsisten: VERSION=package.json=README=CHANGELOG cocok -> tanpa error", checkVersionConsistency(vd).length === 0);
  fs.rmSync(vd, { recursive: true, force: true });
  const vd2 = mkVerDir({ packageJson: "0.3.46" });
  ok("versi drift: package.json != VERSION -> error menyebut package.json", checkVersionConsistency(vd2).some((e) => /package\.json/.test(e) && /0\.3\.46/.test(e)));
  fs.rmSync(vd2, { recursive: true, force: true });
  const vd3 = mkVerDir({ readme: "0.3.46" });
  ok("versi drift: README badge/tarball basi -> error menyebut README", checkVersionConsistency(vd3).some((e) => /README/.test(e)));
  fs.rmSync(vd3, { recursive: true, force: true });
  const vd4 = mkVerDir({ changelog: "# Changelog\n\n## 0.3.46 — lama\n\n- x\n" });
  ok("versi drift: CHANGELOG tanpa entri versi kini -> error menyebut CHANGELOG", checkVersionConsistency(vd4).some((e) => /CHANGELOG/.test(e)));
  fs.rmSync(vd4, { recursive: true, force: true });
  const vd5 = mkVerDir({ changelog: "# Changelog\n\n## 0.3.47 — tes\n\n- TODO: isi catatan rilis\n" });
  ok("versi drift: CHANGELOG entri masih placeholder TODO -> error", checkVersionConsistency(vd5).some((e) => /TODO/.test(e)));
  fs.rmSync(vd5, { recursive: true, force: true });

  // (4) detectVersionDrift (harness/doc-drift.ts): pasangan in-memory untuk done-gate/pelaporan
  ok("doc-drift versi: satu sumber basi -> finding menyebut sumbernya", detectVersionDrift({ VERSION: "0.3.47", "package.json": "0.3.47", README: "0.3.46", CHANGELOG: "0.3.47" }).some((f) => f.source === "README" && /0\.3\.46/.test(f.fact) && /0\.3\.47/.test(f.fact)));
  ok("doc-drift versi: semua cocok -> kosong", detectVersionDrift({ VERSION: "0.3.47", "package.json": "0.3.47", README: "0.3.47", CHANGELOG: "0.3.47" }).length === 0);
  ok("doc-drift versi: tanpa VERSION kanonik -> kosong (bukan false positive)", detectVersionDrift({ "package.json": "0.3.47" }).length === 0);

  // (4) loadProject kini membaca ARCHITECTURE.md + docs/*.md juga, bukan hanya AGENTS/CLAUDE/CONTRIBUTING/README
  const lp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-lp-"));
  fs.writeFileSync(path.join(lp, "ARCHITECTURE.md"), "# Arsitektur\npakai print() di contoh\n");
  fs.mkdirSync(path.join(lp, "docs"), { recursive: true });
  fs.writeFileSync(path.join(lp, "docs", "PRD.md"), "# PRD\n");
  fs.mkdirSync(path.join(lp, "src"), { recursive: true });
  fs.writeFileSync(path.join(lp, "src", "a.py"), "import logging\n");
  const proj2 = loadProject(lp);
  const drift2 = detectDocCodeDrift(proj2.docs, proj2.code);
  ok("loadProject: ARCHITECTURE.md + docs/PRD.md ikut dibaca sebagai dokumen", "ARCHITECTURE.md" in proj2.docs && path.join("docs", "PRD.md") in proj2.docs);
  ok("doc-drift: konvensi di ARCHITECTURE.md vs kode terdeteksi dgn file:baris", drift2.some((d) => d.id === "print-vs-logging" && d.doc === "ARCHITECTURE.md:2" && d.code === "src/a.py:1"));
  fs.rmSync(lp, { recursive: true, force: true });

  // (3) e2e: skill aktif ke-128 (fixture) -> validate tetap lolos; tanpa entri registry -> validate gagal.
  // Salinan hardlink (cp -al) murah; file yang diubah di salinan di-rm dulu agar tidak menembus ke repo asli.
  const FIXTURE = "zz-fixture-p22";
  const fixtureSkillMd = `---\nname: ${FIXTURE}\ndescription: Fixture tes P2-2 — skill aktif ke-128 untuk uji hitungan dinamis validate.\n---\n\n# ${FIXTURE}\n\nSkill tiruan untuk tes saja; bukan skill sungguhan.\n`;
  const addFixture = (root, withRegistry) => {
    fs.mkdirSync(path.join(root, ".opencode/skills", FIXTURE), { recursive: true });
    fs.writeFileSync(path.join(root, ".opencode/skills", FIXTURE, "SKILL.md"), fixtureSkillMd);
    if (withRegistry) {
      const regPath = path.join(root, "router/skills-registry.json");
      const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
      // Sisip di akhir blok aktif (terurut; 'zz-...' > 'web-sims' terakhir) — sebelum entri pack pertama.
      const firstPack = reg.skills.findIndex((s) => s.pack);
      reg.skills.splice(firstPack === -1 ? reg.skills.length : firstPack, 0, {
        id: FIXTURE, name: FIXTURE, sektor: "misc",
        description: "Fixture tes P2-2 — skill aktif ke-128 untuk uji hitungan dinamis validate.",
        triggers: [], champion: false, fallback: null, cost: "low", requires_consent: false,
        pack: "", src: "fixture/p2-2", sha: "0000000000000000000000000000000000000000",
        license: "MIT", original_id: `fixture__${FIXTURE}`, original_name: FIXTURE,
      });
      fs.rmSync(regPath); fs.writeFileSync(regPath, JSON.stringify(reg, null, 1) + "\n");
      const idxPath = path.join(root, "router/skills-index.md");
      const idx = fs.readFileSync(idxPath, "utf8");
      fs.rmSync(idxPath);
      fs.writeFileSync(idxPath, idx.replace("## misc\n", `## misc\n- ${FIXTURE}: Fixture tes P2-2 — skill aktif ke-128 untuk uji hitungan dinamis validate.\n`));
    }
  };
  const runValidateCopy = (withRegistry) => {
    const tmp = fs.mkdtempSync(path.join("..", "p22-e2e-"));
    try {
      cp.execFileSync("cp", ["-al", ".", tmp + "/"], { timeout: 120000 });
      addFixture(tmp, withRegistry);
      const r = cp.spawnSync(process.execPath, ["scripts/validate.mjs"], { cwd: tmp, encoding: "utf8", timeout: 120000 });
      return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
  const v128 = runValidateCopy(true);
  ok("validate dinamis: skill aktif ke-128 (fixture + registry + indeks) -> validate lolos", v128.status === 0 && /OK \(warns 0\)/.test(v128.out));
  const vNoReg = runValidateCopy(false);
  ok("validate dinamis: folder ke-128 tanpa entri registry -> validate tetap gagal (bukan lolos diam-diam)", vNoReg.status !== 0 && /registry/.test(vNoReg.out));
}

// ---------- v0.3.48 (P2-3): validate mandiri + offline ----------
// TDD (mattpocock): tes ini ditulis SEBELUM implementasi — harus MERAH dulu.
// B9: validate bergantung (diam-diam) pada ajv/yaml dari node_modules dan
// tidak bisa dibuktikan jalan tanpa binary OpenCode. Target: precheck
// eksplisit (gagal jelas sebelum cek lain bila dep hilang) + flag --offline.
{
  const os = await import("node:os");
  // Salinan repo untuk validate (hardlink, murah). withDeps=false -> hapus node_modules.
  const runValidateCopy = ({ offline = false, withDeps = true, scrubPath = false, offlineEnv = false } = {}) => {
    const tmp = fs.mkdtempSync(path.join("..", "p23-val-"));
    try {
      cp.execFileSync("cp", ["-al", ".", tmp + "/"], { timeout: 120000 });
      if (!withDeps) fs.rmSync(path.join(tmp, "node_modules"), { recursive: true, force: true });
      const env = { ...process.env };
      if (scrubPath) { const empty = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-nobin-")); env.PATH = empty; }
      if (offlineEnv) env.LUMI_VALIDATE_OFFLINE = "1";
      const args = ["scripts/validate.mjs"];
      if (offline) args.push("--offline");
      const r = cp.spawnSync(process.execPath, args, { cwd: tmp, encoding: "utf8", timeout: 120000, env });
      return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
  // (1) --offline: lolos di salinan lengkap meski PATH tidak berisi binary apa pun.
  const off = runValidateCopy({ offline: true, scrubPath: true });
  ok("validate --offline: lolos tanpa binary OpenCode di PATH + penanda [offline]",
    off.status === 0 && /\[offline\]/.test(off.out) && /OK \(warns 0\)/.test(off.out));
  // (1b) LUMI_VALIDATE_OFFLINE=1 sama dengan --offline.
  const offEnv = runValidateCopy({ offlineEnv: true, scrubPath: true });
  ok("validate LUMI_VALIDATE_OFFLINE=1: sama dengan --offline (penanda [offline])",
    offEnv.status === 0 && /\[offline\]/.test(offEnv.out) && /OK \(warns 0\)/.test(offEnv.out));
  // (2) tanpa node_modules: gagal jelas SEBELUM cek lain — [FAIL] pertama
  // menyebut yaml + npm install, tanpa [PASS] registry sebelumnya.
  const noDeps = runValidateCopy({ withDeps: false });
  const firstVerdict = (noDeps.out.match(/^\[(PASS|FAIL)\].*$/m) || [""])[0];
  ok("validate tanpa node_modules: [FAIL] pertama menyebut yaml + npm install, tanpa [PASS] registry",
    noDeps.status !== 0 && /yaml/.test(firstVerdict) && /npm install/.test(firstVerdict) && !/\[PASS\] registry/.test(noDeps.out));
  // (3) skrip npm validate:offline ada.
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  ok("package.json: skrip validate:offline = node scripts/validate.mjs --offline",
    pkg.scripts && pkg.scripts["validate:offline"] === "node scripts/validate.mjs --offline");
}

// (v0.3.49) docs-pack: langkah verifikasi Anthropic — TDD merah dulu.
// Pola: asersi regex pada isi SKILL.md (seperti tes konten skill di suite-services.mjs).
{
  const dp = fs.readFileSync(".opencode/skills/docs-pack/SKILL.md", "utf8");
  const interviewAt = dp.indexOf("### 1. Interview");
  const writeAt = dp.indexOf("### 3. Write the files");
  ok("docs-pack verifikasi: ada langkah verifikasi antara wawancara (1) dan penulisan (2->3)",
    interviewAt >= 0 && writeAt > interviewAt && /### 2\. Verify/.test(dp.slice(interviewAt, writeAt)));
  ok("docs-pack verifikasi: tiap klaim/angka/metrik dicek ke sumber; tanpa sumber -> [TODO: ask the user] atau 'belum terverifikasi', jangan dikarang",
    /every claim|setiap klaim/i.test(dp) && /belum terverifikasi/.test(dp) && /\[TODO: ask the user\]/.test(dp) && /jangan dikarang|never invent|do not invent/i.test(dp));
  ok("docs-pack verifikasi: angka yang hanya dari ringkasan/metadata sumber diperlakukan belum terverifikasi",
    /ringkasan|summary/i.test(dp) && /metadata/.test(dp) && /belum terverifikasi/.test(dp));
  ok("docs-pack: tabel delegasi merujuk cara kerja anthropic-verify-first untuk verifikasi (nama saja, tanpa impor)",
    /anthropic-verify-first/.test(dp) && !/import.*anthropic-verify-first|require.*anthropic-verify-first/.test(dp));
}

finish();
