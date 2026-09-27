import { useCallback, useEffect, useState } from "react";
import { PaperProvider, jumpTo, usePaper } from "./lib/paper.jsx";
import { BlockList } from "./components/Blocks.jsx";
import { Abstract, Hero, Toc, TopBar, useActiveSection, useOutline } from "./components/Chrome.jsx";
import { References } from "./components/References.jsx";

const url = (p) => `${import.meta.env.BASE_URL}${p}`;

async function loadPaper() {
  const index = await fetch(url("papers/index.json")).then((r) => r.json());
  const id = new URLSearchParams(location.search).get("paper") ?? index.papers[0].id;
  const [paper, references] = await Promise.all([
    fetch(url(`papers/${id}/paper.json`)).then((r) => r.json()),
    fetch(url(`papers/${id}/references.json`)).then((r) => r.json()),
  ]);
  return { paper, references };
}

function Reader() {
  const outline = useOutline();
  const active = useActiveSection(outline);
  const [tocOpen, setTocOpen] = useState(false);
  const closeToc = useCallback(() => setTocOpen(false), []);

  // Honour deep links once content has rendered.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) setTimeout(() => jumpTo(id, { flash: true }), 60);
  }, []);

  return (
    <>
      <a className="skip-link" href="#abstract">Skip to content</a>
      <TopBar outline={outline} active={active} onOpenToc={() => setTocOpen(true)} />
      <div className="layout">
        <aside className="layout__rail">
          <Toc outline={outline} active={active} open={tocOpen} onClose={closeToc} />
        </aside>
        <main className="article">
          <Hero />
          <Abstract />
          <PaperBody />
          <References />
          <footer className="colophon">
            <p>
              Rendered by <span className="brand__word">Reprise</span> from the arXiv preprint. Text, equations, tables and figures are the authors’;
              reference summaries and chart views are editorial additions.
            </p>
          </footer>
        </main>
      </div>
    </>
  );
}

function PaperBody() {
  const { paper } = usePaper();
  return <BlockList blocks={paper.blocks} />;
}

export default function App() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    loadPaper()
      .then((data) => {
        document.title = `${data.paper.meta.title}: ${data.paper.meta.subtitle} — Reprise`;
        setState({ status: "ready", ...data });
      })
      .catch((err) => setState({ status: "error", err }));
  }, []);

  if (state.status === "loading") {
    return (
      <div className="boot" aria-busy="true">
        <div className="boot__mark">R</div>
        <div className="boot__line" />
        <div className="boot__line boot__line--short" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="boot boot--error" role="alert">
        <p>Couldn’t load this paper.</p>
        <code>{String(state.err?.message ?? state.err)}</code>
      </div>
    );
  }
  return (
    <PaperProvider paper={state.paper} references={state.references}>
      <Reader />
    </PaperProvider>
  );
}
