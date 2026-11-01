/**
 * Swanwright plugin — API plugin OpenCode V2 (https://opencode.ai/v2/docs/build/plugins/migrate-v1/).
 * Default export definisi { id, setup(ctx) }; hook didaftarkan via ctx.tool.hook("execute.before").
 * `Plugin.define` di @opencode/plugin 2.2.4 adalah fungsi identitas, jadi objek polos setara dan
 * paket tidak butuh dependensi runtime (hanya import tipe, dihapus saat transpile).
 */
import type { Plugin } from "@opencode/plugin";

export const PUSH_MAIN = /\bgit\s+push\b[^\n;&|]*\b(main|master)\b|\bgit\s+push\b[^\n;&|]*:\s*(main|master)\b/i;
/** v0.1.6: `codebase-memory-mcp install|update` menulis config ~45 klien agen → dilarang; daftarkan manual di opencode.jsonc. */
export const CBM_INSTALL = /\bcodebase-memory-mcp\s+(install|update)\b/i;
const SHELL_TOOLS = new Set(["shell", "bash"]);

export function guardPushMain(event: { tool: string; input: unknown }): void {
  if (!SHELL_TOOLS.has(event.tool)) return;
  const cmd = String((event.input as { command?: unknown } | null)?.command ?? "");
  if (PUSH_MAIN.test(cmd)) {
    throw new Error("Swanwright: dilarang git push ke main/master. Kerja di branch; Fahmi membuka PR sendiri.");
  }
  if (CBM_INSTALL.test(cmd)) {
    throw new Error("Swanwright: jangan jalankan `codebase-memory-mcp install/update` (menulis config banyak klien). Server sudah terdaftar manual (codemem).");
  }
}

const plugin = {
  id: "swanwright",
  async setup(ctx: { tool: { hook: (name: "execute.before", fn: (event: { tool: string; input: unknown }) => void) => Promise<unknown> } }) {
    await ctx.tool.hook("execute.before", guardPushMain);
  },
};

export default plugin as unknown as ReturnType<typeof Plugin.define>;
