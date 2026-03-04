"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, type Language, type Translations } from "../lib/translations";

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
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}
