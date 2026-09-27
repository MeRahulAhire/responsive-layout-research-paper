"""Extract figures and the appendix benchmark tables from the FlashAttention PDF.

Reproduces the assets committed under public/papers/flashattention/figures/ and
content/benchmark-tables.json. The PDF is not committed; download it first:

    curl -L -o flashattention.pdf https://arxiv.org/pdf/2205.14135v2
    pip install pymupdf
    python scripts/extract_pdf.py flashattention.pdf
"""
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
FIG_DIR = ROOT / "public/papers/flashattention/figures"
TABLES_OUT = ROOT / "content/benchmark-tables.json"

# Vector figures: (0-based page, clip rect in PDF points). Rendered at 300 dpi.
VECTOR_FIGURES = {
    "fig1": (1, (104, 72, 512, 228)),
    "fig2": (5, (278, 68, 500, 148)),  # middle + right panels; the left panel is a table
    "fig3": (8, (100, 70, 500, 196)),
    "fig4": (26, (138, 68, 474, 332)),
}
# Raster figures embedded in the PDF: (0-based page, image index on that page).
RASTER_FIGURES = {"fig5": (27, 0), "fig6": (28, 0), "fig7": (28, 1), "fig8a": (29, 0), "fig8b": (29, 1)}

METHODS = [
    "PyTorch Attention", "Megatron", "Reformer", "Local Attention", "Linformer", "Smyrf",
    "LSformer", "Block Sparse", "Longformer", "BigBird", "FlashAttention", "Block-Sparse FlashAttention",
]


def extract_figures(doc):
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    for name, (page, rect) in VECTOR_FIGURES.items():
        doc[page].get_pixmap(clip=fitz.Rect(*rect), dpi=300).save(FIG_DIR / f"{name}.png")
    for name, (page, idx) in RASTER_FIGURES.items():
        xref = doc[page].get_image_info(xrefs=True)[idx]["xref"]
        pix = fitz.Pixmap(doc, xref)
        if pix.alpha or pix.n > 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        pix.save(FIG_DIR / f"{name}.png")


def extract_benchmark_tables(doc):
    """Tables 9–21: rebuild rows and columns from word coordinates.

    Plain-text extraction scrambles these tables, so each value is assigned to the
    nearest column header by x-position and to its row by y-position.
    """
    tables = {}
    for page_no in (30, 31, 32, 33):
        words = doc[page_no].get_text("words")  # x0, y0, x1, y1, text, ...
        captions = [w for w in words if w[4] == "Table" and w[0] < 120]
        for head in (w for w in words if w[4] == "Method"):
            hy = (head[1] + head[3]) / 2
            cols = sorted((w for w in words if abs((w[1] + w[3]) / 2 - hy) < 3 and re.fullmatch(r"\d+", w[4])), key=lambda w: w[0])
            centers = [(w[0] + w[2]) / 2 for w in cols]
            cap = max((c for c in captions if c[1] < head[1]), key=lambda c: c[1])
            number = next(w[4] for w in words if abs(w[1] - cap[1]) < 2 and cap[0] < w[0] < cap[0] + 40).strip(":")
            limit = min((c[1] for c in captions if c[1] > head[1] + 5), default=1e9)

            lines = {}
            for w in words:
                if w[1] > head[3] + 1 and w[3] < limit and w[1] < 760:
                    key = round((w[1] + w[3]) / 2)
                    key = next((k for k in lines if abs(k - key) < 3), key)
                    lines.setdefault(key, []).append(w)

            split = cols[0][0] - 8
            rows = []
            for key in sorted(lines):
                ws = sorted(lines[key], key=lambda w: w[0])
                label = " ".join(w[4] for w in ws if w[2] < split)
                if label not in METHODS:
                    continue  # skip body text that shares the page
                values = [None] * len(centers)
                for w in ws:
                    if w[2] >= split:
                        c = (w[0] + w[2]) / 2
                        values[min(range(len(centers)), key=lambda i: abs(centers[i] - c))] = w[4]
                rows.append([label, *values])

            assert [r[0] for r in rows] == METHODS, f"Table {number}: unexpected rows"
            assert all(v is not None for r in rows for v in r), f"Table {number}: empty cell"
            tables[number] = {"cols": [w[4] for w in cols], "rows": rows}
    TABLES_OUT.write_text(json.dumps(tables, indent=1), encoding="utf8")
    return sorted(tables, key=int)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pdf = fitz.open(sys.argv[1])
    extract_figures(pdf)
    print("tables:", extract_benchmark_tables(pdf))
