import katex from "katex";

const cache = new Map();

export function renderMath(tex, display = false) {
  const key = (display ? "D:" : "I:") + tex;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      output: "htmlAndMathml",
    });
    cache.set(key, html);
  }
  return html;
}
