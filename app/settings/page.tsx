"use client";

import Link from "next/link";
import styles from "./settings.module.css";
import Icon from "../components/Icon";

export default function SettingsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Paramètres</h1>
        <p className={styles.subtitle}>Gérez votre profil et vos préférences familiales</p>
      </div>

      <div className={styles.cardsGrid}>
        <Link href="/settings/profile" className={styles.card}>
          <div className={styles.cardIcon}>
            <Icon name="user" size={28} />
          </div>
          <div className={styles.cardContent}>
            <h2>Réglages profil</h2>
            <p>Gérer le compte, infos personnelles, sécurité…</p>
          </div>
          <div className={styles.cardArrow}>
            <Icon name="arrowRight" size={16} />
          </div>
        </Link>

        <Link href="/settings/family" className={styles.card}>
          <div className={styles.cardIcon}>
            <Icon name="users" size={28} />
          </div>
          <div className={styles.cardContent}>
            <h2>Réglages famille</h2>
            <p>Gérer la famille, membres, préférences…</p>
          </div>
          <div className={styles.cardArrow}>
            <Icon name="arrowRight" size={16} />
          </div>
        </Link>

        <Link href="/settings/calendar" className={styles.card}>
          <div className={styles.cardIcon}>
            <Icon name="calendar" size={28} />
          </div>
          <div className={styles.cardContent}>
            <h2>Paramètres calendrier</h2>
            <p>Couleurs des membres, liens iCal…</p>
          </div>
          <div className={styles.cardArrow}>
            <Icon name="arrowRight" size={16} />
          </div>
        </Link>

        <Link href="/settings/display" className={styles.card}>
          <div className={styles.cardIcon}>
            <Icon name="sun" size={28} />
          </div>
          <div className={styles.cardContent}>
            <h2>Réglages affichage</h2>
            <p>Thème, couleur d'accent, apparence…</p>
          </div>
          <div className={styles.cardArrow}>
            <Icon name="arrowRight" size={16} />
          </div>
        </Link>

        <Link href="/settings/points" className={styles.card}>
          <div className={styles.cardIcon}>
            <Icon name="trophy" size={28} />
          </div>
          <div className={styles.cardContent}>
            <h2>Réglages des points</h2>
            <p>Classement, participation, réinitialisation…</p>
          </div>
          <div className={styles.cardArrow}>
            <Icon name="arrowRight" size={16} />
          </div>
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
