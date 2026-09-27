import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "reprise-theme";
const ThemeContext = createContext(null);

function readStored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStored);
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSysDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const resolved = mode === "system" ? (sysDark ? "dark" : "light") : mode;

  useEffect(() => {
    const el = document.documentElement;
    if (mode === "system") delete el.dataset.theme;
    else el.dataset.theme = mode;
    try {
      if (mode === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      /* storage unavailable — theme still applies for this visit */
    }
  }, [mode]);

  const setMode = useCallback((m) => setModeState(m), []);
  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Read resolved CSS custom properties (after the theme attribute has applied). */
export function cssVars(names) {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()]));
}
