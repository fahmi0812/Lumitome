/** Lint gate Lumitome (v0.3.54 — lapis Static Analysis Poteto Pyramid).
 *  Dijalankan lewat tests/run.mjs (npm test).
 *  TDD: tes ini ditulis dulu (merah: scripts/lint.mjs belum ada),
 *  lalu implementasi, lalu hijau di surface yang sama.
 *  Syarat Fahmi: lint murni non-interaktif — tidak membaca stdin,
 *  tidak menunggu input, tidak bertanya apa pun. */
import fs from "node:fs";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, finish } from "./harness.mjs";
import { stripComments, lintSource, lintRepo } from "../scripts/lint.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const has = (vs, rule) => vs.some((v) => v.rule === rule);

{
  // stripComments: komentar hilang, string/regex utuh
  const src = `const a = "https://x.test/p"; // console.log("jelek")\n/* blok\nconsole.log("jelek2") */\nconst re = /^https?:\\/\\//;\nconst t = \`isi \${1 + 1 /* komen */} akhir\`; // ekor\n`;
  const stripped = stripComments(src);
  ok("lint: stripComments menghapus // dan /* */ tapi menjaga string https:// dan regex /\\\\/\\\\//",
    stripped.includes('"https://x.test/p"') && stripped.includes("/^https?:\\/\\//")
    && !stripped.includes("jelek") && !stripped.includes("komen") && !stripped.includes("ekor")
    && stripped.includes("1 + 1") && stripped.includes("akhir"));
}

{
  // LINT-001: larangan hardcode angka hitungan (pelajaran v0.3.47)
  const bad1 = lintSource("scripts/foo.mjs", `if (skills.length === 734) fail("x");`);
  const bad2 = lintSource("scripts/foo.mjs", `if (734 !== arr.length) fail("x");`);
  const bad3 = lintSource("lumitome/lib/foo.mjs", `const n = items.length !== 900 ? 0 : 1;`);
  const good1 = lintSource("scripts/foo.mjs", `if (parts.length === 1) value = 1;\nif (g.length < 120) fail("x");\nif (failures.length === 0) ok();`);
  const good2 = lintSource("scripts/validate.mjs", `// dulu act.length !== 127 di sini — kini dinamis\nif (act.length !== expectedActive) fail("x");`);
  const good3 = lintSource("tests/suite-routing.mjs", `if (act.length !== 735) fail("x");`);
  ok("lint LINT-001: menangkap .length ===/!== literal >= 10 (kedua arah)", has(bad1, "LINT-001") && has(bad2, "LINT-001") && has(bad3, "LINT-001"));
  ok("lint LINT-001: meloloskan hitungan kecil (control flow), ambang <, hitungan dinamis, dan komentar",
    !has(good1, "LINT-001") && !has(good2, "LINT-001"));
  ok("lint LINT-001: tidak berlaku untuk tests/ (pin hitungan sengaja)", !has(good3, "LINT-001"));
}

{
  // LINT-002: larangan process.exit di lumitome/lib/ (entry point saja)
  const bad = lintSource("lumitome/lib/foo.mjs", `if (x) process.exit(1);\n`);
  const shim = lintSource("lumitome/lib/codemem-mcp-shim.mjs", `child.on("exit", (code) => process.exit(code ?? 1));`);
  const ui = lintSource("lumitome/lib/provider-ui.mjs", `if (r.abort) { process.exit(130); }`);
  const bin = lintSource("lumitome/bin/lumitome.mjs", `if (bad) process.exit(2);`);
  const scripts = lintSource("scripts/foo.mjs", `if (bad) process.exit(2);`);
  ok("lint LINT-002: menangkap process.exit di lumitome/lib/", has(bad, "LINT-002"));
  ok("lint LINT-002: allowlist beralasan — shim MCP (teruskan exit code) + menu TUI (abort)",
    !has(shim, "LINT-002") && !has(ui, "LINT-002"));
  ok("lint LINT-002: entry point (bin/, scripts/) boleh process.exit",
    !has(bin, "LINT-002") && !has(scripts, "LINT-002"));
}

