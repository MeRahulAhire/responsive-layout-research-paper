import { HoverCard } from "./HoverCard.jsx";
import { jumpTo, usePaper } from "../lib/paper.jsx";
import { renderMath } from "../lib/math.js";
import { Inline } from "./Inline.jsx";
import { Icon } from "./Icon.jsx";

import { assetUrl } from "../lib/paper.jsx";
const base = (paperId) => assetUrl(paperId, "");

function Preview({ block, label, paperId }) {
  switch (block.type) {
    case "figure": {
      const src = block.images?.[0]?.src ?? block.panels?.find((p) => p.kind === "image")?.src;
      return (
        <div className="xpeek">
          <span className="xpeek__kicker">Figure {block.number}</span>
          {src && (
            <div className="plate plate--peek">
              <img src={base(paperId) + src} alt="" loading="lazy" />
            </div>
          )}
          <p className="xpeek__text clamp-4"><Inline text={block.caption} /></p>
        </div>
      );
    }
    case "equation":
      return (
        <div className="xpeek">
          <span className="xpeek__kicker">{label}{block.label ? ` · ${block.label}` : ""}</span>
          <div className="xpeek__math" dangerouslySetInnerHTML={{ __html: renderMath(block.tex, true) }} />
        </div>
      );
    case "table":
      return (
        <div className="xpeek">
          <span className="xpeek__kicker">Table {block.number} · {block.rows.length} rows × {block.columns.length} columns</span>
          <p className="xpeek__text clamp-4"><Inline text={block.caption} /></p>
        </div>
      );
    case "algorithm":
      return (
        <div className="xpeek">
          <span className="xpeek__kicker">Algorithm {block.number}</span>
          <p className="xpeek__title"><Inline text={block.title} /></p>
          <ol className="xpeek__lines">
            {block.lines.slice(0, 4).map((l, i) => (
              <li key={i} style={{ paddingLeft: `${l.indent * 12}px` }}><Inline text={l.text} /></li>
            ))}
          </ol>
          {block.lines.length > 4 && <p className="xpeek__more">+ {block.lines.length - 4} more lines</p>}
        </div>
      );
    case "theorem":
      return (
        <div className="xpeek">
          <span className="xpeek__kicker">{block.kind} {block.number}</span>
          <p className="xpeek__text xpeek__text--thm"><Inline text={block.text} /></p>
        </div>
      );
    case "heading":
      return (
        <div className="xpeek">
          <span className="xpeek__kicker">{label}</span>
          <p className="xpeek__title"><Inline text={block.title} /></p>
          {block.firstParagraph && <p className="xpeek__text clamp-4"><Inline text={block.firstParagraph} /></p>}
        </div>
      );
    default:
      return <div className="xpeek"><span className="xpeek__kicker">{label}</span></div>;
  }
}

/** Internal link to a figure/table/equation/section with a Wikipedia-style page preview. */
export function CrossRef({ id, label }) {
  const { paper, blocksById } = usePaper();
  const block = blocksById.get(id);
  const go = (e) => {
    e.preventDefault();
    jumpTo(id);
  };
  if (!block) return <a href={`#${id}`} className="xref" onClick={go}>{label}</a>;
  return (
    <HoverCard
      label={`Preview of ${paper.targets[id] ?? label}`}
      width={block.type === "figure" ? 420 : 360}
      renderTrigger={({ ref, open, onClick, ...props }) => (
        <a
          ref={ref}
          href={`#${id}`}
          className={`xref${open ? " is-open" : ""}`}
          {...props}
          onClick={(e) => {
            // On phones the first tap opens the preview; the preview holds the jump button.
            if (window.matchMedia("(max-width: 640px)").matches) {
              e.preventDefault();
              onClick?.(e);
            } else go(e);
          }}
        >
          {label}
        </a>
      )}
    >
      {({ close }) => (
        <div className="xpeek-wrap">
          <Preview block={block} label={paper.targets[id] ?? label} paperId={paper.id} />
          <button type="button" className="xpeek__go" onClick={() => { close(); jumpTo(id); }}>
            Go to {paper.targets[id] ?? label} <Icon name="arrow-down" size={12} />
          </button>
        </div>
      )}
    </HoverCard>
  );
}

