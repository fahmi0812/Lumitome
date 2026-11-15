// paths.mjs — penyelesaian path plugin /subagent (v0.3.63).
// Plugin hidup di <root>/lumitome/config/plugins/subagent/ (bukan
// .opencode/plugins/ — lokasi itu TIDAK dimuat wrapper Lumitome, yang
// menyetel OPENCODE_CONFIG_DIR=$LUMI_HOME/config dengan plugins/ disymlink
// dari lumitome/config/plugins; terverifikasi empiris di engine 2.3.0:
// direktori tanpa package.json di plugins/ config TIDAK dimuat, direktori
// DENGAN package.json dimuat). Karena itu preset + agent tetap di root repo,
// bukan di direktori proyek pengguna (ctx.location.directory).
import fs from "node:fs";
import path from "node:path";

export const PRESET_NAME = "lumitome-subagent.json";

/** Root repo dari path file plugin ini (realpath dulu — config dir bisa symlink). */
export function resolveRepoRoot(pluginFilePath) {
  const here = fs.realpathSync(pluginFilePath);
  // <root>/lumitome/config/plugins/subagent/<file> → 5 tingkat ke atas.
  const root = path.resolve(here, "..", "..", "..", "..", "..");
  if (!fs.existsSync(path.join(root, ".opencode", "lumitome-subagent.json"))) {
    throw new Error(
      `tidak bisa menemukan preset ${PRESET_NAME} di ${root} — ` +
        "plugin /subagent harus berada di <root>/lumitome/config/plugins/subagent/",
    );
  }
  return root;
}

/** Path absolut file preset di root repo. */
export function presetPath(root) {
  return path.join(root, ".opencode", PRESET_NAME);
}
