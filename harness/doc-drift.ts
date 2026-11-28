/**
 * Lumitome harness - Doc-Code Drift (arXiv:2610.30571).
 * Deteksi deterministik konvensi dokumen vs kode yang ada → FACT ber-file:baris.
 * Kode/tes > dokumen basi. Menulis ulang kode yang lulus tes demi dokumen → WARN.
 */
import * as fs from "fs";
import * as path from "path";

export interface Convention { id: string; doc: RegExp; code: RegExp; label: string }

/** Pasangan konvensi: dokumen meminta A, kode memakai B. */
export const CONVENTIONS: Convention[] = [
  { id: "print-vs-logging", doc: /\bprint\(\)?/i, code: /^\s*import logging\b|\blogging\.getLogger\(/, label: "dokumen: print, kode: logging" },
  { id: "ospath-vs-pathlib", doc: /\bos\.path\b/, code: /^\s*from pathlib import|\bimport pathlib\b/, label: "dokumen: os.path, kode: pathlib" },
  { id: "format-vs-fstring", doc: /\bf-?strings?\b/i, code: /\.format\(/, label: "dokumen: f-string, kode: str.format" },
  { id: "relative-vs-absolute-import", doc: /\brelative imports?\b|\bimpor relatif\b/i, code: /^\s*from [a-z_][\w.]* import /, label: "dokumen: impor relatif, kode: impor absolut" },
];

function firstLine(text: string, re: RegExp): number {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 0;
}

export interface DriftFinding { id: string; doc: string; code: string; fact: string }

/** Drift versi/angka (P2-2): kanonik = file VERSION; sumber lain harus sama persis.
 * Pasangan in-memory dari scripts/version-check.mjs (yang membaca file dan
 * ditegakkan validate) — logika bandingnya sama, hanya sumber datanya beda
 * (validate jalan di node polos .mjs, detektor ini di harness TS). */
export interface VersionDriftFinding { source: string; version: string; expected: string; fact: string }

export function detectVersionDrift(versions: Record<string, string>): VersionDriftFinding[] {
  const expected = versions["VERSION"];
  if (!expected) return [];
  return Object.entries(versions)
    .filter(([k, v]) => k !== "VERSION" && v !== expected)
    .map(([k, v]) => ({ source: k, version: v, expected, fact: `FACT: drift versi ${k} ${v} vs VERSION ${expected} — samakan ke VERSION` }));
}

export function detectDocCodeDrift(docs: Record<string, string>, code: Record<string, string>): DriftFinding[] {
  const out: DriftFinding[] = [];
  for (const c of CONVENTIONS) {
    const d = Object.entries(docs).map(([f, t]) => [f, firstLine(t, c.doc)] as const).find(([, n]) => n > 0);
    const k = Object.entries(code).map(([f, t]) => [f, firstLine(t, c.code)] as const).find(([, n]) => n > 0);
    if (!d || !k) continue;
    const doc = `${d[0]}:${d[1]}`, cd = `${k[0]}:${k[1]}`;
    out.push({ id: c.id, doc, code: cd, fact: `FACT: drift ${doc} vs ${cd} — ${c.label}; ikuti kode` });
  }
  return out;
}

export function loadProject(root: string): { docs: Record<string, string>; code: Record<string, string> } {
  const docs: Record<string, string> = {};
  const code: Record<string, string> = {};
  // P2-2: detektor dulu hanya membaca AGENTS|CLAUDE|CONTRIBUTING|README.md —
  // drift di ARCHITECTURE.md / docs/*.md / CHANGELOG.md tidak pernah terlihat.
  // Dokumen yang dibaca kini: keempat itu + ARCHITECTURE.md + CHANGELOG.md +
  // semua *.md di bawah docs/ (termasuk PRD.md).
  const isDoc = (rel: string, name: string) =>
    /^(AGENTS|CLAUDE|CONTRIBUTING|README|ARCHITECTURE|CHANGELOG)\.md$/i.test(name)
    || (rel.startsWith(`docs${path.sep}`) && name.endsWith(".md"));
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "packs") continue;
      const p = path.join(d, e.name);
      const rel = path.relative(root, p);
      if (e.isDirectory()) walk(p);
      else if (isDoc(rel, e.name)) docs[rel] = fs.readFileSync(p, "utf8");
      else if (/\.(py|ts|js|mjs)$/.test(e.name) && !/(^|\/)tests?\//.test(rel)) code[rel] = fs.readFileSync(p, "utf8");
    }
  };
  walk(root);
  return { docs, code };
}

