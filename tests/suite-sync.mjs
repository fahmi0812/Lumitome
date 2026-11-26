/** Sync upstream v0.3.56 + v0.3.60 — pin SHA baru, pin MCP baru, dan penjaga larangan.
 *  Ditulis dulu (merah): pin registry masih lama, pin MCP masih lama,
 *  modul sync-upstream baru belum ada (import gagal).
 *  v0.3.60: pin baru untuk emil/impeccable/anti-slop/rea/solidcraft/logo-design
 *  + 4 repo baru (owasp, 3d-model-anything, BugHunter selektif, trailofbits
 *  selektif CC BY-SA) + MCP Blender opt-in + drawio 0.4.15.
 *  Dijalankan lewat tests/run.mjs (npm test); standalone:
 *  node --experimental-strip-types tests/suite-sync.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ok, finish } from "./harness.mjs";

// ---------- 1. Pin SHA baru (v0.3.60; audit 13 Nov + evaluasi 15 Nov 2026, diverifikasi live) ----------
const NEW_PINS = {
  "caru-ini/stack-diagram": "9175bde8449cc8f5390d6eb72ecc2e1f5bfe21f3",
  "cathrynlavery/diagram-design": "f6db0decea96de66b901331a0f79a8d4b147ebae",
  "emilkowalski/skills": "0f2e23b32bb1265e84cff8d3e75785fec953fb1b",
  "genspark-ai/genoffice": "d751696166e1d93ab4b9e7319d3b0233a70bf984",
  "google/elephant-goldfish-model": "270b10326bf366d823bc76fd662cf83808d5781e",
  "haydenschmitty/floorplan": "5e3eaac9639705f52e5e31b620a0d20550acd9dd",
  "heygen-com/hyperframes": "d208281091b1c00db1724a2ee3db0055955eb41b",
  // kaomei/stickman-video-director DILEWATI (lihat bawah): 299 aset biner baru
  // tidak bisa lewat push konektor, dan teks barunya merujuk aset itu.
  "lemomo-ai/lemo-opuscar": "3a7132b996be0241c1ea0ab180d519f06e6f10b6",
  "magicuidesign/magicui": "2712647e193295d2fd85b65e58095fb2009736d7",
  "miqdadbadjuber/anti-slop": "35b54dc660aa7d11428ee62c5788ad36bc18ac3c",
  "morluto/rea": "da53dce1f729d33abe0d269061412af7662f2a09",
  "pbakaus/impeccable": "1b2aa57ca0f1cd6e393689bba70a780cb701aacd",
  // solidcraft: pin v0.3.60 = HEAD 15 Nov (80a83637). Selisih vs SHA evaluasi
  // 1339e2b9 diverifikasi hanya kode CAD (skill paths tidak berubah).
  "tangency-labs/solidcraft": "80a83637f4e01c8ddfb5fa426c5f164366979d74",
  "vercel-labs/json-render": "5e30a6f9425cd5ffb5038ba44352ab4b1feb3fc7",
  "adhiprib/humanizer-indonesia": "62fe1aed5932c26cfcfc7ed096415e59aae5b0db",
  "Nutlope/hallmark": "04977e15f3dfd6ee4b74c887dac3eb52665d6c92",
  "tt-a1i/archify": "7e45f36c66de1254d5ad6ba1d878f6499ea269fd",
  "nowork-studio/notfair-plugin": "8035315b959379d0a0df0c8f7d30c0defc5be576",
  // v0.3.60 — repo BARU (evaluasi 15 Nov): owasp 1 skill, scan-to-threejs 1,
  // BugHunter SELEKTIF 20 (bukan 83), trailofbits SELEKTIF 5 (CC BY-SA 4.0).
  "agamm/claude-code-owasp": "1ae29cb22518560e3625d77f2ae64f61647d9201",
  "wesbos/3d-model-anything": "31b2dc9da3fb541e501f2f0936e55b32afb70ee8",
  "elementalsouls/Claude-BugHunter": "8ac4242ee0a108e65ac1343b56cce6c50ba456ef",
  "trailofbits/skills": "149d7b21f4067765b82e67029730b42d228ef4b4",
  "kaankiziltug/logo-design-skill": "e9eaddc07895575253d6663320354a708f53e955",
};
const reg = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8"));
// Skill yang upstream HAPUS (cermin + pin lama dipertahankan — bukan gagal sync).
const PIN_KEEP_OLD = { "nowork-studio/notfair-plugin": { gemini: "f70e36082a50db00c18a7752ba97ffa1052d3472", "setup-cms": "f70e36082a50db00c18a7752ba97ffa1052d3472", upgrade: "f70e36082a50db00c18a7752ba97ffa1052d3472" } };
for (const [src, sha] of Object.entries(NEW_PINS)) {
  const skills = reg.skills.filter((s) => s.src === src);
  ok(`pin ${src}: ${skills.length} skill di registry`, skills.length > 0);
  const keepOld = PIN_KEEP_OLD[src] || {};
  ok(`pin ${src} = ${sha.slice(0, 12)}`, skills.filter((s) => !keepOld[s.name]).every((s) => s.sha === sha));
  ok(`pin ${src}: skill yang upstream hapus tetap pin lama`, Object.entries(keepOld).every(([n, o]) => skills.some((s) => s.name === n && s.sha === o)));
  // frontmatter cermin juga membawa pin baru (gen-registry membaca dari sana).
  for (const s of skills) {
    if (keepOld[s.name]) continue;
    const dir = s.pack ? `packs/${s.pack}/skills/${s.name}` : `.opencode/skills/${s.name}`;
    const fm = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    ok(`pin frontmatter ${s.name} = ${sha.slice(0, 12)}`, fm.includes(sha));
  }
}

// Dilewati: directing-stickman-videos — 299 aset biner BARU (JPG/MP4 showcase)
// tidak bisa lewat push konektor (hanya UTF-8), dan 7 file teks barunya merujuk
// aset itu; menulis teks saja merusak cermin di remote. Cermin + pin tetap lama
// sampai ada push berbasis git. Target pin barunya tetap tercatat di
// router/upstream-pins.json untuk sync berikutnya.
const STICK_OLD = "eb4bb378c4716a617f9ad7d98a60379b9d1fa54a";
const stick = reg.skills.find((s) => s.name === "directing-stickman-videos");
ok("lewati: stickman pin tetap lama", stick?.sha === STICK_OLD);
ok("lewati: stickman frontmatter tetap pin lama", fs.readFileSync("packs/motion/skills/directing-stickman-videos/SKILL.md", "utf8").includes(STICK_OLD));

// ---------- 2. Pin MCP baru ----------
const OC = fs.readFileSync("opencode.jsonc", "utf8");
const BC = fs.readFileSync("lumitome/lib/build-config.mjs", "utf8");
const MS = JSON.parse(fs.readFileSync("router/mcp-sectors.json", "utf8"));
const MCPDOC = fs.readFileSync("docs/MCP.md", "utf8");
ok("mcp context7 4.7.0 (opencode.jsonc + docs)", OC.includes("@upstash/context7-mcp@4.7.0") && MCPDOC.includes("@upstash/context7-mcp@4.7.0"));
ok("mcp context7 lama 4.4.4 hilang dari config+docs", !OC.includes("@upstash/context7-mcp@4.4.4") && !MCPDOC.includes("@upstash/context7-mcp@4.4.4"));
ok("mcp playwright 0.0.85 (opencode.jsonc + docs)", OC.includes("@playwright/mcp@0.0.85") && MCPDOC.includes("@playwright/mcp@0.0.85"));
ok("mcp playwright lama 0.0.83 hilang dari config+docs", !OC.includes("@playwright/mcp@0.0.83") && !MCPDOC.includes("@playwright/mcp@0.0.83"));
ok("mcp chromedev 1.13.0 (opencode.jsonc + docs)", OC.includes("chrome-devtools-mcp@1.13.0") && MCPDOC.includes("chrome-devtools-mcp@1.13.0"));
ok("mcp chromedev lama 1.12.0 hilang dari config+docs", !OC.includes("chrome-devtools-mcp@1.12.0") && !MCPDOC.includes("chrome-devtools-mcp@1.12.0"));
ok("mcp drawio @next-ai-drawio/mcp-server@0.4.15 (jsonc + build-config + sectors)", OC.includes("@next-ai-drawio/mcp-server@0.4.15") && BC.includes("@next-ai-drawio/mcp-server@0.4.15") && MS.servers.drawio?.pin === "@next-ai-drawio/mcp-server@0.4.15");
ok("mcp drawio lama 0.4.14 hilang dari config", !OC.includes("@next-ai-drawio/mcp-server@0.4.14") && !BC.includes("@next-ai-drawio/mcp-server@0.4.14") && MS.servers.drawio?.pin !== "@next-ai-drawio/mcp-server@0.4.14");
ok("mcp figcraft v0.18.1 (sectors + docs + komentar build-config)", MS.servers.figcraft?.pin === "v0.18.1" && MCPDOC.includes("v0.18.1") && /figcraft.*v0\.18\.1/.test(BC));
ok("mcp figcraft lama v0.16.0 hilang dari sectors+docs", MS.servers.figcraft?.pin !== "v0.16.0" && !MCPDOC.includes("v0.16.0"));

// ---------- 2b. v0.3.60 — skill baru (27), lisensi CC BY-SA, MCP Blender, ref 9router ----------
ok("registry 931 skill (930 + modern-web-guidance baru)", reg.skills.length === 931);
const BH = ["bb-methodology", "redteam-mindset", "triage-validation", "evidence-hygiene", "hunt-sqli", "hunt-xss", "hunt-ssrf", "hunt-idor", "hunt-auth-bypass", "hunt-jwt-crypto", "hunt-csrf", "hunt-rce", "hunt-ssti", "hunt-xxe", "hunt-lfi", "hunt-deserialization", "hunt-oauth", "hunt-session", "hunt-graphql", "hunt-llm-ai"];
const bhSkills = reg.skills.filter((s) => s.src === "elementalsouls/Claude-BugHunter");
ok("v0.3.60: BugHunter SELEKTIF 20 skill (bukan 83)", bhSkills.length === 20 && BH.every((n) => bhSkills.some((s) => s.name === n)));
const tob = reg.skills.filter((s) => s.src === "trailofbits/skills");
ok("v0.3.60: trailofbits SELEKTIF 5 skill CC BY-SA 4.0 + atribusi + LICENSE", tob.length === 5 && ["audit-context-building", "c-review", "cvss-scoring", "fp-check", "differential-review"].every((n) => tob.some((s) => s.name === n)) && tob.every((s) => s.license.startsWith("CC-BY-SA-4.0")) && tob.every((s) => fs.existsSync(`.opencode/skills/${s.name}/LICENSE`) && fs.readFileSync(`.opencode/skills/${s.name}/SKILL.md`, "utf8").includes("license_note") && fs.readFileSync(`.opencode/skills/${s.name}/SKILL.md`, "utf8").includes("Trail of Bits, CC BY-SA 4.0")));
ok("v0.3.60: owasp-security + scan-to-threejs (MIT, sektor benar)", reg.skills.some((s) => s.name === "owasp-security" && s.src === "agamm/claude-code-owasp" && s.sektor === "security" && s.license === "MIT") && reg.skills.some((s) => s.name === "scan-to-threejs" && s.src === "wesbos/3d-model-anything" && s.sektor === "media" && s.pack === "3d" && s.license === "MIT"));
ok("v0.3.60: MCP blender opt-in disabled + pin 2.2.9 (sektor media, ask execute_blender_code)", MS.servers.blender?.default === "disabled" && MS.servers.blender?.pin === "mcp-for-blender@2.2.9" && MS.sectors.media.includes("blender") && (MS.servers.blender?.ask || []).includes("execute_blender_code") && OC.includes("mcp-for-blender==2.2.9") && BC.includes("mcp-for-blender==2.2.9"));
ok("v0.3.60: README merujuk antigravity-fixer untuk 9router 403/not eligible + peringatan OAuth", fs.readFileSync("README.md", "utf8").includes("antigravity-fixer") && /Read the tool before running it/i.test(fs.readFileSync("README.md", "utf8")));

// ---------- 3. Yang DILARANG disentuh — harus tetap ----------
const bySrc = (src) => reg.skills.filter((s) => s.src === src);
ok("larang: agents-system pin tetap d9d87d04cd9b", bySrc("PaulRBerg/agent-skills").some((s) => s.name === "agents-system" && s.sha === "d9d87d04cd9b932469c488a1de79b3260e7435c8"));
ok("larang: agents-system mirror tetap ada", fs.existsSync(".opencode/skills/agents-system/SKILL.md"));
ok("larang: deslop TIDAK diimpor", !reg.skills.some((s) => s.name === "deslop"));
ok("larang: humanizer blader pin tetap 0ef9fe5bc357", bySrc("blader/humanizer").some((s) => s.name === "humanizer" && s.sha === "0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0"));
ok("larang: humanizer blader tetap 'Do not make anything up.'", fs.readFileSync(".opencode/skills/humanizer/SKILL.md", "utf8").includes("Do not make anything up."));
ok("larang: taste-skill pin tetap 12af471f627f", bySrc("Leonxlnx/taste-skill").every((s) => s.sha === "12af471f627f866411b4bd785b19646d3672784c"));
ok("larang: CanvasAnvil pin tetap 3de19527e36e", bySrc("CodingFeng101/CanvasAnvil").every((s) => s.sha === "3de19527e36ecded4338b4f4e79f6842a33d2723"));
for (const n of ["gemini", "setup-cms", "upgrade"]) {
  ok(`larang: mirror notfair ${n} tetap ada + WORKFLOW.md utuh`, fs.existsSync(`packs/seo/skills/${n}/SKILL.md`) && fs.existsSync(`packs/seo/skills/${n}/WORKFLOW.md`));
}
ok("larang: seo-drift/seo-page tetap lokal (src kosong, bukan impor)", reg.skills.filter((s) => ["seo-drift", "seo-page"].includes(s.name)).every((s) => !s.src));
ok("larang: software-factory (mattpocock baru) TIDAK diimpor", !reg.skills.some((s) => s.name === "software-factory"));

// ---------- 4. Modul sync-upstream: penemuan, stempel, reconcile, denylist ----------
const SU = await import("../scripts/sync-upstream.mjs");
ok("sync: discoverSkillDir menemukan skills/<nama>", SU.discoverSkillDir(["skills/stack-diagram/SKILL.md", "skills/other/SKILL.md"], "stack-diagram") === "skills/stack-diagram");
ok("sync: discoverSkillDir menemukan .agents/skills/<nama>", SU.discoverSkillDir([".agents/skills/rea-tool-design/SKILL.md"], "rea-tool-design") === ".agents/skills/rea-tool-design");
ok("sync: discoverSkillDir menemukan SKILL.md di root repo", SU.discoverSkillDir(["SKILL.md", "README.md"], "humanizer-indonesia") === "");
ok("sync: discoverSkillDir null bila tidak ada", SU.discoverSkillDir(["skills/a/SKILL.md"], "tidak-ada") === null);
ok("sync: denylist berisi 4 repo terlarang", ["PaulRBerg/agent-skills", "blader/humanizer", "Leonxlnx/taste-skill", "CodingFeng101/CanvasAnvil"].every((r) => SU.SYNC_DENYLIST.has(r)));
ok("sync: syncTargets tidak pernah memasukkan repo denylist", SU.syncTargets([{ src: "PaulRBerg/agent-skills", sha: "x", name: "agents-system" }, { src: "caru-ini/stack-diagram", sha: "y", name: "stack-diagram" }]).every((t) => t.src !== "PaulRBerg/agent-skills"));
ok("sync: applySkips mengeluarkan skill yang dilewati", SU.applySkips([{ name: "a" }, { name: "b" }], ["b"]).length === 1 && SU.applySkips([{ name: "a" }], []).length === 1);
// Base merge dari frontmatter cermin, bukan registry (v0.3.56): registry yang
// mendahului cermin membuat sync mengira upstream tak berubah (tulis=0).
const MIRROR_OLD = "---\nname: x\nmetadata:\n  swanwright_sha: OLD111\n---\nisi\n";
ok("sync: baseShaFor utamakan pin frontmatter cermin", SU.baseShaFor({ mirrorText: MIRROR_OLD, skillSha: "NEW222", fallbackSha: "FALL" }) === "OLD111" && SU.baseShaFor({ mirrorText: null, skillSha: "NEW222", fallbackSha: "FALL" }) === "NEW222" && SU.baseShaFor({ mirrorText: "tanpa frontmatter", skillSha: "", fallbackSha: "FALL" }) === "FALL");
ok("sync: syncTargets mengelompokkan per repo", (() => { const t = SU.syncTargets([{ src: "a/b", sha: "1", name: "s1" }, { src: "a/b", sha: "1", name: "s2" }]); return t.length === 1 && t[0].skills.length === 2; })());
ok("sync: mirrorDirFor aktif vs pack", SU.mirrorDirFor({ name: "stack-diagram", pack: "" }) === ".opencode/skills/stack-diagram" && SU.mirrorDirFor({ name: "genoffice", pack: "penulisan" }) === "packs/penulisan/skills/genoffice");

// stampFrontmatter: tambah ke metadata yang ada, update yang ada, buat bila tidak ada.
const FM1 = `---\nname: x\ndescription: d\nmetadata:\n  version: '2.6'\n  swanwright_original_id: a__x\n---\n\n# X\n`;
const stamped1 = SU.stampFrontmatter(FM1, { src: "o/r", sha: "abc123" });
ok("sync: stamp menambah src+sha ke metadata yang ada", stamped1.includes("swanwright_src: o/r") && stamped1.includes("swanwright_sha: abc123") && stamped1.includes("swanwright_original_id: a__x") && stamped1.includes("version: '2.6'") && stamped1.endsWith("# X\n"));
const FM2 = `---\nname: y\ndescription: d\nmetadata:\n  swanwright_src: o/r\n  swanwright_sha: old000\n---\n\nbody\n`;
const stamped2 = SU.stampFrontmatter(FM2, { src: "o/r", sha: "new999" });
ok("sync: stamp memperbarui sha lama (bukan duplikat)", stamped2.includes("swanwright_sha: new999") && !stamped2.includes("old000") && (stamped2.match(/swanwright_sha/g) || []).length === 1);
const FM3 = `---\nname: z\ndescription: d\n---\n\nbody\n`;
const stamped3 = SU.stampFrontmatter(FM3, { src: "o/r", sha: "abc123" });
ok("sync: stamp membuat blok metadata bila tidak ada", stamped3.includes("metadata:\n  swanwright_src: o/r\n  swanwright_sha: abc123") && stamped3.endsWith("body\n"));

// reconcileDir: salin penuh (references/scripts/assets ikut), hapus file basi, LICENSE dipertahankan.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumitome-sync-test-"));
const stage = path.join(tmp, "stage", "skill-x");
const dest = path.join(tmp, "dest", "skill-x");
fs.mkdirSync(path.join(stage, "references"), { recursive: true });
fs.mkdirSync(path.join(stage, "scripts"), { recursive: true });
fs.mkdirSync(path.join(dest, "references"), { recursive: true });
fs.writeFileSync(path.join(stage, "SKILL.md"), "# baru\n");
fs.writeFileSync(path.join(stage, "references", "r.md"), "ref baru\n");
fs.writeFileSync(path.join(stage, "scripts", "s.mjs"), "console.log(1);\n");
fs.writeFileSync(path.join(dest, "SKILL.md"), "# lama\n");
fs.writeFileSync(path.join(dest, "references", "r.md"), "ref lama\n");
fs.writeFileSync(path.join(dest, "references", "basi.md"), "hapus saya\n");
fs.writeFileSync(path.join(dest, "LICENSE"), "MIT\n");
const rec = SU.reconcileDir({ stageDir: stage, destDir: dest });
ok("sync: reconcile menyalin SKILL.md + references + scripts", fs.readFileSync(path.join(dest, "SKILL.md"), "utf8") === "# baru\n" && fs.readFileSync(path.join(dest, "references", "r.md"), "utf8") === "ref baru\n" && fs.existsSync(path.join(dest, "scripts", "s.mjs")));
ok("sync: reconcile menghapus file basi", !fs.existsSync(path.join(dest, "references", "basi.md")));
ok("sync: reconcile mempertahankan LICENSE cermin", fs.readFileSync(path.join(dest, "LICENSE"), "utf8") === "MIT\n");
ok("sync: reconcile melaporkan salinan + hapusan", rec.copied >= 3 && rec.deleted === 1 && rec.preserved.includes("LICENSE"));
// ---------- 5. Merge tiga-arah + pemilihan sumber (unit) ----------
// 5a. pickSourceDir: salinan terdekat cermin menang (impeccable ← cursor-plugin, bukan .opencode).
const IMP_BODY = "# Impeccable\n\nJalankan `<skill-base-dir>/scripts/impeccable context` sekali per sesi.\n";
const pick = SU.pickSourceDir({
  candidates: ["plugin/skills/impeccable", "cursor-plugin/skills/impeccable", ".opencode/skills/impeccable", ".agents/skills/impeccable"],
  skillName: "impeccable",
  mirrorBody: IMP_BODY,
  readSkill: (d) => {
    if (d === "cursor-plugin/skills/impeccable") return `---\nname: impeccable\ndescription: d\n---\n\n${IMP_BODY}`;
    return `---\nname: impeccable\ndescription: d\nuser-invocable: true\n---\n\n# Impeccable\n\nJalankan \`npx impeccable\` dan hal lain yang berbeda.\n`;
  },
});
ok("sync: pickSourceDir memilih salinan terdekat cermin (cursor-plugin)", pick?.dir === "cursor-plugin/skills/impeccable");
ok("sync: discoverSkillDir mengutamakan cursor-plugin", SU.discoverSkillDir(["plugin/skills/impeccable/SKILL.md", "cursor-plugin/skills/impeccable/SKILL.md", ".opencode/skills/impeccable/SKILL.md"], "impeccable") === "cursor-plugin/skills/impeccable");
ok("sync: pickSourceDir menolak kandidat yang namanya tidak cocok", SU.pickSourceDir({ candidates: ["skills/x"], skillName: "y", readSkill: () => "---\nname: x\n---\n\nbody\n" }) === null);

// 5b. mergeText: gabung bersih (perubahan tidak berdampingan) + konflik terdeteksi.
// Kontrak git merge-file: perubahan yang dipisah ≥1 baris tak-berubah bergabung;
// perubahan pada baris yang sama/berdampingan = konflik (konservatif, aman).
const m1 = SU.mergeText({ current: "a\nB2\nc\nd\ne\n", base: "a\nb\nc\nd\ne\n", other: "a\nb\nc\nD4\ne\n" });
ok("sync: mergeText menggabung edit dua sisi tanpa konflik", !m1.conflicts && m1.text === "a\nB2\nc\nD4\ne\n");
const m2 = SU.mergeText({ current: "a\nB2\nc\n", base: "a\nb\nc\n", other: "a\nB2-lain\nc\n" });
ok("sync: mergeText mendeteksi konflik pada baris yang sama", m2.conflicts === true);

// 5c. mergeSkillFile: frontmatter per kunci + body edit lokal dipertahankan.
const SK_BASE = `---\nname: imp\ndescription: "lama"\nuser-invocable: true\nargument-hint: "[x]"\nallowed-tools:\n  - Bash(npx imp *)\n---\n\nLangkah 1: jalankan \`.opencode/skills/impeccable/scripts/impeccable context\`.\nLangkah 2: siapkan brief.\nLangkah 3: tinjau hasil.\n`;
const SK_CUR = `---\nname: imp\ndescription: "baru dan pendek"\nversion: 4.9.0\nuser-invocable: true\nargument-hint: "[x]"\nallowed-tools:\n  - Bash(npx imp *)\n---\n\nLangkah 1: jalankan \`.opencode/skills/impeccable/scripts/impeccable context\`.\nLangkah 2: siapkan brief.\nLangkah 3: tinjau hasil.\nLangkah 4: baca PRODUCT.md.\n`;
const SK_OTH = `---\nname: imp\ndescription: 'lama'\nlicense: Apache 2.0\nmetadata:\n  swanwright_src: pbakaus/impeccable\n  swanwright_sha: old000\n  swanwright_original_id: pbakaus-impeccable__impeccable\n---\n\nLangkah 1: jalankan \`"<skill-base-dir>/scripts/impeccable" context\`.\nLangkah 2: siapkan brief.\nLangkah 3: tinjau hasil.\n`;
const sk = SU.mergeSkillFile({ base: SK_BASE, current: SK_CUR, other: SK_OTH });
ok("sync: mergeSkillFile mengambil deskripsi baru upstream", !sk.conflicts && sk.text.includes('description: "baru dan pendek"'));
ok("sync: mergeSkillFile mempertahankan penghapusan kunci lokal", !sk.conflicts && !sk.text.includes("user-invocable") && !sk.text.includes("allowed-tools"));
ok("sync: mergeSkillFile mempertahankan blok metadata cermin", !sk.conflicts && sk.text.includes("swanwright_original_id: pbakaus-impeccable__impeccable"));
ok("sync: mergeSkillFile mempertahankan edit body lokal + langkah baru upstream", !sk.conflicts && sk.text.includes('"<skill-base-dir>/scripts/impeccable" context') && sk.text.includes("Langkah 4: baca PRODUCT.md."));

// 5d. reconcileDir tiga-arah.
const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), "lumitome-sync-test3-"));
const mk3 = (base, rel, content) => { const p = path.join(tmp3, base, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
// Kasus A: edit lokal notfair (WORKFLOW.md) dipertahankan + deskripsi baru masuk.
mk3("base", "SKILL.md", `---\nname: seo-analysis\ndescription: "lama panjang"\n---\n\nRead \`../../seo/seo-analysis/WORKFLOW.md\` completely.\n`);
mk3("new", "SKILL.md", `---\nname: seo-analysis\ndescription: "baru pendek"\n---\n\nRead \`../../seo/seo-analysis/WORKFLOW.md\` completely.\n`);
mk3("dest", "SKILL.md", `---\nname: seo-analysis\ndescription: 'lama panjang'\nmetadata:\n  swanwright_src: nowork-studio/notfair-plugin\n  swanwright_sha: old000\n---\n\nRead \`./WORKFLOW.md\` completely.\n`);
mk3("base", "WORKFLOW.md", "langkah lama\n");
mk3("new", "WORKFLOW.md", "langkah baru\n");
mk3("dest", "WORKFLOW.md", "langkah lama\n");
mk3("base", "old.md", "hapus saya\n");
mk3("dest", "old.md", "hapus saya\n"); // upstream hapus, cermin tak diedit → ikut terhapus
mk3("base", "gone.md", "asli\n");
mk3("dest", "gone.md", "asli + edit lokal\n"); // upstream hapus, cermin diedit → dipertahankan
mk3("base", "bin.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
mk3("new", "bin.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x02]));
mk3("dest", "bin.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
const rec3 = SU.reconcileDir({ stageDir: path.join(tmp3, "new"), baseDir: path.join(tmp3, "base"), destDir: path.join(tmp3, "dest") });
const destSkill3 = fs.readFileSync(path.join(tmp3, "dest", "SKILL.md"), "utf8");
ok("sync: reconcile 3-arah mempertahankan rujukan WORKFLOW.md lokal", destSkill3.includes("Read `./WORKFLOW.md` completely."));
ok("sync: reconcile 3-arah mengambil deskripsi baru upstream", destSkill3.includes('description: "baru pendek"'));
ok("sync: reconcile 3-arah mengambil WORKFLOW.md baru", fs.readFileSync(path.join(tmp3, "dest", "WORKFLOW.md"), "utf8") === "langkah baru\n");
ok("sync: reconcile 3-arah menghapus file yang upstream hapus (cermin tak diedit)", !fs.existsSync(path.join(tmp3, "dest", "old.md")));
ok("sync: reconcile 3-arah mempertahankan file hapusan-upstream yang cermin edit", fs.readFileSync(path.join(tmp3, "dest", "gone.md"), "utf8") === "asli + edit lokal\n");
ok("sync: reconcile 3-arah menahan biner yang berubah upstream + melaporkannya", fs.readFileSync(path.join(tmp3, "dest", "bin.png")).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])) && rec3.binariesKept.includes("bin.png"));
// Kasus B: konflik → atomik, tidak ada yang ditulis.
mk3("base2", "conf.md", "a\nb\nc\n");
mk3("new2", "conf.md", "a\nB2\nc\n");
mk3("dest2", "conf.md", "a\nB2-lain\nc\n");
mk3("base2", "ok.md", "lama\n");
mk3("new2", "ok.md", "baru\n");
mk3("dest2", "ok.md", "lama\n");
const recB = SU.reconcileDir({ stageDir: path.join(tmp3, "new2"), baseDir: path.join(tmp3, "base2"), destDir: path.join(tmp3, "dest2") });
ok("sync: reconcile melaporkan konflik dan tidak menulis apa pun (atomik)", recB.conflicts.includes("conf.md") && fs.readFileSync(path.join(tmp3, "dest2", "conf.md"), "utf8") === "a\nB2-lain\nc\n" && fs.readFileSync(path.join(tmp3, "dest2", "ok.md"), "utf8") === "lama\n");
// Kasus C: cermin CRLF (.cmd Windows) vs upstream LF — gabung berdasarkan isi,
// hasil SELALU LF (upstream): CRLF membuat `git diff --check` gagal.
mk3("base3", "run.cmd", "a\nb\nc\nd\ne\n");
mk3("new3", "run.cmd", "a\nB2\nc\nd\ne\n");
mk3("dest3", "run.cmd", "a\r\nb\r\nc\r\nD4\r\ne\r\n");
const recC = SU.reconcileDir({ stageDir: path.join(tmp3, "new3"), baseDir: path.join(tmp3, "base3"), destDir: path.join(tmp3, "dest3") });
const crlfOut = fs.readFileSync(path.join(tmp3, "dest3", "run.cmd"), "utf8");
ok("sync: reconcile CRLF bergabung bersih + hasil LF", recC.conflicts.length === 0 && crlfOut === "a\nB2\nc\nD4\ne\n");
fs.rmSync(tmp3, { recursive: true, force: true });
// 5e. fetchTreeToDir: salin per file dari repo git lokal (termasuk biner).
const tmp4 = fs.mkdtempSync(path.join(os.tmpdir(), "lumitome-sync-test4-"));
const repo4 = path.join(tmp4, "repo");
fs.mkdirSync(path.join(repo4, "skills", "demo", "assets"), { recursive: true });
fs.writeFileSync(path.join(repo4, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n\nHai\n");
fs.writeFileSync(path.join(repo4, "skills", "demo", "assets", "x.bin"), Buffer.from([0, 1, 2, 255]));
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
spawnSync("git", ["init", "-q"], { cwd: repo4, env: gitEnv });
spawnSync("git", ["add", "."], { cwd: repo4, env: gitEnv });
spawnSync("git", ["commit", "-qm", "demo"], { cwd: repo4, env: gitEnv });
const sha4 = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo4, encoding: "utf8" }).stdout.trim();
const out4 = path.join(tmp4, "out");
const copied4 = SU.fetchTreeToDir(repo4, sha4, "skills/demo", out4);
ok("sync: fetchTreeToDir menyalin SKILL.md + biner per file", copied4.includes("SKILL.md") && copied4.includes("assets/x.bin") && fs.readFileSync(path.join(out4, "SKILL.md"), "utf8").includes("Hai") && fs.readFileSync(path.join(out4, "assets/x.bin")).equals(Buffer.from([0, 1, 2, 255])));
fs.rmSync(tmp4, { recursive: true, force: true });

finish();
