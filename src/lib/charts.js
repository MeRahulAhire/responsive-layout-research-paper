// Builds ECharts options from declarative table chart specs (see content/*.mjs `chart`).
import { cellNumber, toPlain } from "./inline.js";

export const TOKENS = ["series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "ink", "ink-2", "muted", "faint", "rule", "rule-strong", "bg-elev", "bg"];

const SYMBOLS = ["circle", "diamond", "rect", "triangle", "roundRect", "pin"];
const DASHES = ["solid", "dashed", "dotted", [10, 4, 2, 4], [2, 3]];

export const normRows = (rows) => rows.map((r) => (Array.isArray(r) ? { cells: r } : r));
export const rowLabel = (row) => toPlain(row.cells[0]).replace(/\s*\(ours\)\s*/i, "").trim();

const fmt = (v) => {
  if (v == null || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 100) return v.toFixed(1).replace(/\.0$/, "");
  return String(Number(v.toFixed(2)));
};

function baseOption(c, { xLabel, yLabel, logY, compact }) {
  const font = "Geist, ui-sans-serif, system-ui, sans-serif";
  const axisCommon = {
    axisLine: { lineStyle: { color: c["rule-strong"] } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontFamily: font, fontSize: 11 },
    nameTextStyle: { color: c.muted, fontFamily: font, fontSize: 11 },
    splitLine: { lineStyle: { color: c.rule, type: [3, 4] } },
  };
  return {
    animationDuration: 500,
    animationEasing: "cubicOut",
    textStyle: { fontFamily: font },
    grid: { left: 8, right: 20, top: 56, bottom: 44, containLabel: true },
    legend: {
      type: "scroll",
      top: 0,
      left: 0,
      right: 0,
      itemGap: 16,
      itemWidth: 18,
      itemHeight: 10,
      textStyle: { color: c["ink-2"], fontFamily: font, fontSize: 12 },
      pageIconColor: c.muted,
      pageIconInactiveColor: c.rule,
      pageTextStyle: { color: c.muted },
      inactiveColor: c.faint,
    },
    tooltip: {
      backgroundColor: c["bg-elev"],
      borderColor: c.rule,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: c.ink, fontFamily: font, fontSize: 12 },
      extraCssText: "border-radius:12px;box-shadow:0 12px 32px -12px rgba(0,0,0,.28);",
      confine: true,
    },
    xAxis: {
      ...axisCommon,
      name: xLabel,
      nameLocation: "middle",
      nameGap: 30,
      splitLine: { show: false },
    },
    yAxis: {
      ...axisCommon,
      name: compact ? "" : yLabel,
      nameLocation: "end",
      nameGap: 14,
      nameTextStyle: { ...axisCommon.nameTextStyle, align: "left", padding: [0, 0, 0, -4] },
      type: logY ? "log" : "value",
      logBase: 10,
      scale: !logY,
      axisLabel: { ...axisCommon.axisLabel, formatter: (v) => fmt(v) },
    },
  };
}

function marker(color, symbol = "circle") {
  const shape = symbol === "diamond" ? "transform:rotate(45deg);border-radius:1px;width:7px;height:7px;" : symbol === "rect" ? "border-radius:2px;" : "border-radius:50%;";
  return `<span style="display:inline-block;width:8px;height:8px;${shape}background:${color};margin-right:8px;vertical-align:middle"></span>`;
}

/** Resolve a fixed palette slot for each series — color follows the entity, never its rank. */
function colorResolver(spec, c) {
  const palette = [1, 2, 3, 4, 5, 6].map((i) => c[`series-${i}`]);
  const rules = spec.encode?.color;
  let next = 1;
  const seen = new Map();
  return (label, group) => {
    if (rules) {
      const rule = rules.find((r) => (r.group && r.group === group) || (r.match && new RegExp(r.match).test(label)));
      if (rule) return { color: palette[rule.slot], group: rule.group ?? group };
    }
    const key = /FlashAttention/.test(label) ? "__ours" : label;
    if (!seen.has(key)) seen.set(key, key === "__ours" ? 0 : Math.min(next++, 5));
    return { color: palette[seen.get(key)], group };
  };
}

function dashFor(spec, label) {
  const rule = spec.encode?.dash?.find((r) => new RegExp(r.match).test(label));
  return rule?.type;
}

