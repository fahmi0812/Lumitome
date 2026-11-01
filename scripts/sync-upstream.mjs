import fs from "fs";
import { execSync } from "child_process";
/** Re-fetch pinned SHAs listed in router/skills-registry.json + NOTICE pointers. */
const reg = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8"));
const bySrc = new Map();
for (const s of reg.skills) {
  if (!bySrc.has(s.src)) bySrc.set(s.src, s.sha);
}
console.log("Pinned sources:");
for (const [src, sha] of bySrc) {
  console.log(`  ${src} @ ${sha}`);
  console.log(`  git clone --depth 1 https://github.com/${src} && git -C <dir> fetch --depth 1 origin ${sha} && git -C <dir> checkout ${sha}`);
}
console.log("Jalankan manual di mesin Fahmi; skrip ini tidak mengunduh otomatis di CI kosong.");
