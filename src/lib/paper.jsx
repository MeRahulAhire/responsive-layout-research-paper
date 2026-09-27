import { createContext, useContext, useMemo } from "react";

const PaperContext = createContext(null);

/** Index every addressable block so cross-references can preview and jump to it. */
function indexBlocks(blocks) {
  const byId = new Map();
  let lastHeading = null;
  const visit = (list) => {
    for (const b of list) {
      if (b.type === "heading") {
        lastHeading = { ...b, firstParagraph: null };
        byId.set(b.id, lastHeading);
        continue;
      }
      if (b.type === "paragraph" && lastHeading && !lastHeading.firstParagraph) lastHeading.firstParagraph = b.text;
      if (b.id) byId.set(b.id, b);
      if (b.type === "proof") visit(b.blocks);
      if (b.type === "table-set") b.tables.forEach((t) => byId.set(t.id, { type: "table", ...t, inSet: b.id }));
      if (b.type === "figure") (b.panels ?? []).forEach((p) => p.table && byId.set(p.table.id, { type: "table", ...p.table }));
    }
  };
  visit(blocks);
  return byId;
}

export function PaperProvider({ paper, references, children }) {
  const value = useMemo(() => {
    const refsById = new Map(references.items.map((r) => [r.id, r]));
    return { paper, references: references.items, refsById, blocksById: indexBlocks(paper.blocks) };
  }, [paper, references]);
  return <PaperContext.Provider value={value}>{children}</PaperContext.Provider>;
}

export const usePaper = () => useContext(PaperContext);

/** Scroll to an anchor, letting grouped blocks (the benchmark table set) reveal it first. */
export function jumpTo(id, { flash = true } = {}) {
  window.dispatchEvent(new CustomEvent("reprise:reveal", { detail: id }));
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    if (flash) {
      const target = el.closest("[data-flash]") ?? el;
      target.classList.remove("is-flash");
      void target.offsetWidth;
      target.classList.add("is-flash");
      setTimeout(() => target.classList.remove("is-flash"), 1800);
    }
  });
}

export const surname = (name) => {
  const parts = name.replace(/,.*$/, "").trim().split(/\s+/);
  return parts[parts.length - 1];
};

export const KIND_LABEL = {
  conference: "Conference",
  journal: "Journal",
  preprint: "Preprint",
  book: "Book",
  whitepaper: "Whitepaper",
  report: "Report",
  dataset: "Dataset",
  talk: "Talk",
};

export const assetUrl = (paperId, path) => `${import.meta.env.BASE_URL}papers/${paperId}/${path}`;
