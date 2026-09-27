// Parses the inline markup used inside paper text into a flat node list.
//   $...$  [@1, 2]  [#id:Label]  [^1]  [label](url)  **bold**  *italic*
const TOKEN =
  /\$([^$]+)\$|\[@([\d,\s]+)\]|\[#([\w.-]+):([^\]]+)\]|\[\^(\d+)\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|\*(?![\s*])(.+?)\*/g;

const cache = new Map();

export function parseInline(text) {
  if (text == null) return [];
  const hit = cache.get(text);
  if (hit) return hit;
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) nodes.push({ t: "text", v: text.slice(last, m.index) });
    const [, math, cite, xid, xlabel, fn, linkLabel, href, bold, italic] = m;
    if (math !== undefined) nodes.push({ t: "math", v: math });
    else if (cite !== undefined) nodes.push({ t: "cite", ids: cite.split(",").map((s) => Number(s.trim())) });
    else if (xid !== undefined) nodes.push({ t: "xref", id: xid, label: xlabel });
    else if (fn !== undefined) nodes.push({ t: "fn", n: fn });
    else if (href !== undefined) nodes.push({ t: "link", label: linkLabel, href });
    else if (bold !== undefined) nodes.push({ t: "b", children: parseInline(bold) });
    else if (italic !== undefined) nodes.push({ t: "i", children: parseInline(italic) });
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push({ t: "text", v: text.slice(last) });
  cache.set(text, nodes);
  return nodes;
}

/** Plain-text rendering of inline markup (for previews, CSV, search, labels). */
export function toPlain(text) {
  const walk = (nodes) =>
    nodes
      .map((n) => {
        switch (n.t) {
          case "text": case "math": return n.v;
          case "xref": case "link": return n.label;
          case "cite": case "fn": return "";
          default: return walk(n.children);
        }
      })
      .join("");
  return walk(parseInline(text)).replace(/\s+/g, " ").trim();
}

/** nth number appearing in a cell ("9.5 days (1.0×)" → 9.5 / 1.0), ignoring citations. */
export function cellNumber(cell, nth = 0) {
  if (cell == null) return null;
  const s = String(cell).replace(/\[@[\d,\s]+\]/g, "").replace(/\*/g, "");
  const nums = s.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length <= nth) return null;
  return Number(nums[nth]);
}
