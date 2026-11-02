/**
 * Branding Lumitome untuk wrapper (BUKAN patch engine — binary OpenCode tetap terpin SHA256).
 * Palet = brand kit assets/brand (logo.svg / banner.svg / generate.py): white-gold → champagne → bronze.
 * Mode warna: truecolor (COLORTERM / Windows Terminal) → 256 warna → polos (NO_COLOR, non-TTY, TERM=dumb).
 */
export const PALETTE = ["#FFF8DC", "#FFF4C8", "#F3D27A", "#E8C266", "#D4AF5A", "#C9962E", "#B8892A", "#9C6F17"];
export const TITLE = "Lumitome";
const WORD = [
  "█    █  █ █▀▄▀█ █ ▀█▀ █▀▀█ █▀▄▀█ █▀▀▀",
  "█    █  █ █ ▀ █ █  █  █  █ █ ▀ █ █▀▀ ",
  "▀▀▀▀ ▀▀▀▀ ▀   ▀ ▀  ▀  ▀▀▀▀ ▀   ▀ ▀▀▀▀",
];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function colorMode(env = process.env, isTTY = !!process.stderr.isTTY) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (env.FORCE_COLOR === "0") return "none";
  if (!isTTY && !env.FORCE_COLOR) return "none";
  if (env.TERM === "dumb") return "none";
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM || "") || env.WT_SESSION || env.TERM_PROGRAM === "vscode" || env.FORCE_COLOR === "3") return "truecolor";
  if (process.platform === "win32") return "truecolor"; // Windows 10+ conhost/WT mendukung VT truecolor
  return "256";
}
const to256 = ([r, g, b]) => 16 + 36 * Math.round(r / 51) + 6 * Math.round(g / 51) + Math.round(b / 51);
function lerp(t) {
  const x = Math.max(0, Math.min(1, t)) * (PALETTE.length - 1), i = Math.min(PALETTE.length - 2, Math.floor(x)), f = x - i;
  const a = rgb(PALETTE[i]), b = rgb(PALETTE[i + 1]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}
const fg = (c, mode) => mode === "truecolor" ? `\x1b[38;2;${c[0]};${c[1]};${c[2]}m` : `\x1b[38;5;${to256(c)}m`;
/** Banner gradasi (diagonal white-gold → champagne → bronze). Tanpa background → aman di terminal gelap & terang. */
export function banner({ mode = colorMode(), version = "", tagline = "The book of light for your AI agent" } = {}) {
  const sub = `${tagline}${version ? `  ·  v${version}` : ""}`;
  if (mode === "none") return `${WORD.join("\n")}\n${sub}\n`;
  const w = WORD[0].length, out = [];
  WORD.forEach((line, y) => {
    let s = "\x1b[1m";
    for (let x = 0; x < line.length; x++) s += line[x] === " " ? " " : fg(lerp((x / w) * 0.8 + (y / WORD.length) * 0.2), mode) + line[x];
    out.push(s + "\x1b[0m");
  });
  out.push(`${fg(rgb("#C9962E"), mode)}\x1b[3m${sub}\x1b[0m`);
  return out.join("\n") + "\n";
}
/** OSC 0 judul jendela/tab (xterm, GNOME, iTerm2, Windows Terminal, PowerShell/conhost). */
export const titleSeq = (t = TITLE) => `\x1b]0;${String(t).replace(/[\x00-\x1f\x7f]/g, "")}\x07`;
/** Default UI engine (cli.json terisolasi): theme lumitome + engine tidak menimpa judul "Lumitome". Kunci milik user dihormati. */
export function seedCliConfig(cur) {
  const c = cur && typeof cur === "object" && !Array.isArray(cur) ? { ...cur } : {};
  let changed = false;
  if (!c.theme || typeof c.theme !== "object" || !c.theme.name) { c.theme = { ...(c.theme || {}), name: "lumitome" }; changed = true; }
  if (!c.terminal || typeof c.terminal !== "object" || c.terminal.title === undefined) { c.terminal = { ...(c.terminal || {}), title: false }; changed = true; }
  return { config: c, changed };
}
