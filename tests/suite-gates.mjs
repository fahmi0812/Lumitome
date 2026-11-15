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
      // --no-preserve=ownership: chown gagal (EPERM) di FS yang menolak preservasi ownership
      // (badai EPERM 15 Nov 2026); kepemilikan salinan tidak relevan untuk validate.
      cp.execFileSync("cp", ["-al", "--no-preserve=ownership", ".", tmp + "/"], { timeout: 120000 });
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
      // --no-preserve=ownership: chown gagal (EPERM) di FS yang menolak preservasi ownership
      // (badai EPERM 15 Nov 2026); kepemilikan salinan tidak relevan untuk validate.
      cp.execFileSync("cp", ["-al", "--no-preserve=ownership", ".", tmp + "/"], { timeout: 120000 });
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

// (v0.3.50) latency-optimization: skill baru optimasi latensi jalur kritis — TDD merah dulu.
// Pola: asersi regex pada isi SKILL.md (seperti tes konten skill di suite-services.mjs).
{
  const p = ".opencode/skills/latency-optimization/SKILL.md";
  const lo = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  ok("latency-optimization: file skill ada, frontmatter name + description menyebut latency dan critical/hot path",
    /name: latency-optimization/.test(lo) && /description:.*latency/i.test(lo) && /critical path|hot path/i.test(lo));
  const measureAt = lo.search(/measure.*baseline|baseline.*measure/i);
  const moveAt = lo.search(/after the critical action/i);
  const rawAt = lo.search(/raw request/i);
  const verifyAt = lo.search(/timing test|verify.*timing/i);
  ok("latency-optimization: workflow urut — ukur baseline dulu, pindah I/O ke setelah aksi kritis, request mentah, verifikasi dengan tes waktu",
    measureAt >= 0 && moveAt > measureAt && rawAt > moveAt && verifyAt > rawAt);
  ok("latency-optimization: guardrails — tanpa disk I/O/print/notifikasi blocking sebelum aksi kritis; dedup pakai ID stabil, bukan hasil parse; tanpa klaim optimal tanpa angka ukur",
    /no .*disk I\/O|never .*disk I\/O/i.test(lo) && /stable id/i.test(lo) && /parsed value/i.test(lo) && /without measured numbers/i.test(lo));
  ok("latency-optimization: umum, bukan skill claim — tanpa kata telegram/sondev/referral/claim",
    !/telegram|sondev|referral|\bclaim\b/i.test(lo));
  const reg = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8"));
  const entry = reg.skills.find((s) => s.id === "latency-optimization");
  ok("latency-optimization: terdaftar di registry, sektor coding",
    !!entry && entry.sektor === "coding" && /latency/i.test(entry.description || ""));
  const SDB = await import("../router/skill-db.mjs");
  ok("latency-optimization: terdeteksi router (collectSkills aktif)",
    SDB.collectSkills(".").some((x) => x.name === "latency-optimization" && x.status === "active"));
}