/** Kode yang tadinya lulus tes diubah hanya demi dokumen → WARN (bukan blok). */
export function checkRewriteToDocs(input: {
  changedFiles: string[];
  passingBefore: string[];
  reasons?: Record<string, string>;
}): string[] {
  const passing = new Set(input.passingBefore.map((f) => f.replace(/^\.\//, "")));
  return input.changedFiles
    .map((f) => f.replace(/^\.\//, ""))
    .filter((f) => passing.has(f) && /doc|agents\.md|claude\.md|konvensi|readme/i.test(input.reasons?.[f] ?? ""))
    .map((f) => `doc-drift: ${f} lulus tes tapi ditulis ulang demi dokumen — ikuti kode, laporkan drift`);
}

export function driftSection(findings: string[]): string {
  return ["## Doc-Code Drift", ...(findings.length ? findings.map((f) => `- ${f}`) : ["- (tidak ada)"])].join("\n");
}

export interface RepoDocDriftResult {
  ok: boolean;
  findings: Array<{ id: string; fact: string }>;
}

/**
 * Deteksi drift antara fakta kode aktual (engine.mjs, skills-registry.json,
 * mcp-sectors.json, plugins) dan dokumen repo (ARCHITECTURE.md, README.md, docs/PRD.md).
 */
export function detectRepoDocDrift(root = "."): RepoDocDriftResult {
  const findings: Array<{ id: string; fact: string }> = [];
  const readOpt = (rel: string) => {
    try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; }
  };

  const eng = readOpt("lumitome/lib/engine.mjs");
  const inst = readOpt("install.sh");
  const arch = readOpt("ARCHITECTURE.md");
  const readme = readOpt("README.md");
  const prd = readOpt("docs/PRD.md");

  // 1. OC_VERSION drift: engine.mjs vs install.sh & dokumen
  const ocVer = eng?.match(/export const OC_VERSION\s*=\s*"([^"]+)"/)?.[1];
  const instVer = inst?.match(/^OC_VERSION=([0-9.]+)/m)?.[1];
  if (ocVer && instVer && ocVer !== instVer) {
    findings.push({ id: "oc-version-install", fact: `FACT: drift OC_VERSION install.sh (${instVer}) vs engine.mjs (${ocVer})` });
  }
  if (ocVer && arch && !arch.includes(ocVer)) {
    findings.push({ id: "oc-version-arch", fact: `FACT: drift OC_VERSION ARCHITECTURE.md tidak menyebut ${ocVer}` });
  }
  if (ocVer && readme && !readme.includes(ocVer)) {
    findings.push({ id: "oc-version-readme", fact: `FACT: drift OC_VERSION README.md tidak menyebut ${ocVer}` });
  }

  // 2. Skill counts: registry vs ARCHITECTURE.md / README.md / docs/PRD.md
  const regRaw = readOpt("router/skills-registry.json");
  if (regRaw) {
    try {
      const reg = JSON.parse(regRaw);
      const total = Array.isArray(reg.skills) ? reg.skills.length : 0;
      const routable = Array.isArray(reg.skills) ? reg.skills.filter((s: { pack?: string }) => s.pack !== "red-team").length : 0;
      if (total > 0) {
        if (arch && (!arch.includes(String(total)) || !arch.includes(String(routable)))) {
          findings.push({ id: "skill-count-arch", fact: `FACT: drift jumlah skill ARCHITECTURE.md vs registry (${total} total / ${routable} routable)` });
        }
        if (readme && (!readme.includes(String(total)) || !readme.includes(String(routable)))) {
          findings.push({ id: "skill-count-readme", fact: `FACT: drift jumlah skill README.md vs registry (${total} total / ${routable} routable)` });
        }
        if (prd && (!prd.includes(String(total)) || !prd.includes(String(routable)))) {
          findings.push({ id: "skill-count-prd", fact: `FACT: drift jumlah skill docs/PRD.md vs registry (${total} total / ${routable} routable)` });
        }
      }
    } catch { /* abaikan parse error di fixture parsial */ }
  }

  // 3. MCP per sektor: router/mcp-sectors.json vs tabel §3 ARCHITECTURE.md
  const mcpRaw = readOpt("router/mcp-sectors.json");
  if (mcpRaw && arch) {
    try {
      const mcp = JSON.parse(mcpRaw);
      const secMatch = arch.match(/## 3\. MCP per sektor[\s\S]*?(?=\n## |\n*$)/);
      const secBlock = secMatch ? secMatch[0] : "";
      for (const [sector, servers] of Object.entries<string[]>(mcp.sectors || {})) {
        const row = secBlock.split("\n").find((l) => l.startsWith(`| ${sector} `));
        if (!row) {
          findings.push({ id: `mcp-sector-${sector}`, fact: `FACT: drift ARCHITECTURE.md §3 kehilangan baris sektor ${sector}` });
          continue;
        }
        for (const srv of servers) {
          if (!row.includes(srv)) {
            findings.push({ id: `mcp-server-${sector}-${srv}`, fact: `FACT: drift ARCHITECTURE.md §3 sektor ${sector} belum mencantumkan MCP '${srv}'` });
          }
        }
      }
    } catch { /* abaikan parse error */ }
  }

  // 4. Plugin IDs: .opencode/plugins/lumitome-harness.ts vs ARCHITECTURE.md & docs/PRD.md
  const harnessPlugin = readOpt(".opencode/plugins/lumitome-harness.ts");
  const harnessId = harnessPlugin?.match(/\bid\s*:\s*["']([^"']+)["']/)?.[1];
  if (harnessId) {
    if (arch && !arch.includes(harnessId)) {
      findings.push({ id: "plugin-arch", fact: `FACT: drift plugin ID ARCHITECTURE.md tidak menyebut ${harnessId}` });
    }
    if (prd && !prd.includes(harnessId)) {
      findings.push({ id: "plugin-prd", fact: `FACT: drift plugin ID docs/PRD.md tidak menyebut ${harnessId}` });
    }
  }

  return { ok: findings.length === 0, findings };
}
