import fs from "fs";
import path from "path";
/** Sisipkan frontmatter minimal bila belum ada. Tidak mengubah body. */
function walk(d, acc=[]) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name === "SKILL.md") acc.push(p);
  }
  return acc;
}
const root = process.argv[2] || "packs";
let n = 0;
for (const p of walk(root)) {
  const t = fs.readFileSync(p, "utf8");
  if (t.startsWith("---")) continue;
  const id = path.basename(path.dirname(p)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  const fm = `---\nname: ${id}\ndescription: Imported skill (adapter Swanwright). Lihat docs/ADAPTERS.md.\n---\n\n`;
  fs.writeFileSync(p, fm + t);
  n++;
}
console.log("adapted", n);
