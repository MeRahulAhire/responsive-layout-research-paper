import { useEffect, useRef, useState } from "react";
import { Inline } from "./Inline.jsx";
import { Icon } from "./Icon.jsx";
import { renderMath } from "../lib/math.js";
import { assetUrl, usePaper } from "../lib/paper.jsx";
import { DataTable } from "./DataTable.jsx";
import { TableSet } from "./TableSet.jsx";

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — nothing else to do */
    }
  };
  return [copied, copy];
}

export function Heading({ block }) {
  const Tag = block.level === 1 ? "h2" : "h3";
  return (
    <Tag id={block.id} className={`h h--${block.level}`} data-heading={block.level}>
      {block.number && <span className="h__num">{block.number}</span>}
      <span className="h__title"><Inline text={block.title} /></span>
      <a className="h__anchor" href={`#${block.id}`} aria-label="Link to this section">#</a>
    </Tag>
  );
}

export function Paragraph({ block }) {
  return (
    <div className="para" data-block="paragraph">
      <p>
        {block.lead && <span className="para__lead"><Inline text={block.lead} /> </span>}
        <Inline text={block.text} />
      </p>
    </div>
  );
}

export function List({ block }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <div className="para" data-block="list">
      <Tag className={`list ${block.ordered ? "list--ol" : "list--ul"}`}>
        {block.items.map((it, i) => (
          <li key={i}>
            {it.lead && <span className="para__lead"><Inline text={it.lead} /> </span>}
            <Inline text={it.text} />
          </li>
        ))}
      </Tag>
    </div>
  );
}

/** Tiny TeX highlighter for the source view: commands, braces, scripts. */
function TexSource({ tex }) {
  const parts = tex.split(/(\\[a-zA-Z]+|\\.|[{}]|[_^&]|\\\\)/g).filter(Boolean);
  return (
    <code>
      {parts.map((p, i) => {
        let cls = "";
        if (/^\\[a-zA-Z]+$/.test(p)) cls = "tx-cmd";
        else if (p === "{" || p === "}") cls = "tx-brace";
        else if (p === "_" || p === "^") cls = "tx-script";
        else if (p === "&" || p === "\\\\") cls = "tx-align";
        return cls ? <span key={i} className={cls}>{p}</span> : p;
      })}
    </code>
  );
}

