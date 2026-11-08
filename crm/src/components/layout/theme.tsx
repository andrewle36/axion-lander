"use client";
import { createContext, useContext, useEffect, useState } from "react";
type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({ theme: "light", setTheme: () => {}, toggle: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => { try { const t = localStorage.getItem("theme") as Theme | null; if (t) setThemeState(t); } catch {} }, []);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("theme", t); } catch {}
    document.documentElement.classList.toggle("dark", t === "dark");
  };
  return <Ctx.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
