import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { Inline } from "./Inline.jsx";
import { jumpTo, usePaper } from "../lib/paper.jsx";
import { useTheme } from "../lib/theme.jsx";

/** Headings in reading order, split into body and appendix groups. */
export function useOutline() {
  const { paper } = usePaper();
  return useMemo(() => {
    const out = [{ id: "abstract", number: "", title: "Abstract", level: 1, group: "body" }];
    let group = "body";
    for (const b of paper.blocks) {
      if (b.type === "appendix-start") group = "appendix";
      if (b.type === "heading") out.push({ id: b.id, number: b.number, title: b.title, level: b.level, group });
    }
    out.push({ id: "references", number: "", title: "References", level: 1, group: "end" });
    return out;
  }, [paper]);
}

export function useActiveSection(outline) {
  const [active, setActive] = useState(outline[0]?.id);
  useEffect(() => {
    const els = outline.map((o) => document.getElementById(o.id)).filter(Boolean);
    const visible = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        // The active section is the last heading that has scrolled above the reading line.
        const line = 120;
        let current = els[0]?.id;
        for (const el of els) {
          if (el.getBoundingClientRect().top - line <= 0) current = el.id;
          else break;
        }
        setActive(current);
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: [0, 1] },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      let current = els[0]?.id;
      for (const el of els) {
        if (el.getBoundingClientRect().top - 120 <= 0) current = el.id;
        else break;
      }
      setActive(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [outline]);
  return active;
}

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        setP(max > 0 ? h.scrollTop / max : 0);
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return p;
}

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const order = ["system", "light", "dark"];
  const next = order[(order.indexOf(mode) + 1) % order.length];
  const icon = mode === "system" ? "system" : mode === "light" ? "sun" : "moon";
  const label = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" }[mode];
  return (
    <button type="button" className="icon-btn" onClick={() => setMode(next)} aria-label={`${label}. Switch to ${next}.`} title={label}>
      <Icon name={icon} size={17} />
    </button>
  );
}

export function TopBar({ outline, active, onOpenToc }) {
  const { paper } = usePaper();
  const progress = useScrollProgress();
  const current = outline.find((o) => o.id === active);
  const scrolled = progress > 0.015;
  return (
    <header className={`topbar${scrolled ? " is-scrolled" : ""}`}>
      <div className="topbar__inner">
        <button type="button" className="icon-btn topbar__menu" onClick={onOpenToc} aria-label="Open contents">
          <Icon name="menu" size={18} />
        </button>
        <a className="brand" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="brand__mark" aria-hidden="true">R</span>
          <span className="brand__word">Reprise</span>
        </a>
        <div className={`topbar__where${scrolled ? " is-shown" : ""}`} aria-live="polite">
          <span className="topbar__paper sc">FlashAttention</span>
          {current && current.id !== "abstract" && (
            <>
              <span className="topbar__sep" aria-hidden="true">/</span>
              <span className="topbar__section">
                {current.number && <span className="topbar__num">{current.number}</span>}
                <Inline text={current.title} />
              </span>
            </>
          )}
        </div>
        <div className="topbar__actions">
          <a className="icon-btn" href={paper.meta.code} target="_blank" rel="noreferrer" aria-label="Source code on GitHub" title="Code">
            <Icon name="github" size={17} />
          </a>
          <a className="icon-btn" href={paper.meta.pdf} target="_blank" rel="noreferrer" aria-label="Original PDF on arXiv" title="Original PDF">
            <Icon name="file" size={17} />
          </a>
          <ThemeToggle />
        </div>
      </div>
      <div className="topbar__progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
    </header>
  );
}

