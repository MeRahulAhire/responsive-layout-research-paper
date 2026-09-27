// Compiles authored paper content into the JSON documents the app renders at runtime.
//   content/<paper>.mjs + content/references.json + content/benchmark-tables.json
//     → public/papers/<paper>/paper.json, public/papers/<paper>/references.json
// Fails loudly on broken citations, cross-references, footnotes, or LaTeX.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";
import paper, { benchmarkTableIds, benchmarkCaption } from "../content/flashattention.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const references = read("content/references.json");
const bench = read("content/benchmark-tables.json");

// ── Expand Tables 9–21 into a faceted table set ─────────────────────────────
const FAMILY = {
  "PyTorch Attention": "Exact",
  Megatron: "Exact",
  Reformer: "Approximate",
  "Local Attention": "Approximate",
  Linformer: "Approximate",
  Smyrf: "Approximate",
  LSformer: "Approximate",
  "Block Sparse": "Sparse",
  Longformer: "Sparse",
  BigBird: "Sparse",
  FlashAttention: "Ours",
  "Block-Sparse FlashAttention": "Ours",
};
const FACETS = {
  9: ["Yes", "Yes", "Forward"], 10: ["Yes", "Yes", "Backward"], 11: ["Yes", "Yes", "Combined"],
  12: ["No", "Yes", "Forward"], 13: ["No", "Yes", "Backward"], 14: ["No", "Yes", "Combined"],
  15: ["Yes", "No", "Forward"], 16: ["Yes", "No", "Backward"], 17: ["Yes", "No", "Combined"],
  18: ["No", "No", "Forward"], 19: ["No", "No", "Backward"], 20: ["No", "No", "Combined"],
  21: ["No", "No", "Memory"],
};

function benchmarkTable(n) {
  const src = bench[String(n)];
  if (!src) throw new Error(`benchmark table ${n} missing from benchmark-tables.json`);
  const isMemory = n === 21;
  let prevFamily = null;
  const rows = src.rows.map(([label, ...vals]) => {
    const family = FAMILY[label];
    const row = { cells: [label, ...vals], group: family, ours: family === "Ours" };
    if (prevFamily && family !== prevFamily) row.divider = true;
    prevFamily = family;
    return row;
  });
  const [dropout, masking, pass] = FACETS[n];
  return {
    id: `tab${n}`,
    number: String(n),
    caption: benchmarkCaption(n),
    facets: { dropout, masking, pass },
    columns: [
      { key: "method", label: "Attention Method", align: "left" },
      ...src.cols.map((c) => ({ key: c, label: c, numeric: true })),
    ],
    rows,
    highlight: { by: "column", best: "min", second: true },
    chart: {
      kind: "line",
      mode: "rows-as-series",
      logY: true,
      xLabel: "Sequence length",
      yLabel: isMemory ? "Memory (MB, log scale)" : "Runtime (ms, log scale)",
      familyFilter: true,
      encode: {
        color: [
          { group: "Ours", slot: 0 },
          { group: "Exact", slot: 1 },
          { group: "Approximate", slot: 2 },
          { group: "Sparse", slot: 3 },
        ],
      },
      note: "A dash in the table means the method ran out of memory or does not support that length, so the line stops.",
    },
  };
}

const blocks = paper.blocks.flatMap((b) =>
  b.type === "benchmark-tables"
    ? [{
        type: "table-set",
        id: "bench-tables",
        title: "Tables 9–21 · Full benchmarking results on A100",
        facetOrder: [
          { key: "dropout", label: "Dropout", options: ["Yes", "No"] },
          { key: "masking", label: "Masking", options: ["Yes", "No"] },
          { key: "pass", label: "Pass", options: ["Forward", "Backward", "Combined", "Memory"] },
        ],
        tables: benchmarkTableIds.map(benchmarkTable),
      }]
    : [b],
);

