# Hermes Trading Web UI

Trading customization layered on top of [hermes-webui](https://github.com/nesquena/hermes-webui).
The agent stays text-only — it prints a fenced `hermes` JSON block and the UI
renders it as a live, interactive trading widget. Nothing here changes the
agent runtime; it's a render layer + a skill that teaches the agent the format.

## What was added

| File | Purpose |
|---|---|
| `static/trading.js` | Widget engine. Parses ```hermes JSON specs and renders charts/tables/scorecards. Lazy-loads the chart lib. Computes indicators (SMA/EMA/Bollinger/VWAP/RSI) client-side. |
| `static/trading.css` | Bloomberg-terminal aesthetic + the `terminal` skin (deep near-black, amber accent, green/red semantics, tabular monospace numerics). |
| `static/vendor/lightweight-charts/` | TradingView Lightweight Charts (vendored, Apache-2.0, no build step). |
| `skills/trading-widgets/SKILL.md` | The contract the agent reads: every widget type, fields, and copy-paste examples. |
| `skills/webui-system-management/SKILL.md` | Teaches any agent to start/stop/restart/update this UI server and remember where it lives. |
| `trading-demo.html` | Standalone render check — open it to see all widgets with synthetic data. |

> **Skills are visible & toggleable in the app:** the **Skills** panel (layers
> icon, left rail) lists every installed skill by category with an enable/disable
> switch — `trading-widgets` and `webui-system-management` appear there once
> installed. Install both with the loop in
> [`INSTALL_FOR_AGENTS.md`](INSTALL_FOR_AGENTS.md) step 2.

### Edits to existing files (all mirror the built-in mermaid pipeline)
- `static/ui.js` — fence dispatcher emits a `.hermes-widget` placeholder for ```hermes blocks; sanitizer allowlists the class; paragraph-protection regex preserves it; `postProcessRenderedMessages()` calls `renderHermesWidgets()`.
- `static/index.html` — links `trading.css` + `trading.js`.
- `static/boot.js` — registers the `Terminal` skin in the picker.

## Widget types

`candlestick` · `line`/`area` · `table` · `quote` · `metrics` · `bars`

Full spec and examples: [`skills/trading-widgets/SKILL.md`](skills/trading-widgets/SKILL.md).

Minimal example the agent would emit:

````
```hermes
{"type":"quote","symbol":"RELIANCE","currency":"₹","price":2890.5,"change":34.2,"changePct":1.2}
```
````

## How it flows

1. Agent fetches data (MCP market tools, saved files, prior analysis).
2. Large datasets → save to a file, reference with `"src":"path.json"`.
3. Agent emits one or more ```hermes blocks and narrates the takeaway in prose.
4. UI renders interactive widgets inline in the chat stream.

## Enabling the terminal look

Settings → Appearance → Skin → **Terminal** (pairs best with the Dark theme),
or `/theme terminal` in the composer.

## Demo

```bash
python3 -m http.server 8000        # from repo root
open http://localhost:8000/trading-demo.html
```
