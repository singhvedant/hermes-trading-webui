/* ──────────────────────────────────────────────────────────────────────────
 * Hermes Trading Widgets
 * ---------------------------------------------------------------------------
 * Renders interactive trading visualizations from fenced ```hermes blocks the
 * agent emits in chat. Hermes is a text-only harness, so the contract is:
 * the agent prints a fenced code block tagged `hermes` whose body is a JSON
 * spec, and this module turns that spec into a live chart / table / scorecard.
 *
 * The JSON spec body is carried as the escaped textContent of a
 * <div class="hermes-widget"> placeholder (the same mechanism mermaid uses),
 * so there is no HTML-attribute encoding to worry about and nothing the spec
 * contains can become live markup.
 *
 * Data may be inline (`data` / `series` / `rows`) or pulled from a file the
 * agent saved (`src`), fetched through the existing /api/media?path= endpoint.
 *
 * Charts use TradingView Lightweight Charts (vendored, Apache-2.0), lazily
 * loaded the first time a chart widget appears — mirroring the mermaid loader.
 * Tables, quotes, bars and metric scorecards are dependency-free DOM.
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var LWC_SRC = 'static/vendor/lightweight-charts/4.2.3/lightweight-charts.standalone.production.js';
  var _lwcReady = false;
  var _lwcLoading = false;
  var _lwcWaiters = [];

  function loadCharts(cb) {
    if (_lwcReady && window.LightweightCharts) { cb(); return; }
    _lwcWaiters.push(cb);
    if (_lwcLoading) return;
    _lwcLoading = true;
    var s = document.createElement('script');
    s.src = LWC_SRC;
    s.onload = function () {
      _lwcReady = true;
      var w = _lwcWaiters.slice(); _lwcWaiters.length = 0;
      w.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    };
    s.onerror = function () {
      _lwcLoading = false;
      var w = _lwcWaiters.slice(); _lwcWaiters.length = 0;
      w.forEach(function (fn) { try { fn(new Error('chart library failed to load')); } catch (e) {} });
    };
    document.head.appendChild(s);
  }

  /* ── theme: pull palette from CSS vars so charts track the active skin ── */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = (v || '').trim();
    return v || fallback;
  }
  function palette() {
    return {
      up: cssVar('--tw-up', '#26a17b'),
      down: cssVar('--tw-down', '#e0524a'),
      text: cssVar('--tw-axis', '#8b93a7'),
      grid: cssVar('--tw-grid', 'rgba(255,255,255,0.05)'),
      bg: 'transparent',
      accent: cssVar('--accent', '#f5a623'),
      ind: ['#f5a623', '#4aa3ff', '#c678dd', '#56b6c2', '#e5c07b']
    };
  }

  /* ── number / time helpers ── */
  function fmtNum(n, opts) {
    if (n == null || isNaN(n)) return '—';
    opts = opts || {};
    var abs = Math.abs(n);
    if (opts.compact && abs >= 1000) {
      var units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
      for (var i = 0; i < units.length; i++) {
        if (abs >= units[i][1]) return (n / units[i][1]).toFixed(2).replace(/\.00$/, '') + units[i][0];
      }
    }
    var d = opts.decimals != null ? opts.decimals : (abs < 10 ? 2 : abs < 1000 ? 2 : 2);
    return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function toTime(t) {
    if (typeof t === 'number') return t;            // unix seconds or business-day epoch
    if (typeof t === 'string') {
      // 'YYYY-MM-DD' is consumed natively by lightweight-charts
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
      var ms = Date.parse(t);
      if (!isNaN(ms)) return Math.floor(ms / 1000);
    }
    return t;
  }

  /* ── indicator math (computed client-side over candle closes) ── */
  function sma(values, period) {
    var out = [], sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      out.push(i >= period - 1 ? sum / period : null);
    }
    return out;
  }
  function ema(values, period) {
    var out = [], k = 2 / (period + 1), prev = null;
    for (var i = 0; i < values.length; i++) {
      if (prev == null) {
        if (i >= period - 1) {
          var seed = 0; for (var j = i - period + 1; j <= i; j++) seed += values[j];
          prev = seed / period; out.push(prev);
        } else out.push(null);
      } else { prev = values[i] * k + prev * (1 - k); out.push(prev); }
    }
    return out;
  }
  function stddev(values, period) {
    var out = [];
    for (var i = 0; i < values.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var m = 0; for (var j = i - period + 1; j <= i; j++) m += values[j]; m /= period;
      var v = 0; for (var k = i - period + 1; k <= i; k++) v += Math.pow(values[k] - m, 2);
      out.push(Math.sqrt(v / period));
    }
    return out;
  }
  function rsi(values, period) {
    var out = [], gain = 0, loss = 0;
    for (var i = 0; i < values.length; i++) {
      if (i === 0) { out.push(null); continue; }
      var ch = values[i] - values[i - 1];
      var g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      if (i <= period) {
        gain += g; loss += l;
        if (i === period) { gain /= period; loss /= period; out.push(100 - 100 / (1 + (loss === 0 ? 100 : gain / loss))); }
        else out.push(null);
      } else {
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        out.push(100 - 100 / (1 + (loss === 0 ? 100 : gain / loss)));
      }
    }
    return out;
  }

  /* ── error / empty states ── */
  function errBox(el, msg) {
    el.classList.add('tw-error');
    el.textContent = 'Widget error: ' + msg;
  }

  /* ── shell: title bar + body, returned for each widget ── */
  function shell(el, spec, kind) {
    el.classList.add('tw', 'tw-' + kind);
    var head = document.createElement('div'); head.className = 'tw-head';
    var title = document.createElement('div'); title.className = 'tw-title';
    title.textContent = spec.title || spec.symbol || '';
    head.appendChild(title);
    if (spec.subtitle) {
      var sub = document.createElement('div'); sub.className = 'tw-sub';
      sub.textContent = spec.subtitle; head.appendChild(sub);
    }
    var body = document.createElement('div'); body.className = 'tw-body';
    if (spec.title || spec.symbol || spec.subtitle) el.appendChild(head);
    el.appendChild(body);
    return body;
  }

  /* ──────────────────────────── CANDLESTICK ──────────────────────────── */
  function renderCandles(el, spec) {
    var body = shell(el, spec, 'chart');
    loadCharts(function (err) {
      if (err) return errBox(el, err.message);
      var p = palette();
      var h = spec.height || 360;
      body.style.height = h + 'px';
      var chart = window.LightweightCharts.createChart(body, baseChartOpts(p, h));
      var candle = chart.addCandlestickSeries({
        upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down,
        wickUpColor: p.up, wickDownColor: p.down
      });
      var rows = (spec.data || []).map(function (d) {
        return { time: toTime(d.time || d.t || d.date), open: +d.open, high: +d.high, low: +d.low, close: +d.close };
      }).filter(function (d) { return d.time != null && !isNaN(d.close); });
      candle.setData(rows);

      var closes = rows.map(function (r) { return r.close; });
      var times = rows.map(function (r) { return r.time; });

      // volume histogram on its own overlaid scale
      if (spec.volume) {
        var vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        vol.setData(rows.map(function (r, i) {
          var d = spec.data[i];
          return { time: r.time, value: +(d.volume || d.v || 0), color: r.close >= r.open ? hexA(p.up, 0.5) : hexA(p.down, 0.5) };
        }));
      }

      // overlay indicators computed from closes
      (spec.indicators || []).forEach(function (ind, idx) {
        var color = ind.color || p.ind[idx % p.ind.length];
        var type = (ind.type || '').toLowerCase();
        var period = ind.period || 20;
        if (type === 'sma' || type === 'ma') addLine(chart, times, sma(closes, period), color, (ind.label || 'SMA ' + period));
        else if (type === 'ema') addLine(chart, times, ema(closes, period), color, (ind.label || 'EMA ' + period));
        else if (type === 'vwap') addLine(chart, times, vwap(spec.data, rows), color, 'VWAP');
        else if (type === 'bbands' || type === 'bollinger') {
          var mid = sma(closes, period), sd = stddev(closes, period), k = ind.mult || 2;
          addLine(chart, times, mid.map(function (m, i) { return m == null ? null : m + k * sd[i]; }), hexA(color, 0.6), 'BB upper');
          addLine(chart, times, mid, hexA(color, 0.4), 'BB mid');
          addLine(chart, times, mid.map(function (m, i) { return m == null ? null : m - k * sd[i]; }), hexA(color, 0.6), 'BB lower');
        }
      });

      chart.timeScale().fitContent();
      legend(el, spec, p);
      autosize(chart, body);
    });
  }
  function vwap(raw, rows) {
    var cumPV = 0, cumV = 0, out = [];
    for (var i = 0; i < rows.length; i++) {
      var tp = (rows[i].high + rows[i].low + rows[i].close) / 3;
      var v = +(raw[i].volume || raw[i].v || 0);
      cumPV += tp * v; cumV += v;
      out.push(cumV ? cumPV / cumV : null);
    }
    return out;
  }
  function addLine(chart, times, vals, color, title) {
    var s = chart.addLineSeries({ color: color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, title: title || '' });
    s.setData(times.map(function (t, i) { return vals[i] == null ? null : { time: t, value: vals[i] }; }).filter(Boolean));
    return s;
  }

  /* ──────────────────────────── LINE / AREA ──────────────────────────── */
  function renderLine(el, spec) {
    var body = shell(el, spec, 'chart');
    loadCharts(function (err) {
      if (err) return errBox(el, err.message);
      var p = palette();
      var h = spec.height || 320;
      body.style.height = h + 'px';
      var chart = window.LightweightCharts.createChart(body, baseChartOpts(p, h));
      var series = spec.series || [{ name: spec.name || 'Value', data: spec.data }];
      series.forEach(function (s, i) {
        var color = s.color || p.ind[i % p.ind.length];
        var ser = spec.area
          ? chart.addAreaSeries({ lineColor: color, topColor: hexA(color, 0.28), bottomColor: hexA(color, 0.02), lineWidth: 2, title: s.name || '' })
          : chart.addLineSeries({ color: color, lineWidth: 2, title: s.name || '' });
        ser.setData((s.data || []).map(function (d) {
          return { time: toTime(d.time || d.t || d.date || d.x), value: +(d.value != null ? d.value : d.y) };
        }).filter(function (d) { return d.time != null && !isNaN(d.value); }));
      });
      chart.timeScale().fitContent();
      legend(el, { indicators: series.map(function (s, i) { return { label: s.name, color: s.color || p.ind[i % p.ind.length] }; }) }, p);
      autosize(chart, body);
    });
  }

  function baseChartOpts(p, h) {
    return {
      height: h, autoSize: false,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: p.text, fontFamily: 'var(--tw-mono, ui-monospace, monospace)', fontSize: 11 },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderColor: p.grid },
      timeScale: { borderColor: p.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1, vertLine: { color: p.text, labelBackgroundColor: p.accent }, horzLine: { color: p.text, labelBackgroundColor: p.accent } }
    };
  }
  function autosize(chart, body) {
    if (typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(function () {
      chart.applyOptions({ width: body.clientWidth });
    });
    ro.observe(body);
    chart.applyOptions({ width: body.clientWidth });
  }
  function legend(el, spec, p) {
    var inds = spec.indicators || [];
    if (!inds.length) return;
    var lg = document.createElement('div'); lg.className = 'tw-legend';
    inds.forEach(function (ind, i) {
      if (!ind.label) return;
      var item = document.createElement('span'); item.className = 'tw-legend-item';
      var dot = document.createElement('i'); dot.style.background = ind.color || p.ind[i % p.ind.length];
      item.appendChild(dot); item.appendChild(document.createTextNode(ind.label));
      lg.appendChild(item);
    });
    if (lg.children.length) el.appendChild(lg);
  }

  /* ──────────────────────────── TABLE ──────────────────────────── */
  function renderTable(el, spec) {
    var body = shell(el, spec, 'table');
    var cols = spec.columns || inferCols(spec.rows);
    var rows = (spec.rows || []).slice();
    var table = document.createElement('table'); table.className = 'tw-table';
    var thead = document.createElement('thead'); var tr = document.createElement('tr');
    var sortState = { key: null, dir: 1 };
    cols.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c.label != null ? c.label : c.key;
      if (c.align === 'right' || c.numeric) th.classList.add('tw-right');
      if (spec.sortable !== false) {
        th.classList.add('tw-sortable');
        th.onclick = function () {
          if (sortState.key === c.key) sortState.dir *= -1; else { sortState.key = c.key; sortState.dir = 1; }
          rows.sort(function (a, b) {
            var x = a[c.key], y = b[c.key];
            if (c.numeric) { x = +x; y = +y; }
            return (x > y ? 1 : x < y ? -1 : 0) * sortState.dir;
          });
          [].forEach.call(thead.querySelectorAll('th'), function (h) { h.removeAttribute('data-sort'); });
          th.setAttribute('data-sort', sortState.dir > 0 ? 'asc' : 'desc');
          fill();
        };
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = document.createElement('tbody'); table.appendChild(tbody);
    function fill() {
      tbody.innerHTML = '';
      rows.forEach(function (r) {
        var rtr = document.createElement('tr');
        cols.forEach(function (c) {
          var td = document.createElement('td');
          var raw = r[c.key];
          if (c.numeric || c.align === 'right') td.classList.add('tw-right', 'tw-num');
          if (c.delta && typeof raw === 'number') {
            td.classList.add(raw > 0 ? 'tw-up' : raw < 0 ? 'tw-down' : 'tw-flat');
            td.textContent = (raw > 0 ? '+' : '') + fmtNum(raw, c);
          } else if (c.numeric && typeof raw === 'number') {
            td.textContent = (c.prefix || '') + fmtNum(raw, c) + (c.suffix || '');
          } else if (c.bar && typeof raw === 'number') {
            var max = Math.max.apply(null, rows.map(function (x) { return Math.abs(+x[c.key]) || 0; })) || 1;
            var w = Math.round(Math.abs(raw) / max * 100);
            td.classList.add('tw-cell-bar');
            td.innerHTML = '<span class="tw-bar-fill" style="width:' + w + '%"></span><span class="tw-bar-lbl">' + esc(fmtNum(raw, c)) + '</span>';
          } else {
            td.textContent = raw == null ? '—' : String(raw);
          }
          rtr.appendChild(td);
        });
        tbody.appendChild(rtr);
      });
    }
    fill();
    var wrap = document.createElement('div'); wrap.className = 'tw-table-wrap'; wrap.appendChild(table);
    body.appendChild(wrap);
  }
  function inferCols(rows) {
    if (!rows || !rows.length) return [];
    return Object.keys(rows[0]).map(function (k) {
      return { key: k, label: k, numeric: typeof rows[0][k] === 'number' };
    });
  }

  /* ──────────────────────────── QUOTE SCORECARD ──────────────────────────── */
  function renderQuote(el, spec) {
    el.classList.add('tw', 'tw-quote');
    var chg = spec.change != null ? +spec.change : null;
    var pct = spec.changePct != null ? +spec.changePct : null;
    var dir = chg == null ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
    var head = document.createElement('div'); head.className = 'tw-q-head';
    head.innerHTML =
      '<div class="tw-q-id"><span class="tw-q-sym">' + esc(spec.symbol || '') + '</span>' +
      (spec.name ? '<span class="tw-q-name">' + esc(spec.name) + '</span>' : '') + '</div>' +
      '<div class="tw-q-px tw-' + dir + '">' +
        '<span class="tw-q-price">' + (spec.currency || '') + esc(fmtNum(+spec.price, { decimals: spec.decimals })) + '</span>' +
        (chg != null ? '<span class="tw-q-chg">' + (chg > 0 ? '▲ ' : chg < 0 ? '▼ ' : '') +
          (chg > 0 ? '+' : '') + esc(fmtNum(chg, { decimals: spec.decimals })) +
          (pct != null ? ' (' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%)' : '') + '</span>' : '') +
      '</div>';
    el.appendChild(head);
    if (spec.stats && spec.stats.length) {
      var grid = document.createElement('div'); grid.className = 'tw-q-stats';
      spec.stats.forEach(function (s) {
        var cell = document.createElement('div'); cell.className = 'tw-q-stat';
        cell.innerHTML = '<span class="tw-q-lbl">' + esc(s.label || '') + '</span><span class="tw-q-val">' + esc(String(s.value)) + '</span>';
        grid.appendChild(cell);
      });
      el.appendChild(grid);
    }
  }

  /* ──────────────────────────── METRICS ROW ──────────────────────────── */
  function renderMetrics(el, spec) {
    el.classList.add('tw', 'tw-metrics');
    (spec.items || []).forEach(function (m) {
      var d = m.delta != null ? +m.delta : null;
      var dir = d == null ? '' : d > 0 ? 'tw-up' : d < 0 ? 'tw-down' : 'tw-flat';
      var card = document.createElement('div'); card.className = 'tw-metric';
      card.innerHTML =
        '<span class="tw-m-lbl">' + esc(m.label || '') + '</span>' +
        '<span class="tw-m-val">' + esc(String(m.value)) + '</span>' +
        (d != null ? '<span class="tw-m-delta ' + dir + '">' + (d > 0 ? '+' : '') + d.toFixed(2) + '%</span>' : '');
      el.appendChild(card);
    });
  }

  /* ──────────────────────────── BARS ──────────────────────────── */
  function renderBars(el, spec) {
    var body = shell(el, spec, 'bars');
    var data = (spec.data || []).slice();
    var max = Math.max.apply(null, data.map(function (d) { return Math.abs(+d.value) || 0; })) || 1;
    var p = palette();
    var list = document.createElement('div'); list.className = 'tw-bars-list';
    data.forEach(function (d, i) {
      var row = document.createElement('div'); row.className = 'tw-bar-row';
      var w = Math.round(Math.abs(+d.value) / max * 100);
      var color = d.color || (spec.colorBySign && +d.value < 0 ? p.down : spec.colorBySign ? p.up : p.ind[i % p.ind.length]);
      row.innerHTML =
        '<span class="tw-bar-label">' + esc(d.label || '') + '</span>' +
        '<span class="tw-bar-track"><span class="tw-bar-bar" style="width:' + w + '%;background:' + esc(color) + '"></span></span>' +
        '<span class="tw-bar-value">' + esc((spec.prefix || '') + fmtNum(+d.value, spec) + (spec.suffix || '')) + '</span>';
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  /* ──────────────────────────── dispatch ──────────────────────────── */
  var RENDERERS = {
    candlestick: renderCandles, candles: renderCandles, ohlc: renderCandles,
    line: renderLine, area: function (el, s) { s.area = true; renderLine(el, s); },
    table: renderTable, quote: renderQuote, ticker: renderQuote,
    metrics: renderMetrics, kpi: renderMetrics,
    bars: renderBars, bar: renderBars, allocation: renderBars
  };

  function renderSpec(el, spec) {
    var type = (spec.type || '').toLowerCase();
    var fn = RENDERERS[type];
    if (!fn) { errBox(el, 'unknown widget type "' + (spec.type || '') + '"'); return; }
    el.innerHTML = '';
    fn(el, spec);
  }

  function renderOne(el) {
    el.setAttribute('data-rendered', '1');
    var raw = el.textContent || '';
    var spec;
    try { spec = JSON.parse(raw); }
    catch (e) { errBox(el, 'invalid JSON — ' + e.message); return; }
    if (spec.src) {
      el.innerHTML = '<div class="tw-loading">Loading data…</div>';
      fetch('api/media?path=' + encodeURIComponent(spec.src))
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
          // merge fetched payload: array → primary data key by type, object → spread
          if (Array.isArray(data)) {
            var k = /line|area/.test(spec.type) ? 'series' : 'data';
            if (k === 'series' && data.length && data[0].name) spec.series = data; else spec[(spec.type === 'table' ? 'rows' : 'data')] = data;
          } else { for (var key in data) if (!(key in spec)) spec[key] = data[key]; }
          renderSpec(el, spec);
        })
        .catch(function (e) { errBox(el, 'data fetch failed — ' + e.message); });
    } else {
      renderSpec(el, spec);
    }
  }

  /* esc + hexA utilities (esc may exist globally from ui.js) */
  function esc(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hexA(hex, a) {
    if (!/^#([0-9a-f]{6})$/i.test(hex)) return hex;
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* public entry — called from postProcessRenderedMessages() in ui.js */
  window.renderHermesWidgets = function (container) {
    var root = container || document;
    var blocks = root.querySelectorAll('.hermes-widget:not([data-rendered])');
    [].forEach.call(blocks, function (el) {
      try { renderOne(el); } catch (e) { errBox(el, e.message); }
    });
  };
})();
