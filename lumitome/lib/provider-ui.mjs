/**
 * Menu provider Lumitome (layar penuh, Node murni, tanpa dependensi): daftar provider tersimpan + form tambah.
 * Dipakai otomatis saat belum ada provider, dan lewat `lumitome provider`. Linux, macOS, Windows Terminal/PowerShell/cmd.
 * API key ditampilkan sebagai • per karakter (paste didukung, termasuk bracketed paste & CRLF dari Windows).
 */
export const GOLD = { left: "#C9962E", right: "#F3D27A" };
// sama dengan wordmark engine (engine/patches/logo.patch): LUMI + TOME
export const LOGO = {
  left: ["█    █  █ █▀▄▀█ ▀█▀", "█    █  █ █   █  █ ", "▀▀▀▀ ▀▀▀▀ ▀   ▀ ▀▀▀"],
  right: ["▀█▀ █▀▀█ █▀▄▀█ █▀▀▀", " █  █  █ █   █ █▀▀ ", " ▀  ▀▀▀▀ ▀   ▀ ▀▀▀▀"],
};
export const FIELDS = ["type", "name", "baseURL", "key"];
export const TYPES = [["openai", "OpenAI"], ["anthropic", "Anthropic (compatible)"]];

/** Urai potongan input terminal jadi token. Mengenali VT (Linux/macOS/Windows Terminal/conhost VT), bracketed paste, CRLF. */
export function parseKeys(chunk, st = { paste: null }) {
  const out = []; let s = String(chunk), i = 0;
  while (i < s.length) {
    if (st.paste !== null) {
      const end = s.indexOf("\x1b[201~", i);
      if (end < 0) { st.paste += s.slice(i); break; }
      st.paste += s.slice(i, end); out.push({ t: "paste", v: cleanPaste(st.paste) }); st.paste = null; i = end + 6; continue;
    }
    if (s.startsWith("\x1b[200~", i)) { st.paste = ""; i += 6; continue; }
    const c = s[i];
    if (c === "\x1b") {
      const m = /^\x1b(?:\[([0-9;]*)([A-Za-z~])|O([A-Za-z]))/.exec(s.slice(i));
      if (m) {
        const k = m[3] || m[2], n = m[1];
        const name = k === "A" ? "up" : k === "B" ? "down" : k === "C" ? "right" : k === "D" ? "left" : k === "Z" ? "shift-tab"
          : k === "H" ? "home" : k === "F" ? "end" : k === "~" ? ({ 3: "delete", 1: "home", 7: "home", 4: "end", 8: "end" })[(n || "").split(";")[0]] || "unknown" : "unknown";
        out.push({ t: name }); i += m[0].length; continue;
      }
      out.push({ t: "esc" }); i += 1; continue;
    }
    if (c === "\r") { out.push({ t: "enter" }); i += s[i + 1] === "\n" ? 2 : 1; continue; }
    if (c === "\n") { out.push({ t: "enter" }); i++; continue; }
    if (c === "\t") { out.push({ t: "tab" }); i++; continue; }
    if (c === "\x7f" || c === "\b") { out.push({ t: "backspace" }); i++; continue; }
    if (c === "\x03") { out.push({ t: "ctrl-c" }); i++; continue; }
    if (c === "\x15") { out.push({ t: "clear" }); i++; continue; } // Ctrl+U
    if (c === "\x16") { i++; continue; }
    if (c < " ") { i++; continue; }
    // teks biasa: beberapa karakter sekaligus tanpa bracketed paste (paste di cmd/conhost lama) → satu token paste
    let j = i; while (j < s.length && s[j] >= " " && s[j] !== "\x7f" && s[j] !== "\x1b") j++;
    const txt = s.slice(i, j); out.push(txt.length > 1 ? { t: "paste", v: txt } : { t: "char", v: txt }); i = j;
  }
  return out;
}
export const cleanPaste = (v) => String(v).replace(/\r\n?|\n/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim();
export const mask = (v) => "•".repeat([...String(v || "")].length);

export function initState(providers = {}) {
  const list = Object.entries(providers).map(([name, p]) => ({ name, models: (p.models || []).length }));
  return { list, focus: list.length ? "form:name" : "form:name", type: 0, name: "", baseURL: "", key: "", status: null, confirm: null, busy: false, done: false };
}
const focusOrder = (st) => [...st.list.map((_, i) => `list:${i}`), ...FIELDS.map((f) => `form:${f}`)];
function move(st, d) { const o = focusOrder(st); const i = Math.max(0, o.indexOf(st.focus)); st.focus = o[(i + d + o.length) % o.length]; }

/** Reducer murni: (state, token) → aksi {save} | {remove: name} | {exit} | null. State dimutasi. */
export function reduce(st, k) {
  if (k.t === "ctrl-c") { st.done = true; return { exit: true }; }
  if (st.busy) return null;
  if (st.confirm) {
    if (k.t === "char" && /^[yY]$/.test(k.v) || k.t === "enter") { const n = st.confirm; st.confirm = null; return { remove: n }; }
    st.confirm = null; st.status = null; return null;
  }
  if (k.t === "esc") { st.done = true; return { exit: true }; }
  if (k.t === "tab" || k.t === "down") { move(st, 1); return null; }
  if (k.t === "shift-tab" || k.t === "up") { move(st, -1); return null; }
  const [kind, f] = st.focus.split(":");
  if (kind === "list") {
    const row = st.list[Number(f)]; if (!row) return null;
    if (k.t === "delete" || k.t === "enter" || k.t === "backspace" || (k.t === "char" && (k.v === "x" || k.v === "×"))) { st.confirm = row.name; }
    return null;
  }
  if (k.t === "enter") return { save: true };
  if (f === "type") {
    if (k.t === "left" || k.t === "right" || (k.t === "char" && k.v === " ")) st.type = (st.type + 1) % TYPES.length;
    return null;
  }
  if (k.t === "backspace") { st[f] = [...st[f]].slice(0, -1).join(""); return null; }
  if (k.t === "clear") { st[f] = ""; return null; }
  if (k.t === "char" || k.t === "paste") {
    let v = k.t === "paste" ? cleanPaste(k.v) : k.v;
    if (f === "name") v = v.toLowerCase();
    st[f] += v; st.status = null; return null;
  }
  return null;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const fgc = (h) => { const [r, g, b] = hex(h); return `\x1b[38;2;${r};${g};${b}m`; };
const BG = "\x1b[48;2;0;0;0m", RST = "\x1b[0m", DIM = "\x1b[2m", BOLD = "\x1b[1m", REV = "\x1b[7m";
const vlen = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;

/** Bingkai layar (string ANSI). Tanpa kotak/border; terpusat; latar hitam; hanya logo emas. */
export function render(st, cols = 80, rows = 24) {
  const L = [];
  const W = Math.min(64, cols - 4);
  LOGO.left.forEach((l, i) => L.push(`${fgc(GOLD.left)}${l} ${BOLD}${fgc(GOLD.right)}${LOGO.right[i]}${RST}${BG}`));
  L.push("");
  L.push(`${DIM}Provider tersimpan${RST}${BG}`);
  if (!st.list.length) L.push(`${DIM}  (belum ada)${RST}${BG}`);
  st.list.forEach((p, i) => {
    const on = st.focus === `list:${i}`;
    const txt = `${p.name.padEnd(20)} ${String(p.models).padStart(4)} model   ×`;
    L.push(on ? `${REV}› ${txt}${RST}${BG}` : `  ${txt}`);
  });
  if (st.confirm) L.push(`  Hapus '${st.confirm}'? y = ya, tombol lain = batal`);
  L.push(`${DIM}${"─".repeat(W)}${RST}${BG}`);
  L.push(`${DIM}Tambah provider${RST}${BG}`);
  const field = (f, label, val) => {
    const on = st.focus === `form:${f}`;
    return `${on ? "›" : " "} ${label.padEnd(9)} › ${val}${on && f !== "type" ? "█" : ""}`;
  };
  L.push(field("type", "Tipe", TYPES.map(([, n], i) => (i === st.type ? `${BOLD}${n}${RST}${BG}` : `${DIM}${n}${RST}${BG}`)).join(" · ")));
  L.push(field("name", "Nama", st.name));
  L.push(field("baseURL", "Base URL", st.baseURL || (st.focus === "form:baseURL" ? "" : `${DIM}${TYPES[st.type][0] === "anthropic" ? "https://api.example.com" : "http://127.0.0.1:20128/v1"}${RST}${BG}`)));
  const km = mask(st.key); const kshow = vlen(km) > W - 16 ? "…" + km.slice(-(W - 17)) : km;
  L.push(field("key", "API Key", kshow));
  L.push("");
  L.push(st.busy ? `${DIM}… menghubungi server${RST}${BG}` : st.status || "");
  L.push("");
  L.push(`${DIM}Tab pindah · Enter simpan · Del hapus · Esc lewati${RST}${BG}`);
  const top = Math.max(0, Math.floor((rows - L.length) / 2));
  const left = Math.max(0, Math.floor((cols - Math.max(...L.map(vlen))) / 2));
  const lines = [];
  for (let y = 0; y < rows; y++) {
    const l = L[y - top];
    const body = l === undefined ? "" : " ".repeat(left) + l;
    lines.push(`${BG}${body}${" ".repeat(Math.max(0, cols - vlen(body)))}${RST}`);
  }
  return "\x1b[H" + lines.join("\r\n");
}

/** Jalankan menu interaktif. deps: {load, add, remove} dari providers.mjs. Mengembalikan jumlah provider saat keluar. */
export async function run({ home, PV, input = process.stdin, output = process.stdout }) {
  const st = initState(PV.load(home));
  const size = () => [output.columns || 80, output.rows || 24];
  const draw = () => output.write(render(st, ...size()));
  const raw = !!input.isTTY;
  output.write("\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[2J");
  if (raw) input.setRawMode(true);
  input.setEncoding("utf8"); input.resume();
  const ps = { paste: null };
  const onResize = () => { output.write("\x1b[2J"); draw(); };
  output.on?.("resize", onResize);
  draw();
  await new Promise((resolve) => {
    const onData = async (chunk) => {
      for (const k of parseKeys(chunk, ps)) {
        const act = reduce(st, k);
        if (act?.exit) { input.removeListener("data", onData); return resolve(); }
        if (act?.remove) {
          const ok = PV.remove(home, act.remove);
          st.list = st.list.filter((p) => p.name !== act.remove);
          st.status = ok ? `✓ '${act.remove}' dihapus` : `✗ '${act.remove}' tidak ada`;
          st.focus = st.list.length ? `list:0` : "form:name";
        }
        if (act?.save) {
          const type = TYPES[st.type][0];
          st.busy = true; draw();
          try {
            const models = await PV.add(home, { name: st.name.trim(), type, baseURL: st.baseURL.trim(), key: st.key.trim() });
            st.list = st.list.filter((p) => p.name !== st.name.trim()).concat({ name: st.name.trim(), models: models.length });
            st.status = `✓ Terhubung · ${models.length} model terdeteksi`;
            st.name = ""; st.baseURL = ""; st.key = ""; st.focus = "form:name";
          } catch (e) { st.status = `✗ ${String(e.message || e).replace(st.key, "•••")}`; }
          st.busy = false;
        }
      }
      draw();
    };
    input.on("data", onData);
  });
  output.off?.("resize", onResize);
  if (raw) input.setRawMode(false);
  input.pause();
  output.write("\x1b[?2004l\x1b[?25h\x1b[0m\x1b[?1049l");
  return st.list.length;
}

/** Input baris tersamar (•) untuk `lumitome connect` non-menu. Backspace Windows (\b) & Linux (\x7f), paste, CRLF. */
export function askMasked(q, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve) => {
    output.write(q + "\x1b[?2004h"); let buf = ""; const ps = { paste: null };
    const raw = !!input.isTTY; if (raw) input.setRawMode(true); input.setEncoding("utf8"); input.resume();
    const finish = (v) => { input.removeListener("data", on); if (raw) input.setRawMode(false); input.pause(); output.write("\x1b[?2004l\n"); resolve(v); };
    const on = (chunk) => {
      for (const k of parseKeys(chunk, ps)) {
        const r = maskedStep(buf, k);
        if (r.abort) { output.write("\x1b[?2004l\n"); process.exit(130); }
        if (r.done) return finish(r.buf);
        if (r.buf !== buf) { const a = [...buf].length, b = [...r.buf].length; output.write(b < a ? "\b \b".repeat(a - b) : mask(r.buf.slice(buf.length))); buf = r.buf; }
      }
    };
    input.on("data", on);
  });
}
/** Langkah murni untuk input tersamar. */
export function maskedStep(buf, k) {
  if (k.t === "ctrl-c") return { buf, abort: true };
  if (k.t === "enter") return { buf, done: true };
  if (k.t === "backspace") return { buf: [...buf].slice(0, -1).join("") };
  if (k.t === "clear") return { buf: "" };
  if (k.t === "char") return { buf: buf + k.v };
  if (k.t === "paste") return { buf: buf + cleanPaste(k.v) };
  return { buf };
}
