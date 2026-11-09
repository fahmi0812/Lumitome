/**
 * Lumitome pairwise critic — bandingkan dua kandidat desain (v0.3.31 §6).
 * Kritikus membandingkan iterasi sekarang vs sebelumnya di atas:
 * - binary checklist per tugas (satu item per kategori gate + total findings:
 *   kandidat menang item bila findings fail-nya di kategori itu LEBIH
 *   SEDIKIT — seri = 0 untuk keduanya),
 * - DOM bounding box + computed styles di samping screenshot (packet yang
 *   dikirim ke kritikus LLM, dalam DUA urutan presentasi),
 * - agregasi dua urutan: pemenang harus sama di kedua urutan, kalau tidak
 *   hasilnya "tie" (inkonsisten — jangan dipakai).
 *
 * MENGINFORMASIKAN, NEVER-GATE: vonis lolos/gagal tetap milik gate
 * deterministik + behavior gate (harness/design-gate.mjs). Hasil pairwise
 * hanya memberi tahu Maker kandidat mana yang lebih baik dan di mana —
 * tidak pernah mengubah `pass`.
 *
 * Goldens / reference-anchored judging (rank 3 riset): DITUNDA ke v0.3.32
 * (lihat CHANGELOG) — modul ini membandingkan dua kandidat loop, bukan
 * terhadap golden.
 *
 * Pure ESM, zero-dep (selain CDP skill + design-measure/behavior).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Browser } from "../.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { measureAndGate, resolveChromePath, serveLocal } from "./design-measure.mjs";
import { measureAndGateWithBehavior } from "./design-behavior.mjs";

/** Kategori gate yang masuk checklist biner pairwise (per tugas). */
export const PAIRWISE_CATEGORIES = ["contrast", "tap-target", "overflow", "assets", "token-fidelity", "anti-slop", "text-cases", "consistency", "licenses", "behavior", "probe-gagal"];

/**
 * Skor checklist biner dari dua daftar findings.
 * Per kategori: kandidat dengan fail LEBIH SEDIKIT menang item itu (1 poin);
 * seri = 0 keduanya. Item terakhir: total findings (fail saja) lebih sedikit.
 * → {items: [{category, aFails, bFails, winner: "a"|"b"|"tie"}], aWins, bWins, winner}.
 */
export function scoreChecklist(aFindings = [], bFindings = []) {
  const fails = (list, check) => list.filter((f) => f.check === check && f.severity === "fail").length;
  const items = [];
  for (const category of PAIRWISE_CATEGORIES) {
    const a = fails(aFindings, category), b = fails(bFindings, category);
    items.push({ category, aFails: a, bFails: b, winner: a < b ? "a" : b < a ? "b" : "tie" });
  }
  const aTotal = aFindings.filter((f) => f.severity === "fail").length;
  const bTotal = bFindings.filter((f) => f.severity === "fail").length;
  items.push({ category: "total", aFails: aTotal, bFails: bTotal, winner: aTotal < bTotal ? "a" : bTotal < aTotal ? "b" : "tie" });
  const aWins = items.filter((i) => i.winner === "a").length;
  const bWins = items.filter((i) => i.winner === "b").length;
  return { items, aWins, bWins, winner: aWins > bWins ? "a" : bWins > aWins ? "b" : "tie" };
}

// ---------- DOM summary (bbox + computed styles, di samping screenshot) ----------
/* eslint-disable no-undef */
// Fungsi ini jalan DI DALAM browser — tidak boleh import / closure ke scope modul.
export function collectDomInPage() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  const out = [];
  for (const el of document.querySelectorAll("h1,h2,h3,button,a,input,img")) {
    if (out.length >= 60) break;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const label = ((el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("alt") || el.tagName) ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    out.push({
      tag: el.tagName.toLowerCase(),
      label,
      bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
    });
  }
  return out;
}
/* eslint-enable no-undef */

/**
 * Kumpulkan ringkasan DOM (bbox + computed styles) satu halaman.
 * → array elemen (maks 60), atau [] bila Chrome tidak ada (bukan throw).
 */
