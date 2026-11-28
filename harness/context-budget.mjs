/**
 * Context Budget & Cache-Aligned Prompt Assembly (M3 / T3.1 + T3.4).
 * - Static Prefix vs Dynamic Suffix separation dengan prefix_sha256 stabil lintas turn.
 * - Secret scrubbing (API key, Bearer token, private key, .env values) sebelum tulis disk/konteks.
 * - Tool output offload (> threshold char) ke <ws>/.tmp/run_logs/<runId>.log dengan ringkasan pendek.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function sanitizeSeg(value, fallback = "run") {
  const s = String(value ?? "").replace(/[^A-Za-z0-9._-]/g, "_");
  return s || fallback;
}

/**
 * Scrub rahasia (API key, Bearer token, private key PEM, nilai .env) sebelum ditulis ke log/memori/konteks.
 */
export function scrubSecrets(text) {
  let out = String(text ?? "");
  if (!out) return out;
  // 1) PEM private keys (multiline)
  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED:PRIVATE_KEY]",
  );
  // 2) Authorization Bearer / Basic headers
  out = out.replace(
    /\b(Bearer|Basic)\s+(?!\[REDACTED)(?:[A-Za-z0-9._~+/=-]{8,})/gi,
    (_, scheme) => `${scheme} [REDACTED:TOKEN]`,
  );
  // 3) Token/key ber-prefix dikenal
  out = out.replace(/\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{12,}\b/g, "[REDACTED:API_KEY]");
  out = out.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, "[REDACTED:GITHUB_TOKEN]");
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, "[REDACTED:GITHUB_TOKEN]");
  out = out.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED:API_KEY]");
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED:SLACK_TOKEN]");
  out = out.replace(/\bfigd_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED:FIGMA_TOKEN]");
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED:AWS_KEY]");
  // 4) Nilai variabel .env / assignment sensitif (KEY=val atau KEY: val)
  out = out.replace(
    /(\b(?:NINEROUTER_API_KEY|LUMI_KEY_[A-Z0-9_]+|LUMI_9ROUTER_KEY|[A-Z][A-Z0-9_]*(?:_API_KEY|_SECRET_KEY|_ACCESS_TOKEN|_AUTH_TOKEN|_PRIVATE_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_KEY))\s*[:=]\s*)(["']?)(?!\[REDACTED)([^\s"'\n\r;]{4,})\2/g,
    "$1$2[REDACTED:ENV]$2",
  );
  return out;
}

function normalizePart(part) {
  if (part == null) return "";
  if (typeof part === "string") return part.replace(/\r\n/g, "\n").trim();
  if (typeof part === "object") {
    const label = part.name ?? part.label ?? "";
    const content = String(part.content ?? part.text ?? "").replace(/\r\n/g, "\n").trim();
    if (!content) return "";
    return label ? `<!-- ${String(label).trim()} -->\n${content}` : content;
  }
  return String(part).trim();
}

/**
 * Susun prompt selaras KV-cache:
 * - staticPrefixParts digabung secara deterministik tanpa timestamp/nonce dinamis -> prefix_sha256 stabil.
 * - dynamicSuffixParts dipisah ke bagian akhir dan dibatasi maxSuffixChars.
 */
export function assembleCacheAlignedPrompt({
  staticPrefixParts = [],
  dynamicSuffixParts = [],
  maxSuffixChars = 8000,
} = {}) {
  const staticList = (Array.isArray(staticPrefixParts) ? staticPrefixParts : [staticPrefixParts])
    .map(normalizePart)
    .filter(Boolean);
  const staticPrefix = staticList.join("\n\n");
  const prefix_sha256 = sha256Hex(staticPrefix);

  const suffixList = (Array.isArray(dynamicSuffixParts) ? dynamicSuffixParts : [dynamicSuffixParts])
    .map(normalizePart)
    .filter(Boolean);
  let dynamicSuffix = suffixList.join("\n\n");
  let suffixTruncated = false;

  if (Number.isFinite(maxSuffixChars) && maxSuffixChars > 0 && dynamicSuffix.length > maxSuffixChars) {
    suffixTruncated = true;
    const marker = "\n...[suffix truncated]...\n";
    if (maxSuffixChars <= marker.length + 16) {
      dynamicSuffix = dynamicSuffix.slice(dynamicSuffix.length - maxSuffixChars);
    } else {
      const budget = maxSuffixChars - marker.length;
      const headLen = Math.floor(budget * 0.35);
      const tailLen = budget - headLen;
      dynamicSuffix = dynamicSuffix.slice(0, headLen) + marker + dynamicSuffix.slice(dynamicSuffix.length - tailLen);
    }
  }

  const prompt = dynamicSuffix
    ? (staticPrefix ? `${staticPrefix}\n\n${dynamicSuffix}` : dynamicSuffix)
    : staticPrefix;

  return {
    staticPrefix,
    dynamicSuffix,
    prefix_sha256,
    prefixChars: staticPrefix.length,
    suffixChars: dynamicSuffix.length,
    suffixTruncated,
    prompt,
  };
}

/**
 * Offload output besar (> threshold char) ke <workspaceRoot>/.tmp/run_logs/<runId>.log
 * setelah secret scrubbing. Mengembalikan ringkasan pendek (head + tail + pointer + byte_size + sha256).
 */
export function offloadLargeOutput(
  output,
  {
    workspaceRoot = process.cwd(),
    runId = "run",
    callId = "",
    threshold = 500,
    scrub = true,
  } = {},
) {
  const raw = String(output ?? "");
  const cleaned = scrub ? scrubSecrets(raw) : raw;
  const byte_size = Buffer.byteLength(cleaned, "utf8");
  const sha256 = sha256Hex(cleaned);

  if (cleaned.length <= threshold) {
    return {
      offloaded: false,
      summary: cleaned,
      logPath: null,
      relPath: null,
      byte_size,
      sha256,
      originalLength: raw.length,
      scrubbed: Boolean(scrub),
    };
  }

  const ws = path.resolve(workspaceRoot);
  const safeRun = sanitizeSeg(runId, "run");
  const safeCall = callId ? sanitizeSeg(callId, "") : "";
  const logPath = safeCall
    ? path.join(ws, ".tmp", "run_logs", safeRun, `${safeCall}.log`)
    : path.join(ws, ".tmp", "run_logs", `${safeRun}.log`);

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, cleaned, "utf8");

  const relPath = path.relative(ws, logPath).split(path.sep).join("/");
  const meta = `\n[offload: ${relPath} | bytes=${byte_size} | sha256=${sha256}]`;
  const avail = Math.max(0, threshold - meta.length);

  let snippet = "";
  if (avail >= 24) {
    const errLines = cleaned
      .split("\n")
      .filter((l) => /\b(error|fail|failed|exception|traceback|assertionerror|enoent|denied)\b/i.test(l))
      .slice(0, 2)
      .join(" | ")
      .slice(0, Math.floor(avail * 0.28));
    const sep = errLines ? `\n... [ERR: ${errLines}] ...\n` : "\n...\n";
    const bodyBudget = Math.max(0, avail - sep.length);
    const headLen = Math.ceil(bodyBudget * 0.5);
    const tailLen = Math.max(0, bodyBudget - headLen);
    snippet = cleaned.slice(0, headLen) + sep + (tailLen > 0 ? cleaned.slice(cleaned.length - tailLen) : "");
  } else if (avail > 0) {
    snippet = cleaned.slice(0, avail);
  }

  let summary = snippet + meta;
  if (summary.length > threshold && threshold >= meta.length) {
    const cut = threshold - meta.length;
    summary = snippet.slice(0, Math.max(0, cut)) + meta;
  }

  return {
    offloaded: true,
    summary,
    logPath,
    relPath,
    byte_size,
    sha256,
    originalLength: raw.length,
    scrubbed: Boolean(scrub),
  };
}