// ── rows-as-series: one series per row, x = numeric column headers ───────────
function rowsAsSeries(table, spec, c, state) {
  const rows = normRows(table.rows);
  const cols = table.columns.slice(1).map((col) => col.label);
  const colorOf = colorResolver(spec, c);
  const perGroupIndex = new Map();
  const oursSeen = { n: 0 };
  const isScatter = spec.kind === "scatter";

  const series = rows
    .map((row) => {
      const label = rowLabel(row);
      const group = row.group;
      if (state.hiddenGroups?.has(group)) return null;
      const { color } = colorOf(label, group);
      let values = row.cells.slice(1).map((cell) => cellNumber(cell));
      let raw = values;
      if (spec.normalizeTo) {
        const baseV = values[spec.normalizeTo - 1];
        values = values.map((v) => (v == null ? null : +((v / baseV) * 100).toFixed(1)));
      }
      if (values.every((v) => v == null)) return null;

      const gi = perGroupIndex.get(group ?? label) ?? 0;
      perGroupIndex.set(group ?? label, gi + 1);
      const ours = /FlashAttention/.test(label);
      const oursIdx = ours ? oursSeen.n++ : 0;
      const explicitDash = dashFor(spec, label);
      const dash = explicitDash ?? (group ? DASHES[gi % DASHES.length] : ours ? DASHES[oursIdx % 2] : "solid");
      const symbol = group ? SYMBOLS[gi % SYMBOLS.length] : ours ? SYMBOLS[oursIdx % 2] : SYMBOLS[0];

      return {
        name: label,
        type: isScatter ? "scatter" : "line",
        data: values.map((v, i) => ({ value: v, raw: raw[i] })),
        connectNulls: false,
        symbol,
        symbolSize: isScatter ? 14 : ours ? 8 : 7,
        showSymbol: true,
        lineStyle: { width: ours ? 3 : 2, type: dash, color },
        itemStyle: { color, borderColor: c["bg-elev"], borderWidth: isScatter ? 2 : 1.5 },
        emphasis: { focus: "series", lineStyle: { width: ours ? 3.5 : 2.6 } },
        blur: { lineStyle: { opacity: 0.18 }, itemStyle: { opacity: 0.2 } },
        z: ours ? 5 : 2,
        label: isScatter ? { show: true, position: "right", distance: 8, color: c["ink-2"], fontSize: 11, formatter: (p) => fmt(p.value) } : undefined,
        _group: group,
      };
    })
    .filter(Boolean);

  if (spec.referenceLine && series[0]) {
    series[0].markLine = {
      silent: true,
      symbol: "none",
      lineStyle: { color: c.muted, type: [4, 4], width: 1 },
      label: { formatter: spec.referenceLine.label, color: c.muted, fontSize: 11, position: "insideEndTop" },
      data: [{ yAxis: spec.referenceLine.value }],
    };
  }

  const opt = baseOption(c, { ...spec, yLabel: spec.yLabel, compact: state.compact });
  if (series.length > 4) {
    // Many series: let the legend wrap onto extra rows instead of paginating.
    opt.legend = { ...opt.legend, type: "plain" };
    const perRow = state.compact ? 2 : 5;
    opt.grid.top = 40 + Math.ceil(series.length / perRow) * 22;
  }
  opt.xAxis = { ...opt.xAxis, type: "category", data: cols, boundaryGap: isScatter || cols.length <= 3 };
  if (spec.referenceLine) opt.yAxis.min = (v) => Math.floor(Math.min(v.min, spec.referenceLine.value) - 4);
  opt.series = series;
  opt.tooltip = {
    ...opt.tooltip,
    trigger: isScatter ? "item" : "axis",
    axisPointer: { type: "line", lineStyle: { color: c.muted, width: 1, type: [3, 3] } },
    formatter: (params) => {
      const list = (Array.isArray(params) ? params : [params]).filter((p) => p.value != null);
      if (!list.length) return "";
      const head = `<div style="font-weight:600;margin-bottom:6px">${spec.xLabel ? `${spec.xLabel}: ` : ""}${list[0].name}</div>`;
      const sorted = [...list].sort((a, b) => a.value - b.value);
      return (
        head +
        sorted
          .map((p) => {
            const s = series[p.seriesIndex];
            const rawNote = spec.normalizeTo ? ` <span style="color:${c.muted}">(${fmt(p.data.raw)})</span>` : "";
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;line-height:1.7">
              <span>${marker(s.itemStyle.color, s.symbol)}${p.seriesName}</span>
              <span style="font-variant-numeric:tabular-nums;font-weight:600">${fmt(p.value)}${spec.normalizeTo ? "%" : ""}${rawNote}</span></div>`;
          })
          .join("")
      );
    },
  };
  return opt;
}

// ── columns-as-series: x from a column; series grouped by row-label pattern ──
function columnsAsSeries(table, spec, c, state) {
  const rows = normRows(table.rows);
  const metric = spec.metrics?.[state.metric ?? 0];
  const xs = [...new Set(rows.map((r) => toPlain(r.cells[spec.x])))];
  const groups = new Map();
  for (const row of rows) {
    const label = rowLabel(row);
    const g = label.match(new RegExp(spec.seriesBy.pattern))?.[1] ?? label;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);
  }
  const colorOf = colorResolver(spec, c);
  const series = [...groups.entries()].map(([name, grows]) => {
    const { color } = colorOf(name);
    const ours = /FlashAttention/.test(name);
    const data = xs.map((x) => {
      const r = grows.find((row) => toPlain(row.cells[spec.x]) === x);
      return r ? cellNumber(r.cells[metric.col]) : null;
    });
    return {
      name,
      type: "line",
      data,
      symbol: ours ? "circle" : "diamond",
      symbolSize: 10,
      showSymbol: true,
      lineStyle: { width: ours ? 3 : 2, color },
      itemStyle: { color, borderColor: c["bg-elev"], borderWidth: 2 },
      emphasis: { focus: "series" },
      label: { show: true, position: "top", distance: 8, color: c["ink-2"], fontSize: 11, formatter: (p) => fmt(p.value) },
    };
  });
  const opt = baseOption(c, { xLabel: spec.xLabel, yLabel: metric.yLabel, compact: state.compact });
  opt.grid.top = 80; // room for value labels above the highest point
  opt.xAxis = { ...opt.xAxis, type: "category", data: xs, boundaryGap: true };
  opt.series = series;
  opt.tooltip = { ...opt.tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: c.muted, type: [3, 3] } } };
  return opt;
}

// ── points: labelled scatter of two numeric columns ─────────────────────────
function points(table, spec, c, state) {
  const rows = normRows(table.rows);
  const groupOf = (label) => {
    const cb = spec.colorBy;
    if (!cb) return label;
    if (cb.rules) return cb.rules.find((r) => new RegExp(r.match).test(label))?.group ?? cb.fallback;
    return label.match(new RegExp(cb.pattern))?.[1] ?? label;
  };
  const shapeKeys = [];
  const shapeOf = (label) => {
    if (!spec.shapeBy) return "circle";
    const k = label.match(new RegExp(spec.shapeBy.pattern))?.[1];
    if (k && !shapeKeys.includes(k)) shapeKeys.push(k);
    return SYMBOLS[Math.max(0, shapeKeys.indexOf(k))];
  };
  const colorOf = colorResolver(spec, c);
  const groups = new Map();
  for (const row of rows) {
    const label = rowLabel(row);
    const fill = spec.fill?.[label] ?? {};
    const x = fill[spec.x] ?? cellNumber(row.cells[spec.x]);
    const y = fill[spec.y] ?? cellNumber(row.cells[spec.y]);
    if (x == null || y == null) continue;
    const g = groupOf(label);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ value: [x, y], name: label, symbol: shapeOf(label) });
  }
  const series = [...groups.entries()].map(([name, data]) => {
    const { color } = colorOf(name);
    return {
      name,
      type: "scatter",
      data,
      symbolSize: 13,
      itemStyle: { color, borderColor: c["bg-elev"], borderWidth: 2 },
      emphasis: { focus: "series", scale: 1.25 },
      label: {
        show: true,
        position: "top",
        distance: 8,
        color: c["ink-2"],
        fontSize: 11,
        formatter: (p) => p.name.replace(/^GPT-2 /, "").replace(/ - .*$/, "").replace(/ Attention$/, ""),
      },
      labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
    };
  });
  const opt = baseOption(c, { ...spec, compact: state.compact });
  opt.xAxis = { ...opt.xAxis, type: "value", scale: true, splitLine: { show: true, lineStyle: { color: c.rule, type: [3, 4] } }, axisLabel: { ...opt.xAxis.axisLabel, formatter: (v) => fmt(v) } };
  opt.grid.right = 28;
  opt.grid.top = 64;
  opt.series = series;
  opt.tooltip = {
    ...opt.tooltip,
    trigger: "item",
    formatter: (p) =>
      `<div style="font-weight:600;margin-bottom:4px">${marker(p.color, p.data.symbol)}${p.name}</div>
       <div style="color:${c.muted}">${spec.xLabel}: <b style="color:${c.ink}">${fmt(p.value[0])}</b></div>
       <div style="color:${c.muted}">${spec.yLabel}: <b style="color:${c.ink}">${fmt(p.value[1])}</b></div>`,
  };
  opt._shapes = shapeKeys.map((k, i) => ({ key: k, symbol: SYMBOLS[i] }));
  return opt;
}

// ── error-dots: mean ± sd per row ──────────────────────────────────────────
function errorDots(table, spec, c, state) {
  const rows = normRows(table.rows);
  const colorOf = colorResolver(spec, c);
  const items = rows.map((row) => {
    const label = rowLabel(row);
    return { label, mean: cellNumber(row.cells[spec.value], 0), sd: cellNumber(row.cells[spec.value], 1), color: colorOf(label).color };
  });
  const opt = baseOption(c, { ...spec, compact: state.compact });
  opt.legend = { show: false };
  opt.grid.top = 36;
  opt.xAxis = { ...opt.xAxis, type: "category", data: items.map((i) => i.label), boundaryGap: true };
  opt.yAxis = { ...opt.yAxis, min: (v) => Math.floor(v.min - 2), max: (v) => Math.ceil(v.max + 1) };
  opt.series = [
    {
      type: "custom",
      name: "± 1 s.d.",
      data: items.map((it, i) => [i, it.mean - it.sd, it.mean + it.sd]),
      renderItem: (params, api) => {
        const x = api.value(0);
        const lo = api.coord([x, api.value(1)]);
        const hi = api.coord([x, api.value(2)]);
        const w = 10;
        const stroke = { stroke: items[params.dataIndex].color, lineWidth: 2, lineCap: "round" };
        return {
          type: "group",
          children: [
            { type: "line", shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style: stroke },
            { type: "line", shape: { x1: lo[0] - w / 2, y1: lo[1], x2: lo[0] + w / 2, y2: lo[1] }, style: stroke },
            { type: "line", shape: { x1: hi[0] - w / 2, y1: hi[1], x2: hi[0] + w / 2, y2: hi[1] }, style: stroke },
          ],
        };
      },
      encode: { x: 0, y: [1, 2] },
      silent: true,
      z: 1,
    },
    {
      type: "scatter",
      name: spec.yLabel,
      data: items.map((it, i) => ({ value: [i, it.mean], itemStyle: { color: it.color }, sd: it.sd })),
      symbolSize: 14,
      itemStyle: { borderColor: c["bg-elev"], borderWidth: 2 },
      label: { show: true, position: "right", distance: 12, color: c.ink, fontSize: 12, fontWeight: 600, formatter: (p) => `${fmt(p.value[1])} ± ${fmt(p.data.sd)}` },
      z: 3,
    },
  ];
  opt.tooltip = {
    ...opt.tooltip,
    trigger: "item",
    formatter: (p) => (p.seriesType === "scatter" ? `<b>${items[p.dataIndex].label}</b><br/>${fmt(p.value[1])} ± ${fmt(p.data.sd)} min` : ""),
  };
  return opt;
}

export function buildChartOption(table, colors, state = {}) {
  const spec = table.chart;
  switch (spec.mode) {
    case "rows-as-series": return rowsAsSeries(table, spec, colors, state);
    case "columns-as-series": return columnsAsSeries(table, spec, colors, state);
    case "points": return points(table, spec, colors, state);
    case "error-dots": return errorDots(table, spec, colors, state);
    default: throw new Error(`Unknown chart mode ${spec.mode}`);
  }
}
