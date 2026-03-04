"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { translations, type Language, type Translations } from "../lib/translations";
import { savePreferencesToDB } from "../lib/userPreferences";

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "fr",
  setLanguage: () => {},
  t: translations.fr,
});

export const useTranslation = () => useContext(LanguageContext);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("fr");

  useEffect(() => {
    const stored = localStorage.getItem("language") as Language | null;
    if (stored && (stored === "fr" || stored === "en")) {
      setLanguageState(stored);
    }

    // Listen for preference changes from login flow (same tab)
    const onPrefsUpdated = (e: Event) => {
      const lang = (e as CustomEvent).detail?.language;
      if (lang && (lang === "fr" || lang === "en")) {
        setLanguageState(lang as Language);
      }
    };
    window.addEventListener("preferences-updated", onPrefsUpdated);

    return () => {
      window.removeEventListener("preferences-updated", onPrefsUpdated);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);

    // Persist to DB if user is logged in
    const raw = localStorage.getItem("sessionUser");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.id) savePreferencesToDB(user.id, { language: lang });
      } catch { /* ignore */ }
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}
