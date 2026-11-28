/**
 * Context-Stripped Independent Reviewer Packet (M4 / T2.4).
 * Membuang narasi persuasif Builder, self-praise, <think> CoT, dan riwayat chat;
 * hanya meneruskan { spec, diff, facts (ATTESTED/FACT), targetFiles } dalam ukuran terkendali.
 */
import { isValidAttestedRecord, formatAttestedString } from "./witness.mjs";

const DEFAULT_MAX_CHARS = 16000;

const PERSUASIVE_LINE_RE = /^(?:\s*(?:JUDGMENT:|Builder\s*(?:note|claim|summary|explanation|justification)\s*:|Catatan\s*Builder\s*:|Alasan\s*Builder\s*:|Riwayat\s*(?:percakapan|chat)\s*:|Chat\s*history\s*:|Conversation\s*:|Self-check\s*:|Confidence\s*:|I(?:'m| am)\s+(?:100%|very|completely|totally)?\s*(?:confident|sure|certain)|Trust me|Saya\s+yakin|Dijamin\s+(?:aman|lolos|benar)|Percayalah|Everything\s+(?:works|is)\s+perfectly).*)$/gim;

export function stripThinkBlocks(text) {
  return String(text ?? "").replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
}

export function stripBuilderNoise(text) {
  let out = stripThinkBlocks(text);
  // Hapus bagian blok riwayat/narasi eksplisit
  out = out.replace(/^(?:#{1,3}\s*)?(?:Builder\s+Narrative|Narasi\s+Builder|Conversation\s+History|Riwayat\s+Percakapan|Chain\s+of\s+Thought)\b[\s\S]*?(?=\n#{1,3}\s|\s*$)/gim, "");
  // Hapus baris persuasif / self-praise / JUDGMENT
  out = out.replace(PERSUASIVE_LINE_RE, "");
  // Hapus klaim ATTESTED(...) mentah dari teks bebas (anti-spoof)
  out = out.replace(/\bATTESTED\([^)\n]*\)/g, "[STRIPPED_UNVERIFIED_ATTESTED]");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function truncateText(text, maxLen) {
  const s = String(text ?? "");
  if (s.length <= maxLen) return { text: s, truncated: false };
  const suffix = `\n... [truncated ${s.length - maxLen} chars]`;
  const keep = Math.max(0, maxLen - suffix.length);
  return { text: s.slice(0, keep) + suffix, truncated: true };
}

export function buildStrippedReviewPacket({
  spec = "",
  diff = "",
  witnesses = [],
  targetFiles = [],
  facts = [],
  features = [],
  scanFindings = [],
  docDrift = [],
  runLogPointers = [],
  maxChars = DEFAULT_MAX_CHARS,
  // Field berikut sengaja diterima lalu dibuang total (Context Stripping):
  narrative: _narrative,
  builderNarrative: _builderNarrative,
  selfPraise: _selfPraise,
  chainOfThought: _chainOfThought,
  thinking: _thinking,
  chatHistory: _chatHistory,
  conversation: _conversation,
  history: _history,
  messages: _messages,
  judgment: _judgment,
} = {}) {
  const hadNarrativeInput = Boolean(
    _narrative || _builderNarrative || _selfPraise || _chainOfThought || _thinking ||
    _chatHistory || _conversation || _history || _messages || _judgment,
  );

  const cleanSpecRaw = typeof spec === "string"
    ? stripBuilderNoise(spec)
    : stripBuilderNoise(JSON.stringify(spec ?? "", null, 2));

  const normalizedFiles = [];
  const seenFiles = new Set();
  for (const f of Array.isArray(targetFiles) ? targetFiles : []) {
    const s = String(f || "").trim();
    if (s && !seenFiles.has(s)) {
      seenFiles.add(s);
      normalizedFiles.push(s);
    }
  }

  const verifiedFacts = [];
  let droppedWitnessCount = 0;

  for (const w of Array.isArray(witnesses) ? witnesses : []) {
    if (!w || typeof w !== "object") {
      droppedWitnessCount += 1;
      continue;
    }
    if (!isValidAttestedRecord(w) || w.status !== "VALID" || w.exit_code !== 0 || w.masked_exit || w.output_failed) {
      droppedWitnessCount += 1;
      continue;
    }
    const attestedStr = typeof w.attested === "string" && w.attested.startsWith("ATTESTED(")
      ? w.attested
      : formatAttestedString(w);
    const cmdNote = w.command ? ` cmd=${JSON.stringify(String(w.command).slice(0, 120))}` : "";
    verifiedFacts.push(`${attestedStr}${cmdNote}`);
  }

  for (const f of Array.isArray(facts) ? facts : []) {
    const line = stripThinkBlocks(String(f || "")).trim();
    if (!line) continue;
    if (/\bATTESTED\s*\(/.test(line)) {
      // Klaim string ATTESTED(...) tanpa objek runtime ditolak
      droppedWitnessCount += 1;
      continue;
    }
    if (/^FACT:/i.test(line)) {
      verifiedFacts.push(line);
    }
  }

  for (const s of Array.isArray(scanFindings) ? scanFindings : []) {
    const line = stripThinkBlocks(String(s || "")).trim();
    if (line) verifiedFacts.push(`SCAN: ${line}`);
  }
  for (const d of Array.isArray(docDrift) ? docDrift : []) {
    const line = stripThinkBlocks(String(d || "")).trim();
    if (line) verifiedFacts.push(line);
  }
  for (const p of Array.isArray(runLogPointers) ? runLogPointers : []) {
    const line = String(p || "").trim();
    if (line) verifiedFacts.push(`RUN_LOG: ${line}`);
  }

  const cleanFeatures = (Array.isArray(features) ? features : [])
    .filter((f) => f && typeof f === "object")
    .map((f) => ({
      id: String(f.id || ""),
      description: stripBuilderNoise(String(f.description || "")),
      passes: Boolean(f.passes),
      status: String(f.status || (f.passes ? "PASS" : "FAIL")),
    }));

  // Alokasi anggaran karakter terkendali: spec (25%), facts (20%), diff (55%)
  const budget = Math.max(1000, Number(maxChars) || DEFAULT_MAX_CHARS);
  const specRes = truncateText(cleanSpecRaw, Math.floor(budget * 0.3));
  const diffBudget = Math.max(400, budget - specRes.text.length - Math.min(verifiedFacts.join("\n").length, Math.floor(budget * 0.25)));
  const diffRes = truncateText(String(diff ?? ""), diffBudget);

  const packet = {
    spec: specRes.text,
    diff: diffRes.text,
    facts: verifiedFacts,
    targetFiles: normalizedFiles,
    ...(cleanFeatures.length ? { features: cleanFeatures } : {}),
  };

  const serializedLen = JSON.stringify(packet).length;
  packet.meta = {
    strippedNarrative: hadNarrativeInput,
    droppedWitnessCount,
    truncated: specRes.truncated || diffRes.truncated,
    charCount: serializedLen,
    approxTokens: Math.ceil(serializedLen / 4),
  };

  return packet;
}

export function formatStrippedReviewPacket(packet) {
  const p = packet || buildStrippedReviewPacket({});
  const sections = [
    "[CONTEXT-STRIPPED REVIEW PACKET]",
    "Periksa HANYA spec, targetFiles, facts terverifikasi, dan raw diff di bawah ini. Tidak ada narasi Builder.",
    "",
    "## SPEC",
    p.spec || "(kosong)",
    "",
    "## TARGET FILES",
    p.targetFiles?.length ? p.targetFiles.map((f) => `- ${f}`).join("\n") : "(tidak ditentukan)",
    "",
    "## FACTS (ATTESTED / VERIFIED)",
    p.facts?.length ? p.facts.map((f) => `- ${f}`).join("\n") : "(belum ada witness VALID / FACT)",
  ];
  if (p.features?.length) {
    sections.push("", "## FEATURES", ...p.features.map((f) => `- ${f.id} [${f.status}]: ${f.description}`));
  }
  sections.push("", "## DIFF", "```diff", p.diff || "(diff kosong)", "```");
  return sections.join("\n");
}

export function sanitizeReviewerPrompt(prompt, context = {}) {
  if (context && (context.spec !== undefined || context.diff !== undefined || Array.isArray(context.witnesses))) {
    const pkt = buildStrippedReviewPacket({
      spec: context.spec ?? prompt,
      diff: context.diff ?? "",
      witnesses: context.witnesses ?? [],
      targetFiles: context.targetFiles ?? [],
      facts: context.facts ?? [],
      features: context.features ?? [],
      narrative: context.narrative,
      maxChars: context.maxChars,
    });
    return formatStrippedReviewPacket(pkt);
  }
  const cleaned = stripBuilderNoise(String(prompt ?? ""));
  const res = truncateText(cleaned || String(prompt ?? "").trim(), context?.maxChars ?? DEFAULT_MAX_CHARS);
  return res.text;
}
