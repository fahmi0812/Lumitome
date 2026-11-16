#!/usr/bin/env python3
"""Sensus delegasi /subagent dari DB sesi engine (v0.3.73, eval harness P4).

Baca $LUMI_HOME/data/opencode/opencode.db (SQLite, hanya-baca) dan laporkan
sesi yang BARU muncul sejak snapshot `--before` (daftar id sesi sebelum run):
  - parent: sesi baru tanpa parent_id (bila >1, yang pesan user-nya paling awal)
  - children: sesi baru dengan parent_id == parent; peran dari awalan judul
    "[Thinking] ...", "[Search] ...", "[Builder] ...", "[Reviewer] ..."
  - per sesi: model + agent (dari pesan assistant pertama), selesai atau tidak
    (pesan assistant ber-finish, atau idle outcome=succeeded)
  - parentSubagentCalls: jumlah tool part `subagent` di pesan assistant parent

Hanya stdlib (sqlite3). Tidak pernah crash CLI pemanggil: bila DB tidak ada,
tabel hilang, atau python/sqlite bermasalah, cetak {"census": null, "reason": ...}
dan exit 0. Argumen buruk -> exit 2.

Pakai: python3 harness/role-eval-census.py --db <opencode.db> --before <ids.json>
  --before: file JSON berisi array id sesi sebelum run (boleh kosong/missing -> []).
  --out: bila diisi, tulis JSON hasil ke file itu juga (selain stdout).
"""
import argparse
import json
import re
import sqlite3
import sys

ROLE_RE = re.compile(r"^\[(Thinking|Search|Builder|Reviewer)\]")


def load_before(path):
    if not path:
        return set()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return set(data) if isinstance(data, list) else set()
    except Exception:
        return set()


def msg_data(row):
    try:
        return json.loads(row) if isinstance(row, str) else {}
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--before", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--list-ids", action="store_true",
                    help="hanya cetak {\"ids\": [...]} semua id sesi (untuk snapshot sebelum run)")
    args = ap.parse_args()

    def emit(obj):
        text = json.dumps(obj, ensure_ascii=False)
        if args.out:
            try:
                with open(args.out, "w", encoding="utf-8") as f:
                    f.write(text + "\n")
            except Exception:
                pass
        print(text)
        return 0

    before = load_before(args.before)
    try:
        con = sqlite3.connect("file:%s?mode=ro" % args.db, uri=True)
    except Exception as e:
        return emit({"census": None, "reason": "db tidak bisa dibuka: %s" % e})
    try:
        sessions = {}
        for sid, parent_id, title in con.execute(
            "SELECT id, parent_id, title FROM session_v2"
        ):
            sessions[sid] = {"id": sid, "parentId": parent_id or None, "title": title}
        if args.list_ids:
            return emit({"ids": sorted(sessions)})
        messages = {}
        for sid, typ, data in con.execute(
            "SELECT session_id, type, data FROM session_message ORDER BY seq"
        ):
            messages.setdefault(sid, []).append((typ, msg_data(data)))
    except Exception as e:
        return emit({"census": None, "reason": "query db gagal: %s" % e})
    finally:
        con.close()

    new_ids = [sid for sid in sessions if sid not in before]
    if not new_ids:
        return emit({"census": None, "reason": "tidak ada sesi baru sejak snapshot"})

    def first_user_time(sid):
        for typ, d in messages.get(sid, []):
            if typ == "user" and isinstance(d.get("time"), dict):
                created = d["time"].get("created")
                if isinstance(created, (int, float)):
                    return created
        return float("inf")

    parents = [sid for sid in new_ids if not sessions[sid]["parentId"]]
    if not parents:
        return emit({"census": None, "reason": "sesi baru ada tapi tidak ada parent (parent_id kosong tidak ditemukan)"})
    parent_id = sorted(parents, key=lambda s: (first_user_time(s), s))[0]

    def session_info(sid):
        info = {"id": sid, "title": sessions[sid]["title"], "model": None, "agent": None,
                "completed": False}
        subagent_calls = 0
        for typ, d in messages.get(sid, []):
            if typ == "assistant":
                if info["model"] is None:
                    m = d.get("model")
                    if isinstance(m, dict):
                        info["model"] = m.get("id")
                    elif isinstance(m, str):
                        info["model"] = m
                if info["agent"] is None and isinstance(d.get("agent"), str):
                    info["agent"] = d.get("agent")
                if d.get("finish"):
                    info["completed"] = True
                content = d.get("content")
                if isinstance(content, list):
                    for part in content:
                        if not isinstance(part, dict):
                            continue
                        tool = part.get("tool") or part.get("name")
                        ptype = part.get("type")
                        if ptype in ("tool", "tool-call", "tool_use", "tool-call") and tool == "subagent":
                            subagent_calls += 1
            elif typ == "idle":
                if isinstance(d.get("outcome"), str) and d.get("outcome") == "succeeded":
                    info["completed"] = True
        return info, subagent_calls

    parent_info, parent_calls = session_info(parent_id)
    children = []
    for sid in new_ids:
        if sessions[sid]["parentId"] == parent_id:
            info, _ = session_info(sid)
            m = ROLE_RE.match(info["title"] or "")
            info["role"] = m.group(1).lower() if m else "unknown"
            children.append(info)

    roles_delegated = sorted({c["role"] for c in children if c["role"] != "unknown"})
    roles_completed = sorted({c["role"] for c in children if c["role"] != "unknown" and c["completed"]})
    census = {
        "parentId": parent_id,
        "parentAgent": parent_info["agent"],
        "parentModel": parent_info["model"],
        "parentSubagentCalls": parent_calls,
        "rolesDelegated": roles_delegated,
        "rolesCompleted": roles_completed,
        "children": children,
        "newSessions": len(new_ids),
    }
    return emit({"census": census, "reason": ""})


if __name__ == "__main__":
    sys.exit(main())