export function Toc({ outline, active, open, onClose }) {
  const listRef = useRef(null);
  useEffect(() => {
    const el = listRef.current?.querySelector(".is-active");
    if (el && !open) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeIdx = outline.findIndex((o) => o.id === active);
  const renderGroup = (group, title) => (
    <>
      {title && <li className="toc__group">{title}</li>}
      {outline
        .map((o, i) => ({ ...o, i }))
        .filter((o) => o.group === group)
        .map((o) => (
          <li key={o.id} className={`toc__item toc__item--l${o.level}${o.id === active ? " is-active" : ""}${o.i < activeIdx ? " is-read" : ""}`}>
            <a
              href={`#${o.id}`}
              aria-current={o.id === active ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onClose();
                jumpTo(o.id, { flash: false });
              }}
            >
              {o.number && <span className="toc__num">{o.number}</span>}
              <span className="toc__title"><Inline text={o.title} /></span>
            </a>
          </li>
        ))}
    </>
  );

  return (
    <>
      <div className={`toc-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <nav className={`toc${open ? " is-open" : ""}`} aria-label="Contents">
        <div className="toc__head">
          <span className="toc__label">Contents</span>
          <button type="button" className="icon-btn toc__close" onClick={onClose} aria-label="Close contents">
            <Icon name="close" size={18} />
          </button>
        </div>
        <ol className="toc__list" ref={listRef}>
          {renderGroup("body")}
          {renderGroup("appendix", "Appendix")}
          {renderGroup("end", "")}
        </ol>
      </nav>
    </>
  );
}

function bibtex(meta) {
  const authors = meta.authors.map((a) => a.name).join(" and ");
  return `@article{dao2022flashattention,
  title   = {${meta.title}: ${meta.subtitle}},
  author  = {${authors}},
  journal = {arXiv preprint arXiv:2205.14135},
  year    = {2022}
}`;
}

// Set the last camel-case word in italics: "FlashAttention" → Flash*Attention*.
function splitTitle(title) {
  const m = title.match(/^(.+?)([A-Z][a-z]+)$/);
  return m ? <>{m[1]}<em>{m[2]}</em></> : title;
}

export function Hero() {
  const { paper } = usePaper();
  const { meta } = paper;
  const [copied, setCopied] = useState(false);
  const copyCite = async () => {
    try {
      await navigator.clipboard.writeText(bibtex(meta));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <header className="hero" id="top">
      <div className="hero__eyebrow">
        <span className="pill">arXiv {meta.arxiv}</span>
        <span>{meta.subjects.join(" · ")}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={meta.date}>{meta.dateLabel}</time>
      </div>
      <h1 className="hero__title">{splitTitle(meta.title)}</h1>
      <p className="hero__subtitle">{meta.subtitle}</p>
      <ul className="hero__authors">
        {meta.authors.map((a) => (
          <li key={a.name}>
            <a href={`mailto:${a.email}`} title={a.email}>{a.name}</a>
            <sup>{a.affiliations.join(",")}</sup>
          </li>
        ))}
      </ul>
      <ul className="hero__affils">
        {meta.affiliations.map((af) => (
          <li key={af.id}><sup>{af.id}</sup>{af.name}</li>
        ))}
      </ul>
      <div className="hero__actions">
        <a className="btn btn--primary" href={meta.pdf} target="_blank" rel="noreferrer"><Icon name="file" size={16} /> Original PDF</a>
        <a className="btn" href={meta.code} target="_blank" rel="noreferrer"><Icon name="github" size={16} /> Code</a>
        <button type="button" className="btn" onClick={copyCite}><Icon name={copied ? "check" : "quote"} size={16} /> {copied ? "BibTeX copied" : "Cite"}</button>
      </div>
      <ul className="stats" aria-label="Key results">
        {meta.highlights.map((h) => (
          <li key={h.value}>
            <a href={`#${h.target}`} onClick={(e) => { e.preventDefault(); jumpTo(h.target); }}>
              <span className="stats__value">{h.value}</span>
              <span className="stats__label">{h.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </header>
  );
}

export function Abstract() {
  const { paper } = usePaper();
  return (
    <section className="abstract" id="abstract" aria-labelledby="abstract-h">
      <h2 id="abstract-h" className="abstract__label">Abstract</h2>
      <p className="abstract__text"><Inline text={paper.abstract} /></p>
    </section>
  );
}
