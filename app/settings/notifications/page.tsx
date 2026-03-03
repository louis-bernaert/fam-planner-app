"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../settings.module.css";
import Icon from "../../components/Icon";

export default function NotificationsSettingsPage() {
  const [freeTasksNotif, setFreeTasksNotif] = useState(true);
  const [evalNotif, setEvalNotif] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const freePref = localStorage.getItem("notif_freeTasks");
    const evalPref = localStorage.getItem("notif_evalTasks");
    if (freePref === "false") setFreeTasksNotif(false);
    if (evalPref === "false") setEvalNotif(false);
  }, []);

  const handleSave = () => {
    localStorage.setItem("notif_freeTasks", String(freeTasksNotif));
    localStorage.setItem("notif_evalTasks", String(evalNotif));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <Link href="/settings" className={styles.backButtonArrow}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1 className={styles.pageTitle}>Notifications</h1>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="bell" size={18} />
          Bannières de notification
        </h2>
        <p className={styles.sectionDesc}>
          Choisissez quelles notifications afficher sur votre écran d&apos;accueil
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Tâches libres</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Notification quand des tâches sont libres pour le lendemain
              </div>
            </div>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={freeTasksNotif}
                onChange={(e) => setFreeTasksNotif(e.target.checked)}
              />
              <span className={styles.toggleSlider}></span>
            </label>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Auto-évaluation</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Notification quand des tâches n&apos;ont pas été auto-évaluées
              </div>
            </div>
            <label className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={evalNotif}
                onChange={(e) => setEvalNotif(e.target.checked)}
              />
              <span className={styles.toggleSlider}></span>
            </label>
          </div>
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
