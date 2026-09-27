import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart, CustomChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { LabelLayout } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";
import { buildChartOption, TOKENS } from "../lib/charts.js";
import { cssVars, useTheme } from "../lib/theme.jsx";

echarts.use([LineChart, ScatterChart, CustomChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, LabelLayout, SVGRenderer]);

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function Chart({ table, state, height = 380, onMeta }) {
  const el = useRef(null);
  const inst = useRef(null);
  const { resolved } = useTheme();
  const narrow = useNarrow();

  const option = useMemo(() => {
    // Theme attribute is applied in an effect; read tokens after it lands.
    const colors = cssVars(TOKENS);
    return buildChartOption(table, colors, { ...state, compact: narrow });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, state, resolved, narrow]);

  useEffect(() => {
    onMeta?.({ shapes: option._shapes ?? [] });
  }, [option, onMeta]);

  useEffect(() => {
    inst.current = echarts.init(el.current, null, { renderer: "svg" });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      inst.current?.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={el} className="chart" style={{ height: narrow ? (height > 400 ? 560 : 340) : height }} role="img" aria-label={`Chart view of ${table.number ? `Table ${table.number}` : "table"}`} />;
}
