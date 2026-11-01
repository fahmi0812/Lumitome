---
name: eval-harness
description: Requires a named eval set and a pass rule before an agent or prompt change is trusted.
metadata:
  swanwright_original_id: swanwright__eval-harness
  swanwright_original_name: Eval Harness
---

# Eval Harness

Source: https://github.com/affaan-m/ECC
Pin: 90606c8315ee09cafc303515c5f33024db6b9882
Commit-Date: 2026-10-20
License: MIT. Path .agents/skills/eval-harness. Local summary, not a vendored copy.

## Tujuan

Menolak perubahan agen atau prompt yang tidak punya set eval dan aturan lulus.

## Kapan dipakai

Pakai sebelum mempercayai perubahan rute, prompt, atau skill. Bukan pengganti tes unit kode.

## Langkah

1. Namai set kasus dan ambang lulus sebelum mengubah prompt.
2. Jalankan set yang sama sebelum dan sesudah perubahan.
3. Catat kasus yang jatuh, jangan hanya rata-rata.
4. Jika model live tidak ada, tandai eval itu tidak dijalankan. Jangan dikarang hijau.
5. Gate default repo tetap ci/run-gates.mjs, bukan eval ini.

## Input / output

Input: perubahan dan set kasus. Output: sebelum/sesudah, atau status not-run.

## Batasan

Tidak memanggil model baru. Tidak mengklaim promptfoo hijau tanpa dijalankan.
