"use client";

import { useState, useEffect } from "react";

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Check if running as PWA (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;

    if (isStandalone) {
      // Show splash for PWA mode
      const fadeTimer = setTimeout(() => {
        setIsFading(true);
      }, 1200);

      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 1700);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else {
      // Hide immediately for browser mode
      setIsVisible(false);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--color-bg, #ffffff)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        opacity: isFading ? 0 : 1,
        transition: "opacity 0.5s ease-out",
      }}
    >
      <img
        src="/logo/logo_sans_nom_couleur.png"
        alt="Fam'Planner"
        style={{
          width: 120,
          height: 120,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <h1
        style={{
          marginTop: 24,
          fontSize: "1.5rem",
          fontWeight: 600,
          color: "var(--color-text, #1e293b)",
          letterSpacing: "-0.02em",
        }}
      >
        Fam'Planner
      </h1>
      <p
        style={{
          marginTop: 8,
          fontSize: "0.875rem",
          color: "var(--color-text-muted, #64748b)",
        }}
      >
        Chargement...
      </p>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
