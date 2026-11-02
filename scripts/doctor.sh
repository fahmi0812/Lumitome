#!/usr/bin/env bash
# Swanwright doctor — cek pemasangan nyata terhadap OpenCode v2 (via opencode serve + HTTP API proyek).
# Wajib (FAIL→exit 1): opencode v2.2.4, node>=22.6, indeks skill FRESH, policy, skill proyek = 86,
#   MCP context7 + codemem + skills connected, plugin swanwright active, agents, skill_search waras.
# Info/WARN: playwright, chromedev, markitdown, 9router.  Pakai: bash scripts/doctor.sh [dir-proyek]
set -uo pipefail
DIR="$(cd "${1:-.}" && pwd)"; cd "$DIR"
[ -f "${SW_HOME:-$HOME/.swanwright}/env.sh" ] && . "${SW_HOME:-$HOME/.swanwright}/env.sh"
FAILS=0; WARNS=0
pass(){ printf '[PASS] %s\n' "$*"; }; fail(){ printf '[FAIL] %s\n' "$*"; FAILS=$((FAILS+1)); }; warn(){ printf '[WARN] %s\n' "$*"; WARNS=$((WARNS+1)); }
OCV="$(opencode --version 2>/dev/null)"; [ "$OCV" = "opencode v2.2.4" ] && pass "$OCV" || fail "opencode v2.2.4 dibutuhkan (dapat: ${OCV:-tidak ada})"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=6)?0:1)' 2>/dev/null && pass "node $(node -v)" || fail "node >= 22.6 dibutuhkan"
command -v codebase-memory-mcp >/dev/null && pass "$(codebase-memory-mcp --version)" || fail "codebase-memory-mcp tidak di PATH"
command -v uvx >/dev/null && pass "uvx ada" || warn "uvx tidak ada (markitdown)"
node --no-warnings scripts/skill-index.mjs --check >/dev/null && pass "indeks skill FRESH (runtime/skills.db)" || { node --no-warnings scripts/skill-index.mjs >/dev/null && pass "indeks skill dibangun ulang (hash berubah)" || fail "indeks skill gagal"; }
node --no-warnings scripts/gen-policy.mjs --check >/dev/null && pass "permissions agent sinkron (gen-policy)" || fail "permissions agent basi → npm run policy"
[ -d .git ] || { git init -q && git -c user.email=doctor@local -c user.name=doctor add -A >/dev/null && git -c user.email=doctor@local -c user.name=doctor commit -qm "swanwright doctor snapshot" && warn "repo git belum ada → dibuat lokal (tanpa remote)"; }

PORT="${PORT:-$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}"
export OPENCODE_PASSWORD="${OPENCODE_PASSWORD:-$(node -e 'console.log(require("crypto").randomBytes(18).toString("hex"))')}"
LOG="$(mktemp)"; opencode serve --port "$PORT" >"$LOG" 2>&1 & SP=$!
trap 'kill $SP 2>/dev/null; wait $SP 2>/dev/null; rm -f "$LOG" "$LOG".*' EXIT
api(){ curl -s -u "opencode:$OPENCODE_PASSWORD" "http://127.0.0.1:$PORT$1?directory=$DIR"; }
for i in $(seq 1 40); do curl -s -o /dev/null -u "opencode:$OPENCODE_PASSWORD" "http://127.0.0.1:$PORT/api/location" && break; sleep 1; done
# indeks skill & MCP dimuat async per-lokasi → poll sampai stabil
S="$LOG.skill"; M="$LOG.mcp"; P="$LOG.plugin"
prev=""; for i in $(seq 1 45); do api /api/skill > "$S"; api /api/mcp > "$M"
  cur="$(node -e 'const f=require("fs"),s=JSON.parse(f.readFileSync(process.argv[1])).data,m=JSON.parse(f.readFileSync(process.argv[2])).data;console.log(s.length+":"+m.map(x=>x.status.status).join(","))' "$S" "$M" 2>/dev/null)"
  case "$cur" in *pending*|*connecting*|*starting*|"") ;; *) [ "$cur" = "$prev" ] && break;; esac; prev="$cur"; sleep 2; done
