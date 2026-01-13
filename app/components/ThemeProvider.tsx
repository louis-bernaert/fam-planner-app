'use client';

import { useEffect, ReactNode } from 'react';

type AccentColor = "blue" | "purple" | "green" | "orange" | "red" | "pink" | "teal";

const ACCENT_COLORS: { id: AccentColor; light: string; dark: string }[] = [
  { id: "blue", light: "#3b82f6", dark: "#60a5fa" },
  { id: "purple", light: "#8b5cf6", dark: "#a78bfa" },
  { id: "green", light: "#22c55e", dark: "#4ade80" },
  { id: "orange", light: "#f97316", dark: "#fb923c" },
  { id: "red", light: "#ef4444", dark: "#f87171" },
  { id: "pink", light: "#ec4899", dark: "#f472b6" },
  { id: "teal", light: "#14b8a6", dark: "#2dd4bf" },
];

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : "59, 130, 246";
}

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Appliquer le thème
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme && storedTheme !== "system") {
      document.documentElement.setAttribute("data-theme", storedTheme);
    }

    // Appliquer la couleur d'accent
    const storedAccent = localStorage.getItem("accentColor") as AccentColor | null;
    if (storedAccent) {
      const color = ACCENT_COLORS.find((c) => c.id === storedAccent);
      if (color) {
        const isDark =
          document.documentElement.getAttribute("data-theme") === "dark" ||
          (!storedTheme || storedTheme === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches;
        
        const primaryColor = isDark ? color.dark : color.light;
        const hoverColor = isDark ? color.light : adjustBrightness(color.light, -15);
        const subtleColor = isDark
          ? `rgba(${hexToRgb(color.light)}, 0.15)`
          : adjustBrightness(color.light, 95);

        document.documentElement.style.setProperty("--color-primary", primaryColor);
        document.documentElement.style.setProperty("--color-primary-hover", hoverColor);
        document.documentElement.style.setProperty("--color-primary-subtle", subtleColor);
      }
    }

    // Écouter les changements de préférence système
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentTheme = localStorage.getItem("theme");
      const accent = localStorage.getItem("accentColor") as AccentColor | null;
      
      if ((!currentTheme || currentTheme === "system") && accent) {
        const color = ACCENT_COLORS.find((c) => c.id === accent);
        if (color) {
          const isDark = mediaQuery.matches;
          const primaryColor = isDark ? color.dark : color.light;
          const hoverColor = isDark ? color.light : adjustBrightness(color.light, -15);
          const subtleColor = isDark
            ? `rgba(${hexToRgb(color.light)}, 0.15)`
            : adjustBrightness(color.light, 95);

          document.documentElement.style.setProperty("--color-primary", primaryColor);
          document.documentElement.style.setProperty("--color-primary-hover", hoverColor);
          document.documentElement.style.setProperty("--color-primary-subtle", subtleColor);
        }
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return <>{children}</>;
}
