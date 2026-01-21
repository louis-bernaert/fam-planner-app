"use client";

import Link from "next/link";
import styles from "./settings.module.css";
import Icon from "../components/Icon";

export default function SettingsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Paramètres</h1>
      </div>

      <div className={styles.settingsGrid}>
        <Link href="/settings/profile" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="user" size={24} />
          </div>
          <span className={styles.gridLabel}>Profil</span>
        </Link>

        <Link href="/settings/family" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="users" size={24} />
          </div>
          <span className={styles.gridLabel}>Famille</span>
        </Link>

        <Link href="/settings/calendar" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="calendar" size={24} />
          </div>
          <span className={styles.gridLabel}>Calendrier</span>
        </Link>

        <Link href="/settings/display" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="sun" size={24} />
          </div>
          <span className={styles.gridLabel}>Affichage</span>
        </Link>

        <Link href="/settings/points" className={styles.gridCard}>
          <div className={styles.gridIcon}>
            <Icon name="trophy" size={24} />
          </div>
          <span className={styles.gridLabel}>Points</span>
        </Link>
      </div>

      <div className={styles.backLink}>
        <Link href="/planner">
          <Icon name="arrowLeft" size={14} style={{ marginRight: '6px' }} />
          Retour au planner
        </Link>
      </div>
    </div>
  );
}
