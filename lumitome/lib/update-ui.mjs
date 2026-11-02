/**
 * Tampilan `lumitome update`: logo LUMITOME emas (hanya logo berwarna), satu baris status yang diperbarui di tempat
 * dengan spinner, lalu satu baris hasil. Non-TTY / CI: baris polos tanpa animasi & tanpa ANSI.
 * Glyph ASCII bila konsol Windows bukan UTF-8 (sama dengan layar provider) atau LUMI_ASCII=1.
 */
import { LOGO, GOLD, pickGlyphs, UNI } from "./provider-ui.mjs";

export const FRAMES_UNI = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const FRAMES_ASCII = ["|", "/", "-", "\\"];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const fg = (h) => { const [r, g, b] = rgb(h); return `\x1b[38;2;${r};${g};${b}m`; };
const RST = "\x1b[0m", DIM = "\x1b[2m", HIDE = "\x1b[?25l", SHOW = "\x1b[?25h", CLR = "\r\x1b[2K";

/** Mode tampilan: {tty, color, ascii}. */
export function uiMode({ env = process.env, isTTY = !!process.stderr.isTTY, platform = process.platform, codepage = null } = {}) {
  const tty = isTTY && env.TERM !== "dumb" && !env.CI;
  const color = tty && !(env.NO_COLOR !== undefined && env.NO_COLOR !== "");
  const G = pickGlyphs(env, platform, codepage);
  return { tty, color, ascii: G !== UNI };
}

export function createUI({ out = process.stderr, mode = uiMode(), interval = 80, now = () => Date.now() } = {}) {
  const frames = mode.ascii ? FRAMES_ASCII : FRAMES_UNI;
  const ok = mode.ascii ? "OK" : "✓", bad = mode.ascii ? "x" : "✗", ell = mode.ascii ? "..." : "…";
  let timer = null, word = "", i = 0, live = false, logoShown = false;
  const w = (s) => out.write(s);
  const gold = (s, h) => (mode.color ? `${fg(h)}${s}${RST}` : s);
  const dim = (s) => (mode.color ? `${DIM}${s}${RST}` : s);
  const draw = () => { w(`${CLR}${gold(frames[i % frames.length], GOLD.right)} ${word}${dim(ell)}`); i++; };
  const clear = () => { if (timer) { clearInterval(timer); timer = null; } if (live) { w(CLR); live = false; } };
  return {
    mode,
    logo() {
      if (logoShown) return; logoShown = true;
      if (!mode.tty) return; // CI/log: tanpa logo
      w("\n");
      if (mode.ascii) w(`  ${gold("L U M I ", GOLD.left)}${gold("T O M E", GOLD.right)}\n\n`);
      else { LOGO.left.forEach((l, k) => w(`  ${gold(l, GOLD.left)} ${gold(LOGO.right[k], GOLD.right)}\n`)); w("\n"); }
    },
    step(next) {
      word = next;
      if (!mode.tty) { w(`${next}${ell}\n`); return; }
      if (!live) { w(HIDE); live = true; }
      draw();
      if (!timer) { timer = setInterval(draw, interval); timer.unref?.(); }
    },
    done(msg) { clear(); w(`${mode.tty ? `  ${gold(ok, GOLD.right)} ` : ""}${msg}\n`); if (mode.tty) w(SHOW); },
    calm(msg) { clear(); w(`${mode.tty ? "  " : ""}${msg}\n`); if (mode.tty) w(SHOW); },
    fail(msg, hint) { clear(); w(`${mode.tty ? `  ${bad} ` : ""}${msg}\n`); if (hint) w(`${mode.tty ? "    " : ""}${dim(hint)}\n`); if (mode.tty) w(SHOW); },
    stop() { clear(); if (mode.tty) w(SHOW); },
    /** frame ke-n (untuk bukti/tes) */
    frame(n, s) { return `${frames[n % frames.length]} ${s}${ell}`; },
  };
}
