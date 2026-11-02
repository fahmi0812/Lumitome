---
name: drawio-diagram
description: Make or edit draw.io (diagrams.net) diagrams — architecture, flowchart, network, cloud (AWS/GCP/Azure icons), ER, sequence, org chart — as .drawio / .drawio.svg files, optionally with the next-ai-draw-io MCP server for a live browser preview. Use when the user asks for a draw.io/diagrams.net diagram, a .drawio file, or to change an existing one.
license: Apache-2.0
metadata:
  version: '1.0'
  swanwright_original_id: dayuanjiang-next-ai-draw-io__drawio-diagram
  swanwright_original_name: drawio-diagram
  swanwright_src: DayuanJiang/next-ai-draw-io
  swanwright_sha: c9dc5f5cc62e7e5a327a62b39027d80033e1548c
---

# draw.io diagrams

Based on [DayuanJiang/next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) @ `c9dc5f5` (Apache-2.0). Upstream ships an MCP server, not a skill; this skill is Lumitome's guide to using it, plus a no-MCP fallback.

## Pick a path

1. **MCP `drawio` is connected** (tools `drawio_*`; turn on with `LUMI_MCP=<defaults>,drawio`): live preview in the browser.
   - `start_session` → read the drawing guide it returns; follow it.
   - `create_new_diagram` with `mxCell` XML; `edit_diagram` to add/update/delete cells by id (all-or-nothing).
   - `get_diagram` / `get_selection` read back the user's hand edits before changing anything.
   - `screenshot_diagram` to check layout yourself; fix overlaps before saying done.
   - `export_diagram` → `.drawio`, `.drawio.svg`, `.png` or `.svg` inside the project. `load_diagram` opens an existing file.
   - Cloud icons: `get_shape_library` (e.g. `aws4`) for the exact style strings.
2. **No MCP**: write the file directly — `<name>.drawio` (plain XML) or `.drawio.svg`. It opens in diagrams.net, the draw.io desktop app, or the VS Code draw.io extension.

## File format (no-MCP path)

```xml
<mxfile host="lumitome"><diagram id="p1" name="Page-1"><mxGraphModel dx="800" dy="600" grid="1" gridSize="10">
  <root>
    <mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="api" value="API" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
    <mxCell id="db" value="DB" style="shape=cylinder3;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="240" y="40" width="80" height="80" as="geometry"/></mxCell>
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="api" target="db"><mxGeometry relative="1" as="geometry"/></mxCell>
  </root></mxGraphModel></diagram></mxfile>
```

Rules: cells `0` and `1` always exist; every id is unique; edges have `source`/`target`; place shapes on a 10 px grid with ≥40 px gaps; one idea per page (`<diagram>`), at most ~25 shapes per page; label edges only when the meaning is not obvious.

## Done

- Base the diagram on the real project (read the code/docs first); do not invent components.
- Check the XML is well-formed (e.g. `xmllint --noout file.drawio`, or `screenshot_diagram` via MCP).
- Report the file path. Do not push or upload it anywhere.
