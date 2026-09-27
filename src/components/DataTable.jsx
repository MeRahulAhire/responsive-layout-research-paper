import { Fragment, Suspense, lazy, useCallback, useMemo, useState } from "react";
import { Inline } from "./Inline.jsx";
import { Icon } from "./Icon.jsx";
import { cellNumber, toPlain } from "../lib/inline.js";
import { normRows } from "../lib/charts.js";

// ECharts is heavy; load it the first time a reader flips a table to its chart view.
const Chart = lazy(() => import("./Chart.jsx").then((m) => ({ default: m.Chart })));

/** Best / second-best cells, mirroring the paper's bold / underline convention. */
function computeHighlights(table, rows) {
  const marks = new Map(); // "r:c" → "best" | "second"
  const hl = table.highlight;
  const numericCols = table.columns.map((c, i) => (c.numeric ? i : -1)).filter((i) => i >= 0);
  const mark = (cells) => {
    const vals = cells.filter((x) => x.v != null);
    if (!vals.length) return;
    const dir = hl.best === "min" ? 1 : -1;
    const distinct = [...new Set(vals.map((x) => x.v))].sort((a, b) => dir * (a - b));
    const tiedBest = vals.filter((x) => x.v === distinct[0]).length > 1;
    for (const x of vals) {
      if (x.v === distinct[0]) marks.set(x.key, "best");
      // A tie for first already fills both podium places; don't underline a third value.
      else if (hl.second && !tiedBest && x.v === distinct[1]) marks.set(x.key, "second");
    }
  };
  if (hl) {
    if (hl.by === "column") {
      for (const c of numericCols) mark(rows.map((r, ri) => ({ key: `${ri}:${c}`, v: cellNumber(r.cells[c]) })));
    } else {
      rows.forEach((r, ri) => mark(numericCols.map((c) => ({ key: `${ri}:${c}`, v: cellNumber(r.cells[c]) }))));
    }
  }
  rows.forEach((r, ri) => (r.bold ?? []).forEach((c) => marks.set(`${ri}:${c}`, "best")));
  return marks;
}

function downloadCsv(table, rows) {
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [table.columns.map((c) => esc(c.label)), ...rows.map((r) => r.cells.map((c) => esc(toPlain(c))))];
  const blob = new Blob([lines.map((l) => l.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `table-${table.number ?? table.id}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "is-on" : ""} onClick={() => onChange(o.value)} disabled={o.disabled}>
          {o.icon && <Icon name={o.icon} size={14} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
export { Segmented };

const SHAPE_GLYPH = { circle: "●", diamond: "◆", rect: "■", triangle: "▲", roundRect: "▢", pin: "⬤" };

export function DataTable({ table, embedded = false, noAnchor = false, headerExtra = null, view: viewProp, onViewChange }) {
  const [viewState, setViewState] = useState("table");
  const view = viewProp ?? viewState;
  const setView = onViewChange ?? setViewState;
  const [hidden, setHidden] = useState(() => new Set());
  const [metric, setMetric] = useState(0);
  const [meta, setMeta] = useState({ shapes: [] });
  const rows = useMemo(() => normRows(table.rows), [table]);
  const marks = useMemo(() => computeHighlights(table, rows), [table, rows]);
  const chart = table.chart;
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group).filter(Boolean))], [rows]);
  const chartState = useMemo(() => ({ hiddenGroups: hidden, metric }), [hidden, metric]);
  const onMeta = useCallback((m) => setMeta(m), []);
  const wide = !embedded && table.columns.length > 6;

  const toggleGroup = (g) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      if (next.size === groups.length) return prev; // keep at least one family visible
      return next;
    });

  let lastGroup = null;

  return (
    <figure id={noAnchor ? undefined : table.id} className={`dtable${embedded ? " dtable--embedded" : ""}${wide ? " is-wide" : ""}`} data-flash>
      {!embedded && (
        <figcaption className="dtable__head">
          <div className="caption">
            <span className="caption__kicker">Table {table.number}</span>
            <Inline text={table.caption} />
          </div>
        </figcaption>
      )}
      <div className="dtable__bar">
        {headerExtra}
        <div className="dtable__tools">
          {chart && (
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "table", label: "Table", icon: "table" },
                { value: "chart", label: "Chart", icon: "chart" },
              ]}
            />
          )}
          <button type="button" className="icon-btn" onClick={() => downloadCsv(table, rows)} aria-label="Download as CSV" title="Download CSV">
            <Icon name="download" size={15} />
          </button>
        </div>
      </div>

      {view === "table" || !chart ? (
        <div className="dtable__scroll" tabIndex={0} role="region" aria-label={`Table ${table.number ?? ""} data`}>
          <table className="tbl">
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c.key} scope="col" className={`${c.numeric ? "is-num" : ""}${i === 0 ? " is-first" : ""}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const groupRow = r.group && r.group !== lastGroup;
                lastGroup = r.group ?? lastGroup;
                return (
                  <Fragment key={ri}>
                    {groupRow && (
                      <tr className="tbl__group">
                        <th colSpan={table.columns.length} scope="colgroup">{r.group === "Ours" ? "This paper" : `${r.group} attention`}</th>
                      </tr>
                    )}
                    <tr className={`${r.ours ? "is-ours" : ""}${r.divider && !groupRow ? " has-divider" : ""}`}>
                      {r.cells.map((cell, ci) => {
                        const m = marks.get(`${ri}:${ci}`);
                        const Tag = ci === 0 ? "th" : "td";
                        const isX = cell === "✗";
                        return (
                          <Tag
                            key={ci}
                            scope={ci === 0 ? "row" : undefined}
                            className={[table.columns[ci]?.numeric && "is-num", ci === 0 && "is-first", m && `is-${m}`, isX && "is-x", cell === "-" && "is-na"].filter(Boolean).join(" ")}
                          >
                            {cell === "-" ? <span aria-label="not available">—</span> : <Inline text={cell} />}
                          </Tag>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dtable__chart">
          {(chart.familyFilter || chart.metrics) && (
            <div className="chart-controls">
              {chart.metrics && (
                <Segmented label="Metric" value={metric} onChange={setMetric} options={chart.metrics.map((m, i) => ({ value: i, label: m.label }))} />
              )}
              {chart.familyFilter && (
                <div className="fam-chips" role="group" aria-label="Show attention families">
                  {groups.map((g) => (
                    <button key={g} type="button" className={`fam-chip${hidden.has(g) ? "" : " is-on"}`} data-group={g} aria-pressed={!hidden.has(g)} onClick={() => toggleGroup(g)}>
                      <span className="fam-chip__dot" aria-hidden="true" />
                      {g === "Ours" ? "FlashAttention" : g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Suspense fallback={<div className="chart chart--loading" style={{ height: chart.familyFilter ? 440 : 360 }} aria-busy="true" />}>
            <Chart table={table} state={chartState} height={chart.familyFilter ? 440 : 360} onMeta={onMeta} />
          </Suspense>
          {(chart.note || meta.shapes.length > 0) && (
            <p className="chart-note">
              {meta.shapes.length > 0 && (
                <span className="chart-note__shapes">
                  {meta.shapes.map((s) => (
                    <span key={s.key}><span aria-hidden="true">{SHAPE_GLYPH[s.symbol]}</span> {s.key}</span>
                  ))}
                </span>
              )}
              {chart.note}
            </p>
          )}
        </div>
      )}
      {table.legend && view === "table" && <p className="dtable__legend">{table.legend}</p>}
    </figure>
  );
}
