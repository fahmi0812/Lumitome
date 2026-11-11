/**
 * Swanwright - Doc-Code Drift (arXiv:2610.30571).
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
