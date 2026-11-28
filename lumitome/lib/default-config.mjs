/**
 * Single Source of Truth konfigurasi dasar Lumitome (v0.4.0 Wave 0, T0.1).
 *
 * Digunakan bersama oleh build-config.mjs, providers.mjs, dan checkConfigSync()
 * untuk memastikan lumitome/config/opencode.jsonc dan root opencode.jsonc
 * membawa default model, limit, compaction, dan tool_output yang konsisten
 * serta valid terhadap schema OpenCode 2.3.0 (sebelum upgrade 2.4.2).
 *
 * Patuh LINT-002 (tanpa process.exit) & LINT-003 (tanpa console.*).
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MODEL } from "./default-model.mjs";
import { stripJsonc } from "../../router/parse.mjs";

export const DEFAULT_9ROUTER_URL = "http://127.0.0.1:20128/v1";
export const DEFAULT_9ROUTER_MODEL_LIMIT = Object.freeze({ context: 1048576, output: 65536 });
export const DEFAULT_COMPACTION = Object.freeze({ auto: true, keep: Object.freeze({ tokens: 24000 }), buffer: "10%" });
export const DEFAULT_TOOL_OUTPUT = Object.freeze({ max_lines: 400, max_bytes: 16384 });

export function buildDefaultProviderFragment({ baseURL = "{env:LUMI_9ROUTER_URL}", apiKey = "{env:LUMI_KEY_9ROUTER}" } = {}) {
  const modelId = DEFAULT_MODEL.replace(/^9router\//, "");
  return {
    "9router": {
      name: "9router",
      package: "aisdk:@ai-sdk/openai-compatible",
      settings: { baseURL, apiKey },
      models: {
        [modelId]: {
          name: `${modelId} (9router)`,
          limit: { ...DEFAULT_9ROUTER_MODEL_LIMIT },
        },
      },
    },
  };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Verifikasi sinkronisasi field dasar antara lumitome/config/opencode.jsonc dan
 * root opencode.jsonc. Mengembalikan { ok, errors }.
 */
export function checkConfigSync(root = ".") {
  const errors = [];
  const files = {
    runtime: path.join(root, "lumitome", "config", "opencode.jsonc"),
    rootCfg: path.join(root, "opencode.jsonc"),
  };
  const parsed = {};
  for (const [label, file] of Object.entries(files)) {
    try {
      parsed[label] = JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
    } catch (e) {
      errors.push(`${file}: gagal membaca/parse JSONC (${e.message})`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const modelId = DEFAULT_MODEL.replace(/^9router\//, "");
  const wantProv = buildDefaultProviderFragment()["9router"];

  for (const [label, cfg] of Object.entries(parsed)) {
    const file = files[label];
    if (cfg.model !== DEFAULT_MODEL) errors.push(`${file}: model "${cfg.model}" != "${DEFAULT_MODEL}"`);
    if (cfg.default_agent !== "orchestrator") errors.push(`${file}: default_agent "${cfg.default_agent}" != "orchestrator"`);
    const p9 = cfg.providers?.["9router"];
    if (!p9) {
      errors.push(`${file}: providers["9router"] tidak ada`);
      continue;
    }
    if (!sameJson(p9.settings, wantProv.settings)) {
      errors.push(`${file}: providers["9router"].settings ${JSON.stringify(p9.settings)} != ${JSON.stringify(wantProv.settings)}`);
    }
    if (!sameJson(p9.models?.[modelId]?.limit, DEFAULT_9ROUTER_MODEL_LIMIT)) {
      errors.push(`${file}: providers["9router"].models["${modelId}"].limit != ${JSON.stringify(DEFAULT_9ROUTER_MODEL_LIMIT)}`);
    }
    if (!sameJson(cfg.compaction, DEFAULT_COMPACTION)) {
      errors.push(`${file}: compaction ${JSON.stringify(cfg.compaction)} != ${JSON.stringify(DEFAULT_COMPACTION)}`);
    }
    if (!sameJson(cfg.tool_output, DEFAULT_TOOL_OUTPUT)) {
      errors.push(`${file}: tool_output ${JSON.stringify(cfg.tool_output)} != ${JSON.stringify(DEFAULT_TOOL_OUTPUT)}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
