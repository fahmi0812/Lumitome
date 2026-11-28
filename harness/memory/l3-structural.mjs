/**
 * L3 Structural Code Map (M3 / T3.3):
 * Generator INDEX.md ToC murni <= 150 baris (zero narasi LLM) di <ws>/.lumitome/INDEX.md,
 * melengkapi AST call-graph codemem tanpa membakar token konteks.
 */
import fs from "node:fs";
import path from "node:path";

export function generateStructuralIndex(workspace = process.cwd(), { maxLines = 150, writeFile = false } = {}) {
  const ws = path.resolve(workspace);
  const lines = ["# INDEX (Structural Map)", ""];

  // 1) Commands dari package.json (bila ada)
  const pkgPath = path.join(ws, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? Object.entries(pkg.scripts) : [];
      if (scripts.length) {
        lines.push("## Commands");
        for (const [k, v] of scripts.slice(0, 16)) {
          lines.push(`- \`npm run ${k}\`: \`${String(v).slice(0, 80)}\``);
        }
        lines.push("");
      }
    } catch {}
  }

  // 2) Top-level directories & key entrypoints
  lines.push("## Layout");
  try {
    const ents = fs.readdirSync(ws, { withFileTypes: true })
      .filter((e) => !["node_modules", ".git", ".tmp", "dist", "build"].includes(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents.slice(0, 32)) {
      lines.push(`- \`${e.name}${e.isDirectory() ? "/" : ""}\``);
    }
  } catch {}
  lines.push("");

  // 3) Hard boundaries
  lines.push("## Boundaries", "- Secrets: `.env*`, `secrets.env`, `$LUMI_HOME/**` (deny)", "- Scratch: `.tmp/` only (no OS `/tmp`)");

  const cap = Math.max(10, Math.min(150, Number(maxLines) || 150));
  const bounded = lines.slice(0, cap);
  const content = bounded.join("\n") + "\n";
  const outPath = path.join(ws, ".lumitome", "INDEX.md");

  if (writeFile) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, "utf8");
  }

  return {
    path: outPath,
    lineCount: bounded.length,
    content,
    written: Boolean(writeFile),
  };
}