// Long display math gets the wide measure on desktop; anything still wider scrolls with a fade cue.
function useOverflow(ref, deps) {
  const [state, setState] = useState({ over: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setState({ over: el.scrollWidth > el.clientWidth + 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function Equation({ block }) {
  const [src, setSrc] = useState(false);
  const [copied, copy] = useCopy();
  const bodyRef = useRef(null);
  const { over, end } = useOverflow(bodyRef, [src]);
  const wide = block.tex.length > 150;
  return (
    <figure id={block.id} className={`eq${src ? " is-src" : ""}${wide ? " is-wide" : ""}${over ? " is-overflowing" : ""}${end ? " is-scrolled-end" : ""}`} data-flash>
      <figcaption className="eq__bar">
        <span className="eq__label">
          {block.number ? <span className="eq__num">Eq. ({block.number})</span> : <span className="eq__num eq__num--plain">Display</span>}
          {block.label && <span className="eq__name">{block.label}</span>}
        </span>
        <span className="eq__tools">
          <button type="button" className={`chip-btn${src ? " is-on" : ""}`} onClick={() => setSrc((s) => !s)} aria-pressed={src}>
            <Icon name="code" size={14} /> TeX
          </button>
          <button type="button" className="chip-btn" onClick={() => copy(block.tex)} aria-label="Copy LaTeX">
            <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </figcaption>
      <div className="eq__body" ref={bodyRef} tabIndex={over ? 0 : undefined}>
        {src ? (
          <pre className="eq__src"><TexSource tex={block.tex} /></pre>
        ) : (
          <div className="eq__math" dangerouslySetInnerHTML={{ __html: renderMath(block.tex, true) }} />
        )}
      </div>
    </figure>
  );
}

const KEYWORD_LINE = /^\*\*(end for|end if)\*\*$/;

export function Algorithm({ block }) {
  return (
    <figure id={block.id} className="algo" data-flash>
      <figcaption className="algo__head">
        <span className="algo__kicker">Algorithm {block.number}</span>
        <span className="algo__title"><Inline text={block.title} /></span>
      </figcaption>
      <div className="algo__require">
        <span className="algo__kw">Require</span>
        <div>{block.require.map((r, i) => <p key={i}><Inline text={r} /></p>)}</div>
      </div>
      <ol className="algo__lines">
        {block.lines.map((l, i) => (
          <li key={i} className={`algo__line${KEYWORD_LINE.test(l.text) ? " algo__line--end" : ""}`}>
            <span className="algo__n">{i + 1}</span>
            <span className="algo__code" style={{ "--indent": l.indent }}>
              {Array.from({ length: l.indent }, (_, k) => <span key={k} className="algo__guide" style={{ "--k": k }} aria-hidden="true" />)}
              <Inline text={l.text} />
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function Theorem({ block }) {
  return (
    <div id={block.id} className={`thm thm--${block.kind.toLowerCase()}`} data-flash>
      <div className="thm__label">{block.kind} {block.number}</div>
      <p className="thm__body"><Inline text={block.text} /></p>
    </div>
  );
}

export function Proof({ block }) {
  const [open, setOpen] = useState(false);
  const bodyId = `${block.id}-body`;
  return (
    <section id={block.id} className={`proof${open ? " is-open" : ""}`} data-flash>
      <header className="proof__head">
        <span className="proof__label"><em>Proof of</em> {block.of}</span>
        <button type="button" className="chip-btn" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          {open ? "Collapse" : "Read proof"}
          <Icon name="chevron" size={14} className={open ? "rot-90" : ""} />
        </button>
      </header>
      <div id={bodyId} className="proof__body">
        <BlockList blocks={block.blocks} />
        {open && <div className="proof__qed" aria-label="End of proof">∎</div>}
      </div>
      {!open && <button type="button" className="proof__fade" onClick={() => setOpen(true)} aria-label={`Expand proof of ${block.of}`} />}
    </section>
  );
}

function Lightbox({ src, alt, caption, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Figure viewer" onClick={onClose}>
      <button ref={closeRef} type="button" className="lightbox__close" onClick={onClose} aria-label="Close figure viewer">
        <Icon name="close" size={20} />
      </button>
      <div className="lightbox__stage" onClick={(e) => e.stopPropagation()}>
        <div className="plate plate--lightbox"><img src={src} alt={alt} /></div>
        {caption && <p className="lightbox__cap"><Inline text={caption} /></p>}
      </div>
    </div>
  );
}

function Plate({ src, alt, caption, label, w, h }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="figure__panel">
      {label && <span className="figure__panel-label">{label}</span>}
      <button type="button" className="plate plate--zoom" onClick={() => setOpen(true)} aria-label={`Enlarge: ${alt}`}>
        <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
        <span className="plate__zoom" aria-hidden="true"><Icon name="expand" size={14} /></span>
      </button>
      {open && <Lightbox src={src} alt={alt} caption={caption} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function Figure({ block }) {
  const { paper } = usePaper();
  const url = (p) => assetUrl(paper.id, p);
  return (
    <figure id={block.id} className={`figure${block.wide ? " is-wide" : ""}`} data-flash>
      <div className={`figure__panels${block.panels ? " figure__panels--mixed" : ""}${(block.images?.length ?? 0) > 1 ? " figure__panels--stack" : ""}`}>
        {block.images?.map((img, i) => (
          <Plate key={i} src={url(img.src)} alt={img.alt} caption={block.caption} label={img.label} w={img.w} h={img.h} />
        ))}
        {block.panels?.map((panel, i) =>
          panel.kind === "table" ? (
            <div key={i} className="figure__panel figure__panel--table">
              <span className="figure__panel-label">{panel.label}</span>
              <DataTable table={panel.table} embedded />
            </div>
          ) : (
            <Plate key={i} src={url(panel.src)} alt={panel.alt} caption={block.caption} label={panel.label} w={panel.w} h={panel.h} />
          ),
        )}
      </div>
      <figcaption className="caption">
        <span className="caption__kicker">Figure {block.number}</span>
        <Inline text={block.caption} />
      </figcaption>
    </figure>
  );
}

function Marker({ block }) {
  return (
    <aside className="marker" role="note">
      <Icon name="sparkle" size={14} />
      <span>{block.note}</span>
    </aside>
  );
}

function AppendixStart() {
  return (
    <div className="appendix-rule" role="separator" aria-label="Appendix">
      <span>Appendix</span>
    </div>
  );
}

const REGISTRY = {
  heading: Heading,
  paragraph: Paragraph,
  list: List,
  equation: Equation,
  algorithm: Algorithm,
  theorem: Theorem,
  proof: Proof,
  figure: Figure,
  table: ({ block }) => <DataTable table={block} />,
  "table-set": TableSet,
  marker: Marker,
  "appendix-start": AppendixStart,
};

/** Server-driven renderer: each block's `type` selects its component. */
export function BlockList({ blocks }) {
  return blocks.map((block, i) => {
    const Component = REGISTRY[block.type];
    if (!Component) {
      if (import.meta.env.DEV) console.warn(`No renderer for block type "${block.type}"`);
      return null;
    }
    return <Component key={block.id ?? `${block.type}-${i}`} block={block} />;
  });
}
