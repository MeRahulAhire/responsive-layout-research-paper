import { useState } from "react";
import { HoverCard } from "./HoverCard.jsx";
import { KIND_LABEL, jumpTo, surname, usePaper } from "../lib/paper.jsx";
import { Icon } from "./Icon.jsx";

const shortYear = (y) => `’${String(y).slice(-2)}`;

function initials(name) {
  const parts = name.replace(/[^\p{L}\s.-]/gu, "").split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function authorLine(ref, max = 3) {
  const a = ref.authors;
  if (a.length <= max && !ref.etAl) return a.join(", ");
  return `${a.slice(0, max).join(", ")} et al.`;
}

export function RefLinks({ item: r, onJump }) {
  const L = r.links;
  return (
    <div className="ref-links">
      {L.arxiv && <a href={L.arxiv} target="_blank" rel="noreferrer">arXiv <Icon name="arrow-up-right" size={12} /></a>}
      {L.doi && <a href={L.doi} target="_blank" rel="noreferrer">DOI <Icon name="arrow-up-right" size={12} /></a>}
      {L.url && !L.doi && <a href={L.url} target="_blank" rel="noreferrer">Source <Icon name="arrow-up-right" size={12} /></a>}
      <a href={L.scholar} target="_blank" rel="noreferrer">Scholar <Icon name="arrow-up-right" size={12} /></a>
      {onJump && (
        <button type="button" className="ref-links__jump" onClick={onJump}>
          In references <Icon name="arrow-down" size={12} />
        </button>
      )}
    </div>
  );
}

function RefPeek({ r, onJump }) {
  return (
    <article className="refpeek">
      <header className="refpeek__head">
        <span className="avatar" data-kind={r.kind} aria-hidden="true">{initials(r.authors[0])}</span>
        <div className="refpeek__who">
          <span className="refpeek__lead">{r.authors[0]}{r.authors.length > 1 || r.etAl ? <span className="muted"> &amp; {r.etAl ? "others" : `${r.authors.length - 1} more`}</span> : null}</span>
          <span className="refpeek__meta">
            <span className="kind-badge" data-kind={r.kind}>{KIND_LABEL[r.kind] ?? r.kind}</span>
            <span>{r.year}</span>
            <span className="refpeek__num">[{r.id}]</span>
          </span>
        </div>
      </header>
      <h4 className="refpeek__title">{r.title}</h4>
      <p className="refpeek__authors">{authorLine(r)}</p>
      <p className="refpeek__venue">
        {r.venue}
        {r.volume ? `, ${r.volume}` : ""}
        {r.pages ? `, ${r.pages}` : ""}
      </p>
      <p className="refpeek__summary">{r.summary}</p>
      <RefLinks item={r} onJump={onJump} />
    </article>
  );
}

/** Replaces bracketed numeric citations with a quiet author–year chip and a peek card. */
export function Citation({ ids, prevText = "" }) {
  const { refsById } = usePaper();
  const refs = ids.map((id) => refsById.get(id)).filter(Boolean);
  const [active, setActive] = useState(0);
  if (!refs.length) return null;

  const first = refs[0];
  const firstSurname = surname(first.authors[0]);
  // "Tay et al. [80]" already names the author in prose — keep the chip minimal.
  const named = prevText.slice(-48).includes(firstSurname);
  const label = named
    ? shortYear(first.year)
    : `${firstSurname} ${shortYear(first.year)}${refs.length > 1 ? ` +${refs.length - 1}` : ""}`;
  const aria = `Citation: ${refs.map((r) => `[${r.id}] ${r.title}`).join("; ")}`;
  const current = refs[Math.min(active, refs.length - 1)];

  const goto = (close) => () => {
    close();
    jumpTo(`ref-${current.id}`);
  };

  return (
    <HoverCard
      label={aria}
      width={refs.length > 1 ? 400 : 380}
      renderTrigger={({ ref, open, ...props }) => (
        <button ref={ref} type="button" className={`cite${open ? " is-open" : ""}${named ? " cite--named" : ""}`} aria-label={aria} {...props}>
          {label}
        </button>
      )}
    >
      {({ close }) => (
        <div className="refpeek-wrap">
          {refs.length > 1 && (
            <div className="refpeek__tabs" role="tablist" aria-label="Cited works">
              <span className="refpeek__count">{refs.length} sources</span>
              {refs.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  className={i === active ? "is-active" : ""}
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                >
                  {surname(r.authors[0])}
                  <span className="refpeek__tabyear">{shortYear(r.year)}</span>
                </button>
              ))}
            </div>
          )}
          <RefPeek r={current} onJump={goto(close)} />
        </div>
      )}
    </HoverCard>
  );
}
