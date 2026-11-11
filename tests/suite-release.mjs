/** Skrip rilis + gate rilis (P2-3: pecahan tests/suite.mjs).
 *  Dipindah verbatim dari monolith, tanpa mengubah isi tes.
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import { ok, finish } from "./harness.mjs";

// ---------- v0.3.40: skrip rilis + gate rilis (P0-2) ----------
// TDD (mattpocock): tes ini ditulis SEBELUM scripts/release.mjs ada — harus MERAH dulu.
{
  const R = await import("../scripts/release.mjs");
  const osm = await import("node:os");
  ok("release: TODO placeholder terdeteksi di CHANGELOG (baris utuh saja, bukan sebutan di prosa)",
    R.hasTodoPlaceholder("## 0.3.40\n\n- TODO: isi catatan rilis\n") && !R.hasTodoPlaceholder("## 0.3.40\n\n- catatan rilis sudah diisi\n")
    && !R.hasTodoPlaceholder("placeholder `- TODO: isi catatan rilis` disebut di tengah kalimat prosa\n"));
  ok("release: parseStatus porcelain (M, ??, rename -> nama baru)",
    JSON.stringify(R.parseStatus(" M CHANGELOG.md\n?? scripts/release.mjs\nR  a.md -> b.md\n")) === JSON.stringify(["CHANGELOG.md", "scripts/release.mjs", "b.md"]));
  ok("release: dirtyOutside — hanya file rilis lolos, file lain ditolak",
    R.dirtyOutside(["VERSION", "CHANGELOG.md"], R.RELEASE_FILES).length === 0
    && R.dirtyOutside(["VERSION", "x.txt"], R.RELEASE_FILES).join() === "x.txt"
    && R.dirtyOutside(["VERSION", "x.txt"], [...R.RELEASE_FILES, "x.txt"]).length === 0);
  ok("release: countSkips menghitung [SKIP] + mengembalikan barisnya (hanya baris berawalan [SKIP], bukan nama tes yang menyebutnya)",
    (() => { const c = R.countSkips("[PASS] a\n[SKIP] chrome tidak ada\n[PASS] b\n[SKIP] engine\n[PASS] x menghitung [SKIP] y\n"); return c.count === 2 && c.lines.length === 2 && /chrome/.test(c.lines[0]); })());
  ok("release: parseReleaseArgs --allow-skipped tanpa alasan ditolak",
    (() => { try { R.parseReleaseArgs(["0.3.40", "--allow-skipped"]); return false; } catch (e) { return /alasan/.test(e.message); } })());
  ok("release: parseReleaseArgs ok + --include berulang",
    (() => { const a = R.parseReleaseArgs(["0.3.40", "--allow-skipped", "chrome tidak ada di VM", "--include", "a.mjs", "--include", "b.mjs"]); return a.version === "0.3.40" && a.allowSkipped === true && a.reason === "chrome tidak ada di VM" && a.includes.join() === "a.mjs,b.mjs"; })());
  // Orkestrasi gate dengan io palsu (tanpa validate/test sungguhan, tanpa git sungguhan).
  const mkFake = ({ changelog = "## 0.3.40\n\n- catatan rilis\n", version = "0.3.40", status = " M VERSION\n M CHANGELOG.md\n", validateStatus = 0, testStatus = 0, testOut = "[PASS] x\n" } = {}) => {
    const calls = [];
    const out = { buf: "", write(s) { out.buf += s; return true; } };
    const stage = fs.mkdtempSync(path.join(osm.tmpdir(), "lumirel-")); fs.writeFileSync(path.join(stage, "VERSION"), version + "\n");
    const run = async (cmd, args) => { calls.push([cmd, ...args]);
      if (cmd === "npm" && args[1] === "validate") return { status: validateStatus, stdout: "OK (warns 0)\n", stderr: "" };
      if (cmd === "npm" && args[0] === "test") return { status: testStatus, stdout: testOut, stderr: "" };
      if (args.includes("--version")) return { status: 0, stdout: `lumitome ${version} (?)\n`, stderr: "" };
      return { status: 0, stdout: "", stderr: "" }; };
    const gate = (argv) => R.releaseGate({ argv, cwd: "/tmp", out, readText: (p) => (p === "CHANGELOG.md" ? changelog : p === "VERSION" ? version + "\n" : ""), gitStatus: async () => status, run, makeStage: async () => ({ stageDir: stage, cleanup: () => fs.rmSync(stage, { recursive: true, force: true }) }) });
    return { calls, out, gate };
  };
  { const f = mkFake({ changelog: "## 0.3.40\n\n- TODO: isi catatan rilis\n" }); const rc = await f.gate(["0.3.40"]);
    ok("release gate: TODO di CHANGELOG → tolak, validate tidak jalan", rc === 1 && f.calls.length === 0 && /TODO/.test(f.out.buf)); }
  { const f = mkFake({ status: " M VERSION\n M x-tidak-terkait.txt\n" }); const rc = await f.gate(["0.3.40"]);
    ok("release gate: git status kotor di luar file rilis → tolak, validate tidak jalan", rc === 1 && f.calls.length === 0 && /x-tidak-terkait/.test(f.out.buf)); }
  { const f = mkFake({ validateStatus: 1 }); const rc = await f.gate(["0.3.40"]);
    ok("release gate: validate gagal → berhenti, npm test tidak jalan", rc === 1 && f.calls.some((c) => c[2] === "validate") && !f.calls.some((c) => c[0] === "npm" && c[1] === "test")); }
  { const f = mkFake({ testStatus: 1 }); const rc = await f.gate(["0.3.40"]);
    ok("release gate: npm test gagal → tolak", rc === 1 && /npm test/.test(f.out.buf)); }
  { const f = mkFake({ testOut: "[PASS] a\n[SKIP] chrome tidak ada\n[PASS] b\n" }); const rc = await f.gate(["0.3.40"]);
    ok("release gate: ada [SKIP] tanpa --allow-skipped → tolak + laporkan jumlah", rc === 1 && /1 tes ter-skip/.test(f.out.buf) && /chrome tidak ada/.test(f.out.buf)); }
  { const f = mkFake({ testOut: "[PASS] a\n[SKIP] chrome tidak ada\n[PASS] b\n" }); const rc = await f.gate(["0.3.40", "--allow-skipped", "Chrome tidak ada di VM ini"]);
    ok("release gate: [SKIP] + --allow-skipped + alasan → lolos dengan laporan", rc === 0 && /1 tes ter-skip/.test(f.out.buf) && /Chrome tidak ada di VM ini/.test(f.out.buf)); }
  { const f = mkFake({ version: "0.3.40" }); const rc = await f.gate(["0.3.41"]);
    ok("release gate: versi argumen != VERSION → tolak", rc === 1 && /0.3.41/.test(f.out.buf)); }
  { const f = mkFake({}); const rc = await f.gate(["0.3.40"]);
    ok("release gate: jalur hijau → 0, TIDAK PERNAH commit/tag/push, tampilkan langkah berikut + simulasi pasca-tag",
      rc === 0 && !f.calls.some((c) => c[0] === "git" && ["commit", "tag", "push"].includes(c[1]))
      && /git tag v0\.3\.40/.test(f.out.buf) && /SIMULASI PENUH BELUM JALAN/.test(f.out.buf) && /lumitome update --to v0\.3\.40/.test(f.out.buf)); }
  { const f = mkFake({}); const rc = await f.gate(["0.3.40", "--include", "scripts/release.mjs"]);
    ok("release gate: --include mengizinkan file slice + tercetak di laporan", rc === 0 && /scripts\/release\.mjs/.test(f.out.buf)); }
}

finish();
