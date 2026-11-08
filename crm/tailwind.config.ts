import type { Config } from "tailwindcss";
const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), panel: v("panel"), subtle: v("subtle"), hover: v("hover"),
        border: v("border"), "border-strong": v("border-strong"),
        fg: v("fg"), muted: v("muted"), faint: v("faint"),
        accent: v("accent"), "accent-fg": v("accent-fg"), "accent-soft": v("accent-soft"),
        danger: v("danger"), success: v("success"), warning: v("warning"),
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      fontSize: { xs: ["12px", "16px"], sm: ["13px", "20px"], base: ["14px", "22px"] },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px" },
      boxShadow: {
        pop: "0 2px 4px rgb(0 0 0 / 0.04), 0 8px 24px rgb(0 0 0 / 0.10)",
        card: "0 1px 2px rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
