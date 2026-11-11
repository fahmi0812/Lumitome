// Tes golden / reference-anchored judging (v0.3.32 §2) — standalone:
//   node tests/design-golden-032.mjs
// Gaya assertion ok() sama seperti tests/suite-design.mjs. Dijalankan dari root repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadGolden, goldenDivergence, normalizeHex } from "../harness/design-golden.mjs";
import { criticInput, evaluateDesign } from "../harness/design-gate.mjs";

// Dijalankan standalone (`node tests/design-golden-032.mjs`) maupun dari
// tests/suite-design.mjs (runGoldenTests(ok)) — satu sumber tes, dua runner.
export async function runGoldenTests(ok) {
let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else fail++; ok(n, c); };

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");

// Direktori golden sementara (di os.tmpdir, dibersihkan di akhir).
const tmpDirs = [];
const mkGolden = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-032-"));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const throwsMsg = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// ---------- loadGolden: fixture golden-sample ----------
const golden = loadGolden("tests/fixtures/golden-sample");
check("golden: loadGolden fixture — nama, screenshot, arah + token terbaca",
  golden.name === "golden-sample" &&
  golden.screenshot.endsWith(path.join("golden-sample", "screenshot.png")) &&
  fs.existsSync(golden.screenshot) &&
  golden.direction === "Hangat artisanal" &&
  JSON.stringify(golden.tokens) === JSON.stringify(["#2C1A14", "#A0591E", "#FFF8F0"]));
check("golden: loadGolden fixture — design (DESIGN.md) + brief (brief.json) ikut terbaca",
  golden.design?.direction === "Hangat artisanal" &&
  golden.brief?.direction === "Hangat artisanal" &&
  typeof golden.brief?.notes === "string" && golden.brief.notes.includes("BUKAN output loop"));

// ---------- loadGolden: fail-closed ----------
check("golden: loadGolden throw bila direktori tidak ada",
  throwsMsg(() => loadGolden("tests/fixtures/golden-tidak-ada"), /tidak ada/));
check("golden: loadGolden throw bila tidak ada screenshot (DESIGN.md saja)",
  throwsMsg(() => loadGolden(mkGolden({ "DESIGN.md": "Arah: Hangat artisanal\nToken:\n- #2C1A14\n" })), /screenshot/));
check("golden: loadGolden throw bila tidak ada DESIGN.md maupun brief (screenshot saja)",
  throwsMsg(() => loadGolden(mkGolden({ "screenshot.png": PNG_1X1 })), /DESIGN\.md maupun brief/));
check("golden: loadGolden throw bila tanpa arah/token (screenshot + brief.json kosong)",
  throwsMsg(() => loadGolden(mkGolden({ "screenshot.png": PNG_1X1, "brief.json": "{}" })), /tanpa arah maupun token/));
check("golden: loadGolden throw bila brief.json rusak",
  throwsMsg(() => loadGolden(mkGolden({ "screenshot.png": PNG_1X1, "brief.json": "{bukan json" })), /tidak bisa diparse/));

// ---------- loadGolden: variasi isi yang didukung ----------
check("golden: loadGolden utamakan screenshot.* daripada gambar lain",
  loadGolden(mkGolden({ "a.png": PNG_1X1, "screenshot.jpg": PNG_1X1, "brief.json": JSON.stringify({ direction: "Hangat artisanal" }) })).screenshot.endsWith("screenshot.jpg"));
check("golden: loadGolden baca brief.md (Arah + hex) bila tanpa DESIGN.md/brief.json",
  (() => { const g = loadGolden(mkGolden({ "shot.png": PNG_1X1, "brief.md": "Arah: Neon Tokyo\nToken: #0B0B14 dan #F2F2F7\n" }));
    return g.direction === "Neon Tokyo" && JSON.stringify(g.tokens) === JSON.stringify(["#0B0B14", "#F2F2F7"]) && g.design === null; })());
check("golden: normalizeHex — #abc jadi #AABBCC, #a0591e jadi #A0591E, bukan-hex null",
  normalizeHex("#abc") === "#AABBCC" && normalizeHex("#a0591e") === "#A0591E" && normalizeHex("merah") === null);

