---
name: trading-widgets
description: >
  Render interactive trading visualizations (candlestick & line charts with
  indicators, sortable tables, quote scorecards, KPI metrics, allocation bars)
  in the Hermes Web UI. Use whenever the user asks to SEE market data, a chart,
  a price, an indicator (moving average, RSI, Bollinger, VWAP), a portfolio
  table, allocation breakdown, or any numeric analysis that is clearer visually.
---

# Trading Widgets

The Hermes Web UI renders rich, interactive trading components from a fenced
code block tagged **`hermes`** whose body is a single JSON object. You are a
text harness — you do not draw anything yourself. You just emit the JSON spec
and the UI turns it into a live widget (zoomable charts, sortable tables, etc.).

## The contract

Emit exactly one JSON object per block, fenced with the language `hermes`:

````
```hermes
{"type":"quote","symbol":"RELIANCE","price":2890.5,"change":34.2,"changePct":1.2}
```
````

Rules:
- The block body MUST be valid JSON (double-quoted keys/strings, no trailing commas, no comments).
- One widget per fence. Emit several fences to build a dashboard (e.g. a `metrics` row, then a `candlestick`, then a `table`).
- Prose before/after the block renders normally as markdown — narrate your analysis around the widgets.
- `type` is required. `title` is optional on every widget.

## Two ways to supply data

1. **Inline** — put the data right in the spec (`data`, `series`, `rows`, …). Best for ≤ a few hundred points.
2. **From a file you saved** — set `"src":"relative/path.json"` and the UI fetches it via the media endpoint. Best for large datasets. Save the file first (e.g. `analysis/reliance_1y.json`), then reference it. The file is parsed and merged into the spec: a bare JSON array fills `data` (or `rows` for tables, or `series` for line charts if its objects have a `name`); a JSON object is spread over the spec.

---

## Widget types

### `candlestick` — OHLC chart with indicators + volume
Indicators are computed **client-side** from the closes — you only send OHLC and which indicators you want.

```hermes
{
  "type":"candlestick",
  "title":"RELIANCE · 1D",
  "symbol":"RELIANCE",
  "volume":true,
  "data":[
    {"time":"2026-06-10","open":2840,"high":2875,"low":2832,"close":2868,"volume":4200000},
    {"time":"2026-06-11","open":2868,"high":2902,"low":2860,"close":2890,"volume":5100000}
  ],
  "indicators":[
    {"type":"sma","period":30,"label":"SMA 30"},
    {"type":"ema","period":9},
    {"type":"bbands","period":20,"mult":2},
    {"type":"vwap"}
  ]
}
```
- `data[]`: `time` (`YYYY-MM-DD` or unix seconds), `open`,`high`,`low`,`close`, optional `volume`.
- `indicators[]` `type`: `sma`/`ma`, `ema`, `bbands`/`bollinger` (with `mult`, default 2), `vwap`. Each takes a `period` and optional `color`/`label`.
- `volume:true` draws a volume histogram pane. `height` optional (default 360).

### `line` / `area` — line chart (moving averages, equity curve, comparisons)
One or many series on a shared time axis.

```hermes
{
  "type":"line",
  "title":"NIFTY — Price vs 30D MA",
  "series":[
    {"name":"Close","data":[{"time":"2026-06-10","value":23410},{"time":"2026-06-11","value":23560}]},
    {"name":"MA 30","color":"#f5a623","data":[{"time":"2026-06-10","value":23200},{"time":"2026-06-11","value":23250}]}
  ]
}
```
Use `"type":"area"` for a filled single series (good for portfolio value over time). Point fields: `time`+`value` (or `x`+`y`).

### `table` — sortable data table
```hermes
{
  "type":"table",
  "title":"Holdings",
  "columns":[
    {"key":"sym","label":"Symbol"},
    {"key":"qty","label":"Qty","numeric":true,"decimals":0},
    {"key":"ltp","label":"LTP","numeric":true,"prefix":"₹"},
    {"key":"pnl","label":"P&L","numeric":true,"delta":true,"prefix":"₹"},
    {"key":"wt","label":"Weight","numeric":true,"suffix":"%","bar":true}
  ],
  "rows":[
    {"sym":"RELIANCE","qty":10,"ltp":2890.5,"pnl":1234.5,"wt":32},
    {"sym":"TCS","qty":5,"ltp":3920.0,"pnl":-410.0,"wt":18}
  ]
}
```
Column flags: `numeric` (right-align, tabular), `delta` (green/red + sign for +/−), `bar` (inline magnitude bar), `prefix`/`suffix`, `decimals`, `align`. Columns auto-infer from rows if omitted. Click headers to sort.

### `quote` — single-instrument price scorecard
```hermes
{
  "type":"quote","symbol":"AAPL","name":"Apple Inc.","currency":"$",
  "price":228.34,"change":3.12,"changePct":1.38,
  "stats":[{"label":"Open","value":"225.10"},{"label":"Day High","value":"229.40"},
           {"label":"Vol","value":"48.2M"},{"label":"P/E","value":"31.2"}]
}
```
Sign of `change` drives the up/down color. `stats[]` is an optional key-value grid.

### `metrics` — KPI scorecard row
```hermes
{"type":"metrics","items":[
  {"label":"Net Worth","value":"₹12.4L","delta":2.1},
  {"label":"Day P&L","value":"+₹3,200","delta":1.4},
  {"label":"Invested","value":"₹10.0L"},
  {"label":"XIRR","value":"18.6%","delta":0.0}
]}
```
`delta` (optional, percent) renders green/red.

### `bars` — horizontal bar / allocation breakdown
```hermes
{"type":"bars","title":"Sector Allocation","suffix":"%","data":[
  {"label":"IT","value":32},{"label":"Banking","value":28},
  {"label":"Energy","value":21},{"label":"FMCG","value":19}
]}
```
`colorBySign:true` colors negative values red (good for sector returns). Per-bar `color` allowed.

---

## How to choose

| User wants… | Widget |
|---|---|
| Price action, candles, "show me the chart" | `candlestick` |
| A moving average / RSI line / equity curve / compare two series | `line` (or `area`) |
| A specific overlay (30D MA, EMA, Bollinger, VWAP) on candles | `candlestick` + `indicators` |
| "What's X trading at" | `quote` |
| Portfolio / screener / option chain rows | `table` |
| Top-line numbers (net worth, P&L, XIRR) | `metrics` |
| Allocation / weights / sector split | `bars` |

## Workflow

1. Fetch/compute the data with whatever tools you have (MCP market-data tools, saved files, prior analysis).
2. If the dataset is large, save it to a file and reference it with `src`.
3. Emit the `hermes` block(s).
4. Narrate the takeaway in prose around the widgets — the chart shows, your words explain.

Keep it honest: only plot data you actually have. Never fabricate OHLC or prices to fill a chart.
