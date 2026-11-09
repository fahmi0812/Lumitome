# DESIGN.md — Fixture kontrak interaksi (uji parseBehaviorContract v0.3.31)
Arah: Hangat artisanal
Token:
- #2C1A14 — kopi (teks/heading)
- #A0591E — karamel (aksen/CTA)
- #FFF8F0 — cream (background)
- #FFFFFF — putih (kartu)
Tipografi: Georgia (display), Georgia (body)
Signature: cangkir SVG berasap
Kontrak interaksi:
```behavior-contract
{
  "initial": [
    { "id": "cart-empty", "label": "keranjang kosong saat dimuat", "kind": "text-equals", "selector": "#cart-total-display", "expected": "¥0" }
  ],
  "actions": [
    { "id": "cart-add", "label": "klik + Tambah → total bertambah sebesar harga", "kind": "click-then-text", "click": ".add-service-btn[data-id=\"photowalk\"]", "selector": "#cart-total-display", "expected": "¥12.000" }
  ]
}
```
