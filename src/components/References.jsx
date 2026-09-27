import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { RefLinks } from "./Citation.jsx";
import { KIND_LABEL, jumpTo, usePaper } from "../lib/paper.jsx";

const GROUPS = [
  { key: "all", label: "All" },
  { key: "conference", label: "Conference" },
  { key: "journal", label: "Journal" },
  { key: "preprint", label: "Preprint" },
  { key: "other", label: "Books & other" },
];
const groupOf = (kind) => (["conference", "journal", "preprint"].includes(kind) ? kind : "other");

function YearStrip({ items, year, onYear }) {
  const years = items.map((r) => r.year);
  const min = Math.min(...years);
  const max = Math.max(...years);
  const counts = new Map();
  years.forEach((y) => counts.set(y, (counts.get(y) ?? 0) + 1));
  const peak = Math.max(...counts.values());
  const span = [];
  for (let y = min; y <= max; y++) span.push(y);
  return (
    <div className="years" role="group" aria-label="Filter references by year">
      <div className="years__bars">
        {span.map((y) => {
          const n = counts.get(y) ?? 0;
          return (
            <button
              key={y}
              type="button"
              className={`years__bar${year === y ? " is-on" : ""}${n === 0 ? " is-empty" : ""}`}
              style={{ "--h": n ? Math.max(0.08, n / peak) : 0.02 }}
              onClick={() => n && onYear(year === y ? null : y)}
              disabled={!n}
              aria-label={n ? `${y}: ${n} reference${n > 1 ? "s" : ""}` : undefined}
              aria-pressed={year === y}
              title={n ? `${y} · ${n}` : undefined}
              tabIndex={n ? 0 : -1}
            />
          );
        })}
      </div>
      <div className="years__axis" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function RefCard({ r }) {
  const [more, setMore] = useState(false);
  return (
    <li id={`ref-${r.id}`} className="refcard" data-flash data-kind={r.kind}>
      <div className="refcard__num">{r.id}</div>
      <div className="refcard__body">
        <div className="refcard__meta">
          <span className="kind-badge" data-kind={r.kind}>{KIND_LABEL[r.kind] ?? r.kind}</span>
          <span className="refcard__year">{r.year}</span>
        </div>
        <h3 className="refcard__title">{r.title}</h3>
        <p className="refcard__authors">{r.authors.join(", ")}{r.etAl ? ", et al." : ""}</p>
        <p className="refcard__venue">
          {r.venue}
          {r.volume ? `, ${r.volume}` : ""}
          {r.pages ? `, pp. ${r.pages}` : ""}
          {r.arxiv ? ` · arXiv:${r.arxiv}` : ""}
          {r.doi ? ` · doi:${r.doi}` : ""}
        </p>
        <p className={`refcard__summary${more ? " is-open" : ""}`}>
          {r.summary}
        </p>
        <button type="button" className="text-btn" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          {more ? "Less" : "What is this paper about?"}
        </button>
        <div className="refcard__foot">
          {r.citedIn.length > 0 && (
            <div className="refcard__cited">
              <span className="refcard__cited-label">Cited in</span>
              {r.citedIn.map((s) => (
                <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); jumpTo(s.id); }}>{s.label}</a>
              ))}
            </div>
          )}
          <RefLinks item={r} />
        </div>
      </div>
    </li>
  );
}

export function References() {
  const { references } = usePaper();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [year, setYear] = useState(null);
  const [sort, setSort] = useState("order");

  const counts = useMemo(() => {
    const c = { all: references.length };
    references.forEach((r) => (c[groupOf(r.kind)] = (c[groupOf(r.kind)] ?? 0) + 1));
    return c;
  }, [references]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = references.filter(
      (r) =>
        (group === "all" || groupOf(r.kind) === group) &&
        (year == null || r.year === year) &&
        (!needle || [r.title, r.venue, r.summary, ...r.authors, String(r.year), String(r.id)].join(" ").toLowerCase().includes(needle)),
    );
    if (sort === "year") out.sort((a, b) => b.year - a.year || a.id - b.id);
    if (sort === "cited") out.sort((a, b) => b.citedIn.length - a.citedIn.length || a.id - b.id);
    return out;
  }, [references, q, group, year, sort]);

  return (
    <section className="refs" id="references" aria-labelledby="refs-h">
      <header className="refs__head">
        <h2 id="refs-h" className="h h--1">
          <span className="h__title">References</span>
        </h2>
        <p className="refs__lede">
          {references.length} works cited, from {Math.min(...references.map((r) => r.year))} to {Math.max(...references.map((r) => r.year))}. Hover any citation in the text to peek; everything lands here.
        </p>
      </header>

      <div className="refs__tools">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search references</span>
          <input type="search" placeholder="Search title, author, venue…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="select">
          <span className="sr-only">Sort references</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="order">Citation order</option>
            <option value="year">Newest first</option>
            <option value="cited">Most cited</option>
          </select>
        </label>
      </div>
      <div className="refs__filters">
        <div className="chips" role="group" aria-label="Filter by type">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" className={`chip${group === g.key ? " is-on" : ""}`} aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>
              {g.label} <span className="chip__count">{counts[g.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <YearStrip items={references} year={year} onYear={setYear} />
      </div>
      {(year != null || q || group !== "all") && (
        <p className="refs__status" aria-live="polite">
          Showing {list.length} of {references.length}
          {year != null && <> · {year}</>}
          <button type="button" className="text-btn" onClick={() => { setQ(""); setGroup("all"); setYear(null); }}>Clear filters</button>
        </p>
      )}
      <ol className="refs__list">
        {list.map((r) => <RefCard key={r.id} r={r} />)}
      </ol>
      {list.length === 0 && <p className="refs__empty">No references match. Try a different search.</p>}
    </section>
  );
}
