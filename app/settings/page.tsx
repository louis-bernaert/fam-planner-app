"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./settings.module.css";
import Icon from "../components/Icon";
import { useTranslation } from "../components/LanguageProvider";

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleLogout = () => {
    window.localStorage.removeItem("sessionUser");
    router.replace("/");
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <Link href="/planner" className={styles.backButtonArrow}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1 className={styles.pageTitle}>{t.settings.title}</h1>
      </div>

      <div className={styles.settingsGrid}>
        <Link href="/settings/profile" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="user" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.profile}</span>
        </Link>

        <Link href="/settings/family" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="users" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.family}</span>
        </Link>

        <Link href="/settings/calendar" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="calendar" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.calendar}</span>
        </Link>

        <Link href="/settings/display" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="sun" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.display}</span>
        </Link>

        <Link href="/settings/points" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="trophy" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.points}</span>
        </Link>

        <Link href="/settings/notifications" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="bell" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.notifications}</span>
        </Link>

        <Link href="/settings/language" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="globe" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.language}</span>
        </Link>

        <button onClick={() => router.push("/planner?guide=true")} className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="lightbulb" size={24} />
          </div>
          <span className={styles.gridLabel}>{t.settings.guide}</span>
        </button>
      </div>

      <div className={styles.backLink}>
        <button className={styles.btnDanger} onClick={handleLogout}>
          {t.common.logout}
        </button>
      </div>
    </div>
  );
}