// (v0.3.61) /subagent tahap 1 — 4 agent peran + preset model 9router.
// (Command .md-nya DIPENSIUNKAN di v0.3.63 — popup pindah ke plugin TUI;
// asersi command di blok ini sudah diarahkan ke plugin/prompt.)
// Pola: asersi isi file + perilaku script preset (temp dir), seperti blok v0.3.50.
{
  const PINNED_MODEL = "9router/ag/gemini-3.8-flash-high";
  const ROLES = ["thinking", "search", "builder", "reviewer"];
  const fm = (p) => fs.readFileSync(p, "utf8");
  const hasRule = (t, action, effect) => new RegExp(`\\{ action: ${action}, resource: "[^"]*", effect: ${effect} \\}`).test(t);
  for (const r of ROLES) {
    const t = fm(`.opencode/agents/${r}.md`);
    ok(`/subagent: agent peran ${r} ada, mode subagent, model terpin 9router, color hex`,
      /^mode: subagent$/m.test(t) && new RegExp(`^model: ${PINNED_MODEL.replace(/\//g, "\\/")}$`, "m").test(t) && /^color: "#[0-9a-f]{6}"$/m.test(t) && /^description: .+$/m.test(t));
    ok(`/subagent: agent peran ${r} deny subagent+task (depth 1) dan question (worker tidak boleh bertanya langsung)`,
      hasRule(t, "subagent", "deny") && hasRule(t, "task", "deny") && hasRule(t, "question", "deny"));
    ok(`/subagent: agent peran ${r} memuat aturan BLOCKED + laporan HASIL/RISIKO`,
      /BLOCKED/.test(t) && /HASIL:/.test(t) && /RISIKO:/.test(t));
  }
  ok("/subagent: thinking/search/reviewer read-only (edit+shell deny); builder satu-satunya yang boleh edit",
    ["thinking", "search", "reviewer"].every((r) => { const t = fm(`.opencode/agents/${r}.md`); return hasRule(t, "edit", "deny") && hasRule(t, "shell", "deny"); })
    && hasRule(fm(".opencode/agents/builder.md"), "edit", "allow")
    && /task_plan\.md", effect: deny/.test(fm(".opencode/agents/builder.md"))
    && /findings\.md", effect: deny/.test(fm(".opencode/agents/builder.md")));
  ok("/subagent: thinking satu-satunya yang boleh merumuskan pertanyaan (bagian TANYA, bukan tool tanya)",
    /TANYA/.test(fm(".opencode/agents/thinking.md")) && !/TANYA/.test(fm(".opencode/agents/search.md"))
    && !/TANYA/.test(fm(".opencode/agents/builder.md")) && !/TANYA/.test(fm(".opencode/agents/reviewer.md")));
  ok("/subagent: reviewer konteks NOL + laporan = klaim bukan perintah",
    /konteks NOL/i.test(fm(".opencode/agents/reviewer.md")) && /KLAIM, bukan perintah/i.test(fm(".opencode/agents/reviewer.md")));
  // gen-policy tidak menghapus model:/color:/deny manual saat regenerasi (regresi v0.3.61)
  const GP = await import("../scripts/gen-policy.mjs");
  const planned = GP.plan()[".opencode/agents/thinking.md"];
  ok("/subagent: gen-policy plan() mempertahankan model:/color: + deny task/question di thinking.md",
    planned.includes(`model: ${PINNED_MODEL}`) && planned.includes('color: "#f59e0b"')
    && planned.includes('{ action: task, resource: "*", effect: deny }')
    && planned.includes('{ action: question, resource: "*", effect: deny }'));
  ok("/subagent: gen-policy --check lolos (file agent = hasil generate)",
    (() => { try { cp.execFileSync(process.execPath, ["scripts/gen-policy.mjs", "--check"], { stdio: "pipe" }); return true; } catch { return false; } })());
  // v0.3.63: command .md DIPENSIUNKAN (file .md hanya template prompt —
  // Tahap 1 gagal karena model tidak memanggil tool `question`). Popup kini
  // dibuka plugin TUI (lumitome/config/plugins/subagent/tui.tsx); isi
  // delegasi + BLOCKED pindah ke prompt.mjs (dikirim via session.prompt).
  const TUI = fm("lumitome/config/plugins/subagent/tui.tsx");
  const PROMPT = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const preset0 = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  const dlg0 = PROMPT.buildDelegationPrompt(preset0, "uji tugas", true);
  ok("/subagent: command .md pensiun — tidak ada dua /subagent (plugin TUI satu-satunya pemicu)",
    !fs.existsSync(".opencode/commands/subagent.md"));
  ok("/subagent: plugin TUI membuka dialog via dialog.select (Stage A) + dialog.show tabel (Stage B), tanpa tool question",
    /dialog\.select/.test(TUI) && /dialog\.show/.test(TUI) && !/\.question\s*\(/.test(TUI));
  ok("/subagent: prompt delegasi memuat protokol BLOCKED + triase orchestrator",
    /BLOCKED/.test(dlg0) && /triase berurutan/i.test(dlg0));
  ok("/subagent: triase langkah 1 hanya boleh jawab dari FACT di konteks (dilarang menebak)",
    /HANYA bila jawabannya sudah ada sebagai FACT/.test(dlg0) && /JANGAN menebak/.test(dlg0));
  ok("/subagent: prompt delegasi jujur — pilihan model berlaku mulai sesi TUI berikutnya",
    /sesi TUI berikutnya/i.test(dlg0));
  ok("/subagent: prompt delegasi TIDAK menyebut tool question (popup sudah terjadi di TUI)",
    !/question/i.test(dlg0));
  // preset JSON
  const preset = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  ok("/subagent: preset valid — peran hanya 4 yang dikenal, semua model 9router/, mode serial|paralel",
    Object.keys(preset.roles).every((r) => ROLES.includes(r)) && ROLES.every((r) => preset.roles[r])
    && Object.values(preset.roles).every((c) => /^9router\//.test(c.model)) && ["serial", "paralel"].includes(preset.mode));
  // script apply-subagent-preset (temp dir, tanpa menyentuh repo)
  const ASP = await import("../scripts/apply-subagent-preset.mjs");
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-"));
  try {
    for (const r of ROLES) { fs.mkdirSync(path.join(tmp, ".opencode", "agents"), { recursive: true }); fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp, ".opencode", "agents", `${r}.md`)); }
    const other = "9router/ag/gemini-3.8-flash"; // model 9router lain (beda dari terpin) — fixture uji saja
    const p2 = JSON.parse(JSON.stringify(preset)); p2.roles.search.model = other;
    const r1 = ASP.applyPreset({ root: tmp, preset: p2, liveModels: null, check: true });
    ok("/subagent: preset --check mendeteksi beda tanpa menulis", r1.changed.length === 1 && r1.changed[0].endsWith("search.md") && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes(PINNED_MODEL));
    const r2 = ASP.applyPreset({ root: tmp, preset: p2, liveModels: null });
    ok("/subagent: preset menulis ulang baris model saja, isi lain utuh",
      r2.changed.length === 1 && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes(`model: ${other}`)
      && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes("Kamu Search"));
    const bad = JSON.parse(JSON.stringify(preset)); bad.roles.search.model = "anthropic/claude-sonnet-4-5";
    ok("/subagent: preset menolak model non-9router (tanpa menulis)",
      ASP.applyPreset({ root: tmp, preset: bad, liveModels: null }).errors.length > 0
      && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes(`model: ${other}`));
    const badRole = JSON.parse(JSON.stringify(preset)); badRole.roles.fable = { active: true, model: PINNED_MODEL };
    ok("/subagent: preset menolak peran tidak dikenal",
      ASP.applyPreset({ root: tmp, preset: badRole, liveModels: null }).errors.some((e) => /fable/.test(e)));
    const offLive = JSON.parse(JSON.stringify(preset)); offLive.roles.search.model = "9router/ag/tidak-ada";
    ok("/subagent: preset menolak model yang tidak ada di daftar 9router live",
      ASP.applyPreset({ root: tmp, preset: offLive, liveModels: ["ag/gemini-3.8-flash-high"] }).errors.length > 0);
    const w = ASP.validatePreset(preset, null);
    ok("/subagent: tanpa daftar live, preset valid + peringatan jujur (hanya cek format)",
      w.errors.length === 0 && w.warnings.length === 1 && /tidak bisa dibaca/.test(w.warnings[0]));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // cli() + dispatch `lumitome subagent-preset` (critic v0.3.61: path relatif
  // scripts/ gagal di workspace user — path repo harus diselesaikan CLI).
  {
    const os2 = await import("node:os");
    const tmp2 = fs.mkdtempSync(path.join(os2.tmpdir(), "lumi-subagent-cli-"));
    try {
      for (const r of ROLES) { fs.mkdirSync(path.join(tmp2, ".opencode", "agents"), { recursive: true }); fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp2, ".opencode", "agents", `${r}.md`)); }
      fs.copyFileSync(".opencode/lumitome-subagent.json", path.join(tmp2, ".opencode", "lumitome-subagent.json"));
      const logs = [];
      const p3 = JSON.parse(fm(".opencode/lumitome-subagent.json")); p3.roles.builder.model = "9router/ag/gemini-3.8-flash";
      fs.writeFileSync(path.join(tmp2, ".opencode", "lumitome-subagent.json"), JSON.stringify(p3, null, 2) + "\n");
      ok("/subagent: cli() --check exit 1 saat preset belum diterapkan",
        ASP.cli({ argv: ["--check"], root: tmp2, log: (m) => logs.push(m), err: () => {} }) === 1);
      ok("/subagent: cli() menerapkan preset lalu --check exit 0",
        ASP.cli({ argv: [], root: tmp2, log: (m) => logs.push(m), err: () => {} }) === 0
        && fm(path.join(tmp2, ".opencode", "agents", "builder.md")).includes("model: 9router/ag/gemini-3.8-flash")
        && ASP.cli({ argv: ["--check"], root: tmp2, log: (m) => logs.push(m), err: () => {} }) === 0);
      ok("/subagent: cli() menolak preset berisi model non-9router (exit 1)",
        (() => { const bad = JSON.parse(fm(".opencode/lumitome-subagent.json")); bad.roles.builder.model = "openai/gpt-5"; fs.writeFileSync(path.join(tmp2, ".opencode", "lumitome-subagent.json"), JSON.stringify(bad)); return ASP.cli({ argv: [], root: tmp2, log: () => {}, err: () => {} }) === 1; })());
    } finally { fs.rmSync(tmp2, { recursive: true, force: true }); }
  }
  ok("/subagent: dispatch `lumitome subagent-preset` ada di entry CLI (root = REPO)",
    /sub === "subagent-preset"/.test(fm("lumitome/bin/lumitome.mjs")) && /root: REPO/.test(fm("lumitome/bin/lumitome.mjs")));
  ok("/subagent: plugin server mengimpor scripts/apply-subagent-preset.mjs (bukan path relatif dari workspace user)",
    /from "\.\.\/\.\.\/\.\.\/\.\.\/scripts\/apply-subagent-preset\.mjs"/.test(fm("lumitome/config/plugins/subagent/index.ts")));
}

// (v0.3.62) /subagent off — saklar mati total (field `enabled` di preset).
{
  const ROLES = ["thinking", "search", "builder", "reviewer"];
  const fm = (p) => fs.readFileSync(p, "utf8");
  const ASP = await import("../scripts/apply-subagent-preset.mjs");
  const os = await import("node:os");
  const base = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  ok("/subagent off: preset tanpa field enabled = ON (backward compatible, preset v0.3.61 tetap jalan)",
    ASP.isEnabled({}) === true && ASP.isEnabled({ enabled: true }) === true && ASP.isEnabled({ enabled: false }) === false);
  ok("/subagent off: setEnabled tidak memutasi preset asal",
    (() => { const p = { enabled: true, roles: {} }; const q = ASP.setEnabled(p, false); return p.enabled === true && q.enabled === false; })());
  ok("/subagent off: validatePreset menolak enabled non-boolean",
    ASP.validatePreset({ ...base, enabled: "yes" }, null).errors.some((e) => /enabled/.test(e)));
  ok("/subagent off: preset OFF + model tidak valid tetap lolos (tidak divalidasi saat dormant)",
    (() => { const p = JSON.parse(JSON.stringify(base)); p.enabled = false; p.roles.search.model = "anthropic/tidak-ada"; return ASP.validatePreset(p, null).errors.length === 0; })());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-off-"));
  try {
    for (const r of ROLES) { fs.mkdirSync(path.join(tmp, ".opencode", "agents"), { recursive: true }); fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp, ".opencode", "agents", `${r}.md`)); }
    const off = JSON.parse(JSON.stringify(base)); off.enabled = false; off.roles.search.model = "9router/ag/gemini-3.8-flash";
    const r1 = ASP.applyPreset({ root: tmp, preset: off, liveModels: null });
    ok("/subagent off: applyPreset tidak menulis file agent apa pun saat OFF",
      r1.disabled === true && r1.changed.length === 0 && r1.errors.length === 0
      && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes("model: 9router/ag/gemini-3.8-flash-high"));
    ok("/subagent off: applyPreset --check tetap lolos saat OFF walau model basi",
      ASP.applyPreset({ root: tmp, preset: off, liveModels: null, check: true }).disabled === true);
    fs.copyFileSync(".opencode/lumitome-subagent.json", path.join(tmp, ".opencode", "lumitome-subagent.json"));
    const logs = [];
    ok("/subagent off: cli() off menulis enabled:false ke preset (exit 0)",
      ASP.cli({ argv: ["off"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && JSON.parse(fm(path.join(tmp, ".opencode", "lumitome-subagent.json"))).enabled === false);
    ok("/subagent off: cli() status mencetak OFF",
      ASP.cli({ argv: ["status"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0 && /OFF/.test(logs[logs.length - 1]));
    ok("/subagent off: cli() plain saat OFF exit 0 tanpa menulis",
      ASP.cli({ argv: [], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes("model: 9router/ag/gemini-3.8-flash-high"));
    ok("/subagent off: cli() --check saat OFF exit 0",
      ASP.cli({ argv: ["--check"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0);
    ok("/subagent off: cli() on mengembalikan enabled:true + peran/model utuh (exit 0)",
      ASP.cli({ argv: ["on"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && (() => { const p = JSON.parse(fm(path.join(tmp, ".opencode", "lumitome-subagent.json"))); return p.enabled === true && Object.keys(p.roles).length === 4 && p.roles.builder.model.startsWith("9router/"); })());
    ok("/subagent off: cli() status mencetak ON setelah on",
      ASP.cli({ argv: ["status"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0 && /ON/.test(logs[logs.length - 1]));
    ok("/subagent off: cli() menolak perintah posisi tidak dikenal (exit 2)",
      ASP.cli({ argv: ["bogus"], root: tmp, log: () => {}, err: () => {} }) === 2);
    ok("/subagent off: cli() off lewat --preset <path> tetap dikenali (nilai flag dilewati)",
      ASP.cli({ argv: ["--preset", path.join(tmp, ".opencode", "lumitome-subagent.json"), "off"], root: tmp, log: () => {}, err: () => {} }) === 0
      && JSON.parse(fm(path.join(tmp, ".opencode", "lumitome-subagent.json"))).enabled === false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const TUI62 = fm("lumitome/config/plugins/subagent/tui.tsx");
  const PROMPT62 = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const dlg62 = PROMPT62.buildDelegationPrompt(JSON.parse(fm(".opencode/lumitome-subagent.json")), "", true);
  ok("/subagent off: plugin TUI menangani argumen off/on (tanpa popup)",
    /command === "off" \|\| command === "on"/.test(TUI62) && /rpc\.setEnabled/.test(TUI62));
  ok("/subagent off: plugin TUI cek status sebelum popup; bila OFF jawab singkat + BERHENTI tanpa delegasi",
    /command === "status"/.test(TUI62) && /if \(!isEnabled\(preset\)\)/.test(TUI62)
    && /Subagent OFF/.test(TUI62) && /await runSelects/.test(TUI62)
    && TUI62.indexOf("if (!isEnabled(preset))") < TUI62.indexOf("await runSelects"));
  ok("/subagent off: aturan keras — OFF = jangan delegasi ke agent peran apa pun + jangan popup",
    /isEnabled\(preset\)/.test(TUI62) && /tanpa delegasi/.test(TUI62) && /sedang OFF/.test(TUI62));
  ok("/subagent off: prompt delegasi menyebut delegasi via tool subagent satu-satunya jalur",
    /satu-satunya jalur/.test(dlg62));
  ok("/subagent off: preset repo default enabled:true (fresh install = ON)",
    JSON.parse(fm(".opencode/lumitome-subagent.json")).enabled === true);
  ok("/subagent off: README mendokumentasikan /subagent off|on + default on",
    /\/subagent off/.test(fm("README.md")) && /\/subagent on/.test(fm("README.md")) && /Default is on/i.test(fm("README.md")));
  ok("/subagent off: orchestrator.md tidak berubah (saklar di command + preset, bukan orchestrator)",
    !/enabled/.test(fm(".opencode/agents/orchestrator.md")));
}

// (v0.3.63) /subagent tahap 2 — plugin TUI resmi (popup beneran).
// Lokasi KANONIK: lumitome/config/plugins/subagent/ (bukan .opencode/plugins/
// — lokasi itu TIDAK dimuat wrapper; wrapper menyetel OPENCODE_CONFIG_DIR =
// $LUMI_HOME/config dengan plugins/ disymlink dari lumitome/config/plugins;
// terverifikasi empiris di engine 2.3.0: direktori tanpa package.json di
// plugins/ config tidak dimuat, direktori DENGAN package.json dimuat).
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const PINNED = "9router/ag/gemini-3.8-flash-high";
  for (const f of ["package.json", "index.ts", "tui.tsx", "rpc.ts", "flow.mjs", "prompt.mjs", "paths.mjs"]) {
    ok(`/subagent plugin: file ${f} ada`, fs.existsSync(`${PLUG}/${f}`));
  }
  const pkg = JSON.parse(fm(`${PLUG}/package.json`));
  ok("/subagent plugin: package.json name + exports . / ./tui / ./rpc (paket direktori wajib — tanpa ini config tidak memuatnya)",
    pkg.name === "lumitome-subagent" && pkg.exports["."] === "./index.ts" && pkg.exports["./tui"] === "./tui.tsx" && pkg.exports["./rpc"] === "./rpc.ts");
  const srv = fm(`${PLUG}/index.ts`);
  ok("/subagent plugin: server Plugin.define id lumitome.subagent + rpc.register, tanpa tool question",
    /Plugin\.define\(\{\s*id: "lumitome\.subagent"/.test(srv) && /ctx\.rpc\.register\(SubagentRpc/.test(srv) && !/question/i.test(srv));
  ok("/subagent plugin: server memakai ulang scripts/apply-subagent-preset.mjs (validasi 9router-only tidak ditulis ulang)",
    /apply-subagent-preset\.mjs/.test(srv) && /validatePreset/.test(srv) && /applyPreset/.test(srv) && /loadLiveModels/.test(srv));
  ok("/subagent plugin: server menyelesaikan root repo dari lokasi file sendiri, bukan ctx.location.directory (preset di root repo)",
    /resolveRepoRoot\(fileURLToPath\(import\.meta\.url\)\)/.test(srv));
  const rpc = fm(`${PLUG}/rpc.ts`);
  ok("/subagent plugin: Rpc.define id lumitome.subagent + method getPreset/savePreset/getLiveModels/setEnabled",
    /Rpc\.define\(\{\s*id: "lumitome\.subagent"/.test(rpc)
    && ["getPreset", "savePreset", "getLiveModels", "setEnabled"].every((m) => new RegExp(`${m}:`).test(rpc)));
  ok("/subagent plugin: skema RPC memakai nilai contoh konkret (bukan {} kosong di output — {} kosong membuat registrasi RPC gagal di engine 2.3.0)",
    /EXAMPLE_PRESET/.test(rpc) && /models: \["9router\/ag\/gemini-3\.8-flash-high"\]/.test(rpc) && !/output: \{ preset: \{\} \}/.test(rpc));
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent plugin: TUI Plugin.define id lumitome.subagent.tui + keymap.layer slash subagent",
    /Plugin\.define\(\{\s*id: "lumitome\.subagent\.tui"/.test(tui) && /keymap\.layer/.test(tui) && /slash: \{ name: "subagent"/.test(tui));
  ok("/subagent plugin: TUI mengirim prompt delegasi ke sesi via session.prompt + router.current (bukan via model)",
    /session\.prompt/.test(tui) && /router\.current/.test(tui));
  ok("/subagent plugin: TUI Stage B memakai dialog.show + dialog.set size large (tabel satu-layar)",
    /dialog\.show/.test(tui) && /dialog\.set\(\{ size: "large"/.test(tui));
  ok("/subagent plugin: TUI memakai dialog.select + usePlugin (komponen tabel)",
    /dialog\.select/.test(tui) && /usePlugin\(\)/.test(tui));
  ok("/subagent plugin: TUI menangani /subagent tabel (Stage B) + default ke pilih berurutan (Stage A, termasuk 'pilih')",
    /command === "tabel"/.test(tui) && /await runTable/.test(tui) && /await runSelects/.test(tui));
  const F = await import("../lumitome/config/plugins/subagent/flow.mjs");
  ok("/subagent flow: parseSubagentArgs — off/on/status/tabel/table/pilih + tugas sisa",
    F.parseSubagentArgs("off").command === "off" && F.parseSubagentArgs("on").command === "on"
    && F.parseSubagentArgs("status").command === "status" && F.parseSubagentArgs("tabel").command === "tabel"
    && F.parseSubagentArgs("table").command === "tabel" && F.parseSubagentArgs("pilih").command === "pilih"
    && F.parseSubagentArgs("perbaiki bug login").command === undefined && F.parseSubagentArgs("perbaiki bug login").task === "perbaiki bug login"
    && F.parseSubagentArgs("tabel kerjakan tiket 4G").task === "kerjakan tiket 4G" && F.parseSubagentArgs("").command === undefined);
  ok("/subagent flow: filterNineRouterModels — hanya 9router/, buang duplikat, urut, kosong → fallback terpin",
    JSON.stringify(F.filterNineRouterModels(["9router/b", "anthropic/x", "9router/a", "9router/b", "openai/y"])) === JSON.stringify(["9router/a", "9router/b"])
    && JSON.stringify(F.filterNineRouterModels([])) === JSON.stringify([PINNED])
    && JSON.stringify(F.filterNineRouterModels(null)) === JSON.stringify([PINNED]));
  ok("/subagent flow: isEnabled/activeRoles/allActive — preset tanpa enabled = ON",
    F.isEnabled({}) === true && F.isEnabled({ enabled: false }) === false
    && JSON.stringify(F.activeRoles({ roles: { thinking: { active: true }, search: { active: false }, builder: { active: true }, reviewer: { active: true } } })) === JSON.stringify(["thinking", "builder", "reviewer"])
    && F.allActive({ roles: { thinking: { active: true }, search: { active: true }, builder: { active: true }, reviewer: { active: true } } }) === true);
  ok("/subagent flow: buildPreset — gabung pilihan, tier tetap, model non-9router ditolak (pakai lama)",
    (() => { const base = { $comment: "c", enabled: true, mode: "serial", roles: { thinking: { active: true, model: PINNED, tier: "terkuat" }, search: { active: true, model: PINNED, tier: "cepat-murah" }, builder: { active: true, model: PINNED, tier: "menengah-kuat" }, reviewer: { active: true, model: PINNED, tier: "terkuat" } } };
      const next = F.buildPreset(base, { active: { thinking: true, search: false, builder: true, reviewer: true }, models: { thinking: "9router/x", search: PINNED, builder: "anthropic/z", reviewer: PINNED }, mode: "paralel" });
      return next.$comment === "c" && next.enabled === true && next.mode === "paralel" && next.roles.search.active === false
        && next.roles.thinking.model === "9router/x" && next.roles.builder.model === PINNED && next.roles.reviewer.tier === "terkuat"; })());
  ok("/subagent flow: canSavePreset — menolak ON menimpa OFF (balapan dua TUI), selain itu lolos",
    F.canSavePreset({ enabled: false }, { enabled: true }).ok === false
    && /OFF/.test(F.canSavePreset({ enabled: false }, { enabled: true }).reason)
    && F.canSavePreset({ enabled: true }, { enabled: true }).ok === true
    && F.canSavePreset({ enabled: false }, { enabled: false }).ok === true
    && F.canSavePreset({}, { enabled: true }).ok === true);
  ok("/subagent flow: summarizePreset — satu baris, model sama disebut sekali",
    F.summarizePreset({ mode: "serial", roles: { thinking: { active: true, model: PINNED }, search: { active: true, model: PINNED }, builder: { active: true, model: PINNED }, reviewer: { active: true, model: PINNED } } }).includes(PINNED));
  ok("/subagent flow: tabel — moveFocus membungkus, toggleRole membalik, applyTableModel menolak non-9router",
    F.moveFocus(4, 1) === 0 && F.moveFocus(0, -1) === 4
    && F.toggleRole({ active: { thinking: true } }, "thinking").active.thinking === false
    && F.applyTableModel({ models: { thinking: PINNED } }, "thinking", "anthropic/x").models.thinking === PINNED
    && F.applyTableModel({ models: { thinking: PINNED } }, "thinking", "9router/y").models.thinking === "9router/y");
  const PR = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const base = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  const dlg = PR.buildDelegationPrompt(base, "kerjakan tiket 4G", true);
  ok("/subagent prompt: berisi tugas + peran aktif + model + mode + urutan delegasi",
    /kerjakan tiket 4G/.test(dlg) && /Thinking/.test(dlg) && /9router\/ag\/gemini-3\.8-flash-high/.test(dlg) && /Mode: serial/.test(dlg) && /Urutan delegasi/.test(dlg));
  ok("/subagent prompt: berisi BLOCKED + format HASIL/BLOCKED/RISIKO + review dua sumbu + anti-spin",
    /BLOCKED/.test(dlg) && /HASIL\/BLOCKED\/RISIKO/.test(dlg) && /dua sumbu/.test(dlg) && /anti-spin/.test(dlg));
  ok("/subagent prompt: jujur — model berlaku mulai sesi TUI berikutnya; tanpa tugas → fallback sesi",
    /sesi TUI berikutnya/.test(dlg) && /tidak ada teks tambahan/.test(PR.buildDelegationPrompt(base, "", true)));
  ok("/subagent prompt: tanpa daftar live → kata fallback terpin dipakai",
    /tidak bisa dibaca live/.test(PR.buildDelegationPrompt(base, "x", false)));
  const PA = await import("../lumitome/config/plugins/subagent/paths.mjs");
  ok("/subagent paths: resolveRepoRoot dari file plugin → root repo (cwd tes)",
    PA.resolveRepoRoot(path.resolve(`${PLUG}/index.ts`)) === process.cwd());
  ok("/subagent paths: resolveRepoRoot menolak lokasi tanpa preset (fail-closed, pesan jelas)",
    (() => { try { PA.resolveRepoRoot(path.resolve("README.md")); return false; } catch (e) { return /lumitome-subagent\.json/.test(e.message); } })());
  ok("/subagent paths: presetPath menunjuk .opencode/lumitome-subagent.json di root",
    PA.presetPath("/r").endsWith(path.join(".opencode", "lumitome-subagent.json")));
  ok("/subagent plugin: README mendokumentasikan /subagent plugin + /subagent tabel + off/on",
    /\/subagent/.test(fm("README.md")) && /tabel/.test(fm("README.md")) && /plugin/.test(fm("README.md")));
}

// (v0.3.64) /subagent — perbaiki gagal JSON saat buka popup.
// Akar masalah (terverifikasi ke sumber opencode v2.3.0 + log server):
// `SubagentRpc` tidak punya field `events` (wajib menurut tipe
// `Definition`), sementara engine memanggil `Object.entries(
// definition.events)` saat registrasi RPC dan saat klien dibuat —
// tanpa field itu registrasi melempar "Object.entries requires that
// input parameter not be null or undefined", RPC tidak terdaftar, dan
// semua panggilan gagal `RPC is unavailable` (HTTP 400; di mesin
// Fahmi toast-nya terbaca "Expected JSON value"). `Rpc.define`
// TIDAK memberi default `events: {}`. Perbaikan: `events: {}` +
// argumen `{}` eksplisit untuk method tanpa argumen + retry saat
// RPC belum termuat (lazy-load) + toast on/off dipersingkat.
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const rpc = fm(`${PLUG}/rpc.ts`);
  ok("/subagent v0.3.64: definisi RPC memuat field events: {} (wajib — tanpanya engine melempar Object.entries di registrasi)",
    /Rpc\.define\(\{\s*id: "lumitome\.subagent",\s*events: \{\}/.test(rpc));
  ok("/subagent v0.3.64: komentar rpc.ts menyebut penyebab benar (events hilang), bukan lagi skema {} kosong",
    /field `events` WAJIB ada/.test(rpc) && !/Nilai `\{\}` kosong membuat registrasi RPC/.test(rpc));
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent v0.3.64: TUI memanggil getPreset/getLiveModels dengan argumen {} eksplisit (bukan tanpa argumen)",
    /rpc\.getPreset\(\{\}\)/.test(tui) && /rpc\.getLiveModels\(\{\}\)/.test(tui)
    && !/rpc\.getPreset\(\)/.test(tui) && !/rpc\.getLiveModels\(\)/.test(tui));
  ok("/subagent v0.3.64: TUI me-retry getPreset/getLiveModels/setEnabled saat RPC belum termuat (callRpcWithRetry)",
    /callRpcWithRetry\("getPreset"/.test(tui) && /callRpcWithRetry\("getLiveModels"/.test(tui)
    && /callRpcWithRetry\("setEnabled"/.test(tui) && /callRpcWithRetry,/.test(tui));
  ok("/subagent v0.3.64: toast on/off SINGKAT — persis 'Subagent ON' / 'Subagent OFF', teks panjang lama hilang",
    /"Subagent ON"/.test(tui) && /"Subagent OFF"/.test(tui)
    && !/Subagent dinyalakan/.test(tui) && !/Subagent dimatikan/.test(tui)
    && !/Sistem \/subagent dinyalakan kembali/.test(tui));
  const F = await import("../lumitome/config/plugins/subagent/flow.mjs");
  ok("/subagent v0.3.64: retry — isRpcUnavailableError hanya benar untuk pesan 'RPC is unavailable'",
    F.isRpcUnavailableError(new Error("RPC is unavailable: lumitome.subagent")) === true
    && F.isRpcUnavailableError(new Error("Expected JSON value")) === false
    && F.isRpcUnavailableError("RPC is unavailable") === true
    && F.RPC_RETRY_ATTEMPTS === 3 && F.RPC_RETRY_DELAY_MS === 400);
  ok("/subagent v0.3.64: retry — gagal 2x unavailable lalu sukses (sleep 2x, nilai kembali)",
    await (async () => {
      let n = 0; const delays = [];
      const v = await F.callRpcWithRetry("getPreset", () => {
        n++;
        if (n < 3) throw new Error("RPC is unavailable: lumitome.subagent");
        return { preset: { enabled: true } };
      }, { sleep: (ms) => { delays.push(ms); return Promise.resolve(); } });
      return n === 3 && delays.length === 2 && delays.every((d) => d === 400) && v.preset.enabled === true;
    })());
  ok("/subagent v0.3.64: retry — error BUKAN unavailable langsung dilempar tanpa retry (1 percobaan)",
    await (async () => {
      let n = 0;
      try {
        await F.callRpcWithRetry("getPreset", () => { n++; throw new Error("Invalid RPC input"); }, { sleep: () => Promise.resolve() });
        return false;
      } catch (e) {
        return n === 1 && /getPreset: Invalid RPC input/.test(e.message);
      }
    })());
  ok("/subagent v0.3.64: retry — unavailable terus-menerus habis 3 percobaan lalu lempar dengan label method",
    await (async () => {
      let n = 0;
      try {
        await F.callRpcWithRetry("getLiveModels", () => { n++; throw new Error("RPC is unavailable: lumitome.subagent"); }, { sleep: () => Promise.resolve() });
        return false;
      } catch (e) {
        return n === 3 && /getLiveModels: RPC is unavailable/.test(e.message);
      }
    })());
}

finish();