// ---------- goldenDivergence: deterministik, advisory ----------
const currentCocok = { direction: "Hangat artisanal", tokens: ["#2C1A14", "#A0591E", "#FFF8F0"] };
check("golden: goldenDivergence kosong bila arah + token cocok",
  goldenDivergence(currentCocok, golden).length === 0);
check("golden: goldenDivergence deteksi token di luar golden + token golden tak dipakai",
  (() => { const d = goldenDivergence({ direction: "Hangat artisanal", tokens: ["#2C1A14", "#000000", "#252538"] }, golden);
    return d.some((s) => s.includes("token di luar golden") && s.includes("#000000") && s.includes("#252538")) &&
      d.some((s) => s.includes("token golden tidak dipakai") && s.includes("#A0591E")); })());
check("golden: goldenDivergence deteksi arah berbeda (case-insensitive lolos)",
  goldenDivergence({ direction: "Neon Tokyo", tokens: ["#2C1A14", "#A0591E", "#FFF8F0"] }, golden).some((s) => s.includes("arah berbeda")) &&
  goldenDivergence({ direction: "hangat artisanal", tokens: ["#2C1A14", "#A0591E", "#FFF8F0"] }, golden).length === 0);
check("golden: goldenDivergence — token sama sekali tak overlap ditandai",
  goldenDivergence({ direction: "Hangat artisanal", tokens: ["#111111", "#222222"] }, golden).some((s) => s.includes("tidak ada token yang sama")));
check("golden: goldenDivergence deterministik — dua panggilan sama hasilnya",
  JSON.stringify(goldenDivergence(currentCocok, golden)) === JSON.stringify(goldenDivergence(currentCocok, golden)) &&
  JSON.stringify(goldenDivergence({ direction: "X", tokens: ["#000000"] }, golden)) === JSON.stringify(goldenDivergence({ direction: "X", tokens: ["#000000"] }, golden)));

// ---------- criticInput: field golden, code/klaim tetap dipotong ----------
check("golden: criticInput membawa golden (screenshot + token + brief), tetap membuang code/claims/prompt/source",
  (() => { const ci = criticInput({ screenshots: [{ width: 390, path: "a.jpg" }], gate: { pass: true, findings: [] },
      golden: { name: "golden-sample", screenshot: golden.screenshot, tokens: golden.tokens, direction: golden.direction },
      code: "x", claims: ["y"], prompt: "z", source: "w" });
    return ci.golden?.name === "golden-sample" && ci.golden.tokens.length === 3 && ci.golden.direction === "Hangat artisanal" &&
      !("code" in ci) && !("claims" in ci) && !("prompt" in ci) && !("source" in ci); })());
check("golden: criticInput tanpa golden → golden null (bukan undefined, bukan throw)",
  criticInput({ screenshots: [], gate: { pass: true, findings: [] } }).golden === null);

// ---------- NEVER-GATE: vonis evaluateDesign tidak berubah dengan/tanpa golden ----------
check("golden: evaluateDesign PASS tetap PASS dengan field golden (golden tidak dibaca gate)",
  evaluateDesign({}).pass === true &&
  evaluateDesign({ golden }).pass === true &&
  JSON.stringify(evaluateDesign({}).findings) === JSON.stringify(evaluateDesign({ golden }).findings));
check("golden: evaluateDesign FAIL tetap FAIL dengan field golden (kontras jelek)",
  evaluateDesign({ contrast: [{ fg: "#999", bg: "#fff", kind: "text" }] }).pass === false &&
  evaluateDesign({ contrast: [{ fg: "#999", bg: "#fff", kind: "text" }], golden }).pass === false &&
  evaluateDesign({ contrast: [{ fg: "#999", bg: "#fff", kind: "text" }] }).findings.length ===
    evaluateDesign({ contrast: [{ fg: "#999", bg: "#fff", kind: "text" }], golden }).findings.length);

for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
return { pass, fail };
}

// Runner standalone: `node tests/design-golden-032.mjs`.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { pass, fail } = await runGoldenTests((n, c) => { if (c) console.log("[PASS]", n); else console.error("[FAIL]", n); });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
