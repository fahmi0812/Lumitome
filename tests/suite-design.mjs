/** Design-gate + anti-slop + behavior + snapshot (P2-3: pecahan tests/suite.mjs).
 *  Dipindah verbatim dari monolith, tanpa mengubah isi tes.
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "fs";
import { ok, skip, finish } from "./harness.mjs";

// design-gate (v0.3.26)
{
  const DG = await import("../harness/design-gate.mjs");
  const DM = await import("../harness/design-measure.mjs");
  const PW = await import("../harness/design-pairwise.mjs");
  const BH = await import("../harness/design-behavior.mjs");
  const SN = await import("../harness/design-snapshot.mjs");
  const os = await import("node:os");
  ok("design-gate: kontras hitam/putih = 21", DG.contrastRatio("#000", "#fff") === 21);
  ok("design-gate: kontras #767676 di putih ≈ 4.54 (batas AA)", Math.abs(DG.contrastRatio("#767676", "#ffffff") - 4.54) < 0.01);
  ok("design-gate: parseColor #rgb/#rrggbb/rgb + tidak dikenal -> null",
    JSON.stringify(DG.parseColor("#1a1a1a")) === "[26,26,26]" &&
    JSON.stringify(DG.parseColor("#fff")) === "[255,255,255]" &&
    JSON.stringify(DG.parseColor("rgb(26, 26, 26)")) === "[26,26,26]" &&
    DG.parseColor("biru") === null && DG.parseColor("#12") === null);
  ok("design-gate: tap target 43 gagal / 44 lolos",
    DG.evaluateTapTargets([{ width: 100, height: 43, label: "x" }]).length === 1 &&
    DG.evaluateTapTargets([{ width: 44, height: 44, label: "x" }]).length === 0);
  // CATATAN: kode menoleransi overflow <= 2px (sw > cw + 2) — 1px di atas
  // clientWidth TIDAK gagal; yang diuji di sini batas sebenarnya (+2 lolos, +3 gagal).
  ok("design-gate: overflow +2 lolos (toleransi), +3 gagal",
    DG.evaluateOverflow([{ width: 390, scrollWidth: 392, clientWidth: 390 }]).length === 0 &&
    DG.evaluateOverflow([{ width: 390, scrollWidth: 393, clientWidth: 390 }]).length === 1);
  ok("design-gate: aset tidak termuat gagal, termuat lolos",
    DG.evaluateAssets({ images: [{ src: "x.png", loaded: false }] }).length === 1 &&
    DG.evaluateAssets({ images: [{ src: "x.png", loaded: true }], fonts: [{ name: "F", loaded: false }] }).length === 1 &&
    DG.evaluateAssets({ images: [{ src: "x.png", loaded: true }] }).length === 0);
  ok("design-gate: konsistensi mismatch gagal, sama lolos",
    DG.checkConsistency([{ label: "total", shown: 5, expected: 6 }]).length === 1 &&
    DG.checkConsistency([{ label: "total", shown: 6, expected: 6 }]).length === 0);
  ok("design-gate: lisensi kosong/tidak dikenal gagal (fail-closed), MIT lolos",
    DG.checkLicenses([{ src: "a.png", license: "" }]).length === 1 &&
    DG.checkLicenses([{ src: "a.png", license: "cc-by-nc-nd" }]).length === 1 &&
    DG.checkLicenses([{ src: "a.png", license: "MIT" }]).length === 0);
  ok("design-gate: teks panjang overflow tanpa truncate gagal; state tidak ter-render gagal",
    DG.evaluateTextCases({ longText: { overflow: true, clipped: true, truncated: false } }).length === 1 &&
    DG.evaluateTextCases({ longText: { overflow: true, clipped: true, truncated: true } }).length === 0 &&
    DG.evaluateTextCases({ emptyState: { rendered: false } }).length === 1);
  ok("design-gate: evaluateDesign kosong lolos, kontras jelek gagal, findings terurut",
    DG.evaluateDesign({}).pass === true &&
    DG.evaluateDesign({ contrast: [{ fg: "#999", bg: "#fff", kind: "text" }] }).pass === false &&
    DG.evaluateDesign({ contrast: [{ fg: "#999", bg: "#fff", kind: "text" }], tapTargets: [{ width: 10, height: 10 }] }).findings[0].check === "contrast");
  ok("design-gate: stressCases berisi 4 id (long-text, empty-state, loading-state, error-state)",
    JSON.stringify(DG.stressCases().map((s) => s.id)) === JSON.stringify(["long-text", "empty-state", "loading-state", "error-state"]));
  ok("design-gate: nextLoopAction done saat gate lolos", DG.nextLoopAction({ iteration: 1, gatePass: true }).action === "done");
  ok("design-gate: nextLoopAction stop saat N habis", DG.nextLoopAction({ iteration: 3, maxIterations: 3 }).reason === "n-habis");
  ok("design-gate: nextLoopAction stop saat tanpa perbaikan", DG.nextLoopAction({ iteration: 1, improved: false }).reason === "tanpa-perbaikan");
  ok("design-gate: nextLoopAction stop saat 3 gagal berturut-turut", DG.nextLoopAction({ iteration: 1, consecutiveFailures: 3 }).reason === "anti-spin");
  ok("design-gate: nextLoopAction fix bila masih ada iterasi + membaik", DG.nextLoopAction({ iteration: 1 }).action === "fix");
  ok("design-gate: criticInput membuang code/claims/prompt/source, hanya screenshot + gate",
    (() => { const ci = DG.criticInput({ screenshots: [{ width: 390, path: "a.jpg" }], gate: { pass: false, findings: [{ check: "contrast", severity: "fail", detail: "x" }] }, code: "x", claims: ["y"], prompt: "z", source: "w" });
      return !("code" in ci) && !("claims" in ci) && !("prompt" in ci) && !("source" in ci) && ci.pass === false && ci.findings.length === 1 && ci.screenshots.length === 1; })());
  // token-fidelity (v0.3.28 §3.1): aturan turunan — solid harus token, tint
  // hanya dari token, transparent lolos, deklarasi rusak gagal.
  ok("design-gate: rgbToHex [160,89,30] = #A0591E", DG.rgbToHex([160, 89, 30]) === "#A0591E");
  ok("design-gate: token-fidelity — solid token lolos, solid di luar token gagal",
    DG.checkTokenFidelity(["#3E2723", "#FFF8F0"], [{ rgb: [62, 39, 35], alpha: 1 }]).length === 0 &&
    DG.checkTokenFidelity(["#3E2723", "#FFF8F0"], [{ rgb: [44, 26, 20], alpha: 1, where: "header" }]).length === 1);
  ok("design-gate: token-fidelity — tint dari token lolos, tint bukan token gagal, transparent lolos",
    DG.checkTokenFidelity(["#FFF8F0"], [{ rgb: [255, 248, 240], alpha: 0.94 }]).length === 0 &&
    DG.checkTokenFidelity(["#FFF8F0"], [{ rgb: [44, 26, 20], alpha: 0.6 }]).length === 1 &&
    DG.checkTokenFidelity(["#FFF8F0"], [{ rgb: [0, 0, 0], alpha: 0 }]).length === 0);
  ok("design-gate: token-fidelity — token tidak bisa diparse gagal; tanpa token/warna tidak dicek",
    DG.checkTokenFidelity(["#ZZZ", "#3E2723"], [{ rgb: [62, 39, 35], alpha: 1 }]).length === 1 &&
    DG.checkTokenFidelity([], [{ rgb: [1, 2, 3], alpha: 1 }]).length === 0 &&
    DG.checkTokenFidelity(["#3E2723"], []).length === 0);
  ok("design-gate: token-fidelity — evaluateDesign tanpa tokens lolos seperti dulu",
    DG.evaluateDesign({ contrast: [{ fg: "#000", bg: "#fff", kind: "text" }] }).pass === true);
  ok("design-gate: criticInput membawa brief/token, tetap membuang code/claims/prompt",
    (() => { const ci = DG.criticInput({ screenshots: [], gate: { pass: false, findings: [] }, brief: { direction: "Hangat", tokens: ["#3E2723"] }, code: "x", claims: ["y"], prompt: "z" });
      return ci.brief && ci.brief.direction === "Hangat" && JSON.stringify(ci.brief.tokens) === '["#3E2723"]' && !("code" in ci) && !("claims" in ci) && !("prompt" in ci); })());
  // direction (§1 v0.3.36): criticInput membawa arah (nama + Karakter +
  // Dunia + Momen + Signature) dari parseDesignFile; tanpa design → null.
  ok("design-gate: criticInput membawa direction dari parseDesignFile; tanpa design → null",
    (() => { const d = DM.parseDesignFile("tests/fixtures/design/DESIGN.md");
      const ci = DG.criticInput({ screenshots: [], gate: { pass: true, findings: [] }, design: d });
      return ci.direction && ci.direction.name === "Hangat artisanal" && ci.direction.character === "tenang, teliti, sedikit hangat" && ci.direction.world === "kertas dan tinta" && ci.direction.moments === "grafik utama + kartu perangkat" && ci.direction.signature === "cangkir SVG berasap"; })() &&
    DG.criticInput({ screenshots: [], gate: { pass: true, findings: [] } }).direction === null);
  // snapshot (§5 v0.3.36): parse argumen + target tak valid → error bersih.
  ok("design-snapshot: parseSnapshotArgs — posisi + --dark/--width= + default 1440x810; flag tak dikenal / lebar tak valid / argumen kurang → throw",
    (() => { const a = SN.parseSnapshotArgs(["https://example.com", "out.html"]);
      return a.target === "https://example.com" && a.out === "out.html" && a.width === 1440 && a.height === 810 && a.scheme === "no-preference"; })() &&
    (() => { const a = SN.parseSnapshotArgs(["f.html", "o.html", "--dark", "--width=800", "--height", "600"]);
      return a.width === 800 && a.height === 600 && a.scheme === "dark"; })() &&
    (() => { try { SN.parseSnapshotArgs(["a", "b", "--ngawur"]); return false; } catch (e) { return String(e.message).includes("flag tak dikenal"); } })() &&
    (() => { try { SN.parseSnapshotArgs(["a", "b", "--width", "0"]); return false; } catch (e) { return String(e.message).includes("--width"); } })() &&
    (() => { try { SN.parseSnapshotArgs(["hanya-satu"]); return false; } catch (e) { return String(e.message).includes("usage:"); } })());
  ok("design-snapshot: target tak valid → reject error bersih (tanpa Chrome, tanpa crash)",
    await SN.snapshot("bukan-url", "tests/fixtures/design/.tmp-snap.html").then(() => false, (e) => String(e?.message ?? e).includes("target tidak ditemukan")));
  // token-fidelity actionable (§2 v0.3.31): finding menyebut nama variabel
  // CSS + saran ganti (token terdekat / tint dari token).
  ok("design-gate: nearestToken — #000000 terdekat #0B0B14, #A0A0B8 terdekat #F2F2F7",
    DG.rgbToHex(DG.nearestToken([0, 0, 0], [[11, 11, 20], [242, 242, 247]])) === "#0B0B14" &&
    DG.rgbToHex(DG.nearestToken([160, 160, 184], [[11, 11, 20], [242, 242, 247]])) === "#F2F2F7");
  ok("design-gate: variableNamesFor — rgb cocok nama var-nya, rgb lain kosong",
    JSON.stringify(DG.variableNamesFor([0, 0, 0], [{ name: "--black", rgb: [0, 0, 0] }, { name: "--bg", rgb: [11, 11, 20] }])) === '["--black"]' &&
    DG.variableNamesFor([1, 2, 3], [{ name: "--black", rgb: [0, 0, 0] }]).length === 0);
  ok("design-gate: token-fidelity actionable — solid menyebut --black + saran token terdekat; tint menyebut --border + saran tint",
    (() => { const f = DG.checkTokenFidelity(["#0B0B14", "#F2F2F7"], [{ rgb: [0, 0, 0], alpha: 1, where: "button: X" }], { cssVars: [{ name: "--black", rgb: [0, 0, 0] }] });
      return f.length === 1 && f[0].detail.includes("(variabel --black)") && f[0].detail.includes("#000000") && f[0].detail.includes("ganti dengan token terdekat #0B0B14"); })() &&
    (() => { const f = DG.checkTokenFidelity(["#F2F2F7"], [{ rgb: [37, 37, 56], alpha: 0.5, where: "div: Y" }], { cssVars: [{ name: "--border", rgb: [37, 37, 56] }] });
      return f.length === 1 && f[0].detail.includes("(variabel --border)") && f[0].detail.includes("tint dari token #F2F2F7"); })() &&
    // tanpa cssVars, finding tetap ada + bersaran (nama var saja yang hilang)
    DG.checkTokenFidelity(["#0B0B14"], [{ rgb: [0, 0, 0], alpha: 1 }])[0].detail.includes("ganti dengan token terdekat #0B0B14"));
  // behavior gate (§1 v0.3.31): asersi gagal → finding behavior; probe gagal
  // → finding probe-gagal; lolos → tanpa finding.
  ok("design-gate: evaluateBehavior — fail asersi → behavior; error probe → probe-gagal; pass → kosong",
    (() => { const f = DG.evaluateBehavior([{ id: "cart-empty", label: "keranjang kosong saat dimuat", passed: false, detail: "teks '#cart-total-display' = '¥12.000', diharapkan '¥0'" }]);
      return f.length === 1 && f[0].check === "behavior" && f[0].severity === "fail" && f[0].detail.includes("keranjang kosong"); })() &&
    (() => { const f = DG.evaluateBehavior([{ id: "klik", label: "klik tambah", passed: false, error: "timeout 5000ms" }]);
      return f.length === 1 && f[0].check === "probe-gagal" && f[0].detail.startsWith("probe-gagal:"); })() &&
    DG.evaluateBehavior([{ id: "a", label: "x", passed: true }]).length === 0 &&
    DG.evaluateDesign({ behavior: [{ id: "a", label: "x", passed: false, detail: "d" }] }).pass === false);
  // criticInput + behavior (§3 v0.3.31): behavior ikut, code/klaim tetap dibuang.
  ok("design-gate: criticInput membawa behavior, tetap membuang code/claims/prompt",
    (() => { const ci = DG.criticInput({ screenshots: [], gate: { pass: false, findings: [] }, behavior: [{ id: "cart-empty", passed: false }], code: "x", claims: ["y"], prompt: "z" });
      return Array.isArray(ci.behavior) && ci.behavior.length === 1 && ci.behavior[0].id === "cart-empty" && !("code" in ci) && !("claims" in ci) && !("prompt" in ci); })());
  // golden (§2 v0.3.32): 19 tes di tests/design-golden-032.mjs — satu sumber
  // tes, dijalankan di suite (standalone: `node tests/design-golden-032.mjs`).
  await (await import("./design-golden-032.mjs")).runGoldenTests(ok);
  // cek aset dua lapis (§4 v0.3.31): verified ok → warn (pass tetap true);
  // dead / tanpa verifikasi → fail seperti dulu.
  ok("design-gate: evaluateAssets dua lapis — verified ok jadi warn (pass true); dead tetap fail",
    (() => { const f = DG.evaluateAssets({ images: [{ src: "u", loaded: false, verified: "ok", verifyNote: "200 + JPEG valid" }] });
      return f.length === 1 && f[0].severity === "warn" && DG.evaluateDesign({ assets: { images: [{ src: "u", loaded: false, verified: "ok" }] } }).pass === true; })() &&
    DG.evaluateAssets({ images: [{ src: "u", loaded: false, verified: "dead" }] }).some((f) => f.severity === "fail") &&
    DG.evaluateAssets({ images: [{ src: "u", loaded: false }] }).some((f) => f.severity === "fail"));
  // aturan berhenti saat mentok (§5 v0.3.31): 2 transisi tak berkurang → stuck.
  ok("design-gate: checkStuck — [21,21,21] mentok 'mentok di 21 findings'; [45,21,21]/[10,9,9]/[30,30,25] belum; <3 data belum",
    DG.checkStuck([21, 21, 21]).stuck === true && DG.checkStuck([21, 21, 21]).verdict === "mentok di 21 findings" &&
    DG.checkStuck([45, 21, 21]).stuck === false && DG.checkStuck([10, 9, 9]).stuck === false &&
    DG.checkStuck([30, 30, 25]).stuck === false && DG.checkStuck([21, 21]).stuck === false);
  ok("design-gate: nextLoopAction mentok → stop 'mentok' + verdict; gate lolos tetap menang atas mentok",
    DG.nextLoopAction({ iteration: 2, stuck: DG.checkStuck([21, 21, 21]) }).reason === "mentok" &&
    DG.nextLoopAction({ iteration: 2, stuck: DG.checkStuck([21, 21, 21]) }).verdict === "mentok di 21 findings" &&
    DG.nextLoopAction({ iteration: 2, gatePass: true, stuck: DG.checkStuck([21, 21, 21]) }).action === "done");
  // pairwise checklist (§6 v0.3.31): murni — kandidat dengan fail lebih
  // sedikit per kategori menang item; seri = 0 keduanya.
  ok("design-gate: scoreChecklist pairwise — 5x menang tap-target + text-cases + total atas basic; token-fidelity seri",
    (() => { const n = (check, k) => Array.from({ length: k }, () => ({ check, severity: "fail" }));
      const s = PW.scoreChecklist(
        [...n("tap-target", 19), ...n("text-cases", 4), ...n("token-fidelity", 13)],
        [...n("token-fidelity", 13)]);
      const byCat = Object.fromEntries(s.items.map((i) => [i.category, i.winner]));
      return s.winner === "b" && byCat["tap-target"] === "b" && byCat["text-cases"] === "b" && byCat["total"] === "b" && byCat["token-fidelity"] === "tie"; })());
  // parseDesignFile: netral-sebagai-tint + tokenVars (§2 v0.3.31).
  ok("design-gate: parseDesignFile baca Netral (tint token) + tokenVars --nama",
    (() => { const d = DM.parseDesignFile("tests/fixtures/design/DESIGN-neutral.md");
      return JSON.stringify(d.neutrals) === JSON.stringify([{ name: "--text-muted", base: "#2C1A14" }, { name: "--border", base: "#2C1A14" }]) &&
        d.tokenVars["--text-muted"] === undefined /* tint rgba, bukan hex — tidak masuk tokenVars */ &&
        DM.parseDesignFile("tests/fixtures/design/DESIGN.md").neutrals.length === 0; })());
  // parseBehaviorContract (§1 v0.3.31): blok fenced di DESIGN.md.
  ok("design-behavior: parseBehaviorContract baca blok behavior-contract dari DESIGN.md (1 initial + 1 action)",
    (() => { const c = BH.parseBehaviorContract("tests/fixtures/design/DESIGN-behavior.md");
      const checks = BH.normalizeContract(c);
      return checks.length === 2 && checks[0].id === "cart-empty" && checks[1].kind === "click-then-text" && BH.normalizeContract([]).length === 0; })());
  // parseBehaviorContract tetap throw bila blok hilang (v0.3.32 §1):
  // yang fallback ke kontrak default adalah PEMANGGIL, bukan parser.
  ok("design-behavior: parseBehaviorContract tetap throw bila blok behavior-contract hilang",
    (() => { try { BH.parseBehaviorContract("tests/fixtures/design/DESIGN.md"); return false; }
      catch (e) { return String(e?.message ?? e).includes("tidak memuat blok"); } })());
  // state loop (§5 v0.3.31): tulis 3 iterasi mentok → stuckVerdict mentok.
  ok("design-behavior: recordLoopIteration + stuckVerdict — [21,21,21] mentok di 21 findings",
    (() => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-loop-"));
      BH.recordLoopIteration(dir, { iteration: 1, findings: 21, pass: false });
      BH.recordLoopIteration(dir, { iteration: 2, findings: 21, pass: false });
      BH.recordLoopIteration(dir, { iteration: 3, findings: 21, pass: false });
      const counts = BH.readLoopCounts(dir);
      const v = BH.stuckVerdict(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      return JSON.stringify(counts) === "[21,21,21]" && v.stuck === true && v.verdict === "mentok di 21 findings"; })());
  // penanda MWG per iterasi (v0.3.55, R1): pengukuran dengan vs tanpa MWG.
  ok("design-behavior: recordLoopIteration + readLoopMwg — penanda mwg cli tercatat dan terbaca",
    (() => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-loop-"));
      BH.recordLoopIteration(dir, { iteration: 1, findings: 5, pass: false, mwg: { consulted: true, guides: ["progress"], source: "cli" } });
      BH.recordLoopIteration(dir, { iteration: 2, findings: 0, pass: true, mwg: { consulted: false, guides: [], source: "fallback" } });
      const m = BH.readLoopMwg(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      return m.length === 2 && m[0].consulted === true && JSON.stringify(m[0].guides) === '["progress"]' && m[0].source === "cli" &&
        m[1].consulted === false && m[1].source === "fallback"; })());
  ok("design-behavior: recordLoopIteration tanpa mwg — readLoopMwg consulted:false/source:none; readLoopCounts tidak berubah",
    (() => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-loop-"));
      BH.recordLoopIteration(dir, { iteration: 1, findings: 7, pass: false });
      const m = BH.readLoopMwg(dir);
      const counts = BH.readLoopCounts(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      return m.length === 1 && m[0].consulted === false && m[0].source === "none" && JSON.stringify(m[0].guides) === "[]" &&
        JSON.stringify(counts) === "[7]"; })());
  ok("design-gate: parseDesignFile baca arah + token + tipografi + signature + fonts",
    (() => { const d = DM.parseDesignFile("tests/fixtures/design/DESIGN.md");
      return d.direction === "Hangat artisanal" && JSON.stringify(d.tokens) === JSON.stringify(["#2C1A14", "#A0591E", "#FFF8F0", "#FFFFFF"]) && d.typography === "Fraunces (display), Inter (body)" && d.signature === "cangkir SVG berasap" && JSON.stringify(d.fonts) === '["fraunces","inter"]'; })());
  // direction (§1 v0.3.36, unslop): Karakter + Dunia + Momen dibaca dari
  // DESIGN.md (toleran: bila tidak ada → null, jangan fail).
  ok("design-gate: parseDesignFile baca Karakter + Dunia + Momen; tanpa ketiganya → null",
    (() => { const d = DM.parseDesignFile("tests/fixtures/design/DESIGN.md");
      return d.character === "tenang, teliti, sedikit hangat" && d.world === "kertas dan tinta" && d.moments === "grafik utama + kartu perangkat"; })() &&
    (() => { const d = DM.parseDesignFile("tests/fixtures/design/DESIGN-neutral.md");
      return d.character === null && d.world === null && d.moments === null; })());
  // anti-slop (v0.3.28 §3.2, dikoreksi v0.3.29): subset kurasi native dari
  // Impeccable (Apache-2.0, 62 aturan = 31 slop + 31 quality) dan ui-craft
  // (MIT, registry 43 aturan di scripts/detect/rules.mjs — terverifikasi;
  // klaim v0.3.28 bahwa "43 aturan tidak terverifikasi" salah, dikoreksi
  // di sini). Jendela hue purple-gradient ikut upstream ui-craft
  // (ungu 255–330°, cyan/biru 170–255°) DAN logikanya AND sejak v0.3.33
  // (dulu OR v0.3.29–v0.3.32). Tiap aturan: tes merah + hijau +
  // pengecualian brief eksplisit (allow).
  ok("design-gate: rgbToHsl — ungu #7C3AED hue ≈ 262, merah hue 0, abu-abu saturasi 0",
    Math.abs(DG.rgbToHsl([124, 58, 237]).h - 262) < 1 && DG.rgbToHsl([255, 0, 0]).h === 0 && DG.rgbToHsl([128, 128, 128]).s === 0);
  ok("design-gate: parseGradientStops baca rgb() + #hex",
    DG.parseGradientStops("linear-gradient(135deg, rgb(124, 58, 237) 0%, #4F46E5 100%)").length === 2 &&
    DG.parseGradientStops("none").length === 0);
  // AND (v0.3.33, ikut upstream ui-craft `purple-cyan-gradient`): fail
  // HANYA bila satu gradien mengandung stop ungu DAN stop cyan/biru.
  // Gradien ungu murni kini PASS (dulu FAIL di OR); gradien cyan murni
  // juga PASS (dulu FAIL di OR — berubah juga, sama seperti ungu murni);
  // gradien ungu+cyan tetap FAIL; gradien dari token lolos; karamel lolos.
  ok("design-gate: anti-slop purple-gradient AND — ungu+cyan gagal; ungu murni lolos; cyan murni lolos; token lolos; karamel lolos; tanpa gradien tidak dicek",
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(79, 70, 229) 100%)", where: "div: hero" }] }).some((f) => f.detail.startsWith("purple-gradient")) &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(168, 85, 247) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(90deg, rgb(34, 211, 238) 0%, rgb(6, 182, 212) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(79, 70, 229) 100%)" }], tokens: ["#7C3AED", "#4F46E5"] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(79, 70, 229) 100%)" }], tokens: ["#4F46E5"] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(90deg, rgb(198, 139, 78) 0%, rgb(62, 39, 35) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({}).length === 0);
  // Jendela hue upstream ui-craft (v0.3.29): ungu 255–330°, cyan/biru
  // 170–255° — DENGAN logika AND sejak v0.3.33. Stop tunggal dari satu
  // jendela saja TIDAK cukup: indigo 243° (jendela cyan), magenta 310°
  // (jendela ungu), biru 220°/230° (jendela cyan) masing-masing lolos bila
  // pasangannya putih/netral. Fail butuh PASANGAN dalam satu gradien:
  // ungu 262° + indigo 243°, magenta 305° + biru 230°, dan batas jendela
  // hue 255° (rgb(64,0,255), ungu) + cyan 187° ikut gagal. Catatan
  // v0.3.29 soal "indigo tidak ditandai mustahil tanpa AND" kini
  // terjawab: AND-lah yang dipakai, dan indigo tunggal memang lolos.
  ok("design-gate: anti-slop purple-gradient hue window upstream AND — stop tunggal lolos (indigo 243, magenta 310, biru 220/230); pasangan ungu+cyan gagal (262+243, 305+230, batas 255+187)",
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(79, 70, 229) 0%, rgb(255, 255, 255) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(255, 0, 212) 0%, rgb(255, 255, 255) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(0, 85, 255) 0%, rgb(255, 255, 255) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(255, 255, 255) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(0, 43, 255) 0%, rgb(255, 255, 255) 100%)" }] }).length === 0 &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(79, 70, 229) 100%)" }] }).some((f) => f.detail.startsWith("purple-gradient")) &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(255, 0, 234) 0%, rgb(0, 43, 255) 100%)" }] }).some((f) => f.detail.startsWith("purple-gradient")) &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(64, 0, 255) 0%, rgb(34, 211, 238) 100%)" }] }).some((f) => f.detail.startsWith("purple-gradient")) &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(79, 70, 229) 100%)" }, { value: "linear-gradient(90deg, rgb(198, 139, 78) 0%, rgb(62, 39, 35) 100%)" }] }).filter((f) => f.detail.startsWith("purple-gradient")).length === 1);
  ok("design-gate: anti-slop repeating-gradient — gradien berulang gagal, gradien biasa lolos",
    DG.checkAntiSlop({ backgrounds: [{ value: "repeating-linear-gradient(45deg, rgb(229, 231, 235) 0px, rgb(255, 255, 255) 10px)" }] }).some((f) => f.detail.startsWith("repeating-gradient")) &&
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(90deg, rgb(198, 139, 78) 0%, rgb(62, 39, 35) 100%)" }] }).length === 0);
  ok("design-gate: anti-slop gradient-text — teks bergradien gagal; allow mengecualikan",
    DG.checkAntiSlop({ gradientTexts: [{ where: "h1: Kopi Senja" }] }).some((f) => f.detail.startsWith("gradient-text")) &&
    DG.checkAntiSlop({ gradientTexts: [{ where: "h1: Kopi Senja" }], allow: ["gradient-text"] }).length === 0);
  ok("design-gate: anti-slop overused-font — Inter >50% teks gagal; dideklarasi di DESIGN.md lolos; ≤50% lolos",
    DG.checkAntiSlop({ texts: [{ font: "Inter, sans-serif" }, { font: "Inter, sans-serif" }, { font: "Georgia, serif" }] }).some((f) => f.detail.startsWith("overused-font")) &&
    DG.checkAntiSlop({ texts: [{ font: "Inter, sans-serif" }, { font: "Inter, sans-serif" }], declaredFonts: ["inter"] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ font: "Inter, sans-serif" }, { font: "Georgia, serif" }, { font: "Georgia, serif" }] }).length === 0);
  ok("design-gate: anti-slop allow — brief eksplisit mengecualikan purple-gradient + repeating-gradient",
    DG.checkAntiSlop({ backgrounds: [{ value: "linear-gradient(135deg, rgb(124, 58, 237) 0%, rgb(79, 70, 229) 100%)" }, { value: "repeating-linear-gradient(45deg, rgb(229, 231, 235) 0px, rgb(255, 255, 255) 10px)" }], allow: ["purple-gradient", "repeating-gradient"] }).length === 0);
  // skipped-heading (v0.3.29, Impeccable): lompatan level >1 gagal;
  // heading pertama boleh level berapa saja; allow mengecualikan.
  ok("design-gate: anti-slop skipped-heading — h1 lalu h3 gagal; h1-h2-h3 lolos; mulai h2 lolos; allow mengecualikan",
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: Judul" }, { level: 3, where: "h3: Sub" }] }).some((f) => f.detail.startsWith("skipped-heading")) &&
    DG.checkAntiSlop({ headings: [{ level: 1 }, { level: 2 }, { level: 3 }, { level: 2 }] }).length === 0 &&
    DG.checkAntiSlop({ headings: [{ level: 2 }, { level: 3 }] }).length === 0 &&
    DG.checkAntiSlop({ headings: [] }).length === 0 &&
    DG.checkAntiSlop({ headings: [{ level: 1 }, { level: 3 }], allow: ["skipped-heading"] }).length === 0);
  // bounce-easing (v0.3.29, Impeccable, ADVISORY): cubic-bezier dengan y
  // di luar [0,1] jadi warn — tidak pernah menggagalkan gate.
  ok("design-gate: anti-slop bounce-easing — bezier overshoot jadi warn (pass tetap true); ease/linear/bezier normal lolos; allow mengecualikan",
    (() => { const r = DG.checkAntiSlop({ easings: [{ value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)", where: "div: kartu" }] });
      return r.some((f) => f.detail.startsWith("bounce-easing") && f.severity === "warn"); })() &&
    DG.evaluateDesign({ easings: [{ value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)" }] }).pass === true &&
    DG.checkAntiSlop({ easings: [{ value: "ease" }, { value: "linear" }, { value: "cubic-bezier(0.2, 0, 0, 1)" }] }).length === 0 &&
    DG.checkAntiSlop({ easings: [{ value: "cubic-bezier(0.68, -0.55, 0.27, 1.55)" }], allow: ["bounce-easing"] }).length === 0);
  // aturan unslop signs.md (v0.3.36 §4): emoji-icon, copy-shout,
  // greeting-headline, hype-words, heavy-font (FAIL) + uppercase-tracked,
  // motion-slop (WARN advisory, tidak pernah menggagalkan gate).
  ok("design-gate: anti-slop emoji-icon — emoji di teks gagal; tanpa emoji lolos; allow mengecualikan",
    DG.checkAntiSlop({ texts: [{ where: "h1: Halo 👋" }] }).some((f) => f.detail.startsWith("emoji-icon") && f.severity === "fail") &&
    DG.checkAntiSlop({ texts: [{ where: "h1: Kopi Senja" }], headings: [{ level: 1, where: "h1: Kopi Senja" }] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ where: "button: Beli 🚀" }], allow: ["emoji-icon"] }).length === 0);
  // © ® ™ bukan emoji-icon: tanda tipografi legal, bukan ikon — footer
  // "© 2026 ..." tidak boleh kena fail (koreksi presisi v0.3.36).
  ok("design-gate: anti-slop emoji-icon — ©/®/™ di teks bukan emoji-icon; emoji asli tetap gagal",
    DG.checkAntiSlop({ texts: [{ where: "div: © 2026 Kopi Senja" }, { where: "div: Merek ® dan ™" }] }).filter((f) => f.detail.startsWith("emoji-icon")).length === 0 &&
    DG.checkAntiSlop({ texts: [{ where: "span: ℹ" }, { where: "span: ⚠" }] }).filter((f) => f.detail.startsWith("emoji-icon")).length === 2);
  ok("design-gate: anti-slop copy-shout — '!' di heading/button gagal; '!' di body lolos; allow mengecualikan",
    DG.checkAntiSlop({ texts: [{ where: "h1: Beli sekarang!" }] }).some((f) => f.detail.startsWith("copy-shout")) &&
    DG.checkAntiSlop({ texts: [{ where: "button: Beli!" }] }).some((f) => f.detail.startsWith("copy-shout")) &&
    DG.checkAntiSlop({ texts: [{ where: "p: Wah, menarik sekali!" }] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ where: "h1: Beli!" }], allow: ["copy-shout"] }).length === 0);
  ok("design-gate: anti-slop greeting-headline — sapaan gagal; judul biasa lolos; 'High quality' bukan 'hi'; allow mengecualikan",
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: Welcome back, Damir" }] }).some((f) => f.detail.startsWith("greeting-headline")) &&
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: Selamat datang di Kopi Senja" }] }).some((f) => f.detail.startsWith("greeting-headline")) &&
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: Halo, ini Kopi Senja" }] }).some((f) => f.detail.startsWith("greeting-headline")) &&
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: High quality coffee" }] }).length === 0 &&
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: Kopi Senja" }] }).length === 0 &&
    DG.checkAntiSlop({ headings: [{ level: 1, where: "h1: Welcome back" }], allow: ["greeting-headline"] }).length === 0);
  ok("design-gate: anti-slop hype-words — kata hype di heading gagal; 'magical'/'unlocked' lolos (word boundary); allow mengecualikan",
    ["Supercharge alur kerja", "Seamless dan cepat", "Unlock semua fitur", "Magic di setiap cangkir", "Revolutionize kopi", "Game-changing!", "AI-powered dashboard"].every((t) =>
      DG.checkAntiSlop({ headings: [{ level: 2, where: `h2: ${t}` }] }).some((f) => f.detail.startsWith("hype-words"))) &&
    DG.checkAntiSlop({ headings: [{ level: 2, where: "h2: Magical things" }, { level: 2, where: "h2: Unlocked achievements" }] }).length === 0 &&
    DG.checkAntiSlop({ headings: [{ level: 2, where: "h2: Supercharge" }], allow: ["hype-words"] }).length === 0);
  ok("design-gate: anti-slop heavy-font — weight >= 800 gagal; 700 lolos; allow mengecualikan",
    DG.checkAntiSlop({ texts: [{ weight: 800, where: "h1: Tebal" }] }).some((f) => f.detail.startsWith("heavy-font") && f.severity === "fail") &&
    DG.checkAntiSlop({ texts: [{ weight: 900, where: "h1: Tebal" }] }).some((f) => f.detail.startsWith("heavy-font")) &&
    DG.checkAntiSlop({ texts: [{ weight: 700, where: "h1: Tebal" }] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ weight: 800, where: "h1: Tebal" }], allow: ["heavy-font"] }).length === 0);
  ok("design-gate: anti-slop uppercase-tracked — uppercase + tracking lebar jadi warn (pass tetap true); tracking kecil/normal lolos; allow mengecualikan",
    (() => { const r = DG.checkAntiSlop({ texts: [{ transform: "uppercase", tracking: "2px", size: 12, where: "p: NAVIGATION" }] });
      return r.some((f) => f.detail.startsWith("uppercase-tracked") && f.severity === "warn"); })() &&
    DG.evaluateDesign({ texts: [{ transform: "uppercase", tracking: "2px", size: 12, where: "p: NAVIGATION" }] }).pass === true &&
    DG.checkAntiSlop({ texts: [{ transform: "uppercase", tracking: "0.2px", size: 12, where: "p: NAV" }] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ transform: "uppercase", tracking: "normal", size: 12, where: "p: NAV" }] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ transform: "none", tracking: "2px", size: 12, where: "p: Biasa" }] }).length === 0 &&
    DG.checkAntiSlop({ texts: [{ transform: "uppercase", tracking: "2px", size: 12, where: "p: NAVIGATION" }], allow: ["uppercase-tracked"] }).length === 0);
  ok("design-gate: anti-slop motion-slop — animate-pulse/ping + hover:scale jadi warn (pass tetap true); class lain lolos; transition-all TIDAK dicek (ditolak v0.3.29); allow mengecualikan",
    (() => { const r = DG.checkAntiSlop({ motionClasses: [{ classes: ["animate-pulse"], where: "div: kartu" }, { classes: ["hover:scale-105"], where: "div: kartu" }, { classes: ["animate-ping"], where: "span: dot" }] });
      return r.filter((f) => f.detail.startsWith("motion-slop") && f.severity === "warn").length === 3; })() &&
    DG.evaluateDesign({ motionClasses: [{ classes: ["animate-pulse"], where: "div: kartu" }] }).pass === true &&
    DG.checkAntiSlop({ motionClasses: [{ classes: ["rounded-lg", "shadow"], where: "div: kartu" }] }).length === 0 &&
    DG.checkAntiSlop({ motionClasses: [{ classes: ["animate-pulse"], where: "div: kartu" }], allow: ["motion-slop"] }).length === 0);
  // renderer-agnostik: input gate yang sama dari report inspect dan export Figcraft -> vonis sama
  const repBad = JSON.parse(fs.readFileSync("tests/fixtures/design/report.json", "utf8"));
  const repClean = JSON.parse(fs.readFileSync("tests/fixtures/design/report-clean.json", "utf8"));
  const gInspectBad = DG.evaluateDesign(DM.fromInspectReport(repBad));
  const gFigBad = DG.evaluateDesign(DM.fromFigcraftExport("tests/fixtures/design/figcraft-export"));
  const gInspectClean = DG.evaluateDesign(DM.fromInspectReport(repClean));
  const gFigClean = DG.evaluateDesign(DM.fromFigcraftExport("tests/fixtures/design/figcraft-export-clean"));
  ok("design-gate: vonis sama inspect vs figcraft (gagal, findings identik)",
    gInspectBad.pass === false && gFigBad.pass === false && JSON.stringify(gInspectBad.findings) === JSON.stringify(gFigBad.findings));
  ok("design-gate: vonis sama inspect vs figcraft (bersih, keduanya lolos)",
    gInspectClean.pass === true && gFigClean.pass === true && gInspectClean.findings.length === 0 && gFigClean.findings.length === 0);
  // RED-TEST integrasi di browser sungguhan (skip bila Chrome tidak ada — jangan fake pass)
  if (!DM.resolveChromePath()) {
    skip("design-gate red-test (Chrome tidak ditemukan, set CHROME_PATH)");
  } else {
    const slop = await DM.measureAndGate("tests/fixtures/design/slop.html");
    const slopChecks = new Set(slop.findings.map((f) => f.check));
    ok("design-gate red-test: slop FAIL dengan contrast + tap-target + overflow + assets",
      slop.pass === false && ["contrast", "tap-target", "overflow", "assets"].every((c) => slopChecks.has(c)));
    const fixed = await DM.measureAndGate("tests/fixtures/design/fixed.html");
    ok("design-gate red-test: fixed PASS tanpa findings", fixed.pass === true && fixed.findings.length === 0);
    // token-fidelity red-test (v0.3.28 §3.1): fixture bersih (hanya token
    // deklarasi + tint token + transparent) lolos; fixture slop gagal.
    const TOKENS = ["#2C1A14", "#A0591E", "#FFF8F0", "#FFFFFF"];
    const tokClean = await DM.measureAndGate("tests/fixtures/design/token-clean.html", { designFile: "tests/fixtures/design/DESIGN.md" });
    ok("design-gate red-test: token-clean PASS via DESIGN.md (hanya token + tint token + transparent)",
      tokClean.pass === true && tokClean.findings.length === 0);
    const tokSlop = await DM.measureAndGate("tests/fixtures/design/token-slop.html", { tokens: TOKENS });
    const tokChecks = new Set(tokSlop.findings.map((f) => f.check));
    ok("design-gate red-test: token-slop FAIL token-fidelity (warna solid di luar token)",
      tokSlop.pass === false && tokChecks.has("token-fidelity") && tokSlop.findings.filter((f) => f.check === "token-fidelity").length === 2);
    // anti-slop red-test (v0.3.28 §3.2): fixture gradien ungu + teks
    // bergradien + gradien berulang + Inter di mana-mana gagal 4 aturan.
    const antiSlop = await DM.measureAndGate("tests/fixtures/design/anti-slop.html");
    const antiDetails = antiSlop.findings.filter((f) => f.check === "anti-slop").map((f) => f.detail);
    ok("design-gate red-test: anti-slop FAIL 4 aturan (purple-gradient + repeating-gradient + gradient-text + overused-font)",
      antiSlop.pass === false &&
      antiDetails.some((d) => d.startsWith("purple-gradient")) &&
      antiDetails.some((d) => d.startsWith("repeating-gradient")) &&
      antiDetails.some((d) => d.startsWith("gradient-text")) &&
      antiDetails.some((d) => d.startsWith("overused-font")));
    // aturan baru v0.3.29 di browser sungguhan: fixture h1→h3 + easing
    // bounce — skipped-heading FAIL + bounce-easing WARN (pass false karena
    // fail-nya, bukan karena warn). Fixture ini bersih dari cek lain.
    const newRules = await DM.measureAndGate("tests/fixtures/design/bounce-easing.html");
    const newAnti = newRules.findings.filter((f) => f.check === "anti-slop");
    ok("design-gate red-test: bounce-easing.html — skipped-heading FAIL + bounce-easing WARN, tepat 2 findings",
      newRules.pass === false &&
      newRules.findings.length === 2 &&
      newAnti.some((f) => f.detail.startsWith("skipped-heading") && f.severity === "fail") &&
      newAnti.some((f) => f.detail.startsWith("bounce-easing") && f.severity === "warn"));
    // aturan unslop signs.md (§4 v0.3.36): fixture sengaja kotor di 5
    // aturan FAIL + 2 WARN — dan bersih dari cek lain (tepat 9 findings).
    const signs = await DM.measureAndGate("tests/fixtures/design/unslop-signs.html");
    const signsAnti = signs.findings.filter((f) => f.check === "anti-slop");
    ok("design-gate red-test: unslop-signs FAIL 5 aturan (emoji-icon + copy-shout x2 + greeting-headline + hype-words + heavy-font) + WARN uppercase-tracked + motion-slop x2, tepat 9 findings",
      signs.pass === false &&
      signs.findings.length === 9 &&
      signsAnti.filter((f) => f.detail.startsWith("emoji-icon")).length === 1 &&
      signsAnti.filter((f) => f.detail.startsWith("copy-shout")).length === 2 &&
      signsAnti.filter((f) => f.detail.startsWith("greeting-headline")).length === 1 &&
      signsAnti.filter((f) => f.detail.startsWith("hype-words")).length === 1 &&
      signsAnti.filter((f) => f.detail.startsWith("heavy-font")).length === 1 &&
      signsAnti.filter((f) => f.detail.startsWith("uppercase-tracked") && f.severity === "warn").length === 1 &&
      signsAnti.filter((f) => f.detail.startsWith("motion-slop") && f.severity === "warn").length === 2);
    // measurePage kumpulkan koleksi baru §4: transform/tracking di texts
    // + motionClasses per elemen.
    ok("design-gate red-test: measurePage kumpulkan transform/tracking + motionClasses (unslop-signs)",
      signs.input.texts.some((t) => t.transform === "uppercase" && t.tracking === "3px") &&
      signs.input.motionClasses.some((m) => m.classes.includes("animate-pulse")) &&
      signs.input.motionClasses.some((m) => m.classes.includes("hover:scale-105")));
    // snapshot (§5 v0.3.36): fixture lokal → HTML + PNG tertulis; HTML
    // tanpa <script>; URL relatif dijadikan absolut.
    const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-snap-"));
    const snapOut = path.join(snapDir, "snap.html");
    const snap = await SN.snapshot("tests/fixtures/design/snapshot-page.html", snapOut);
    const snapHtml = fs.readFileSync(snap.html, "utf8");
    ok("design-snapshot: fixture lokal → HTML + PNG tertulis, tanpa <script>, link absolut",
      fs.existsSync(snap.html) && fs.existsSync(snap.png) && fs.statSync(snap.png).size > 0 &&
      snapHtml.includes("Halaman snapshot") && !/<script[\s>]/.test(snapHtml) && /href="http:\/\/127\.0\.0\.1:\d+\/tentang"/.test(snapHtml));
    fs.rmSync(snapDir, { recursive: true, force: true });
    // measurePage kumpulkan headings dalam urutan DOM (fixed.html: h1 level 1).
    ok("design-gate red-test: measurePage kumpulkan headings (fixed.html h1 level 1)",
      Array.isArray(fixed.input.headings) && fixed.input.headings.length >= 1 && fixed.input.headings[0].level === 1);
    // behavior gate red-test (§1 v0.3.31): fixture keranjang terisi FAIL
    // (finding behavior "keranjang kosong saat dimuat"); fixture
    // keranjang-kosong PASS; selector tak ada → probe-gagal, bukan crash.
    const CART_CONTRACT = { initial: [{ id: "cart-empty", label: "keranjang kosong saat dimuat", kind: "text-equals", selector: "#cart-total-display", expected: "¥0" }], actions: [{ id: "cart-add", label: "klik + Tambah → total bertambah", kind: "click-then-text", click: '.add-service-btn[data-id="photowalk"]', selector: "#cart-total-display", expected: "¥24.000" }] };
    const cartBug = await BH.probeBehavior("tests/fixtures/design/behavior-cart.html", CART_CONTRACT);
    ok("design-behavior red-test: keranjang terisi saat dimuat FAIL behavior (finding 'keranjang kosong', total ¥12.000)",
      cartBug.pass === false && cartBug.checks.find((c) => c.id === "cart-empty")?.passed === false &&
      cartBug.findings.some((f) => f.check === "behavior" && f.detail.includes("keranjang kosong")));
    const cartEmpty = await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html",
      { initial: [{ id: "cart-empty", label: "keranjang kosong saat dimuat", kind: "text-equals", selector: "#cart-total-display", expected: "¥0" }], actions: [{ id: "cart-add", label: "klik + Tambah → total ¥12.000", kind: "click-then-text", click: '.add-service-btn[data-id="photowalk"]', selector: "#cart-total-display", expected: "¥12.000" }] });
    ok("design-behavior red-test: keranjang kosong saat dimuat PASS (initial ¥0 + klik tambah → ¥12.000)",
      cartEmpty.pass === true && cartEmpty.checks.every((c) => c.passed));
    const probeGagal = await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html",
      { checks: [{ id: "hilang", label: "elemen tak ada", kind: "text-equals", selector: "#tidak-ada", expected: "x" }] });
    ok("design-behavior red-test: selector tak ada → finding probe-gagal, bukan crash loop",
      probeGagal.pass === false && probeGagal.findings.some((f) => f.check === "probe-gagal"));
    // Kontrak default turunan DOM (§1 v0.3.32): tanpa kontrak Maker, probe
    // TIDAK dilewati — checks diturunkan dari DOM live tiap pola derivasi.
    const { Browser } = await import("../.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs");
    const derivedDirect = await (async () => {
      const { server, url } = await DM.serveLocal("tests/fixtures/design/behavior-default-all.html");
      const browser = await Browser.launch({ extraArgs: typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [] });
      try {
        const page = await browser.newPage({ width: 1440, height: 900, dsf: 1 });
        try {
          await page.goto(url, { timeoutMs: 30000, settleMs: 800 });
          return await BH.deriveDefaultContract(page);
        } finally { await page.close(); }
      } finally { await browser.close().catch(() => {}); server.close(); }
    })();
    ok("design-behavior default: deriveDefaultContract turunkan 5 pola (cart-empty, cart-add, filter, form-empty, theme-toggle) + interactive",
      JSON.stringify(derivedDirect.derived) === JSON.stringify(["cart-empty", "cart-add", "filter", "form-empty", "theme-toggle"]) &&
      derivedDirect.interactive === true &&
      derivedDirect.contract.initial.some((c) => c.id === "cart-empty" && c.expected === "Rp0") &&
      derivedDirect.contract.actions.some((c) => c.id === "cart-add" && c.expected === "Rp18.000") &&
      derivedDirect.contract.actions.some((c) => c.id === "filter" && c.kind === "click-then-count" && c.expected === 0) &&
      derivedDirect.contract.actions.some((c) => c.id === "form-empty" && c.kind === "click-then-count" && c.expected === 1) &&
      derivedDirect.contract.actions.some((c) => c.id === "theme-toggle" && c.kind === "click-then-attr" && c.expected === "dark"));
    // MaxListeners (§9 v0.3.33): tiap Browser.launch dulu mendaftarkan
    // listener process (exit + SIGINT/SIGTERM/SIGHUP) yang tidak pernah
    // dilepas — 11 launch = MaxListenersExceededWarning. close() kini
    // melepasnya: hitungan listener kembali ke baseline + 0 warning.
    const mlWarns = [];
    const onMlWarn = (w) => { if (w.name === "MaxListenersExceededWarning") mlWarns.push(w.message); };
    process.on("warning", onMlWarn);
    const baseExit = process.listenerCount("exit");
    const baseInt = process.listenerCount("SIGINT");
    try {
      for (let i = 0; i < 3; i++) {
        const b = await Browser.launch({ extraArgs: typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [] });
        try { await b.newPage({ width: 800, height: 600 }); } finally { await b.close().catch(() => {}); }
      }
    } finally { process.removeListener("warning", onMlWarn); }
    ok("design-cdp: launch+close tidak menumpuk listener process (exit/SIGINT kembali ke baseline, 0 MaxListenersExceededWarning)",
      process.listenerCount("exit") === baseExit && process.listenerCount("SIGINT") === baseInt && mlWarns.length === 0);
    const defAll = await BH.probeBehavior("tests/fixtures/design/behavior-default-all.html", null);
    ok("design-behavior default: probe tanpa kontrak PASS di fixture benar (source 'default', 5 checks lolos)",
      defAll.pass === true && defAll.source === "default" && defAll.checks.length === 5 && defAll.checks.every((c) => c.passed) &&
      JSON.stringify(defAll.derived) === JSON.stringify(["cart-empty", "cart-add", "filter", "form-empty", "theme-toggle"]));
    const defDouble = await BH.probeBehavior("tests/fixtures/design/behavior-default-double-add.html", null);
    ok("design-behavior default: double-add tertangkap tanpa kontrak (1 klik → Rp36.000, cart-add FAIL, lainnya lolos)",
      defDouble.pass === false && defDouble.source === "default" &&
      defDouble.checks.find((c) => c.id === "cart-add")?.passed === false &&
      defDouble.checks.find((c) => c.id === "cart-add")?.actual === "Rp36.000" &&
      defDouble.checks.filter((c) => c.id !== "cart-add").every((c) => c.passed) &&
      defDouble.findings.some((f) => f.check === "behavior"));
    const defPrefill = await BH.probeBehavior("tests/fixtures/design/behavior-cart.html", null);
    ok("design-behavior default: keranjang prefill tertangkap tanpa kontrak (cart-empty FAIL, total ¥12.000)",
      defPrefill.pass === false && defPrefill.source === "default" &&
      defPrefill.checks.find((c) => c.id === "cart-empty")?.passed === false &&
      defPrefill.checks.find((c) => c.id === "cart-empty")?.actual === "¥12.000");
    const defEmpty = await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html", null);
    ok("design-behavior default: fixture keranjang-kosong PASS tanpa kontrak (cart-empty + cart-add diturunkan)",
      defEmpty.pass === true && defEmpty.source === "default" &&
      defEmpty.derived.includes("cart-empty") && defEmpty.derived.includes("cart-add") &&
      defEmpty.checks.every((c) => c.passed));
    const defStatic = await BH.probeBehavior("tests/fixtures/design/behavior-default-static.html", null);
    ok("design-behavior default: 0 checks → SATU finding warn 'tidak ada interaksi yang bisa diprobe' (bukan skip, bukan fail)",
      defStatic.pass === true && defStatic.source === "default" && defStatic.checks.length === 0 &&
      defStatic.findings.length === 1 && defStatic.findings[0].check === "behavior" &&
      defStatic.findings[0].severity === "warn" && defStatic.findings[0].detail.includes("tidak ada interaksi yang bisa diprobe"));
    const explicitSrc = await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html",
      { initial: [{ id: "cart-empty", label: "keranjang kosong saat dimuat", kind: "text-equals", selector: "#cart-total-display", expected: "¥0" }] },
      { source: "behavior.json" });
    ok("design-behavior: jalur eksplisit tidak regresi — source tercatat ('behavior.json' bila diminta, 'design' default) + kontrak kosong tetap pass tanpa findings",
      explicitSrc.pass === true && explicitSrc.source === "behavior.json" &&
      (await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html",
        { initial: [{ id: "cart-empty", label: "keranjang kosong saat dimuat", kind: "text-equals", selector: "#cart-total-display", expected: "¥0" }] })).source === "design" &&
      (await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html", { checks: [] })).pass === true &&
      (await BH.probeBehavior("tests/fixtures/design/behavior-cart-empty.html", { checks: [] })).findings.length === 0);
    // measureAndGateWithBehavior (§1 v0.3.32): probe SELALU jalan tiap
    // iterasi — eksplisit > DESIGN.md > default; blok hilang dicatat
    // contractNote, bukan ditelan jadi skip.
    const gwExplicit = await BH.measureAndGateWithBehavior("tests/fixtures/design/behavior-cart-empty.html",
      { behaviorContract: { initial: [{ id: "cart-empty", label: "keranjang kosong saat dimuat", kind: "text-equals", selector: "#cart-total-display", expected: "¥0" }] } });
    ok("design-behavior gate: kontrak eksplisit via opts.behaviorContract → behaviorSource 'design', contractNote null, probe jalan",
      gwExplicit.behaviorSource === "design" && gwExplicit.contractNote === null &&
      Array.isArray(gwExplicit.behavior) && gwExplicit.behavior.length === 1 && gwExplicit.behavior[0].passed === true);
    const gwDesign = await BH.measureAndGateWithBehavior("tests/fixtures/design/behavior-cart-empty.html",
      { designFile: "tests/fixtures/design/DESIGN-behavior.md" });
    ok("design-behavior gate: kontrak dari DESIGN.md (ada blok) → behaviorSource 'design', contractNote null, probe jalan",
      gwDesign.behaviorSource === "design" && gwDesign.contractNote === null &&
      gwDesign.behavior.length === 2 && gwDesign.behavior.every((c) => c.passed));
    const gwDouble = await BH.measureAndGateWithBehavior("tests/fixtures/design/behavior-default-double-add.html",
      { designFile: "tests/fixtures/design/DESIGN.md" });
    ok("design-behavior gate: DESIGN.md tanpa blok → contractNote tercatat + kontrak default jalan (double-add FAIL, gate FAIL)",
      gwDouble.behaviorSource === "default" && typeof gwDouble.contractNote === "string" &&
      gwDouble.contractNote.includes("kontrak default") &&
      gwDouble.pass === false &&
      gwDouble.findings.some((f) => f.check === "behavior" && f.detail.includes("klik tambah")));
    const gwAll = await BH.measureAndGateWithBehavior("tests/fixtures/design/behavior-default-all.html",
      { designFile: "tests/fixtures/design/DESIGN.md" });
    ok("design-behavior gate: DESIGN.md tanpa blok + fixture benar → kontrak default PASS, gate PASS (warn kontras diizinkan, tanpa fail)",
      gwAll.behaviorSource === "default" && typeof gwAll.contractNote === "string" &&
      gwAll.behavior.length === 5 && gwAll.behavior.every((c) => c.passed) && gwAll.pass === true &&
      gwAll.findings.every((f) => f.severity !== "fail"));
    const gwStatic = await BH.measureAndGateWithBehavior("tests/fixtures/design/behavior-default-static.html");
    ok("design-behavior gate: tanpa kontrak apa pun + halaman statis → warn 0-check, pass tetap true, source 'default'",
      gwStatic.behaviorSource === "default" && typeof gwStatic.contractNote === "string" &&
      gwStatic.contractNote.includes("tidak ada kontrak eksplisit") &&
      gwStatic.pass === true && Array.isArray(gwStatic.behavior) && gwStatic.behavior.length === 0 &&
      gwStatic.findings.some((f) => f.check === "behavior" && f.severity === "warn" && f.detail.includes("tidak ada interaksi yang bisa diprobe")));
    // token-fidelity actionable, red-test browser (§2 v0.3.31): fixture
    // netral-sebagai-tint PASS — 0 findings token-fidelity.
    const neutralTint = await DM.measureAndGate("tests/fixtures/design/token-neutral-tint.html", { designFile: "tests/fixtures/design/DESIGN-neutral.md" });
    ok("design-gate red-test: token-neutral-tint PASS (netral = tint token, 0 token-fidelity)",
      neutralTint.pass === true && neutralTint.findings.filter((f) => f.check === "token-fidelity").length === 0);
    // cek aset dua lapis, red-test browser (§4 v0.3.31): URL mati → fail.
    const dead = await DM.measureAndGate("tests/fixtures/design/asset-dead.html");
    ok("design-gate red-test: asset-dead FAIL assets (URL mati, 1 fail assets)",
      dead.pass === false && dead.findings.filter((f) => f.check === "assets" && f.severity === "fail").length === 1);
    // pairwise red-test (§6 v0.3.31): fixed > slop di kedua urutan, packet
    // bertukar urutan; pemenang konsisten. (Kopi basic vs 5x — kriteria
    // plan — diuji di eval luar repo: eval-0331.mjs, 5x menang 3-0.)
    const pw = await PW.comparePairwise("tests/fixtures/design/fixed.html", "tests/fixtures/design/slop.html", { nameA: "fixed", nameB: "slop" });
    ok("design-pairwise red-test: fixed > slop, pemenang sama di kedua urutan, packet bertukar urutan",
      pw.winner === "a" && pw.winnerName === "fixed" && pw.orderConsistent === true &&
      pw.packets.ab.first.name === "fixed" && pw.packets.ba.first.name === "slop" &&
      pw.a.dom.length > 0 && pw.b.dom.length > 0);
  }
}

finish();
