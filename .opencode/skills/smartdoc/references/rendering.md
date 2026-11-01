# Rendering

Load only after CONTENT_LOCK and only if output is PDF, handwriting, or another binary adapter.

Handwriting is a renderer, not a skill.

```text
CONTENT_LOCKED
→ render page-001.png …
→ visual QA on those images (clipping, overflow, empty pages)
→ assemble PDF
→ structural PDF check
```

`pypdf` does not rasterize pages. Pillow is not a generic PDF rasterizer.

If `HANDWRITING` / `PDF_RENDER` is `NOT_CONFIGURED`, stop and say so. Do not fake a PDF.

If `pdftoppm` exists, optional post-assembly raster QA. Else `POST_PDF_RASTER_QA=NOT_CONFIGURED`.

Deterministic: same content, style, seed → same pages. User fonts stay under the resolved SmartDoc `fonts/` tree; never commit them.

Output: explicit destination, or cwd when the request implies creating a file there. Never overwrite silently. Safe filename + `name-1.pdf` collision behavior unless overwrite was explicit.

Renderer must not change sentences, numbers, facts, citations, or answers.