api /api/plugin > "$P"; opencode debug agents --standalone > "$LOG.agents" 2>&1 || true
DIR="$DIR" node --no-warnings - "$S" "$M" "$P" "$LOG.agents" <<'JS'
const fs=require("fs"),D=process.env.DIR,[S,M,P,AF]=process.argv.slice(2);
const rd=(x)=>JSON.parse(fs.readFileSync(x,"utf8")).data; const sk=rd(S), mcp=rd(M), pl=rd(P), ag=fs.readFileSync(AF,"utf8");
const out=(k,ok,msg)=>console.log(`[${ok?"PASS":k}] ${msg}`); let f=0,w=0;
const proj=sk.filter(s=>s.path.startsWith(D+"/.opencode/skills/"));
out("FAIL",proj.length===86,`skill proyek terlihat OpenCode = ${proj.length} (target 86; total ${sk.length} termasuk builtin)`)||0; if(proj.length!==86)f++;
const bad=proj.filter(s=>/^(api-security|llm-security)$/.test(s.id)); if(bad.length){f++;out("FAIL",false,"api-security/llm-security aktif!");} else out("FAIL",true,"api-security/llm-security tidak aktif");
const st=Object.fromEntries(mcp.map(m=>[m.name,m.status.status]));
const req=["context7","codemem","skills"];
for(const n of req){const ok=st[n]==="connected"; if(!ok)f++; out("FAIL",ok,`MCP ${n}: ${st[n]||"tidak ada"}`);}
for(const n of ["playwright","chromedev","markitdown"]){const ok=st[n]==="connected"; if(!ok)w++; out("WARN",ok,`MCP ${n}: ${st[n]||"tidak ada"} (opsional)`);}
const dis=Object.entries(st).filter(([,v])=>v==="disabled").map(([k])=>k); console.log(`[INFO] MCP disabled (default): ${dis.join(", ")}`);
const sw=pl.find(p=>p.id==="swanwright"); const pok=sw?.state?.status==="active"; if(!pok)f++; out("FAIL",pok,`plugin swanwright: ${sw?.state?.status||"tidak ada"}`);
const miss=["orchestrator","sectors/coding","sectors/finance","sectors/media","sectors/penulisan","sectors/riset","sectors/security","elephant","goldfish","synthesizer"].filter(a=>!ag.includes(`"id": "${a}"`));
if(miss.length)f++; out("FAIL",!miss.length,`agents Swanwright ${10-miss.length}/10${miss.length?" hilang: "+miss:""}`);
fs.writeFileSync(AF+".res",`${f} ${w}`);
JS
F2=1; W2=0; [ -f "$LOG.agents.res" ] && read F2 W2 < "$LOG.agents.res"; FAILS=$((FAILS+F2)); WARNS=$((WARNS+W2)); [ "${SW_DOCTOR_KEEP:-}" ] && cp "$S" "$M" "$P" "$SW_DOCTOR_KEEP"/ 2>/dev/null; rm -f "$LOG.agents" "$LOG.agents.res"
R="$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"skill_search","arguments":{"query":"tdd unit test gagal","k":3}}}' | node --no-warnings router/skill-search-mcp.mjs --sector coding | tail -1)"
echo "$R" | grep -q '"tdd-red-green-refactor"' && pass "skill_search(coding, 'tdd unit test gagal') → tdd-red-green-refactor" || fail "skill_search tidak waras: $R"
U="${SW_9ROUTER_URL:-http://127.0.0.1:20128/v1}"; C=$(curl -s -m 5 -A swanwright-doctor -o /dev/null -w '%{http_code}' "$U" 2>/dev/null); [[ "$C" =~ ^[2-4][0-9][0-9]$ ]] && pass "9router hidup ($U, HTTP $C tanpa auth)" || warn "9router tidak terjangkau ($U) — Layer-1 pakai fallback deterministik"
echo "doctor: ${FAILS} FAIL, ${WARNS} WARN"
[ "$FAILS" = 0 ]
