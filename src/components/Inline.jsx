import { Fragment, useState } from "react";
import { parseInline } from "../lib/inline.js";
import { renderMath } from "../lib/math.js";
import { usePaper } from "../lib/paper.jsx";
import { Citation } from "./Citation.jsx";
import { CrossRef } from "./CrossRef.jsx";

export function InlineMath({ tex }) {
  return <span className="math-inline" dangerouslySetInnerHTML={{ __html: renderMath(tex, false) }} />;
}

// The paper sets its own name in small caps; do the same wherever it appears.
const NAME = /(FlashAttention)/g;
function Prose({ text }) {
  const parts = text.split(NAME);
  return parts.map((part, i) =>
    part === "FlashAttention" ? (
      <span key={i} className="sc">FlashAttention</span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Footnote({ n }) {
  const { paper } = usePaper();
  const [open, setOpen] = useState(false);
  const body = paper.footnotes[n];
  return (
    <>
      <sup className="fn-ref">
        <button type="button" aria-expanded={open} aria-label={`Footnote ${n}`} onClick={() => setOpen((o) => !o)}>
          {n}
        </button>
      </sup>
      <span className={`sidenote${open ? " is-open" : ""}`} role="note">
        <span className="sidenote__num">{n}</span>
        <Inline text={body} />
      </span>
    </>
  );
}

function renderNodes(nodes, keyPrefix = "") {
  let prevText = "";
  return nodes.map((n, i) => {
    const key = keyPrefix + i;
    switch (n.t) {
      case "text":
        prevText += n.v;
        return <Prose key={key} text={n.v} />;
      case "math":
        prevText += n.v;
        return <InlineMath key={key} tex={n.v} />;
      case "cite":
        return <Citation key={key} ids={n.ids} prevText={prevText} />;
      case "xref":
        prevText += n.label;
        return <CrossRef key={key} id={n.id} label={n.label} />;
      case "fn":
        return <Footnote key={key} n={n.n} />;
      case "link":
        return (
          <a key={key} className="ext-link" href={n.href} target="_blank" rel="noreferrer">
            {n.label}
          </a>
        );
      case "b":
        return <strong key={key}>{renderNodes(n.children, key + ".")}</strong>;
      case "i":
        return <em key={key}>{renderNodes(n.children, key + ".")}</em>;
      default:
        return null;
    }
  });
}

/** Renders a string of paper inline markup into rich, interactive React nodes. */
export function Inline({ text }) {
  return <>{renderNodes(parseInline(text))}</>;
}
