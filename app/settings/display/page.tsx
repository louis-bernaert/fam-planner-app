"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../settings.module.css";
import Icon from "../../components/Icon";

type ThemeMode = "light" | "dark" | "system";
type AccentColor = "blue" | "purple" | "green" | "orange" | "red" | "pink" | "teal";

const ACCENT_COLORS: { id: AccentColor; label: string; light: string; dark: string }[] = [
  { id: "blue", label: "Bleu", light: "#3b82f6", dark: "#60a5fa" },
  { id: "purple", label: "Violet", light: "#8b5cf6", dark: "#a78bfa" },
  { id: "green", label: "Vert", light: "#22c55e", dark: "#4ade80" },
  { id: "orange", label: "Orange", light: "#f97316", dark: "#fb923c" },
  { id: "red", label: "Rouge", light: "#ef4444", dark: "#f87171" },
  { id: "pink", label: "Rose", light: "#ec4899", dark: "#f472b6" },
  { id: "teal", label: "Turquoise", light: "#14b8a6", dark: "#2dd4bf" },
];

export default function DisplaySettingsPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [accentColor, setAccentColor] = useState<AccentColor>("blue");
  const [saved, setSaved] = useState(false);

  // Charger les préférences au montage
  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as ThemeMode | null;
    const storedAccent = localStorage.getItem("accentColor") as AccentColor | null;
    
    if (storedTheme) setThemeMode(storedTheme);
    if (storedAccent) setAccentColor(storedAccent);
  }, []);

  // Appliquer le thème
  useEffect(() => {
    if (themeMode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", themeMode);
    }
  }, [themeMode]);

  // Appliquer la couleur d'accent
  useEffect(() => {
    const color = ACCENT_COLORS.find((c) => c.id === accentColor);
    if (color) {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark" ||
        (themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      
      const primaryColor = isDark ? color.dark : color.light;
      const hoverColor = isDark ? color.light : adjustBrightness(color.light, -15);
      const subtleColor = isDark
        ? `rgba(${hexToRgb(color.light)}, 0.15)`
        : adjustBrightness(color.light, 95);

      document.documentElement.style.setProperty("--color-primary", primaryColor);
      document.documentElement.style.setProperty("--color-primary-hover", hoverColor);
      document.documentElement.style.setProperty("--color-primary-subtle", subtleColor);
    }
  }, [accentColor, themeMode]);

  const handleSave = () => {
    localStorage.setItem("theme", themeMode);
    localStorage.setItem("accentColor", accentColor);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <Link href="/settings" className={styles.backButtonArrow}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1 className={styles.pageTitle}>Réglages affichage</h1>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="palette" size={18} />
          Couleur d'accent
        </h2>
        <p className={styles.sectionDesc}>Choisissez la couleur principale des boutons et éléments interactifs</p>

        <div className={styles.colorGrid}>
          {ACCENT_COLORS.map((color) => (
            <button
              type="button"
              key={color.id}
              className={`${styles.colorOption} ${accentColor === color.id ? styles.active : ""}`}
              onClick={() => setAccentColor(color.id)}
              title={color.label}
            >
              <span
                className={styles.colorSwatch}
                style={{ backgroundColor: color.light }}
              ></span>
              <span className={styles.colorLabel}>{color.label}</span>
              {accentColor === color.id && (
                <Icon name="check" size={14} className={styles.checkIcon} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="sun" size={18} />
          Mode de luminosité
        </h2>
        <p className={styles.sectionDesc}>Choisissez le thème par défaut de l'interface</p>

        <div className={styles.themeOptions}>
          <button
            type="button"
            className={`${styles.themeOption} ${themeMode === "light" ? styles.active : ""}`}
            onClick={() => setThemeMode("light")}
          >
            <div className={styles.themePreview} data-preview="light">
              <div className={styles.previewHeader}></div>
              <div className={styles.previewContent}>
                <div className={styles.previewLine}></div>
                <div className={styles.previewLine}></div>
              </div>
            </div>
            <Icon name="sun" size={20} className={styles.themeIconMobile} />
            <span className={styles.themeLabel}>Clair</span>
          </button>

          <button
            type="button"
            className={`${styles.themeOption} ${themeMode === "dark" ? styles.active : ""}`}
            onClick={() => setThemeMode("dark")}
          >
            <div className={styles.themePreview} data-preview="dark">
              <div className={styles.previewHeader}></div>
              <div className={styles.previewContent}>
                <div className={styles.previewLine}></div>
                <div className={styles.previewLine}></div>
              </div>
            </div>
            <Icon name="moon" size={20} className={styles.themeIconMobile} />
            <span className={styles.themeLabel}>Sombre</span>
          </button>

          <button
            type="button"
            className={`${styles.themeOption} ${themeMode === "system" ? styles.active : ""}`}
            onClick={() => setThemeMode("system")}
          >
            <div className={styles.themePreview} data-preview="system">
              <div className={styles.previewHeader}></div>
              <div className={styles.previewContent}>
                <div className={styles.previewLine}></div>
                <div className={styles.previewLine}></div>
              </div>
            </div>
            <Icon name="circleHalfStroke" size={20} className={styles.themeIconMobile} />
            <span className={styles.themeLabel}>Système</span>
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={handleSave}>
          <Icon name="check" size={16} />
          {saved ? "Enregistré !" : "Enregistrer les préférences"}
        </button>
      </div>
    </div>
  );
}

// Helpers
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