export async function collectDomSummary(target, { width = 1440, height = 900 } = {}) {
  const chrome = resolveChromePath();
  if (!chrome) return [];
  let url = target, server = null;
  if (!/^https?:\/\//.test(target)) {
    if (!existsSync(resolve(target))) return [];
    ({ server, url } = await serveLocal(target));
  }
  let browser = null;
  try {
    browser = await Browser.launch({
      extraArgs: typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [],
    });
    const page = await browser.newPage({ width, height, dsf: 1 });
    try {
      await page.goto(url, { timeoutMs: 30000, settleMs: 800 });
      return await page.eval(collectDomInPage);
    } finally {
      await page.close();
    }
  } catch {
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
}

/**
 * Packet kritikus untuk satu urutan presentasi: {order, first, second}.
 * Tiap kandidat: {name, screenshots, findings, behavior, dom} — screenshot
 * + findings gate + hasil probe + DOM bbox/computed styles. Kritikus LLM
 * menerima packet ini (bukan kode), dua kali dengan urutan dibalik.
 */
export function buildPairwisePacket(a, b, order = "ab") {
  const first = order === "ba" ? b : a;
  const second = order === "ba" ? a : b;
  const pick = (c) => ({ name: c.name, screenshots: c.screenshots ?? [], findings: c.findings ?? [], behavior: c.behavior ?? null, dom: c.dom ?? [] });
  return { order, first: pick(first), second: pick(second) };
}

/**
 * Bandingkan dua kandidat (file .html lokal / URL) secara pairwise.
 * opts: {nameA, nameB, measureOptsA, measureOptsB, contractA, contractB,
 *   includeDom=true}.
 * Mengukur keduanya (gate + behavior bila ada kontrak + ringkasan DOM),
 * lalu skor checklist di KEDUA urutan presentasi — pemenang harus sama.
 * → {winner: "a"|"b"|"tie", winnerName, aWins, bWins, orderConsistent,
 *      items, packets: {ab, ba}, a: {name, findings, behavior, dom, screenshots},
 *      b: {...}}.
 * TIDAK PERNAH dipakai untuk pass/fail — hanya menginformasikan Maker.
 */
export async function comparePairwise(aTarget, bTarget, opts = {}) {
  const nameA = opts.nameA ?? "A";
  const nameB = opts.nameB ?? "B";
  const measureOne = async (target, name, measureOpts, contract) => {
    const r = contract
      ? await measureAndGateWithBehavior(target, { ...measureOpts, behaviorContract: contract })
      : await measureAndGate(target, measureOpts);
    const dom = opts.includeDom === false ? [] : await collectDomSummary(target);
    return { name, findings: r.findings, behavior: r.behavior ?? null, screenshots: r.screenshots ?? [], dom };
  };
  const a = await measureOne(aTarget, nameA, opts.measureOptsA ?? {}, opts.contractA);
  const b = await measureOne(bTarget, nameB, opts.measureOptsB ?? {}, opts.contractB);
  // Skor checklist deterministik — urutan presentasi tidak mengubah skor,
  // tapi kedua packet tetap dibangun + pemenang dihitung per urutan supaya
  // inkonsistensi (bila logika skor berubah) ketahuan, bukan diam-diam.
  const scoreAB = scoreChecklist(a.findings, b.findings);
  const scoreBA = scoreChecklist(b.findings, a.findings);
  const winnerAB = scoreAB.winner;
  const winnerBA = scoreBA.winner === "a" ? "b" : scoreBA.winner === "b" ? "a" : "tie";
  const orderConsistent = winnerAB === winnerBA;
  const winner = orderConsistent ? winnerAB : "tie";
  return {
    winner,
    winnerName: winner === "a" ? nameA : winner === "b" ? nameB : null,
    aWins: scoreAB.aWins,
    bWins: scoreAB.bWins,
    orderConsistent,
    items: scoreAB.items,
    packets: { ab: buildPairwisePacket(a, b, "ab"), ba: buildPairwisePacket(a, b, "ba") },
    a,
    b,
  };
}