// ── Image dimensions (reserve layout space so anchors don't shift) ──────────
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 12, 16) !== "IHDR") throw new Error(`${file} is not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function withSize(img) {
  const file = path.join(root, "public/papers", paper.id, img.src);
  return fs.existsSync(file) ? { ...img, ...pngSize(file) } : img;
}
for (const b of blocks) {
  if (b.type !== "figure") continue;
  if (b.images) b.images = b.images.map(withSize);
  if (b.panels) b.panels = b.panels.map((p) => (p.kind === "image" ? withSize(p) : p));
}

// ── Inline-markup scanning (mirrors src/lib/inline.js) ──────────────────────
const MATH = /\$([^$]+)\$/g;
const CITE = /\[@([\d,\s]+)\]/g;
const XREF = /\[#([\w.-]+):([^\]]+)\]/g;
const FOOT = /\[\^(\d+)\]/g;

const errors = [];
const refIds = new Set(references.map((r) => r.id));
const targets = new Map(); // id → label
const citedIn = new Map(); // ref id → [{ id, label }]
let section = { id: "top", label: "Abstract" };

function checkTex(tex, display, where) {
  try {
    katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "error", trust: false });
  } catch (e) {
    errors.push(`${where}: KaTeX ${e.message}`);
  }
}

function scanText(text, where) {
  if (typeof text !== "string") return;
  for (const [, tex] of text.matchAll(MATH)) checkTex(tex, false, where);
  for (const [, ids] of text.matchAll(CITE)) {
    for (const id of ids.split(",").map((s) => Number(s.trim()))) {
      if (!refIds.has(id)) errors.push(`${where}: unknown citation [${id}]`);
      const list = citedIn.get(id) ?? [];
      if (!list.some((s) => s.id === section.id)) list.push({ ...section });
      citedIn.set(id, list);
    }
  }
  for (const [, n] of text.matchAll(FOOT)) {
    if (!paper.footnotes[n]) errors.push(`${where}: unknown footnote ${n}`);
  }
}
const pendingXrefs = [];
function collectXrefs(text, where) {
  if (typeof text === "string") for (const [, id] of text.matchAll(XREF)) pendingXrefs.push([id, where]);
}

function register(id, label) {
  if (!id) return;
  if (targets.has(id)) errors.push(`duplicate block id "${id}"`);
  targets.set(id, label);
}

function walkTable(t, where) {
  register(t.id, t.number ? `Table ${t.number}` : "Table");
  scanText(t.caption, where); collectXrefs(t.caption, where);
  for (const row of t.rows) {
    const cells = Array.isArray(row) ? row : row.cells;
    if (cells.length !== t.columns.length) errors.push(`${where}: row has ${cells.length} cells, expected ${t.columns.length}`);
    cells.forEach((c) => { scanText(c, where); collectXrefs(c, where); });
  }
}

function walk(list) {
  for (const b of list) {
    const where = `${b.type}${b.id ? `#${b.id}` : ""} in ${section.label}`;
    switch (b.type) {
      case "heading":
        register(b.id, b.number ? `${/^[A-E]/.test(b.number) ? "Appendix" : "Section"} ${b.number}` : b.title);
        section = { id: b.id, label: b.number ? `§${b.number}` : b.title };
        break;
      case "paragraph": scanText(b.text, where); collectXrefs(b.text, where); break;
      case "list": b.items.forEach((i) => { scanText(i.text, where); collectXrefs(i.text, where); }); break;
      case "equation":
        register(b.id, b.number ? `Eq. (${b.number})` : "Equation");
        checkTex(b.tex, true, where);
        break;
      case "algorithm":
        register(b.id, `Algorithm ${b.number}`);
        [...b.require, ...b.lines.map((l) => l.text)].forEach((t) => { scanText(t, where); collectXrefs(t, where); });
        break;
      case "theorem": register(b.id, `${b.kind} ${b.number}`); scanText(b.text, where); collectXrefs(b.text, where); break;
      case "proof": register(b.id, `Proof of ${b.of}`); walk(b.blocks); break;
      case "figure":
        register(b.id, `Figure ${b.number}`);
        scanText(b.caption, where); collectXrefs(b.caption, where);
        for (const img of b.images ?? []) if (!fs.existsSync(path.join(root, "public/papers", paper.id, img.src))) errors.push(`${where}: missing image ${img.src}`);
        for (const panel of b.panels ?? []) {
          if (panel.kind === "table") walkTable(panel.table, where);
          else if (!fs.existsSync(path.join(root, "public/papers", paper.id, panel.src))) errors.push(`${where}: missing image ${panel.src}`);
        }
        break;
      case "table": walkTable(b, where); break;
      case "table-set": register(b.id, "Tables 9–21"); b.tables.forEach((t) => walkTable(t, where)); break;
      case "marker": case "appendix-start": break;
      default: errors.push(`unknown block type "${b.type}"`);
    }
  }
}

scanText(paper.abstract, "abstract");
Object.entries(paper.footnotes).forEach(([n, t]) => scanText(t, `footnote ${n}`));
walk(blocks);
for (const [id, where] of pendingXrefs) if (!targets.has(id)) errors.push(`${where}: unknown cross-reference #${id}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} problem(s) in ${paper.id}:\n  ` + errors.join("\n  "));
  process.exit(1);
}

// ── Emit ───────────────────────────────────────────────────────────────────
const outDir = path.join(root, "public/papers", paper.id);
fs.mkdirSync(outDir, { recursive: true });
const doc = {
  schema: "reprise.paper/1",
  id: paper.id,
  meta: paper.meta,
  abstract: paper.abstract,
  footnotes: paper.footnotes,
  blocks,
  targets: Object.fromEntries(targets),
};
const refsOut = {
  schema: "reprise.references/1",
  paper: paper.id,
  items: references.map((r) => ({
    ...r,
    links: {
      ...(r.arxiv && { arxiv: `https://arxiv.org/abs/${r.arxiv}` }),
      ...(r.doi && { doi: `https://doi.org/${r.doi}` }),
      ...(r.url && { url: r.url }),
      scholar: `https://scholar.google.com/scholar?q=${encodeURIComponent(r.title)}`,
    },
    citedIn: citedIn.get(r.id) ?? [],
  })),
};
fs.writeFileSync(path.join(outDir, "paper.json"), JSON.stringify(doc));
fs.writeFileSync(path.join(outDir, "references.json"), JSON.stringify(refsOut));
fs.writeFileSync(
  path.join(root, "public/papers/index.json"),
  JSON.stringify({ papers: [{ id: paper.id, title: paper.meta.title, subtitle: paper.meta.subtitle }] }),
);

const uncited = references.filter((r) => !citedIn.has(r.id)).map((r) => r.id);
console.log(
  `✓ ${paper.id}: ${blocks.length} blocks, ${targets.size} anchors, ${references.length} references` +
    (uncited.length ? ` (never cited in text: ${uncited.join(", ")})` : ""),
);
