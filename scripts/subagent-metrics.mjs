#!/usr/bin/env node
/**
 * Ringkas metrik delegasi /subagent (v0.3.70) dari JSONL yang ditulis
 * plugin server ke $LUMI_HOME/subagent-metrics.jsonl.
 *
 * Per sesi orchestrator (mode ON): panggilan subagent vs percobaan mutasi
 * (edit/write/patch/shell/execute) vs yang diblokir guard, plus audit
 * akhir giliran (giliran tanpa delegasi = delta.subagent 0).
 * v0.3.76: plus daftar sesi anak (peran + model awal) dari baris
 * `child-session` plugin — bandingkan dengan preset untuk menemukan
 * kebocoran model (LEAK #5/E).
 *
 * Pakai: node scripts/subagent-metrics.mjs [--home <dir>] [--json]
 *   --home: home Lumitome (default $LUMI_HOME atau ~/.lumitome)
 *   --json: keluaran JSON (untuk harness tes), bukan tabel teks.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function metricsPath(home = process.env.LUMI_HOME || path.join(os.homedir(), ".lumitome")) {
  return path.join(home, "subagent-metrics.jsonl");
}

/** Agregasi per sesi dari baris JSONL (baris rusak dilewati, dihitung).
 * v0.3.76 (LEAK #5/E): baris `child-session` (kelahiran sesi anak: peran +
 * model awal) dikumpulkan ke `children` + hitungan per (peran, model) di
 * `childModels` — tanpa ini metrik buta terhadap kebocoran model anak.
 * Bentuk lama {sessions, malformed} dipertahankan (tes lama tetap lolos). */
export function summarize(lines) {
  const sessions = new Map();
  const children = [];
  const childModels = {};
  let malformed = 0;
  const get = (sid) => {
    if (!sessions.has(sid)) sessions.set(sid, { sessionID: sid, agent: "", subagent: 0, mutating: 0, other: 0, blocked: 0, turns: 0, turnsWithoutDelegation: 0 });
    return sessions.get(sid);
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { malformed += 1; continue; }
    if (e.kind === "tool" && typeof e.sessionID === "string") {
      const s = get(e.sessionID);
      s.agent = e.agent || s.agent;
      if (e.toolKind === "subagent") s.subagent += 1;
      else if (e.toolKind === "mutating") s.mutating += 1;
      else s.other += 1;
    } else if (e.kind === "guard-block" && typeof e.sessionID === "string") {
      const s = get(e.sessionID);
      s.agent = e.agent || s.agent;
      s.blocked += 1;
    } else if (e.kind === "turn-end" && typeof e.sessionID === "string") {
      const s = get(e.sessionID);
      s.agent = e.agent || s.agent;
      s.turns += 1;
      if (e.delegated === false) s.turnsWithoutDelegation += 1;
    } else if (e.kind === "child-session" && typeof e.sessionID === "string") {
      // Engine 2.3.0 mengirim session.created DUA kali per sesi anak
      // (baris kembar, timestamp identik — terbukti live 0376): dedupe per
      // sessionID supaya hitungan anak tidak ganda. Switch-nya sendiri
      // idempotent (target sama), jadi duplikasi event tidak berbahaya.
      if (children.some((c) => c.sessionID === e.sessionID)) continue;
      const row = { sessionID: e.sessionID, parentID: e.parentID ?? null, agent: e.agent ?? null, model: e.model ?? null };
      children.push(row);
      if (typeof row.agent === "string" && typeof row.model === "string") {
        const k = `${row.agent}|${row.model}`;
        childModels[k] = (childModels[k] ?? 0) + 1;
      }
    }
  }
  const list = [...sessions.values()].map((s) => ({
    ...s,
    delegationRate: s.subagent + s.mutating + s.blocked === 0 ? null : s.subagent / (s.subagent + s.mutating + s.blocked),
  }));
  return { sessions: list, malformed, children, childModels };
}

export function renderText({ sessions, malformed, children = [], childModels = {} }) {
  if (sessions.length === 0 && children.length === 0) return "subagent-metrics: belum ada data (file kosong / tidak ada).";
  const out = ["sesi orchestrator (mode ON) — subagent | mutasi | diblokir guard | giliran tanpa delegasi"];
  for (const s of sessions) {
    const rate = s.delegationRate === null ? "-" : `${(s.delegationRate * 100).toFixed(0)}%`;
    out.push(`${s.sessionID.slice(0, 8)} ${s.agent || "?"}: ${s.subagent} | ${s.mutating} | ${s.blocked} | ${s.turnsWithoutDelegation}/${s.turns} giliran (delegasi ${rate})`);
  }
  if (children.length) {
    out.push("sesi anak — peran | model awal (bandingkan dengan preset: model lain = bocor)");
    for (const c of children) {
      out.push(`  ${c.agent || "?"}: ${c.model || "(tidak diketahui)"} (induk ${(c.parentID || "?").slice(0, 8)})`);
    }
    const keys = Object.keys(childModels).sort();
    if (keys.length) out.push(`ringkasan peran+model: ${keys.map((k) => `${k.replace("|", " = ")} (x${childModels[k]})`).join(", ")}`);
  }
  if (malformed) out.push(`peringatan: ${malformed} baris rusak dilewati`);
  return out.join("\n");
}

export function cli({ argv = process.argv.slice(2), home, log = console.log } = {}) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const dir = home ?? val("--home") ?? process.env.LUMI_HOME ?? path.join(os.homedir(), ".lumitome");
  const file = metricsPath(dir);
  let lines = [];
  try { lines = fs.readFileSync(file, "utf8").split("\n"); }
  catch { log(`subagent-metrics: file tidak ada (${file}) — belum ada sesi mode ON.`); return 0; }
  const summary = summarize(lines);
  log(argv.includes("--json") ? JSON.stringify(summary, null, 2) : renderText(summary));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(cli());
