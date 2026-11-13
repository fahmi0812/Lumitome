/** Konsultasi modern-web-guidance di Maker loopdesign/stitch-ui (v0.3.55, R1).
 *  TDD merah dulu: modul harness/mwg-consult.mjs belum ada; langkah MWG
 *  belum ada di SKILL.md loopdesign/stitch-ui; penanda mwg belum ada di
 *  recordLoopIteration; allow rule MWG belum ada di buildFinalConfig.
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import os from "node:os";
import cp from "node:child_process";
import { ok, finish } from "./harness.mjs";

// Stub "npx" — meniru CLI modern-web-guidance tanpa jaringan.
// argv: -y modern-web-guidance@latest <search|retrieve> [...]
// search -> JSON hasil; retrieve -> tulis file panduan + cetak pointer.
function makeStub(dir, mode) {
  const stub = path.join(dir, "fake-npx");
  const script = mode === "fail-search"
    ? `#!/usr/bin/env node\nconst fs = require("node:fs");\nconst os = require("node:os");\nconst a = process.argv.slice(2);\nif (a[2] === "search") { process.stderr.write("boom search\\n"); process.exit(1); }\nconst f = os.tmpdir() + "/mwg-stub-" + process.pid + ".md"; fs.writeFileSync(f, "# Guide\\n");\nprocess.stdout.write("Output (1.0 KB, 2 lines) saved to " + f + " to prevent CLI stdout truncation.\\n");\n`
    : mode === "sleep"
      ? `#!/usr/bin/env node\nAtomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);\n`
      : `#!/usr/bin/env node\nconst fs = require("node:fs");\nconst os = require("node:os");\nconst a = process.argv.slice(2);\nif (a[2] === "search") { process.stdout.write(JSON.stringify([{ id: "progress", description: "progress bar" }, { id: "spinner", description: "spinner" }])); }\nelse if (a[2] === "retrieve") { const f = os.tmpdir() + "/mwg-stub-" + process.pid + ".md"; fs.writeFileSync(f, "# Guide " + a[3] + "\\n".repeat(10)); process.stdout.write("Output (1.0 KB, 12 lines) saved to " + f + " to prevent CLI stdout truncation.\\nRead " + f + " in full using your file-reading tool (12 lines total)\\u2014do not use cat or head.\\n"); }\nelse { process.stderr.write("unknown\\n"); process.exit(1); }\n`;
  fs.writeFileSync(stub, script);
  fs.chmodSync(stub, 0o755);
  return stub;
}

{
  const MWG = await import("../harness/mwg-consult.mjs");

  // (1) Perintah persis — tidak pernah npx telanjang.
  ok("mwg: mwgArgv search = npx -y modern-web-guidance@latest search <query>",
    JSON.stringify(MWG.mwgArgv("search", ["progress determinate"])) ===
    JSON.stringify(["npx", "-y", "modern-web-guidance@latest", "search", "progress determinate"]));
  ok("mwg: mwgArgv retrieve = npx -y modern-web-guidance@latest retrieve <ids>",
    JSON.stringify(MWG.mwgArgv("retrieve", ["progress,spinner"])) ===
    JSON.stringify(["npx", "-y", "modern-web-guidance@latest", "retrieve", "progress,spinner"]));
  ok("mwg: argv selalu [npx, -y, modern-web-guidance@latest, ...] — tanpa -y / tanpa @latest ditolak bentuknya",
    MWG.mwgArgv("search", ["x"])[0] === "npx" && MWG.mwgArgv("search", ["x"])[1] === "-y" &&
    MWG.mwgArgv("search", ["x"])[2] === "modern-web-guidance@latest");

  // (2) Parse output CLI nyata.
  const sample = JSON.stringify([
    { id: "progress", description: "Build a styled progress bar" },
    { id: "spinner", description: "Build a loading spinner" },
  ]);
  ok("mwg: parseSearchJson baca id + description dari JSON search",
    JSON.stringify(MWG.parseSearchJson(sample).map((g) => g.id)) === '["progress","spinner"]');
  ok("mwg: parseSearchJson melempar bila output bukan JSON array",
    (() => { try { MWG.parseSearchJson("bukan json"); return false; } catch { return true; } })());
  const pointer = "Output (10.6 KB, 183 lines) saved to /tmp/mwg-guide-20458-1794559036351.md to prevent CLI stdout truncation.\nRead /tmp/mwg-guide-20458-1794559036351.md in full using your file-reading tool (183 lines total)—do not use cat or head.\n";
  ok("mwg: parseRetrievePointer ambil path file panduan dari baris pointer",
    MWG.parseRetrievePointer(pointer) === "/tmp/mwg-guide-20458-1794559036351.md");
  ok("mwg: parseRetrievePointer null bila tidak ada baris pointer",
    MWG.parseRetrievePointer("tidak ada apa-apa") === null);

  // (3) consult sukses via stub (search -> retrieve, file panduan ada).
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-mwg-"));
  const stub1 = makeStub(d1, "ok");
  const r1 = MWG.consult({ query: "progress determinate", bin: stub1 });
  ok("mwg: consult sukses via stub — ok, source cli, guides progress+spinner, file panduan ada",
    r1.ok === true && r1.consulted === true && r1.source === "cli" &&
    JSON.stringify(r1.guides.map((g) => g.id)) === '["progress","spinner"]' &&
    r1.guides.every((g) => fs.existsSync(g.file) && g.bytes > 0));

  // (4) consult dengan ids eksplisit melewati search (stub yang gagal di
  // search tetap sukses bila hanya retrieve yang dipanggil).
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-mwg-"));
  const stub2 = makeStub(d2, "fail-search");
  const r2 = MWG.consult({ ids: ["progress"], bin: stub2 });
  ok("mwg: consult ids eksplisit melewati search — stub gagal-search tetap ok",
    r2.ok === true && r2.source === "cli" && r2.guides[0].id === "progress");

  // (5) Fallback offline — CLI gagal = lanjut tanpa MWG, bukan error.
  const r3 = MWG.consult({ query: "progress determinate", bin: stub2 });
  ok("mwg: fallback — search exit 1 -> {ok:false, source:fallback}, tanpa throw",
    r3.ok === false && r3.consulted === false && r3.source === "fallback" && typeof r3.reason === "string");
  const r4 = MWG.consult({ query: "progress determinate", bin: path.join(d1, "tidak-ada-npx") });
  ok("mwg: fallback — bin tidak ada (ENOENT) -> {ok:false, source:fallback}",
    r4.ok === false && r4.source === "fallback");
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-mwg-"));
  const stub3 = makeStub(d3, "sleep");
  const r5 = MWG.consult({ query: "progress determinate", bin: stub3, timeoutMs: 200 });
  ok("mwg: fallback — timeout -> {ok:false, source:fallback}",
    r5.ok === false && r5.source === "fallback");
  const r6 = MWG.consult({ bin: stub1 });
  ok("mwg: fallback — tanpa query dan tanpa ids -> {ok:false, source:fallback}",
    r6.ok === false && r6.source === "fallback");
  fs.rmSync(d1, { recursive: true, force: true });
  fs.rmSync(d2, { recursive: true, force: true });
  fs.rmSync(d3, { recursive: true, force: true });

  // (6) CLI main non-interaktif: stdin tertutup, exit 0, JSON — sukses dan
  // fallback sama-sama bukan error (loop lanjut).
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-mwg-"));
  const stub4 = makeStub(d4, "ok");
  const c1 = cp.spawnSync(process.execPath, ["harness/mwg-consult.mjs", "consult", "progress determinate"],
    { env: { ...process.env, LUMI_MWG_BIN: stub4 }, input: "", encoding: "utf8", timeout: 30000 });
  ok("mwg: CLI main consult via stub — stdin tertutup, exit 0, JSON ok:true",
    c1.status === 0 && JSON.parse(c1.stdout).ok === true);
  const stub5 = makeStub(d4, "fail-search");
  const c2 = cp.spawnSync(process.execPath, ["harness/mwg-consult.mjs", "consult", "progress determinate"],
    { env: { ...process.env, LUMI_MWG_BIN: stub5 }, input: "", encoding: "utf8", timeout: 30000 });
  ok("mwg: CLI main consult fallback — stdin tertutup, exit 0, JSON ok:false (bukan error)",
    c2.status === 0 && JSON.parse(c2.stdout).ok === false && JSON.parse(c2.stdout).source === "fallback");
  const c3 = cp.spawnSync(process.execPath, ["harness/mwg-consult.mjs"],
    { env: { ...process.env }, input: "", encoding: "utf8", timeout: 30000 });
  ok("mwg: CLI main tanpa subcommand -> exit 2 (usage)",
    c3.status === 2);
  fs.rmSync(d4, { recursive: true, force: true });
}

// (7) Langkah konsultasi ada di workflow Maker — loopdesign.
{
  const ld = fs.readFileSync(".opencode/skills/loopdesign/SKILL.md", "utf8");
  const sAt = ld.search(/modern-web-guidance/i);
  const searchAt = ld.search(/mwg-consult\.mjs.*search|search.*mwg-consult/i);
  const retrieveAt = ld.search(/mwg-consult\.mjs.*retrieve|retrieve.*mwg-consult/i);
  const verifyAt = ld.search(/verifikasi.*panduan|verify.*panduan/i);
  const discloseAt = ld.search(/### Modern Web Guidance/i);
  ok("loopdesign MWG: menyebut modern-web-guidance + langkah search->retrieve->verify->disclose berurutan",
    sAt >= 0 && searchAt > sAt && retrieveAt > searchAt && verifyAt > retrieveAt && discloseAt > verifyAt);
  ok("loopdesign MWG: disclose di DESIGN.md (seksi ### Modern Web Guidance, ID + nama panduan)",
    /### Modern Web Guidance/.test(ld) && /DESIGN\.md/.test(ld) && /ID/.test(ld));
  ok("loopdesign MWG: fallback offline — gagal = lanjut tanpa MWG, bukan gagal loop",
    /fallback/i.test(ld) && /tanpa MWG|lanjut tanpa/i.test(ld));
  ok("loopdesign MWG: perintah persis npx -y modern-web-guidance@latest; npx telanjang dilarang",
    /npx -y modern-web-guidance@latest/.test(ld) && /telanjang|tanpa -y/i.test(ld));
  ok("loopdesign MWG: penanda pengukuran mwg di recordLoopIteration (consulted/guides/source)",
    /recordLoopIteration/.test(ld) && /mwg/.test(ld) && /consulted/.test(ld) && /source/.test(ld));
  ok("loopdesign MWG: larangan impor dinyatakan eksplisit — tidak ada file MWG yang diimpor, jangan salin SKILL.md/panduan MWG",
    /Tidak ada file MWG yang diimpor ke repo/.test(ld) && /jangan salin SKILL\.md\/panduan MWG/.test(ld));
}

// (8) Langkah konsultasi ada di stitch-ui (Langkah 3, sebelum index.html).
{
  const su = fs.readFileSync(".opencode/skills/stitch-ui/SKILL.md", "utf8");
  const step3 = su.indexOf("### Langkah 3");
  const step4 = su.indexOf("### Langkah 4");
  const seg = step3 >= 0 && step4 > step3 ? su.slice(step3, step4) : "";
  ok("stitch-ui MWG: Langkah 3 menyebut konsultasi MWG sebelum menulis index.html",
    /modern-web-guidance/i.test(seg) && /index\.html/.test(seg));
  ok("stitch-ui MWG: disclose di design.md (seksi ### Modern Web Guidance)",
    /### Modern Web Guidance/.test(su) && /design\.md/.test(su));
  ok("stitch-ui MWG: fallback offline + perintah persis npx -y modern-web-guidance@latest",
    /fallback/i.test(su) && /npx -y modern-web-guidance@latest/.test(su));
}

// (9) Tanpa vendoring: tidak ada skill MWG di repo.
{
  ok("mwg: tanpa vendoring — tidak ada folder .opencode/skills/modern-web-guidance",
    !fs.existsSync(".opencode/skills/modern-web-guidance"));
  const reg = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8"));
  ok("mwg: tanpa vendoring — registry tidak punya entri modern-web-guidance",
    !reg.skills.some((s) => s.id === "modern-web-guidance"));
}

finish();