{
  // LINT-003: larangan console.* di lumitome/lib/
  const bad = lintSource("lumitome/lib/foo.mjs", `console.log("debug");\nconsole.error(err);\n`);
  const defParam = lintSource("lumitome/lib/providers.mjs", `export function cli({ log = console.log, err = (m) => process.stderr.write(m) }) {}`);
  const comment = lintSource("lumitome/lib/quiet-stderr.mjs", `/** Engine mencetaknya langsung ke stderr (console.log), bukan lewat logger. */\n`);
  const outside = lintSource("scripts/foo.mjs", `console.log("ok");`);
  ok("lint LINT-003: menangkap console.log/error di lumitome/lib/", has(bad, "LINT-003"));
  ok("lint LINT-003: meloloskan console.log sebagai nilai (default param) dan sebutan di komentar",
    !has(defParam, "LINT-003") && !has(comment, "LINT-003"));
  ok("lint LINT-003: di luar lumitome/lib/ (scripts/) console.* boleh", !has(outside, "LINT-003"));
}

{
  // LINT-004: batas antar-lapisan — router mandiri, guard hanya node:
  const badRouter = lintSource("router/skill-db.mjs", `import { x } from "../lumitome/lib/providers.mjs";`);
  const badRouterDyn = lintSource("router/foo.mjs", `const m = await import("../harness/lumi-guard.mjs");`);
  const goodRouter = lintSource("router/skill-db.mjs", `import fs from "node:fs";\nimport { tokens } from "./parse.mjs";`);
  const badGuard = lintSource("harness/lumi-guard.mjs", `import { x } from "../lumitome/lib/trust-project.mjs";`);
  const goodGuard = lintSource("harness/lumi-guard.mjs", `import fs from "node:fs";\nimport path from "node:path";`);
  const otherHarness = lintSource("harness/design-gate.mjs", `import { Browser } from "../.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs";`);
  ok("lint LINT-004: menangkap router mengimpor ke luar (statis + dinamis)",
    has(badRouter, "LINT-004") && has(badRouterDyn, "LINT-004"));
  ok("lint LINT-004: meloloskan router yang hanya impor node: + sesama router/",
    !has(goodRouter, "LINT-004"));
  ok("lint LINT-004: menangkap guard mengimpor di luar node:, meloloskan guard node:-only",
    has(badGuard, "LINT-004") && !has(goodGuard, "LINT-004"));
  ok("lint LINT-004: harness lain (bukan guard) tidak dibatasi aturan ini",
    !has(otherHarness, "LINT-004"));
}

{
  // lintRepo di repo nyata: 0 pelanggaran, cepat (< 2 detik)
  const r = lintRepo(ROOT);
  ok(`lint: repo saat ini bersih (0 pelanggaran, ${r.files} file, ${r.ms} ms)`,
    r.violations.length === 0 && r.files >= 50);
  ok("lint: jalan < 2000 ms di repo ini (gate tidak boleh lambat)", r.ms < 2000);
}

{
  // Non-interaktif (syarat Fahmi): CLI lint jalan dengan stdin tertutup,
  // tanpa menggantung, exit 0, tanpa membaca stdin.
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, ["scripts/lint.mjs"], {
    cwd: ROOT, encoding: "utf8", timeout: 10000, input: "",
    stdio: ["ignore", "pipe", "pipe"],
  });
  ok("lint: CLI non-interaktif — stdin tertutup, exit 0, selesai cepat, tanpa prompt",
    r.status === 0 && Date.now() - t0 < 10000 && /OK/.test(r.stdout) && !/ketik|konfirmasi|\\?\\s*$/.test(r.stdout));
}

{
  // Validate ikut menjalankan lint (fail-closed) — wiring statis.
  const v = fs.readFileSync(path.join(ROOT, "scripts/validate.mjs"), "utf8");
  ok("lint: validate.mjs mengimpor + menjalankan lint (fail-closed)",
    v.includes("./lint.mjs") && v.includes("lintRepo"));
}

finish();
