import { useEffect, useMemo, useState } from "react";
import { DataTable, Segmented } from "./DataTable.jsx";
import { Inline } from "./Inline.jsx";

/**
 * Tables 9–21 share one shape; instead of thirteen stacked walls of numbers they
 * live in one explorer, faceted exactly like the paper's Table 8 index.
 */
export function TableSet({ block }) {
  const [activeId, setActiveId] = useState(block.tables[0].id);
  const [view, setView] = useState("table");
  const active = block.tables.find((t) => t.id === activeId);
  const ids = useMemo(() => new Set(block.tables.map((t) => t.id)), [block]);

  useEffect(() => {
    const onReveal = (e) => ids.has(e.detail) && setActiveId(e.detail);
    window.addEventListener("reprise:reveal", onReveal);
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (ids.has(fromHash)) setActiveId(fromHash);
    return () => window.removeEventListener("reprise:reveal", onReveal);
  }, [ids]);

  const pick = (patch) => {
    const want = { ...active.facets, ...patch };
    if (patch.pass === "Memory") Object.assign(want, { dropout: "No", masking: "No" });
    if (want.pass === "Memory" && (patch.dropout === "Yes" || patch.masking === "Yes")) want.pass = "Combined";
    const match = block.tables.find((t) => Object.entries(want).every(([k, v]) => t.facets[k] === v));
    if (match) setActiveId(match.id);
  };

  const memory = active.facets.pass === "Memory";

  return (
    <section className="tset is-wide" id={block.id} data-flash>
      {block.tables.map((t) => (
        <span key={t.id} id={t.id} className="anchor-point" aria-hidden="true" />
      ))}
      <header className="tset__head">
        <span className="caption__kicker">Tables 9–21</span>
        <h4 className="tset__title">Full benchmarking results on A100</h4>
        <p className="tset__lede">Thirteen tables, one explorer. Choose a configuration to see its table; switch any table to a chart.</p>
      </header>
      <div className="tset__facets">
        {block.facetOrder.map((f) => (
          <div key={f.key} className="facet">
            <span className="facet__label">{f.label}</span>
            <Segmented
              label={f.label}
              value={active.facets[f.key]}
              onChange={(v) => pick({ [f.key]: v })}
              options={f.options.map((o) => ({ value: o, label: o, disabled: f.key !== "pass" && memory && o === "Yes" }))}
            />
          </div>
        ))}
      </div>
      <nav className="tset__index" aria-label="All benchmark tables">
        {block.tables.map((t) => (
          <button key={t.id} type="button" className={t.id === activeId ? "is-on" : ""} onClick={() => setActiveId(t.id)} aria-current={t.id === activeId}>
            {t.number}
          </button>
        ))}
      </nav>
      <div className="tset__caption caption">
        <span className="caption__kicker">Table {active.number}</span>
        <Inline text={active.caption} />
      </div>
      <DataTable key={active.id} table={active} embedded noAnchor view={view} onViewChange={setView} />
    </section>
  );
}
