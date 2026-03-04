"use client";

import Link from "next/link";
import styles from "../settings.module.css";
import Icon from "../../components/Icon";
import { useTranslation } from "../../components/LanguageProvider";

export default function LanguageSettingsPage() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <Link href="/settings" className={styles.backButtonArrow}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1 className={styles.pageTitle}>{t.settings.languageSettings}</h1>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="globe" size={18} />
          {t.settings.language}
        </h2>
        <p className={styles.sectionDesc}>{t.settings.chooseLanguage}</p>

        <div className={styles.themeOptions} style={{ marginTop: "16px" }}>
          <button
            type="button"
            className={`${styles.themeOption} ${language === "fr" ? styles.active : ""}`}
            onClick={() => setLanguage("fr")}
          >
            <span style={{ fontSize: "1.5rem" }}>🇫🇷</span>
            <span className={styles.themeLabel}>{t.settings.french}</span>
          </button>

          <button
            type="button"
            className={`${styles.themeOption} ${language === "en" ? styles.active : ""}`}
            onClick={() => setLanguage("en")}
          >
            <span style={{ fontSize: "1.5rem" }}>🇬🇧</span>
            <span className={styles.themeLabel}>{t.settings.english}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
