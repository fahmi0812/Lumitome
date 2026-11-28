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

// Salinan kerja repo untuk gate e2e. Jalur utama: hardlink (cp -al) — murah,
// tidak menggandakan byte. Tapi hardlink tidak bisa melintasi batas
// mount/filesystem (EXDEV): saat repo ter-mount terpisah dari induknya
// (sandbox/CI), `cp -al` ke `../tmp` gagal dan membanjiri stderr dengan
// "Invalid cross-device link" sampai execFileSync pecah ENOBUFS. Karena itu:
// spawnSync + stdio "ignore" (tanpa pipe → tak ada ENOBUFS); bila hardlink
// gagal, fallback salin biasa (cp -a) tanpa .git agar tetap cepat (validate
// hanya butuh file repo + node_modules, bukan direktori .git). Keduanya
// --no-preserve=ownership karena chown bisa EPERM di FS yang menolak
// preservasi ownership (badai EPERM 15 Nov 2026).
function stageRepoCopy(tmp) {
  const hard = cp.spawnSync("cp", ["-al", "--no-preserve=ownership", ".", tmp + "/"], { stdio: "ignore", timeout: 120000 });
  if (hard.status === 0) return;
  // Bersihkan sisa hardlink parsial lalu salin penuh (aman lintas-mount).
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const entries = fs.readdirSync(".").filter((e) => e !== ".git");
  const soft = cp.spawnSync("cp", ["-a", "--no-preserve=ownership", ...entries, tmp + "/"], { stdio: "ignore", timeout: 120000 });
  if (soft.status !== 0) throw new Error(`stageRepoCopy gagal: cp -al status ${hard.status}, cp -a status ${soft.status}${soft.error ? " (" + soft.error.message + ")" : ""}`);
}

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
  // package-lock.json: cocok -> tanpa error; basi -> error (regresi v0.3.80/81:
  // rilis manual meninggalkan lockfile di 0.3.79 dan tak ada gate yang menangkap).
  const mkLock = (ver) => JSON.stringify({ name: "lumitome", version: ver, lockfileVersion: 3, packages: { "": { name: "lumitome", version: ver } } }, null, 1);
  const vd6 = mkVerDir(); fs.writeFileSync(path.join(vd6, "package-lock.json"), mkLock("0.3.47"));
  ok("versi konsisten: package-lock.json root cocok -> tanpa error", checkVersionConsistency(vd6).length === 0);
  fs.rmSync(vd6, { recursive: true, force: true });
  const vd7 = mkVerDir(); fs.writeFileSync(path.join(vd7, "package-lock.json"), mkLock("0.3.46"));
  ok("versi drift: package-lock.json basi -> error menyebut package-lock.json", checkVersionConsistency(vd7).some((e) => /package-lock\.json/.test(e) && /0\.3\.46/.test(e)));
  fs.rmSync(vd7, { recursive: true, force: true });
  // v0.3.82: katalog skill = turunan registry (dulu ditulis tangan, basi sejak v0.1.1)
  const GC = await import("../scripts/gen-catalog.mjs");
  const cat = GC.renderCatalog({ skills: [
    { id: "a", src: "o/r", sha: "0123456789abcdef", license: "MIT", sektor: "coding", pack: "", original_id: "o-r__a" },
    { id: "b|x", sektor: "security", pack: "red-team", original_id: "" },
  ] });
  ok("katalog: hitungan total/route/disabled + baris per skill + pipe di-escape",
    /Total 2 skill di registry\. 1 bisa di-route; 1 \(pack red-team\) disabled\./.test(cat)
    && cat.includes("| `a` | o/r | `0123456789ab` | MIT | coding | active | — | `o-r__a` |")
    && cat.includes("| `b\\|x` | — | — | — | security | disabled | red-team | — |"), cat);
  ok("katalog repo sinkron dengan registry (npm run skills:catalog)", GC.checkCatalog(".").ok);

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
      // Katalog adalah turunan registry (v0.3.82): bangkitkan ulang di salinan.
      // rm dulu — salinan bisa hardlink, menulis langsung akan menembus ke file repo asli.
      const catPath = path.join(root, "docs/SKILLS-CATALOG.md");
      fs.rmSync(catPath, { force: true });
      cp.spawnSync(process.execPath, ["scripts/gen-catalog.mjs"], { cwd: root, stdio: "ignore" });
    }
  };
  const runValidateCopy = (withRegistry) => {
    const tmp = fs.mkdtempSync(path.join("..", "p22-e2e-"));
    try {
      stageRepoCopy(tmp);
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
      stageRepoCopy(tmp);
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
  // dibuka plugin TUI (lumitome/config/plugins/subagent/tui.tsx).
  // v0.3.67: prompt delegasi RAKSASA dihapus — aturan lengkap pindah ke
  // file agent (orchestrator.md + file peran, cara native OpenCode); ke
  // sesi hanya pemberitahuan SINGKAT (prompt.mjs, maks 2 baris).
  const TUI = fm("lumitome/config/plugins/subagent/tui.tsx");
  const PROMPT = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const preset0 = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  const notice0 = PROMPT.buildSubagentNotice(preset0, "uji tugas");
  const ORCH = fm(".opencode/agents/orchestrator.md");
  const RULES = fm(".opencode/rules/subagent.md");
  ok("/subagent: command .md pensiun — tidak ada dua /subagent (plugin TUI satu-satunya pemicu)",
    !fs.existsSync(".opencode/commands/subagent.md"));
  ok("/subagent: plugin TUI membuka dialog via dialog.select (Stage A) + dialog.show tabel (Stage B), tanpa tool question",
    /dialog\.select/.test(TUI) && /dialog\.show/.test(TUI) && !/\.question\s*\(/.test(TUI));
  ok("/subagent: aturan statis di .opencode/rules/subagent.md — BLOCKED + triase + review dua sumbu + depth-1",
    /Protokol BLOCKED/.test(RULES) && /triase berurutan/i.test(RULES) && /dua sumbu/.test(RULES) && /TIDAK BOLEH mendelegasikan lagi/.test(RULES));
  ok("/subagent: triase langkah 1 hanya boleh jawab dari FACT di konteks (dilarang menebak)",
    /HANYA bila jawabannya sudah ada sebagai FACT/.test(RULES) && /JANGAN menebak/.test(RULES));
  ok("/subagent: orchestrator.md hanya berisi gerbang mode + pointer ke rules (bukan aturan panjang) + baris mode",
    /Mode \/subagent/.test(ORCH) && /rules\/subagent\.md/.test(ORCH) && /Mode \/subagent saat ini: serial\./.test(ORCH));
  ok("/subagent: pemberitahuan ke sesi SINGKAT (maks 2 baris) — mode + urutan + Thinking + tugas, tanpa blok konfigurasi",
    notice0.split("\n").length <= 2 && /Mode subagent aktif: serial/.test(notice0) && /thinking → search → builder → reviewer/.test(notice0)
    && /Thinking: 9router\//.test(notice0) && /Tugas: uji tugas/.test(notice0)
    && !/Protokol BLOCKED/.test(notice0) && !/HASIL\/BLOCKED\/RISIKO/.test(notice0) && !/dua sumbu/.test(notice0));
  ok("/subagent: pemberitahuan tanpa tugas menunjuk file rules (bukan blok aturan)",
    /rules\/subagent\.md/.test(PROMPT.buildSubagentNotice(preset0, "")) && !/Protokol BLOCKED/.test(PROMPT.buildSubagentNotice(preset0, "")));
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
      const pp2 = path.join(tmp2, ".opencode", "lumitome-subagent.json");
      const p3 = JSON.parse(fm(".opencode/lumitome-subagent.json")); p3.roles.builder.model = "9router/ag/gemini-3.8-flash";
      fs.writeFileSync(pp2, JSON.stringify(p3, null, 2) + "\n");
      ok("/subagent: cli() --check exit 1 saat preset belum diterapkan",
        ASP.cli({ argv: ["--preset", pp2, "--check"], root: tmp2, log: (m) => logs.push(m), err: () => {} }) === 1);
      ok("/subagent: cli() menerapkan preset lalu --check exit 0",
        ASP.cli({ argv: ["--preset", pp2], root: tmp2, log: (m) => logs.push(m), err: () => {} }) === 0
        && fm(path.join(tmp2, ".opencode", "agents", "builder.md")).includes("model: 9router/ag/gemini-3.8-flash")
        && ASP.cli({ argv: ["--preset", pp2, "--check"], root: tmp2, log: (m) => logs.push(m), err: () => {} }) === 0);
      ok("/subagent: cli() menolak preset berisi model non-9router (exit 1)",
        (() => { const bad = JSON.parse(fm(".opencode/lumitome-subagent.json")); bad.roles.builder.model = "openai/gpt-5"; fs.writeFileSync(pp2, JSON.stringify(bad)); return ASP.cli({ argv: ["--preset", pp2], root: tmp2, log: () => {}, err: () => {} }) === 1; })());
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
    const pp = path.join(tmp, ".opencode", "lumitome-subagent.json");
    fs.copyFileSync(".opencode/lumitome-subagent.json", pp);
    const logs = [];
    ok("/subagent off: cli() off menulis enabled:false ke preset (exit 0)",
      ASP.cli({ argv: ["--preset", pp, "off"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && JSON.parse(fm(pp)).enabled === false);
    ok("/subagent off: cli() status mencetak OFF",
      ASP.cli({ argv: ["--preset", pp, "status"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0 && /OFF/.test(logs[logs.length - 1]));
    ok("/subagent off: cli() plain saat OFF exit 0 tanpa menulis",
      ASP.cli({ argv: ["--preset", pp], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes("model: 9router/ag/gemini-3.8-flash-high"));
    ok("/subagent off: cli() --check saat OFF exit 0",
      ASP.cli({ argv: ["--preset", pp, "--check"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0);
    ok("/subagent off: cli() on mengembalikan enabled:true + peran/model utuh (exit 0)",
      ASP.cli({ argv: ["--preset", pp, "on"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && (() => { const p = JSON.parse(fm(pp)); return p.enabled === true && Object.keys(p.roles).length === 4 && p.roles.builder.model.startsWith("9router/"); })());
    ok("/subagent off: cli() status mencetak ON setelah on",
      ASP.cli({ argv: ["--preset", pp, "status"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0 && /ON/.test(logs[logs.length - 1]));
    ok("/subagent off: cli() menolak perintah posisi tidak dikenal (exit 2)",
      ASP.cli({ argv: ["--preset", pp, "bogus"], root: tmp, log: () => {}, err: () => {} }) === 2);
    ok("/subagent off: cli() off lewat --preset <path> tetap dikenali (nilai flag dilewati)",
      ASP.cli({ argv: ["--preset", path.join(tmp, ".opencode", "lumitome-subagent.json"), "off"], root: tmp, log: () => {}, err: () => {} }) === 0
      && JSON.parse(fm(path.join(tmp, ".opencode", "lumitome-subagent.json"))).enabled === false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const TUI62 = fm("lumitome/config/plugins/subagent/tui.tsx");
  ok("/subagent off: plugin TUI menangani argumen off/on (tanpa popup)",
    /command === "off" \|\| command === "on"/.test(TUI62) && /rpc\.setEnabled/.test(TUI62));
  ok("/subagent off: plugin TUI cek status sebelum popup; bila OFF jawab singkat + BERHENTI tanpa delegasi",
    /command === "status"/.test(TUI62) && /if \(!isEnabled\(preset\)\)/.test(TUI62)
    && /Subagent OFF/.test(TUI62) && /await runSelects/.test(TUI62)
    && TUI62.indexOf("if (!isEnabled(preset))") < TUI62.indexOf("await runSelects"));
  ok("/subagent off: aturan keras — OFF = jangan delegasi ke agent peran apa pun + jangan popup",
    /isEnabled\(preset\)/.test(TUI62) && /tanpa delegasi/.test(TUI62) && /sedang OFF/.test(TUI62));
  ok("/subagent off: aturan delegasi via tool subagent satu-satunya jalur tinggal di .opencode/rules/subagent.md (bukan prompt raksasa)",
    /satu-satunya jalur/.test(fm(".opencode/rules/subagent.md")));
  ok("/subagent off: preset repo default enabled:true (fresh install = ON)",
    JSON.parse(fm(".opencode/lumitome-subagent.json")).enabled === true);
  ok("/subagent off: README + docs/SUBAGENT.md mendokumentasikan /subagent off|on + default on",
    /\/subagent off/.test(fm("README.md")) && /\/subagent on/.test(fm("README.md")) && /Default is on/i.test(fm("README.md")) && /Default is on/i.test(fm("docs/SUBAGENT.md")));
  ok("/subagent off: orchestrator.md memuat pointer rules + baris mode, tapi kata 'enabled' tidak ada di sana (saklar hidup di preset, bukan file ini)",
    /rules\/subagent\.md/.test(fm(".opencode/agents/orchestrator.md")) && /Mode \/subagent saat ini/.test(fm(".opencode/agents/orchestrator.md"))
    && !/enabled/.test(fm(".opencode/agents/orchestrator.md")));
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
    /EXAMPLE_PRESET/.test(rpc) && /models: \[DEFAULT_MODEL\]/.test(rpc) && !/output: \{ preset: \{\} \}/.test(rpc));
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent plugin: TUI Plugin.define id lumitome.subagent.tui + keymap.layer slash subagent",
    /Plugin\.define\(\{\s*id: "lumitome\.subagent\.tui"/.test(tui) && /keymap\.layer/.test(tui) && /slash: \{ name: "subagent"/.test(tui));
  ok("/subagent plugin: TUI mengirim pemberitahuan singkat ke sesi via session.prompt + router.current (bukan via model; prompt raksasa dihapus v0.3.67)",
    /session\.prompt/.test(tui) && /router\.current/.test(tui) && /sendSubagentNotice/.test(tui));
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
  ok("/subagent flow: buildPreset — gabung pilihan, tier tetap, model non-9router ditolak (pakai lama), keempat peran SELALU aktif",
    (() => { const base = { $comment: "c", enabled: true, mode: "serial", roles: { thinking: { active: false, model: PINNED, tier: "terkuat" }, search: { active: true, model: PINNED, tier: "cepat-murah" }, builder: { active: true, model: PINNED, tier: "menengah-kuat" }, reviewer: { active: true, model: PINNED, tier: "terkuat" } } };
      const next = F.buildPreset(base, { models: { thinking: "9router/x", search: PINNED, builder: "anthropic/z", reviewer: PINNED }, mode: "paralel" });
      return next.$comment === "c" && next.enabled === true && next.mode === "paralel" && F.ROLES.every((r) => next.roles[r].active === true)
        && next.roles.thinking.model === "9router/x" && next.roles.builder.model === PINNED && next.roles.reviewer.tier === "terkuat"; })());
  ok("/subagent flow: canSavePreset — menolak ON menimpa OFF (balapan dua TUI), selain itu lolos",
    F.canSavePreset({ enabled: false }, { enabled: true }).ok === false
    && /OFF/.test(F.canSavePreset({ enabled: false }, { enabled: true }).reason)
    && F.canSavePreset({ enabled: true }, { enabled: true }).ok === true
    && F.canSavePreset({ enabled: false }, { enabled: false }).ok === true
    && F.canSavePreset({}, { enabled: true }).ok === true);
  ok("/subagent flow: summarizePreset — satu baris, model sama disebut sekali",
    F.summarizePreset({ mode: "serial", roles: { thinking: { active: true, model: PINNED }, search: { active: true, model: PINNED }, builder: { active: true, model: PINNED }, reviewer: { active: true, model: PINNED } } }).includes(PINNED));
  ok("/subagent flow: tabel — moveFocus membungkus, applyTableModel menolak non-9router (toggleRole dihapus v0.3.65 — peran selalu aktif)",
    F.moveFocus(4, 1) === 0 && F.moveFocus(0, -1) === 4
    && F.toggleRole === undefined
    && F.applyTableModel({ models: { thinking: PINNED } }, "thinking", "anthropic/x").models.thinking === PINNED
    && F.applyTableModel({ models: { thinking: PINNED } }, "thinking", "9router/y").models.thinking === "9router/y");
  const PR = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const base = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  const note = PR.buildSubagentNotice(base, "kerjakan tiket 4G");
  const RULES63 = fm(".opencode/rules/subagent.md");
  ok("/subagent prompt: pemberitahuan singkat berisi tugas + mode + urutan + model Thinking (maks 2 baris)",
    note.split("\n").length <= 2 && /Tugas: kerjakan tiket 4G/.test(note) && /Mode subagent aktif: serial/.test(note)
    && /thinking → search → builder → reviewer/.test(note) && /Thinking: 9router\/ag\/gemini-3\.8-flash-high/.test(note));
  ok("/subagent prompt: aturan BLOCKED + format HASIL/BLOCKED/RISIKO + review dua sumbu + anti-spin tinggal di .opencode/rules/subagent.md (bukan di pesan)",
    /BLOCKED/.test(RULES63) && /HASIL\/BLOCKED\/RISIKO/.test(RULES63) && /dua sumbu/.test(RULES63) && /anti-spin/.test(RULES63)
    && !/BLOCKED/.test(note) && !/HASIL\/BLOCKED\/RISIKO/.test(note) && !/dua sumbu/.test(note));
  ok("/subagent prompt: tanpa tugas → pemberitahuan menunjuk file rules, tetap singkat",
    PR.buildSubagentNotice(base, "").split("\n").length <= 2 && /rules\/subagent\.md/.test(PR.buildSubagentNotice(base, "")));
  ok("/subagent prompt: buildDelegationPrompt raksasa sudah dihapus (tidak ada ekspor lama)",
    PR.buildDelegationPrompt === undefined);
  const PA = await import("../lumitome/config/plugins/subagent/paths.mjs");
  ok("/subagent paths: resolveRepoRoot dari file plugin → root repo (cwd tes)",
    PA.resolveRepoRoot(path.resolve(`${PLUG}/index.ts`)) === process.cwd());
  ok("/subagent paths: resolveRepoRoot menolak lokasi tanpa preset (fail-closed, pesan jelas)",
    (() => { try { PA.resolveRepoRoot(path.resolve("README.md")); return false; } catch (e) { return /lumitome-subagent\.json/.test(e.message); } })());
  ok("/subagent paths: presetPath menunjuk .opencode/lumitome-subagent.json di root",
    PA.presetPath("/r").endsWith(path.join(".opencode", "lumitome-subagent.json")));
  ok("/subagent plugin: README mendokumentasikan /subagent plugin + /subagent tabel + off/on",
    /\/subagent/.test(fm("README.md")) && /tabel/.test(fm("README.md")) && /plugin/.test(fm("README.md")) && /docs\/SUBAGENT\.md/.test(fm("README.md")));
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
    && F.RPC_RETRY_ATTEMPTS === 12 && F.RPC_RETRY_DELAY_MS === 400);
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
  ok("/subagent v0.3.64: retry — unavailable terus-menerus habis 12 percobaan lalu lempar dengan label method",
    await (async () => {
      let n = 0;
      try {
        await F.callRpcWithRetry("getLiveModels", () => { n++; throw new Error("RPC is unavailable: lumitome.subagent"); }, { sleep: () => Promise.resolve() });
        return false;
      } catch (e) {
        return n === 12 && /getLiveModels: RPC is unavailable/.test(e.message);
      }
    })());
}

// (v0.3.65) /subagent — model sesi ikut Thinking saat disimpan + peran selalu aktif.
// Laporan Fahmi (13:54 WIB): sesudah pilih model (Thinking = opus 5.5), status
// line TUI tetap "gemini-3.8-flash-high". Penyebab (dari kode): status line
// menampilkan model SESI (orchestrator, default terpin di opencode.jsonc),
// sedangkan popup hanya menulis model PERAN ke file agent (berlaku sesi
// berikutnya). Perbaikan: sesudah save, plugin memanggil session.switchModel
// (mekanisme resmi yang sama dipakai /models — POST /api/session/:id/model;
// terverifikasi ke client opencode v2.3.0 DAN v2.2.4) ke model Thinking.
// Bonus (ditemukan saat uji live alur save): pengiriman prompt delegasi v0.3.63
// memakai bentuk `parts` yang tidak ada di SessionPromptInput — gagal live
// "Missing key at [\"text\"]", jadi prompt tidak pernah terkirim. Bentuk resmi:
// session.prompt({ sessionID, text }) — sama di 2.3.0 dan 2.2.4.
// Bonus 2 (ditemukan saat uji live Stage B): close() tabel memanggil
// dialog.clear() SEBELUM onAction — clear() memicu on-close "cancel" sehingga
// Ctrl+S selalu berakhir "Dibatalkan" tanpa menyimpan. Urutan dibalik:
// onAction dulu, baru clear().
// Celah yang DITEMUKAN tapi TIDAK ditutup di slice ini (jujur, lihat CHANGELOG):
// sesi baru yang dibuat dari TUI berakhir dengan model default terpin
// (gemini), bukan Thinking — TUI menerapkan model pilihannya saat pesan
// pertama dikirim, menimpa pengalihan watcher (session.created). Watcher
// tetap berguna untuk sesi yang dibuat via API/headless (`lumitome run`);
// perbaikan penuh butuh mengubah model default wrapper (slice terpisah).
// Koreksi Fahmi (14:03 WIB): keempat peran SELALU aktif — toggle per peran
// dihapus (Spasi tidak lagi menonaktifkan peran; [✓] hanya penanda visual);
// saklar global /subagent on/off tetap ada.
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const PINNED = "9router/ag/gemini-3.8-flash-high";
  const OPUS = "9router/kr/claude-opus-5.5-test-agentic";
  const F = await import("../lumitome/config/plugins/subagent/flow.mjs");
  ok("/subagent v0.3.65: splitModelId — pisah di '/' pertama (id boleh mengandung '/')",
    JSON.stringify(F.splitModelId("9router/ag/gemini-3.8-flash-high")) === JSON.stringify({ providerID: "9router", id: "ag/gemini-3.8-flash-high" })
    && JSON.stringify(F.splitModelId(OPUS)) === JSON.stringify({ providerID: "9router", id: "kr/claude-opus-5.5-test-agentic" })
    && F.splitModelId("tanpa-slash") === null && F.splitModelId("") === null && F.splitModelId(null) === null && F.splitModelId("/kosong") === null);
  ok("/subagent v0.3.65: thinkingSessionModel — model Thinking bila aktif + 9router; null bila nonaktif/tidak valid",
    F.thinkingSessionModel({ roles: { thinking: { active: true, model: OPUS } } }) === OPUS
    && F.thinkingSessionModel({ roles: { thinking: { active: false, model: OPUS } } }) === null
    && F.thinkingSessionModel({ roles: { thinking: { active: true, model: "anthropic/x" } } }) === null
    && F.thinkingSessionModel({ roles: {} }) === null
    && F.thinkingSessionModel({}) === null);
  ok("/subagent v0.3.65: tableState — tanpa field active (peran selalu aktif, preset lama yang nonaktif pun ikut)",
    (() => { const s = F.tableState({ mode: "serial", roles: { thinking: { active: false, model: OPUS }, search: { active: false, model: PINNED }, builder: { active: false, model: PINNED }, reviewer: { active: false, model: PINNED } } }); return !("active" in s) && s.models.thinking === OPUS && s.mode === "serial"; })());
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent v0.3.65: save memanggil session.switchModel ke model Thinking (mekanisme /models)",
    /switchSessionToThinking/.test(tui) && /context\.client\.session\.switchModel\(\{ sessionID, model: \{ providerID: parts\.providerID, id: parts\.id \} \}\)/.test(tui)
    && /thinkingSessionModel\(/.test(tui) && /splitModelId\(/.test(tui));
  ok("/subagent v0.3.65: pemberitahuan singkat memakai bentuk resmi session.prompt({ sessionID, text }) — bukan parts (v0.3.63 salah bentuk, gagal live 'Missing key at [\"text\"]')",
    /session\.prompt\(\{ sessionID, text \}\)/.test(tui) && !/session\.prompt\(\{ sessionID, parts/.test(tui));
  const idx = fm(`${PLUG}/index.ts`);
  ok("/subagent v0.3.65: sesi baru otomatis ikut Thinking — server plugin langganan session.created + switchModel (terverifikasi ke API plugin 2.3.0 + 2.2.4)",
    /ctx\.event\.subscribe\(\{ types: \["session\.created"\] \}\)/.test(idx)
    && /switchSessionModel\(ctx, data\.sessionID, thinking\)/.test(idx)
    && /thinkingSessionModel\(preset\)/.test(idx) && /splitModelId\(target\)/.test(idx));
  ok("/subagent v0.3.76 (LEAK #1/A): sesi anak peran JUGA dialihkan ke preset.roles[agent].model — bukan dilewati (dulu: parentID return)",
    /childSessionModel\(preset, agent, initial\)/.test(idx)
    && /switchSessionModel\(ctx, data\.sessionID, target\)/.test(idx)
    && !/if \(!data\.sessionID \|\| data\.parentID\) return/.test(idx)
    && /child-switch/.test(idx) && /child-switch-failed/.test(idx));
  ok("/subagent v0.3.65: watcher sesi baru punya pengaman — lewati anak subagent (parentID) + agent bukan orchestrator + /subagent off + model awal bukan default terpin",
    /data\.parentID/.test(idx) && /data\.agent !== "orchestrator"/.test(idx)
    && /preset\.enabled === false/.test(idx) && /initial !== DEFAULT_MODEL/.test(idx));
  ok("/subagent v0.3.65: watcher fail-silent + dijaga kapabilitas engine (engine lama tanpa ctx.event/switchModel tidak mematikan plugin)",
    /typeof ctx\.event\?\.subscribe === "function"/.test(idx) && /typeof ctx\.session\?\.switchModel === "function"/.test(idx)
    && (idx.match(/catch \{/g) ?? []).length >= 3);
  ok("/subagent v0.3.65: note tanpa sesi jujur — sesi baru nanti otomatis pakai Thinking; tui + README menyebut hal yang sama (prompt raksasa sudah dihapus v0.3.67)",
    /sesi baru nanti otomatis pakai model Thinking/.test(tui)
    && /buildSubagentNotice/.test(fm(`${PLUG}/prompt.mjs`))
    && /New sessions created afterwards start with the Thinking model too/.test(fm("docs/SUBAGENT.md")));
  ok("/subagent v0.3.65: tabel close() — onAction DULU baru dialog.clear() (bug v0.3.63: clear() duluan memicu on-close 'cancel' sehingga Ctrl+S selalu Dibatalkan tanpa menyimpan)",
    (() => { const a = tui.search(/^\s*props\.onAction\(action\)$/m); const b = tui.search(/^\s*plugin\.ui\.dialog\.clear\(\)$/m); return a !== -1 && b !== -1 && a < b; })());
  ok("/subagent v0.3.65: on/off TIDAK mengubah model sesi (cabang off/on tanpa switchModel, toast tetap singkat)",
    (() => { const seg = tui.slice(tui.indexOf('if (command === "off"'), tui.indexOf('if (command === "status"')); return !/switchModel/.test(seg) && /"Subagent ON"/.test(seg) && /"Subagent OFF"/.test(seg); })());
  ok("/subagent v0.3.65: toast simpan menyebut model sesi kini Thinking + model peran sesi berikutnya",
    /Model sesi kini/.test(tui) && /Model peran berlaku mulai sesi TUI berikutnya/.test(tui));
  ok("/subagent v0.3.65: Stage A tanpa dialog peran aktif (langsung model per peran)",
    !/Peran aktif/.test(tui) && !/Atur per peran/.test(tui) && !/Tidak ada peran aktif/.test(tui));
  ok("/subagent v0.3.65: tabel tanpa Spasi — tidak ada bind space, baris peran selalu [✓], teks minimal",
    !/bind: "space"/.test(tui) && /"\[✓\]"/.test(tui) && !/Spasi aktif\/nonaktif/.test(tui)
    && /↑↓ pindah • Enter ganti • Ctrl\+S simpan • Esc batal/.test(tui) && /Model sesi ikut Thinking saat disimpan/.test(tui));
  const PR = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const note65 = PR.buildSubagentNotice(JSON.parse(fm(".opencode/lumitome-subagent.json")), "uji");
  ok("/subagent v0.3.65: pemberitahuan singkat menyebut model Thinking yang dipakai sesi (model PERAN berlaku sesi berikutnya — di toast + orchestrator.md)",
    /Thinking: 9router\//.test(note65) && /Model peran berlaku mulai sesi TUI berikutnya/.test(tui));
  ok("/subagent v0.3.65: docs/SUBAGENT.md — peran selalu aktif, model sesi ikut Thinking, tanpa Spasi toggle",
    /always all active/.test(fm("docs/SUBAGENT.md")) && /switches the current session's model to the Thinking role's model/.test(fm("docs/SUBAGENT.md"))
    && !/Space toggles a role/.test(fm("README.md")) && !/Space toggles a role/.test(fm("docs/SUBAGENT.md")));
}

// (v0.3.66) /subagent — dua perbaikan atas laporan live Fahmi (15 Nov):
// (A) Model default sesi TUI ikut Thinking. Akar bug v0.3.65: watcher
// switchModel (session.created) ketimpa TUI saat pesan pertama — TUI
// menerapkan model default config (terpin gemini) ke sesi baru. Perbaikan:
// wrapper (lumitome.mjs) membaca preset saat launch dan memakai model
// Thinking sebagai MODEL untuk buildFinalConfig (sesi TUI); `lumitome run`
// TIDAK diubah; LUMI_MODEL eksplisit tetap menang; model Thinking yang
// tidak ada di daftar 9router → diam, pakai default lama.
// (B) Langkah akhir sesudah simpan: "Masuk mode subagent sekarang?"
// [Ya, mulai] / [Simpan saja]. "Ya" langsung masuk mode subagent — sesi
// aktif dialihkan ke Thinking; bila belum ada sesi, sesi baru DIBUKA
// (client.session.create + model Thinking) lalu TUI diarahkan ke sana
// (router.navigate) dan prompt delegasi dikirim — tanpa ketik pesan dulu,
// tanpa restart manual. Esc/batal = "Simpan saja".
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const PINNED = "9router/ag/gemini-3.8-flash-high";
  const OPUS = "9router/kr/claude-opus-5.5-test-agentic";
  const W = fm("lumitome/bin/lumitome.mjs");
  ok("/subagent v0.3.66: wrapper — model default TUI ikut Thinking dari preset (bukan hardcode gemini)",
    /let TUI_MODEL = MODEL/.test(W) && /loadPreset\(\{ home: ISO_HOME, root: REPO \}\)/.test(W)
    && /resolveSessionDefault\(loaded\.preset, ASP\.loadLiveModels\(ISO_HOME\)\)/.test(W)
    && /MODEL: TUI_MODEL/.test(W));
  ok("/subagent v0.3.66: wrapper — preset Thinking HANYA untuk sesi TUI: `lumitome run` tetap MODEL lama; LUMI_MODEL menang",
    /if \(sub !== "run" && !env\.LUMI_MODEL\)/.test(W)
    && /args = \["run", "--standalone", \.\.\.\(mIdx\.length \? \[\] : \["-m", model \|\| MODEL\]\)/.test(W));
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent v0.3.66: sesudah simpan ada SATU pilihan akhir 'Masuk mode subagent sekarang?' — [Ya, mulai] / [Simpan saja]",
    /Masuk mode subagent sekarang\?/.test(tui) && /"Ya, mulai"/.test(tui) && /"Simpan saja"/.test(tui)
    && /current: "start"/.test(tui));
  ok("/subagent v0.3.66: 'Ya, mulai' tanpa sesi → buka sesi baru (session.create + model Thinking) lalu arahkan TUI (router.navigate) + kirim pemberitahuan singkat",
    /enterSubagentMode/.test(tui) && /context\.client\.session\.create\(\{ model: \{ providerID: parts\.providerID, id: parts\.id \}, agent: "orchestrator", \.\.\.sessionCreateLocation\(process\.cwd\(\)\) \}\)/.test(tui)
    && /context\.ui\.router\.navigate\(\{ type: "session", sessionID \}\)/.test(tui)
    && /sendSubagentNotice\(context, preset, task, sessionID\)/.test(tui));
  ok("/subagent v0.3.66: 'Ya, mulai' dengan sesi aktif → switchModel ke Thinking di tempat (tanpa restart); gagal create/switch → catatan jujur, preset tetap tersimpan",
    /if \(sessionID\) \{/.test(tui) && /context\.client\.session\.switchModel\(\{ sessionID, model: \{ providerID: parts\.providerID, id: parts\.id \} \}\)/.test(tui)
    && /Sesi baru gagal dibuat/.test(tui) && /Model sesi gagal dialihkan/.test(tui));
  ok("/subagent v0.3.66: 'Simpan saja' (atau Esc) = perilaku lama — toast 'Subagent disimpan' + switch + delegasi ke sesi aktif bila ada",
    /const switched = await switchSessionToThinking\(context, next\)/.test(tui)
    && /"Subagent disimpan"/.test(tui) && /choice === "start"/.test(tui));
  const PR66 = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  const note66 = PR66.buildSubagentNotice(JSON.parse(fm(".opencode/lumitome-subagent.json")), "uji");
  ok("/subagent v0.3.66: pemberitahuan singkat tetap jalan sesudah 'Ya, mulai' (mode + Thinking + tugas, tanpa prompt raksasa)",
    /Mode subagent aktif/.test(note66) && /Thinking: 9router\//.test(note66) && /Tugas: uji/.test(note66) && !/pilih 'Ya, mulai'/.test(note66));
}

// (v0.3.67) /subagent — hapus prompt delegasi raksasa (Fahmi 15 Nov 16:42 WIB:
// konfigurasi masuk lewat prompt/file .md terasa aneh — maunya native).
// Aturan lengkap pindah ke file agent (cara native OpenCode): orchestrator.md
// (urutan, BLOCKED, review, fast-path, depth-1) + file peran + baris mode
// "Mode /subagent saat ini" di orchestrator.md (ditulis apply-preset —
// baris itulah yang mengaktifkan/mematikan aturan peran). Ke sesi hanya
// pemberitahuan SINGKAT (maks 2 baris). Batasan jujur: sesi yang sudah
// berjalan sebelum upgrade tidak memuat aturan baru sampai restart TUI.
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const PINNED = "9router/ag/gemini-3.8-flash-high";
  const OPUS = "9router/kr/claude-opus-5.5-test-agentic";
  const ORCH = fm(".opencode/agents/orchestrator.md");
  const RULES67 = fm(".opencode/rules/subagent.md");
  const preset = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  const PR = await import("../lumitome/config/plugins/subagent/prompt.mjs");
  ok("/subagent v0.3.67: prompt raksasa DIHAPUS — tidak ada lagi buildDelegationPrompt / 'Protokol BLOCKED' di pesan",
    PR.buildDelegationPrompt === undefined && typeof PR.buildSubagentNotice === "function"
    && !/buildDelegationPrompt/.test(fm(`${PLUG}/tui.tsx`)) && !/sendDelegationPrompt/.test(fm(`${PLUG}/tui.tsx`)));
  ok("/subagent v0.3.67: pemberitahuan singkat — maks 2 baris, mode + urutan + Thinking + tugas; tanpa tugas menunjuk file rules",
    (() => { const a = PR.buildSubagentNotice(preset, "perbaiki bug login"); const b = PR.buildSubagentNotice(preset, "");
      return a.split("\n").length === 2 && b.split("\n").length === 2
        && /Mode subagent aktif: serial · thinking → search → builder → reviewer · Thinking: 9router\//.test(a)
        && /Tugas: perbaiki bug login/.test(a) && /rules\/subagent\.md/.test(b)
        && !/BLOCKED/.test(a) && !/BLOCKED/.test(b) && !/dua sumbu/.test(a); })());
  ok("/subagent v0.3.67: .opencode/rules/subagent.md memuat aturan statis lengkap — urutan, fast-path builder, format laporan, review dua sumbu, BLOCKED + triase, depth-1 + pagar diri pada baris mode",
    /thinking → \(search\) → builder → reviewer/.test(RULES67) && /langsung builder/.test(RULES67)
    && /HASIL\/BLOCKED\/RISIKO/.test(RULES67) && /dua sumbu/.test(RULES67)
    && /Protokol BLOCKED/.test(RULES67) && /triase berurutan/.test(RULES67) && /TIDAK BOLEH mendelegasikan lagi/.test(RULES67)
    && /HANYA bila `.opencode\/agents\/orchestrator\.md` menyebut/.test(RULES67));
  ok("/subagent v0.3.67: orchestrator.md hanya berisi gerbang mode + pointer ke rules + baris mode yang cocok dengan preset repo (serial, ON)",
    /Mode \/subagent saat ini: serial\./.test(ORCH) && /bila baris di bawah menyebut serial\/paralel, patuhi/.test(ORCH)
    && /rules\/subagent\.md/.test(ORCH) && !/Protokol BLOCKED/.test(ORCH) && !/enabled/.test(ORCH));
  ok("/subagent v0.3.67: validate cap orchestrator dikalibrasi 600 → 700 (terdokumentasi — gerbang mode menambah tanggung jawab)",
    /tok > 700/.test(fm("scripts/validate.mjs")) && /dinaikkan dari 600 di v0\.3\.67/.test(fm("scripts/validate.mjs")));
  ok("/subagent v0.3.67: TUI mengirim pemberitahuan singkat (bukan prompt delegasi) di kedua jalur simpan",
    /sendSubagentNotice\(context, preset, task, sessionID\)/.test(fm(`${PLUG}/tui.tsx`))
    && /sendSubagentNotice\(context, next, task\)/.test(fm(`${PLUG}/tui.tsx`))
    && /session\.prompt\(\{ sessionID, text \}\)/.test(fm(`${PLUG}/tui.tsx`)));
  ok("/subagent v0.3.67: server setEnabled ikut sinkronkan baris mode (OFF tidak boleh tinggalkan aturan peran aktif)",
    /syncOrchestratorMode\(\{ root, preset: next \}\)/.test(fm(`${PLUG}/index.ts`)));
  // Baris mode — applyPreset di temp dir (salin file peran + orchestrator).
  const ASP = await import("../scripts/apply-subagent-preset.mjs");
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0367-"));
  try {
    for (const r of ["thinking", "search", "builder", "reviewer"]) { fs.mkdirSync(path.join(tmp, ".opencode", "agents"), { recursive: true }); fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp, ".opencode", "agents", `${r}.md`)); }
    fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(tmp, ".opencode", "agents", "orchestrator.md"));
    const orchTmp = () => fm(path.join(tmp, ".opencode", "agents", "orchestrator.md"));
    const pPar = JSON.parse(JSON.stringify(preset)); pPar.mode = "paralel";
    // cli() membaca preset dari DISK (v0.3.71 A1: --preset eksplisit —
    // default cli = file user $LUMI_HOME), bukan dari objek — tulis preset
    // pPar dulu supaya --check/off/on menguji preset itu.
    const pp67 = path.join(tmp, ".opencode", "lumitome-subagent.json");
    fs.writeFileSync(pp67, JSON.stringify(pPar, null, 2) + "\n");
    const r1 = ASP.applyPreset({ root: tmp, preset: pPar, liveModels: null });
    ok("/subagent v0.3.67: applyPreset menulis baris mode paralel ke orchestrator.md (modeChanged) + model peran tetap jalan",
      r1.modeChanged === true && /Mode \/subagent saat ini: paralel\./.test(orchTmp()) && r1.errors.length === 0);
    const r2 = ASP.applyPreset({ root: tmp, preset: pPar, liveModels: null });
    ok("/subagent v0.3.67: applyPreset idempotent — baris mode sudah cocok → modeChanged false, tidak ada tulis ulang",
      r2.modeChanged === false && r2.changed.length === 0);
    const pOff = JSON.parse(JSON.stringify(pPar)); pOff.enabled = false;
    const r3 = ASP.applyPreset({ root: tmp, preset: pOff, liveModels: null });
    ok("/subagent v0.3.67: applyPreset saat OFF — model peran TIDAK ditulis, tapi baris mode jadi OFF (saklar baca tetap jalan)",
      r3.disabled === true && r3.modeChanged === true && /Mode \/subagent saat ini: OFF\./.test(orchTmp())
      && fm(path.join(tmp, ".opencode", "agents", "search.md")).includes(`model: ${PINNED}`));
    ok("/subagent v0.3.67: applyPreset --check mendeteksi baris mode basi (preset ON, baris OFF)",
      ASP.applyPreset({ root: tmp, preset: pPar, liveModels: null, check: true }).modeChanged === true);
    ok("/subagent v0.3.67: cli() --check exit 1 saat baris mode basi, exit 0 sesudah diterapkan",
      ASP.cli({ argv: ["--preset", pp67, "--check"], root: tmp, log: () => {}, err: () => {} }) === 1
      && ASP.cli({ argv: ["--preset", pp67], root: tmp, log: () => {}, err: () => {} }) === 0
      && ASP.cli({ argv: ["--preset", pp67, "--check"], root: tmp, log: () => {}, err: () => {} }) === 0);
    const logs = [];
    ok("/subagent v0.3.67: cli() off menulis enabled:false + baris mode OFF; cli() on mengembalikan keduanya",
      ASP.cli({ argv: ["--preset", pp67, "off"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && /Mode \/subagent saat ini: OFF\./.test(orchTmp())
      && ASP.cli({ argv: ["--preset", pp67, "on"], root: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && /Mode \/subagent saat ini: paralel\./.test(orchTmp()));
    ok("/subagent v0.3.67: orchestratorModeLine — ON serial/paralel, OFF → OFF (tanpa kata enabled)",
      ASP.orchestratorModeLine({ enabled: true, mode: "serial" }) === "Mode /subagent saat ini: serial."
      && ASP.orchestratorModeLine({ enabled: true, mode: "paralel" }) === "Mode /subagent saat ini: paralel."
      && ASP.orchestratorModeLine({ enabled: false, mode: "serial" }) === "Mode /subagent saat ini: OFF.");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // Fixture tanpa orchestrator.md (tes lama hanya menyalin file peran):
  // sync mode = peringatan, bukan error — apply model tetap jalan.
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0367b-"));
  try {
    for (const r of ["thinking", "search", "builder", "reviewer"]) { fs.mkdirSync(path.join(tmp2, ".opencode", "agents"), { recursive: true }); fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp2, ".opencode", "agents", `${r}.md`)); }
    const p2 = JSON.parse(JSON.stringify(preset)); p2.roles.search.model = "9router/ag/gemini-3.8-flash";
    const r = ASP.applyPreset({ root: tmp2, preset: p2, liveModels: null });
    ok("/subagent v0.3.67: tanpa orchestrator.md, applyPreset tetap menulis model (peringatan saja, bukan error)",
      r.errors.length === 0 && r.changed.length === 1 && r.modeChanged === false && r.warnings.length >= 1);
  } finally { fs.rmSync(tmp2, { recursive: true, force: true }); }
  ok("/subagent v0.3.67: docs/SUBAGENT.md mendokumentasikan pemberitahuan singkat + aturan di orchestrator.md (bukan prompt raksasa)",
    /short confirmation/.test(fm("docs/SUBAGENT.md")) && /orchestrator\.md/.test(fm("docs/SUBAGENT.md")));
}

// (v0.3.68) /subagent — notice hanya untuk sesi lama, sesi baru bersih.
// Keluhan Fahmi (17:20 WIB): notice 2 baris v0.3.67 ("Mode subagent aktif:
// ... Aturan lengkap di .opencode/rules/subagent.md — beri tugas untuk
// mulai.") masih terasa seperti prompt injection — terutama untuk sesi BARU
// (via "Ya, mulai") yang sebenarnya sudah memuat aturan dari file.
// Perbaikan: (a) mapping peran→model + urutan + mode ditulis ke FILE saat
// save — blok "Konfigurasi aktif" di .opencode/rules/subagent.md,
// disinkronkan apply-subagent-preset (ON/OFF) + dijaga validate
// fail-closed seperti baris mode; (b) notice HANYA dikirim bila sesi sudah
// berjalan SEBELUM save; (c) sesi BARU via "Ya, mulai" TIDAK menerima
// notice sama sekali; (d) tanpa sesi + "Simpan saja" tetap toast singkat
// (bukan pesan chat — bukan injection).
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const PINNED = "9router/ag/gemini-3.8-flash-high";
  const OPUS = "9router/kr/claude-opus-5.5-test-agentic";
  const ASP = await import("../scripts/apply-subagent-preset.mjs");
  const os = await import("node:os");
  const preset = JSON.parse(fm(".opencode/lumitome-subagent.json"));
  ok("/subagent v0.3.68: subagentConfigBlock — mode + urutan + keempat peran→model, satu blok berpenanda",
    (() => { const b = ASP.subagentConfigBlock({ enabled: true, mode: "paralel", roles: { thinking: { model: OPUS }, search: { model: PINNED }, builder: { model: PINNED }, reviewer: { model: PINNED } } });
      return b.startsWith("<!-- KONFIG-SUBAGENT -->") && b.endsWith("<!-- /KONFIG-SUBAGENT -->")
        && /- Mode: paralel\. Urutan: thinking → search → builder → reviewer\./.test(b)
        && new RegExp(`- Thinking: ${OPUS.replace(/\//g, "\\/")}`).test(b)
        && /- Search: 9router\/ag\/gemini-3\.8-flash-high/.test(b); })());
  ok("/subagent v0.3.68: subagentConfigBlock saat OFF — mode OFF tertulis di blok (file rules mengabaikan dirinya bila baris mode OFF)",
    /- Mode: OFF\./.test(ASP.subagentConfigBlock({ enabled: false, mode: "serial", roles: { thinking: { model: OPUS } } })));
  ok("/subagent v0.3.68: blok konfigurasi di repo cocok dengan preset repo (serial, keempat peran = model preset)",
    (() => { const r = fm(".opencode/rules/subagent.md");
      return /<!-- KONFIG-SUBAGENT -->/.test(r) && /- Mode: serial\. Urutan: thinking → search → builder → reviewer\./.test(r)
        && ["thinking", "search", "builder", "reviewer"].every((role) => r.includes(preset.roles[role].model)); })());
  // syncSubagentRulesConfig + applyPreset di temp dir (salin file peran +
  // orchestrator + rules + preset).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0368-"));
  try {
    fs.mkdirSync(path.join(tmp, ".opencode", "agents"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".opencode", "rules"), { recursive: true });
    for (const r of ["thinking", "search", "builder", "reviewer"]) fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp, ".opencode", "agents", `${r}.md`));
    fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(tmp, ".opencode", "agents", "orchestrator.md"));
    fs.copyFileSync(".opencode/rules/subagent.md", path.join(tmp, ".opencode", "rules", "subagent.md"));
    const rulesTmp = () => fm(path.join(tmp, ".opencode", "rules", "subagent.md"));
    fs.writeFileSync(path.join(tmp, ".opencode", "lumitome-subagent.json"), JSON.stringify(preset, null, 2) + "\n");
    const pOpus = JSON.parse(JSON.stringify(preset)); pOpus.roles.thinking.model = OPUS; pOpus.mode = "paralel";
    const r1 = ASP.applyPreset({ root: tmp, preset: pOpus, liveModels: null });
    ok("/subagent v0.3.68: applyPreset menulis blok konfigurasi (configChanged) — mode paralel + Thinking opus di rules/subagent.md",
      r1.configChanged === true && r1.errors.length === 0
      && /- Mode: paralel\. Urutan: thinking → search → builder → reviewer\./.test(rulesTmp())
      && rulesTmp().includes(`- Thinking: ${OPUS}`) && r1.modeChanged === true);
    const r2 = ASP.applyPreset({ root: tmp, preset: pOpus, liveModels: null });
    ok("/subagent v0.3.68: applyPreset idempotent — blok sudah cocok → configChanged false, tidak ada tulis ulang",
      r2.configChanged === false && r2.modeChanged === false && r2.changed.length === 0);
    const pStale = JSON.parse(JSON.stringify(pOpus)); pStale.roles.search.model = "9router/ag/gemini-3.8-flash";
    ok("/subagent v0.3.68: applyPreset --check mendeteksi blok konfigurasi basi (tanpa menulis)",
      ASP.applyPreset({ root: tmp, preset: pStale, liveModels: null, check: true }).configChanged === true
      && !rulesTmp().includes("- Search: 9router/ag/gemini-3.8-flash\n"));
    const pOff = JSON.parse(JSON.stringify(pOpus)); pOff.enabled = false;
    const r3 = ASP.applyPreset({ root: tmp, preset: pOff, liveModels: null });
    ok("/subagent v0.3.68: applyPreset saat OFF — blok konfigurasi jadi OFF + baris mode OFF (model peran tetap tidak ditulis)",
      r3.disabled === true && r3.configChanged === true && /- Mode: OFF\./.test(rulesTmp())
      && /Mode \/subagent saat ini: OFF\./.test(fm(path.join(tmp, ".opencode", "agents", "orchestrator.md"))));
    const pp68 = path.join(tmp, ".opencode", "lumitome-subagent.json");
    ok("/subagent v0.3.68: cli() --check exit 1 saat blok konfigurasi basi, exit 0 sesudah diterapkan",
      ASP.cli({ argv: ["--preset", pp68, "--check"], root: tmp, home: tmp, log: () => {}, err: () => {} }) === 1
      && ASP.cli({ argv: ["--preset", pp68], root: tmp, home: tmp, log: () => {}, err: () => {} }) === 0
      && ASP.cli({ argv: ["--preset", pp68, "--check"], root: tmp, home: tmp, log: () => {}, err: () => {} }) === 0);
    const logs = [];
    // cli() membaca preset dari DISK (v0.3.71 A1: --preset eksplisit) —
    // tulis pOpus dulu supaya off/on menguji preset itu (seperti tes v0.3.67).
    fs.writeFileSync(pp68, JSON.stringify(pOpus, null, 2) + "\n");
    ok("/subagent v0.3.68: cli() off menulis blok OFF; cli() on mengembalikan blok paralel + Thinking opus",
      ASP.cli({ argv: ["--preset", pp68, "off"], root: tmp, home: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && /- Mode: OFF\./.test(rulesTmp())
      && ASP.cli({ argv: ["--preset", pp68, "on"], root: tmp, home: tmp, log: (m) => logs.push(m), err: () => {} }) === 0
      && /- Mode: paralel\./.test(rulesTmp()) && rulesTmp().includes(`- Thinking: ${OPUS}`));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // Fixture tanpa rules/subagent.md: sync blok = peringatan, bukan error.
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0368b-"));
  try {
    fs.mkdirSync(path.join(tmp2, ".opencode", "agents"), { recursive: true });
    for (const r of ["thinking", "search", "builder", "reviewer"]) fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp2, ".opencode", "agents", `${r}.md`));
    fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(tmp2, ".opencode", "agents", "orchestrator.md"));
    const r = ASP.syncSubagentRulesConfig({ root: tmp2, preset });
    ok("/subagent v0.3.68: tanpa rules/subagent.md, sync blok konfigurasi hanya peringatan (bukan error, changed false)",
      r.errors.length === 0 && r.changed === false && r.warnings.length >= 1);
  } finally { fs.rmSync(tmp2, { recursive: true, force: true }); }
  // TUI: notice hanya untuk sesi yang sudah berjalan sebelum save.
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent v0.3.68: 'Ya, mulai' ke sesi BARU tanpa notice — enterSubagentMode hanya kirim notice bila sesi sudah ada sebelum save (preExisting)",
    (() => { const seg = tui.slice(tui.indexOf("async function enterSubagentMode"), tui.indexOf("async function saveAndDelegate"));
      return /const preExisting = sessionID !== undefined/.test(seg)
        && /if \(preExisting\) \{\s*await sendSubagentNotice\(context, preset, task, sessionID\)\s*\}/.test(seg); })());
  ok("/subagent v0.3.68: 'Simpan saja' di sesi berjalan TETAP kirim notice singkat (sesi lama butuh diberi tahu)",
    /sendSubagentNotice\(context, next, task\)/.test(tui));
  ok("/subagent v0.3.68: server setEnabled ikut sinkronkan blok konfigurasi (OFF tidak boleh tinggalkan blok aktif)",
    /syncSubagentRulesConfig\(\{ root, preset: next \}\)/.test(fm(`${PLUG}/index.ts`))
    && /syncSubagentRulesConfig/.test(fm("scripts/apply-subagent-preset.mjs")));
  ok("/subagent v0.3.68: prompt.mjs mendokumentasikan gating notice v0.3.68 (hanya sesi lama; sesi baru baca dari file)",
    /v0\.3\.68/.test(fm(`${PLUG}/prompt.mjs`)) && /Sesi BARU/.test(fm(`${PLUG}/prompt.mjs`)));
  // BUG VALIDATOR v0.3.68 (Fahmi 17:34 WIB): model `9router/kn/dots-3-note-preview:free`
  // ditawarkan dropdown live tapi ditolak validatePreset — `:` tidak lolos
  // MODEL_RE lama, sehingga preset apa pun yang membawanya TIDAK BISA disimpan
  // sama sekali (termasuk beralih kembali ke model lain lewat popup).
  const DOTS = "9router/kn/dots-3-note-preview:free";
  const dotsPreset = () => ({ enabled: true, mode: "serial", roles: Object.fromEntries(["thinking", "search", "builder", "reviewer"].map((r) => [r, { active: true, model: DOTS, tier: "terkuat" }])) });
  ok("/subagent v0.3.68: validator menerima ID dengan sufiks `:free` (keempat peran) — format + keanggotaan live",
    ASP.validatePreset(dotsPreset(), null).errors.length === 0
    && ASP.validatePreset(dotsPreset(), ["kn/dots-3-note-preview:free", "ag/gemini-3.8-flash-high"]).errors.length === 0);
  // Toast "Simpan saja" tanpa sesi (temuan uji live v0.3.68): sendSubagentNotice
  // tanpa sesi hanya menampilkan toast "Tidak ada sesi aktif" yang menimpa
  // toast "Subagent disimpan" sebelum sempat dirender — cabang simpan hanya
  // memanggilnya bila ada sesi; info tanpa-sesi sudah ada di switched.note.
  const tuiSave = fm(`${PLUG}/tui.tsx`);
  ok("/subagent v0.3.68: cabang 'Simpan saja' hanya mengirim notice bila ada sesi (toast 'Subagent disimpan' tidak tertimpa saat tanpa sesi)",
    /if \(currentSessionID\(context\)\) await sendSubagentNotice\(context, next, task\)/.test(tuiSave));
  ok("/subagent v0.3.68: validator tetap menolak provider lain / ID kosong / spasi (9router saja)",
    ASP.validatePreset({ enabled: true, mode: "serial", roles: { thinking: { active: true, model: "openai/gpt-5" } } }, null).errors.length >= 1
    && ASP.validatePreset({ enabled: true, mode: "serial", roles: { thinking: { active: true, model: "9router/" } } }, null).errors.length >= 1
    && ASP.validatePreset({ enabled: true, mode: "serial", roles: { thinking: { active: true, model: "9router/kn/dots 3" } } }, null).errors.length >= 1);
  const F68 = await import("../lumitome/config/plugins/subagent/flow.mjs");
  ok("/subagent v0.3.68: buildPreset mempertahankan model `:free` (bukan fallback ke terpin)",
    F68.buildPreset(preset, { models: { thinking: DOTS, search: DOTS, builder: DOTS, reviewer: DOTS }, mode: "serial" }).roles.thinking.model === DOTS);
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0368c-"));
  try {
    fs.mkdirSync(path.join(tmp3, ".opencode", "agents"), { recursive: true });
    fs.mkdirSync(path.join(tmp3, ".opencode", "rules"), { recursive: true });
    for (const r of ["thinking", "search", "builder", "reviewer"]) fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmp3, ".opencode", "agents", `${r}.md`));
    fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(tmp3, ".opencode", "agents", "orchestrator.md"));
    fs.copyFileSync(".opencode/rules/subagent.md", path.join(tmp3, ".opencode", "rules", "subagent.md"));
    const rDots = ASP.applyPreset({ root: tmp3, preset: dotsPreset(), liveModels: ["kn/dots-3-note-preview:free"] });
    ok("/subagent v0.3.68: applyPreset menulis model `:free` ke keempat file agent + blok konfigurasi (save berhasil ujung-ke-ujung)",
      rDots.errors.length === 0
      && ["thinking", "search", "builder", "reviewer"].every((role) => fm(path.join(tmp3, ".opencode", "agents", `${role}.md`)).includes(`model: ${DOTS}`))
      && fm(path.join(tmp3, ".opencode", "rules", "subagent.md")).includes(`- Thinking: ${DOTS}`));
  } finally { fs.rmSync(tmp3, { recursive: true, force: true }); }
}

// (v0.3.69) /subagent — perbaiki SEMUA temuan uji end-to-end v0.3.68.
// (1) BUG DIREKTORI: sesi "Ya, mulai" dibuat di cwd server (/home/hatch),
//     bukan folder proyek — DB sesi uji 0368b: 117/117 directory=/home/hatch.
//     Perbaikan: session.create dengan location: { directory: cwd TUI }
//     (API: field top-level directory/projectID diabaikan server —
//     terverifikasi live: location.directory = ws → sesi tercatat di ws).
// (2) INDIKATOR PERAN: baris TUI hanya "Running subagent…" generik —
//     toast "<Peran> jalan" dari event session.tool.called (input.agent +
//     input.description; event TIDAK membawa nama tool) + aturan deskripsi
//     delegasi harus diawali label peran di rules/subagent.md.
// (3) H2 TERBUKTI live: model tersimpan yang tidak ada di daftar live →
//     dialog diam-diam memilih models[0]; Enter menimpa preset (kr opus
//     → ag gemini — dan di mesin Fahmi kemungkinan kn/... lalu 402).
//     Perbaikan: model tersimpan tetap ditawarkan + ditandai, jadi current.
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const PLUG = "lumitome/config/plugins/subagent";
  const F69 = await import("../lumitome/config/plugins/subagent/flow.mjs");
  const ASP = await import("../scripts/apply-subagent-preset.mjs");
  const os = await import("node:os");
  const LIVE = ["9router/ag/gemini-3.8-flash", "9router/kr/claude-haiku-5.5", "9router/kr/claude-opus-5.5"];
  ok("/subagent v0.3.69: sessionCreateLocation — direktori proyek jadi location.directory; kosong/bukan string → {} (perilaku lama)",
    JSON.stringify(F69.sessionCreateLocation("/home/hatch/ws")) === JSON.stringify({ location: { directory: "/home/hatch/ws" } })
    && JSON.stringify(F69.sessionCreateLocation("")) === "{}"
    && JSON.stringify(F69.sessionCreateLocation(undefined)) === "{}"
    && JSON.stringify(F69.sessionCreateLocation(42)) === "{}");
  ok("/subagent v0.3.69: subagentStartInfo — panggilan subagent dikenali dari input.agent; awalan label '[Peran]' di deskripsi dibuang",
    (() => { const i = F69.subagentStartInfo({ agent: "thinking", description: "[Thinking] Rencanakan pencarian+filter" });
      return i && i.role === "thinking" && i.label === "Thinking" && i.description === "Rencanakan pencarian+filter"; })()
    && F69.subagentStartInfo({ agent: "search", description: "Cari pola filter" }).description === "Cari pola filter"
    && F69.subagentStartInfo({ agent: "builder" }).description === ""
    && F69.subagentStartInfo({ agent: "reviewer", description: "[Reviewer] Periksa hasil" }).label === "Review");
  ok("/subagent v0.3.69: subagentStartInfo — input tool lain (read/write) / agent bukan peran / null → null (tidak ada toast)",
    F69.subagentStartInfo({ path: "index.html" }) === null
    && F69.subagentStartInfo({ agent: "orchestrator", description: "x" }) === null
    && F69.subagentStartInfo(null) === null
    && F69.subagentStartInfo({ agent: "fable", description: "x" }) === null);
  ok("/subagent v0.3.69: modelOptionsForRole — tersimpan ada di live → opsi utuh, current = tersimpan, storedMissing false",
    (() => { const r = F69.modelOptionsForRole(LIVE, "9router/kr/claude-opus-5.5");
      return r.current === "9router/kr/claude-opus-5.5" && r.storedMissing === false && r.options.length === LIVE.length && r.options[0] === LIVE[0]; })());
  ok("/subagent v0.3.69: modelOptionsForRole — tersimpan TIDAK ada di live → tetap ditawarkan (paling akhir), current = tersimpan, storedMissing true (H2)",
    (() => { const r = F69.modelOptionsForRole(LIVE, "9router/kr/claude-opus-5.5-GONE");
      return r.current === "9router/kr/claude-opus-5.5-GONE" && r.storedMissing === true
        && r.options.length === LIVE.length + 1 && r.options[r.options.length - 1] === "9router/kr/claude-opus-5.5-GONE"; })());
  ok("/subagent v0.3.69: modelOptionsForRole — tersimpan tidak valid / kosong → current = models[0] (perilaku lama), tanpa storedMissing",
    F69.modelOptionsForRole(LIVE, "openai/gpt-5").current === LIVE[0]
    && F69.modelOptionsForRole(LIVE, "openai/gpt-5").storedMissing === false
    && F69.modelOptionsForRole(LIVE, undefined).current === LIVE[0]
    && F69.modelOptionsForRole(LIVE, "9router/kn/dots-3-note-preview:free").storedMissing === true);
  const tui = fm(`${PLUG}/tui.tsx`);
  ok("/subagent v0.3.69: 'Ya, mulai' membuat sesi dengan location.directory = cwd TUI (folder proyek)",
    /session\.create\(\{ model: \{ providerID: parts\.providerID, id: parts\.id \}, agent: "orchestrator", \.\.\.sessionCreateLocation\(process\.cwd\(\)\) \}\)/.test(tui));
  ok("/subagent v0.3.69: plugin punya SATU call-site session.create (tidak ada lagi pembuatan sesi tanpa location di plugin)",
    (tui.match(/session\.create\(/g) || []).length === 1
    && !/session\.create\(/.test(fm(`${PLUG}/index.ts`)));
  ok("/subagent v0.3.69: pengamat peran — watchSubagentStarts dipanggil di setup, langganan session.tool.called, toast '<Label> jalan' + deskripsi",
    /watchSubagentStarts\(context\)/.test(tui)
    && /function watchSubagentStarts\(context\)/.test(tui)
    && /context\.client\.event\.subscribe\(\{ types: \["session\.tool\.called"\] \}\)/.test(tui)
    && /toast\(context, `\$\{info\.label\} jalan`, info\.description/.test(tui)
    && /event\?\.data\?\.sessionID !== currentSessionID\(context\)/.test(tui));
  ok("/subagent v0.3.69: pengamat peran fail-silent — langganan dibungkus try/catch, toast tidak menggagalkan plugin bila event gagal",
    (() => { const seg = tui.slice(tui.indexOf("function watchSubagentStarts"), tui.indexOf("async function switchSessionToThinking"));
      return /void \(async \(\) => \{/.test(seg) && /try \{/.test(seg) && /catch \{\}/.test(seg) && /catch \{\}/.test(seg); })());
  ok("/subagent v0.3.69: dialog Stage A + Stage B memakai modelOptionsForRole (tersimpan dipertahankan) + deskripsi 'Tersimpan — tidak ada di daftar live'",
    /modelOptionsForRole\(models, byRole\[role\]\)/.test(tui)
    && /modelOptionsForRole\(models, state\.models\[action\.role\]\)/.test(tui)
    && /Tersimpan — tidak ada di daftar live/.test(tui));
  // Grandfathering server (v0.3.69 — tanpa ini dialog di atas percuma: save
  // tetap menolak model tersimpan yang tidak ada di live, terbukti live
  // toast "Gagal menyimpan preset" untuk model tersimpan).
  const GONE = "9router/kr/claude-opus-5.5-GONE";
  const storedGone = { enabled: true, mode: "serial", roles: { thinking: { active: true, model: GONE }, search: { active: true, model: "9router/kr/claude-haiku-5.5" } } };
  const keepGone = { enabled: true, mode: "serial", roles: { thinking: { active: true, model: GONE }, search: { active: true, model: "9router/kr/claude-haiku-5.5" } } };
  const newGone = { enabled: true, mode: "serial", roles: { thinking: { active: true, model: "9router/kr/claude-opus-5.5-GONE2" }, search: { active: true, model: "9router/kr/claude-haiku-5.5" } } };
  ok("/subagent v0.3.69: validatePreset meng-grandfather model TERSIMPAN yang tidak ada di live (peringatan 'dipertahankan', bukan error)",
    (() => { const r = ASP.validatePreset(keepGone, ["kr/claude-haiku-5.5"], storedGone);
      return r.errors.length === 0 && r.warnings.some((w) => /thinking/.test(w) && /dipertahankan/.test(w) && w.includes(GONE)); })());
  ok("/subagent v0.3.69: validatePreset tetap MENOLAK model BARU (bukan tersimpan) yang tidak ada di live",
    ASP.validatePreset(newGone, ["kr/claude-haiku-5.5"], storedGone).errors.some((e) => /thinking/.test(e) && /tidak ada di daftar 9router live/.test(e)));
  ok("/subagent v0.3.69: validatePreset tanpa stored = perilaku lama (model di luar live ditolak)",
    ASP.validatePreset(keepGone, ["kr/claude-haiku-5.5"]).errors.length >= 1);
  ok("/subagent v0.3.69: validatePreset tidak memperingatkan model tersimpan yang ADA di live",
    ASP.validatePreset(keepGone, ["kr/claude-opus-5.5-GONE", "kr/claude-haiku-5.5"], storedGone).warnings.length === 0);
  ok("/subagent v0.3.69: readAppliedModels membaca baris model: dari file agent (fixture sintetis, tidak tergantung working copy)",
    (() => { const tmpR = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0369r-"));
      try {
        fs.mkdirSync(path.join(tmpR, ".opencode", "agents"), { recursive: true });
        for (const r of ["thinking", "search", "builder", "reviewer"]) fs.writeFileSync(path.join(tmpR, ".opencode", "agents", `${r}.md`), `---\nname: ${r}\n---\nmodel: 9router/kr/${r}-model-x\n`);
        const m = ASP.readAppliedModels(tmpR);
        return m.thinking === "9router/kr/thinking-model-x" && m.search === "9router/kr/search-model-x"
          && m.builder === "9router/kr/builder-model-x" && m.reviewer === "9router/kr/reviewer-model-x";
      } finally { fs.rmSync(tmpR, { recursive: true, force: true }); } })());
  const tmpG = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-subagent-0369g-"));
  try {
    fs.mkdirSync(path.join(tmpG, ".opencode", "agents"), { recursive: true });
    fs.mkdirSync(path.join(tmpG, ".opencode", "rules"), { recursive: true });
    for (const r of ["thinking", "search", "builder", "reviewer"]) fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(tmpG, ".opencode", "agents", `${r}.md`));
    fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(tmpG, ".opencode", "agents", "orchestrator.md"));
    fs.copyFileSync(".opencode/rules/subagent.md", path.join(tmpG, ".opencode", "rules", "subagent.md"));
    // File agent thinking.md di tmp masih model repo (gemini terpin) — tulis
    // GONE ke sana supaya jalur CLI (stored = file agent) meng-grandfather.
    const thTmp = path.join(tmpG, ".opencode", "agents", "thinking.md");
    fs.writeFileSync(thTmp, fm(thTmp).replace(/^model:.*$/m, `model: ${GONE}`));
    const rG = ASP.applyPreset({ root: tmpG, preset: keepGone, liveModels: ["kr/claude-haiku-5.5"] });
    ok("/subagent v0.3.69: applyPreset jalur CLI meng-grandfather via file agent — preset dengan model tersimpan di luar live TERSIMPAN (peringatan, bukan error)",
      rG.errors.length === 0 && rG.warnings.some((w) => /dipertahankan/.test(w))
      && fm(thTmp).includes(`model: ${GONE}`));
    const rN = ASP.applyPreset({ root: tmpG, preset: newGone, liveModels: ["kr/claude-haiku-5.5"] });
    ok("/subagent v0.3.69: applyPreset jalur CLI tetap menolak model baru di luar live (bukan tersimpan di file agent)",
      rN.errors.length >= 1);
  } finally { fs.rmSync(tmpG, { recursive: true, force: true }); }
  ok("/subagent v0.3.69: server savePreset meneruskan preset tersimpan (stored) ke validatePreset + applyPreset (grandfathering ujung-ke-ujung)",
    /const stored = readPreset\(root, home\)/.test(fm(`${PLUG}/index.ts`))
    && /validatePreset\(preset, live, stored\)/.test(fm(`${PLUG}/index.ts`))
    && /applyPreset\(\{ root, preset, liveModels: live, stored \}\)/.test(fm(`${PLUG}/index.ts`)));
  ok("/subagent v0.3.69: rules/subagent.md — deskripsi delegasi WAJIB diawali label peran '[Peran]' (yang tampil di TUI saat berjalan/selesai)",
    /Deskripsi delegasi: tiap panggilan tool subagent WAJIB diawali label peran dalam kurung siku/.test(fm(".opencode/rules/subagent.md"))
    && /contoh "\[Thinking\] Rencanakan/.test(fm(".opencode/rules/subagent.md")));
}

// (v0.3.71) /subagent — preset pindah ke $LUMI_HOME (A1) + update
// mempertahankannya (A1b) + TUI_MODEL bersuara (A2) + satu DEFAULT_MODEL (A3)
// + sandbox/batas baca-tulis dihapus (scope B).
// Akar (fullcheck §2, terbukti): preset = state mesin ter-commit di git
// (seed semua gemini); `lumitome update` menukar SELURUH direktori repo
// dengan clone segar → tiap update reset preset ke seed; watcher tak bisa
// menolong (thinking === initial, sama-sama gemini).
{
  const fm = (p) => fs.readFileSync(p, "utf8");
  const os = await import("node:os");
  const SP = await import("../lumitome/lib/subagent-preset.mjs");
  const DM = await import("../lumitome/lib/default-model.mjs");
  const F = await import("../lumitome/config/plugins/subagent/flow.mjs");
  const ASP = await import("../scripts/apply-subagent-preset.mjs");
  const PINNED = DM.DEFAULT_MODEL;
  const seedPreset = () => JSON.parse(fm(".opencode/lumitome-subagent.json"));
  const customPreset = () => ({ enabled: true, mode: "serial", roles: {
    thinking: { active: true, model: "9router/kr/claude-opus-5.5", tier: "terkuat" },
    search: { active: true, model: "9router/ag/gemini-3.8-flash", tier: "cepat-murah" },
    builder: { active: true, model: "9router/kr/claude-sonnet-5.5", tier: "menengah-kuat" },
    reviewer: { active: true, model: "9router/kr/claude-opus-5.5", tier: "terkuat" },
  } });
  // --- A3: satu sumber DEFAULT_MODEL ---
  ok("v0.3.71 A3: DEFAULT_MODEL satu sumber (lib = flow = apply-script)",
    DM.DEFAULT_MODEL === F.DEFAULT_MODEL && ASP.DEFAULT_MODEL === DM.DEFAULT_MODEL
    && DM.DEFAULT_MODEL === "9router/ag/gemini-3.8-flash-high");
  ok("v0.3.71 A3: wrapper tidak lagi mendefinisikan literal default sendiri",
    !/const DEFAULT_MODEL = "9router\//.test(fm("lumitome/bin/lumitome.mjs"))
    && /from "\.\.\/lib\/default-model\.mjs"/.test(fm("lumitome/bin/lumitome.mjs"))
    && /default-model\.mjs/.test(fm("lumitome/config/plugins/subagent/flow.mjs")));
  ok("v0.3.71 A3: kedua opencode.jsonc membawa penanda sumber tunggal",
    /lumitome\/lib\/default-model\.mjs/.test(fm("lumitome/config/opencode.jsonc"))
    && /lumitome\/lib\/default-model\.mjs/.test(fm("opencode.jsonc")));
  // --- A1: migrasi + load + save user ---
  const home71 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-home-0371-"));
  const root71 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-root-0371-"));
  try {
    fs.mkdirSync(path.join(root71, ".opencode"), { recursive: true });
    fs.writeFileSync(path.join(root71, ".opencode", "lumitome-subagent.json"), JSON.stringify(customPreset(), null, 2) + "\n");
    ok("v0.3.71 A1: migratePreset menyalin seed → file user (sekali)",
      SP.migratePreset({ home: home71, root: root71 }).migrated === true
      && JSON.parse(fm(path.join(home71, "lumitome-subagent.json"))).roles.thinking.model === "9router/kr/claude-opus-5.5");
    ok("v0.3.71 A1: migratePreset kedua = no-op (file user TIDAK ditimpa)",
      SP.migratePreset({ home: home71, root: root71 }).migrated === false
      && JSON.parse(fm(path.join(home71, "lumitome-subagent.json"))).roles.thinking.model === "9router/kr/claude-opus-5.5");
    ok("v0.3.71 A1: loadPreset sumber = user sesudah migrasi",
      SP.loadPreset({ home: home71, root: root71 }).source === "user");
    ok("v0.3.71 A1: loadPreset fallback ke seed bila file user rusak",
      (() => { fs.writeFileSync(path.join(home71, "lumitome-subagent.json"), "{rusak"); const r = SP.loadPreset({ home: home71, root: root71 }); fs.writeFileSync(path.join(home71, "lumitome-subagent.json"), JSON.stringify(customPreset())); return r.source === "seed" && r.preset.roles.thinking.model === "9router/kr/claude-opus-5.5"; })());
    ok("v0.3.71 A1: loadPreset --preset eksplisit menang atas file user",
      SP.loadPreset({ home: home71, root: root71, explicitPath: path.join(root71, ".opencode", "lumitome-subagent.json") }).source === "explicit");
    ok("v0.3.71 A1: saveUserPreset atomik (tanpa file .tmp tersisa)",
      (() => { const p = customPreset(); p.mode = "paralel"; SP.saveUserPreset({ home: home71, preset: p }); return JSON.parse(fm(path.join(home71, "lumitome-subagent.json"))).mode === "paralel" && !fs.readdirSync(home71).some((f) => f.includes(".tmp-")); })());
    // --- A1b: preserve saat swap ---
    const oldRepo = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-oldrepo-0371-"));
    try {
      fs.mkdirSync(path.join(oldRepo, ".opencode"), { recursive: true });
      fs.writeFileSync(path.join(oldRepo, ".opencode", "lumitome-subagent.json"), JSON.stringify(customPreset(), null, 2) + "\n");
      const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-homeb-0371-"));
      try {
        ok("v0.3.71 A1b: preservePresetAcrossUpdate menyalin preset repo lama → file user",
          SP.preservePresetAcrossUpdate({ oldRepo, home: homeB }).preserved === true
          && JSON.parse(fm(path.join(homeB, "lumitome-subagent.json"))).roles.thinking.model === "9router/kr/claude-opus-5.5");
        ok("v0.3.71 A1b: preserve kedua = no-op (file user sudah ada)",
          SP.preservePresetAcrossUpdate({ oldRepo, home: homeB }).preserved === false);
        const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-empty-0371-"));
        const homeC = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-homec2-0371-"));
        ok("v0.3.71 A1b: repo lama tanpa preset → preserved false",
          SP.preservePresetAcrossUpdate({ oldRepo: emptyRepo, home: homeC }).preserved === false
          && !fs.existsSync(path.join(homeC, "lumitome-subagent.json")));
        fs.rmSync(emptyRepo, { recursive: true, force: true }); fs.rmSync(homeC, { recursive: true, force: true });
      } finally { fs.rmSync(homeB, { recursive: true, force: true }); }
    } finally { fs.rmSync(oldRepo, { recursive: true, force: true }); }
    // --- A2: resolveSessionDefault ---
    const LIVE = ["kr/claude-opus-5.5", "kr/claude-sonnet-5.5", "ag/gemini-3.8-flash", "ag/gemini-3.8-flash-high"];
    ok("v0.3.71 A2: Thinking ada di live → sesi pakai Thinking",
      ASP.resolveSessionDefault(customPreset(), LIVE).model === "9router/kr/claude-opus-5.5");
    ok("v0.3.71 A2: Thinking TIDAK ada di live → default terpin + alasan menyebut refresh",
      (() => { const d = ASP.resolveSessionDefault(customPreset(), ["ag/gemini-3.8-flash-high"]); return d.model === PINNED && /tidak ada di cache/.test(d.reason) && /refresh/.test(d.reason); })());
    ok("v0.3.71 A2: live tidak bisa dibaca → default terpin + alasan jujur",
      ASP.resolveSessionDefault(customPreset(), null).model === PINNED);
    ok("v0.3.71 A2: preset OFF / tanpa preset → default terpin",
      ASP.resolveSessionDefault({ ...customPreset(), enabled: false }, LIVE).model === PINNED
      && ASP.resolveSessionDefault(null, LIVE).model === PINNED);
    ok("v0.3.79 A2: preset OFF → default terpin + expected: true (fallback diharapkan, wrapper diam)",
      (() => { const d = ASP.resolveSessionDefault({ ...customPreset(), enabled: false }, LIVE); return d.model === PINNED && d.expected === true && /sistem \/subagent OFF/.test(d.reason); })());
    ok("v0.3.79 A2: preset ON + Thinking ada di cache live → model = Thinking (tanpa expected)",
      (() => { const d = ASP.resolveSessionDefault(customPreset(), LIVE); return d.model === "9router/kr/claude-opus-5.5" && !d.expected; })());
    ok("v0.3.79 A2: preset ON + Thinking TIDAK ada di cache → default terpin + expected falsy (fallback tak terduga, wrapper tetap bersuara)",
      (() => { const d = ASP.resolveSessionDefault(customPreset(), ["ag/gemini-3.8-flash-high"]); return d.model === PINNED && !d.expected; })());
    ok("v0.3.71 A2: wrapper memakai resolveSessionDefault (bukan logika duplikat) + bersuara saat fallback TAK TERDUGA ke default terpin, diam saat OFF expected (v0.3.76 LEAK #2/C: tanpa syarat LUMI_DEBUG; v0.3.79: OFF = diharapkan)",
      /resolveSessionDefault/.test(fm("lumitome/bin/lumitome.mjs"))
      && /loadPreset\(\{ home: ISO_HOME, root: REPO \}\)/.test(fm("lumitome/bin/lumitome.mjs"))
      && /if \(d\.model === DEFAULT_MODEL && d\.thinking && d\.thinking !== DEFAULT_MODEL && !d\.expected\)/.test(fm("lumitome/bin/lumitome.mjs"))
      && /if \(d2\.thinking && d2\.thinking !== DEFAULT_MODEL && !d2\.expected\)/.test(fm("lumitome/bin/lumitome.mjs"))
      && !/LUMI_DEBUG && d\.model === DEFAULT_MODEL/.test(fm("lumitome/bin/lumitome.mjs"))
      && /PERINGATAN — model default sesi TUI jatuh ke default terpin/.test(fm("lumitome/bin/lumitome.mjs"))
      && /PERINGATAN — run headless memakai model default terpin/.test(fm("lumitome/bin/lumitome.mjs")));
    // --- A1 di update.mjs (jalur kode) + plugin server ---
    ok("v0.3.71 A1b: update.mjs memanggil preserve di swap git + rollback + npm",
      /preservePresetAcrossUpdate\(\{ oldRepo: bak, home \}\)/.test(fm("lumitome/lib/update.mjs"))
      && /preservePresetAcrossUpdate\(\{ oldRepo: repo, home \}\)/.test(fm("lumitome/lib/update.mjs"))
      && /preservePresetObject\(oldPresetNpm, home\)/.test(fm("lumitome/lib/update.mjs")));
    ok("v0.3.71 A1: plugin server baca/tulis preset via accessor user (bukan seed repo)",
      /loadPreset\(\{ home/.test(fm("lumitome/config/plugins/subagent/index.ts"))
      && /saveUserPreset\(\{ home, preset \}\)/.test(fm("lumitome/config/plugins/subagent/index.ts"))
      && !/writeFileSync\(presetPath\(root\)/.test(fm("lumitome/config/plugins/subagent/index.ts")));
    // --- cli() dengan home param: status + on/off ke file user ---
    const rootCli = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-rootcli-0371-"));
    try {
      for (const r of ["thinking", "search", "builder", "reviewer"]) { fs.mkdirSync(path.join(rootCli, ".opencode", "agents"), { recursive: true }); fs.copyFileSync(`.opencode/agents/${r}.md`, path.join(rootCli, ".opencode", "agents", `${r}.md`)); }
      fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(rootCli, ".opencode", "agents", "orchestrator.md"));
      const homeCli = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-homecli-0371-"));
      try {
        fs.writeFileSync(path.join(homeCli, "lumitome-subagent.json"), JSON.stringify(customPreset(), null, 2) + "\n");
        fs.writeFileSync(path.join(homeCli, "providers.json"), JSON.stringify({ providers: { "9router": { models: LIVE } } }));
        const logs = [];
        ok("v0.3.71 A2: cli() status menyebut preset user + Thinking + default sesi",
          ASP.cli({ argv: ["status"], root: rootCli, home: homeCli, log: (m) => logs.push(m), err: () => {} }) === 0
          && /subagent: ON/.test(logs[logs.length - 1]) && /preset: user/.test(logs[logs.length - 1])
          && /Thinking: 9router\/kr\/claude-opus-5\.5 \(ada di cache live\)/.test(logs[logs.length - 1])
          && /model default sesi TUI: 9router\/kr\/claude-opus-5\.5/.test(logs[logs.length - 1]));
        ok("v0.3.71 A1: cli() off/on menulis ke file USER (seed repo tidak tersentuh)",
          ASP.cli({ argv: ["off"], root: rootCli, home: homeCli, log: () => {}, err: () => {} }) === 0
          && JSON.parse(fm(path.join(homeCli, "lumitome-subagent.json"))).enabled === false
          && ASP.cli({ argv: ["on"], root: rootCli, home: homeCli, log: () => {}, err: () => {} }) === 0
          && JSON.parse(fm(path.join(homeCli, "lumitome-subagent.json"))).enabled === true);
      } finally { fs.rmSync(homeCli, { recursive: true, force: true }); }
    } finally { fs.rmSync(rootCli, { recursive: true, force: true }); }
    // --- A4: sinkron file agent dari preset user SEBELUM engine start ---
    // (engine memuat definisi agent saat startup; popup save di tengah sesi
    // tidak dibaca ulang — terbukti live 0371: sesi anak tetap gemini-high
    // sesudah save menulis opus ke disk.)
    const rootA4 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-roota4-0371-"));
    try {
      for (const r of ["thinking", "search", "builder", "reviewer"]) {
        fs.mkdirSync(path.join(rootA4, ".opencode", "agents"), { recursive: true });
        fs.writeFileSync(path.join(rootA4, ".opencode", "agents", `${r}.md`),
          `---\ndescription: peran ${r}\nmodel: 9router/ag/gemini-3.8-flash-high\n---\n\nIsi peran ${r}.\n`);
      }
      fs.copyFileSync(".opencode/agents/orchestrator.md", path.join(rootA4, ".opencode", "agents", "orchestrator.md"));
      fs.mkdirSync(path.join(rootA4, ".opencode", "rules"), { recursive: true });
      fs.copyFileSync(".opencode/rules/subagent.md", path.join(rootA4, ".opencode", "rules", "subagent.md"));
      const r1 = ASP.applyPreset({ root: rootA4, preset: customPreset(), liveModels: null });
      ok("v0.3.71 A4: applyPreset menulis model preset ke file agent (seed gemini → opus/flash/sonnet/opus)",
        r1.errors.length === 0 && r1.changed.length === 4
        && ["thinking", "search", "builder", "reviewer"].every((r) =>
          new RegExp(`^model: ${customPreset().roles[r].model.replace(/\//g, "\\/")}$`, "m").test(fm(path.join(rootA4, ".opencode", "agents", `${r}.md`)))));
      const r2 = ASP.applyPreset({ root: rootA4, preset: customPreset(), liveModels: null });
      ok("v0.3.71 A4: applyPreset kedua = no-op (file agent sudah sesuai preset)",
        r2.errors.length === 0 && r2.changed.length === 0);
      ok("v0.3.71 A4: applyPreset menolak model non-9router (file agent tidak ditulis)",
        (() => { const bad = customPreset(); bad.roles.thinking.model = "anthropic/claude-opus-5-5"; const rb = ASP.applyPreset({ root: rootA4, preset: bad, liveModels: null }); return rb.errors.length > 0 && /^model: 9router\/kr\/claude-opus-5\.5$/m.test(fm(path.join(rootA4, ".opencode", "agents", "thinking.md"))); })());
    } finally { fs.rmSync(rootA4, { recursive: true, force: true }); }
    ok("v0.3.71 A4: wrapper menyinkronkan file agent dari preset user sebelum engine start (liveModels: null)",
      /ASP\.applyPreset\(\{ root: REPO, preset: loaded\.preset, liveModels: null \}\)/.test(fm("lumitome/bin/lumitome.mjs"))
      && /engine memuat definisi agent saat startup/.test(fm("lumitome/bin/lumitome.mjs")));
  } finally { fs.rmSync(home71, { recursive: true, force: true }); fs.rmSync(root71, { recursive: true, force: true }); }
  // --- scope B: sandbox mati default, batas baca/tulis hilang ---
  ok("v0.3.71 scope B: guard plugin hanya bwrap bila LUMI_SANDBOX=bwrap eksplisit",
    /const sandbox = env\.LUMI_SANDBOX === "bwrap" \? "bwrap" : "off"/.test(fm("lumitome/config/plugins/lumitome-guard.ts"))
    && !/TIER === "strict" \? "bwrap"/.test(fm("lumitome/config/plugins/lumitome-guard.ts")));
  ok("v0.3.71 scope B: wrapper tidak lagi memperingatkan sandbox-downgraded",
    !/sandbox-downgraded", runId/.test(fm("lumitome/bin/lumitome.mjs"))
    && !/LUMI_SANDBOX=off menurunkan tier strict/.test(fm("lumitome/bin/lumitome.mjs")));
}

// ---------- Wave 2 (T2.1): Pre-Stop Re-Drive Gate (experimental.idle + maxRedrives=2 + bypasses) ----------
{
  const { pathToFileURL } = await import("node:url");
  const EA = await import("../lumitome/config/plugins/lib/experimental-adapter.mjs");
  const IGC = await import("../lumitome/config/plugins/lib/idle-gate-core.mjs");
  const tmpBase = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tmpBase, { recursive: true });
  const w2Dir = fs.mkdtempSync(path.join(tmpBase, "w2-t21-"));
  try {
    // 1) Kompatibilitas 2.3.0: tanpa session.hook -> capability-missing logged, tidak throw
    const reg23 = await EA.registerExperimentalHook({}, "experimental.idle", () => {}, { home: w2Dir });
    const regRej = await EA.registerExperimentalHook(
      { session: { hook: async () => { throw new Error("unknown hook experimental.idle"); } } },
      "experimental.idle",
      () => {},
      { home: w2Dir },
    );
    const telRows = fs.readFileSync(EA.telemetryPath(w2Dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    ok("T2.1 experimental-adapter: graceful capability check 2.3.0 (tanpa crash, log capability-missing)",
      reg23.registered === false && regRej.registered === false && telRows.filter((r) => r.kind === "capability-missing").length === 2);

    // 2) Circuit breaker maxRedrives = 2: attempt 1-2 inject synthetic (idempoten), attempt 3 trip idle-circuit-open
    const injected = [];
    const warnings = [];
    const mockCtx = {
      session: {
        synthetic: async (p) => { injected.push(p); return { ok: true }; },
      },
    };
    const ctrl = new IGC.IdleGateController({
      maxRedrives: 2,
      env: {},
      lumiHome: w2Dir,
      onWarning: (m) => warnings.push(m),
    });
    ctrl.onUserInput("ses_1");
    const r1 = await ctrl.handleIdle({ sessionID: "ses_1", background: [], snapshot: { wrote: true, ran: 0 }, ctx: mockCtx });
    const r2 = await ctrl.handleIdle({ sessionID: "ses_1", background: [], snapshot: { wrote: true, ran: 0 }, ctx: mockCtx });
    const r3 = await ctrl.handleIdle({ sessionID: "ses_1", background: [], snapshot: { wrote: true, ran: 0 }, ctx: mockCtx });
    ok("T2.1 idle-gate: attempt 1-2 inject synthetic idempoten; attempt 3 trip idle-circuit-open & berhenti",
      r1.action === "redrive" && r1.attempt === 1 && r1.id.startsWith("msg_lumi_redrive_")
      && r2.action === "redrive" && r2.attempt === 2 && r2.id !== r1.id
      && injected.length === 2
      && r3.action === "circuit-open" && r3.reason === "idle-circuit-open"
      && warnings.some((w) => /idle-circuit-open/.test(w)));

    // 3) Bypass aman: Q&A non-mutasi, question/BLOCKED, compaction, subagent, interrupt, background own, verified PASS, LUMI_IDLE_REDRIVE=0
    const ctrl2 = new IGC.IdleGateController({ maxRedrives: 2, env: {}, lumiHome: w2Dir, onWarning: () => {} });
    let inj2 = 0;
    const ctx2 = { session: { synthetic: async () => { inj2++; } } };
    const bNoMut = await ctrl2.handleIdle({ sessionID: "s_qa", snapshot: { wrote: false, ran: 0 }, ctx: ctx2 });
    const bWait = await ctrl2.handleIdle({ sessionID: "s_wait", snapshot: { wrote: true, ran: 0, waitingForUser: true }, ctx: ctx2 });
    const bBlk = await ctrl2.handleIdle({ sessionID: "s_blk", snapshot: { wrote: true, ran: 0, blocked: true }, ctx: ctx2 });
    ctrl2.onCompactionStarted("s_cmp");
    const bCmp = await ctrl2.handleIdle({ sessionID: "s_cmp", snapshot: { wrote: true, ran: 0 }, ctx: ctx2 });
    ctrl2.markSubagentActive("s_sub", true);
    const bSub = await ctrl2.handleIdle({ sessionID: "s_sub", snapshot: { wrote: true, ran: 0 }, ctx: ctx2 });
    const bInt = await ctrl2.handleIdle({ sessionID: "s_int", snapshot: { wrote: true, ran: 0, interrupted: true }, ctx: ctx2 });
    const bBg = await ctrl2.handleIdle({ sessionID: "s_bg", background: [{ kind: "shell", sessionID: "s_bg", shellID: "sh1", command: "npm test" }], snapshot: { wrote: true, ran: 0 }, ctx: ctx2 });
    const bPass = await ctrl2.handleIdle({ sessionID: "s_ok", snapshot: { wrote: true, ran: 1, lastExit: 0, hasValidWitness: true, featuresAllPass: true }, ctx: ctx2 });
    const ctrlOff = new IGC.IdleGateController({ env: { LUMI_IDLE_REDRIVE: "0" }, lumiHome: w2Dir });
    const bOff = await ctrlOff.handleIdle({ sessionID: "s_off", snapshot: { wrote: true, ran: 0 }, ctx: ctx2 });
    ok("T2.1 idle-gate bypasses: Q&A non-mutasi, question/BLOCKED, compaction, subagent, interrupt, background own, PASS, LUMI_IDLE_REDRIVE=0 -> 0 redrive",
      inj2 === 0
      && bNoMut.action === "allow" && bNoMut.skipReason === "no-mutations"
      && bWait.action === "allow" && bWait.skipReason === "waiting-for-user"
      && bBlk.action === "allow" && bBlk.skipReason === "waiting-for-user"
      && bCmp.action === "allow" && bCmp.skipReason === "compaction-active"
      && bSub.action === "allow" && bSub.skipReason === "subagent-active"
      && bInt.action === "allow" && bInt.skipReason === "user-interrupted"
      && bBg.action === "allow" && bBg.skipReason === "background-own"
      && bPass.action === "allow" && bPass.skipReason === "verified-pass"
      && bOff.action === "bypass" && bOff.skipReason === "flag-off");

    // 4) Plugin lumitome-idle-gate.ts: setup aman di 2.3.0 & hook experimental.idle berjalan di 2.4.2
    const idlePlug = await import(pathToFileURL(path.resolve("lumitome/config/plugins/lumitome-idle-gate.ts")).href + `?t=${Date.now()}`);
    await idlePlug.default.setup({ location: { directory: w2Dir } }); // 2.3.0 tanpa session.hook -> tidak throw
    let idleCb = null;
    const plugSyn = [];
    await idlePlug.default.setup({
      location: { directory: w2Dir },
      tool: { hook: async () => {} },
      session: {
        hook: async (name, fn) => { if (name === "experimental.idle") idleCb = fn; },
        synthetic: async (p) => { plugSyn.push(p); },
      },
    });
    ok("T2.1 lumitome-idle-gate.ts: setup kompatibel 2.3.0 & mendaftarkan experimental.idle di 2.4.2",
      idlePlug.default.id === "lumitome-idle-gate" && typeof idleCb === "function");
  } finally {
    fs.rmSync(w2Dir, { recursive: true, force: true });
  }
}

// ---------- Wave 2 (T2.3): Runtime-Attested Witness, features.json Default-FAIL & Tether STALE/UNSETTLED ----------
{
  const W = await import("../harness/witness.mjs");
  const tmpBase = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tmpBase, { recursive: true });
  const ws23 = fs.mkdtempSync(path.join(tmpBase, "w2-t23-"));
  try {
    const srcFile = path.join(ws23, "app.mjs");
    fs.writeFileSync(srcFile, "export const v = 1;\n");
    const sDir = W.sessionDirFor(ws23, "ses_t23");

    // 1) features.json Default-FAIL (bahkan bila input mencoba passes: true)
    const doc = W.initFeatures(sDir, [{ id: "F-01", description: "app v=1", passes: true, status: "PASS" }], { overwrite: true });
    ok("T2.3 features.json: selalu inisialisasi default FAIL (passes:false), tidak pernah default PASS",
      doc.features.length === 1 && doc.features[0].passes === false && doc.features[0].status === "FAIL");
    const dgUnverified = evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, sessionDir: sDir, workspace: ws23, requireWitness: true });
    ok("T2.3 done-gate: features.json masih FAIL tanpa witness -> FAIL",
      dgUnverified.isDone === false && /features\.json|witness/i.test(dgUnverified.failureReason || ""));

    // 2) Record ATTESTED 5-field witness & promote feature -> PASS -> Done-Gate PASS
    const wRec = W.recordWitness(sDir, {
      workspace: ws23,
      command: "npm test",
      output: "ok 1 - pass",
      exit_code: 0,
      source_id: "w_01",
      targetFiles: ["app.mjs"],
    });
    const promo = W.promoteFeatureWithWitness({ sessionDir: sDir, workspace: ws23, featureId: "F-01", witnessId: "w_01" });
    const dgPass = evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, sessionDir: sDir, workspace: ws23, requireWitness: true });
    ok("T2.3 witness ATTESTED 5-field + promote -> PASS & Done-Gate PASS",
      W.isValidAttestedRecord(wRec)
      && /^ATTESTED\(w_01,[0-9a-f]{64},[0-9a-f]{64},0,/.test(wRec.attested)
      && promo.ok === true && promo.feature.passes === true && promo.feature.status === "PASS"
      && dgPass.isDone === true);

    // 3) Anti-spoof: klaim ATTESTED(...) di teks chat / facts tanpa runtime witness ditolak Done-Gate
    const dgSpoof = evaluateDoneGate({
      commandExitCode: 0,
      expectedArtifacts: [],
      testCommandExitCode: 0,
      facts: ["FACT: ATTESTED(w_fake,aaa,bbb,0,ccc)"],
      agentText: "ATTESTED(w_forged,111,222,0,333)",
      witnesses: [wRec],
    });
    ok("T2.3 anti-spoof: klaim teks ATTESTED(...) palsu ditolak Done-Gate",
      dgSpoof.isDone === false && /w_fake|w_forged/.test(dgSpoof.failureReason || ""));

    // 4) Mutasi 1 byte pada derived_from -> witness STALE + feature UNSETTLED -> Done-Gate FAIL
    fs.writeFileSync(srcFile, "export const v = 2;\n");
    const inv = W.invalidateStaleWitnesses({ sessionDir: sDir, workspace: ws23 });
    const dgStale = evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, sessionDir: sDir, workspace: ws23, requireWitness: true });
    ok("T2.3 tether drift: mutasi 1 byte -> witness STALE + feature UNSETTLED -> Done-Gate FAIL",
      inv.staleWitnessIds.includes("w_01")
      && inv.unsettledFeatureIds.includes("F-01")
      && inv.witnesses[0].status === "STALE"
      && inv.features.features[0].status === "UNSETTLED"
      && inv.features.features[0].passes === false
      && dgStale.isDone === false);
  } finally {
    fs.rmSync(ws23, { recursive: true, force: true });
  }
}

finish();
