"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./points.module.css";
import Icon from "../../components/Icon";

interface Family {
  id: string;
  name: string;
  members: {
    id: string;
    userId: string;
    participatesInLeaderboard: boolean;
    participatesInAutoAssign: boolean;
    user: {
      id: string;
      name: string;
    };
  }[];
}

type ResetPeriod = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time";

export default function PointsSettingsPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [selectedMemberForReset, setSelectedMemberForReset] = useState<{userId: string; name: string} | null>(null);
  const [resetPeriod, setResetPeriod] = useState<ResetPeriod>("this_week");
  const [toast, setToast] = useState<{type: "success" | "error"; text: string} | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem("sessionUser");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setCurrentUser(parsed.id);
      } catch (e) {
        console.warn("session parse", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const loadFamilies = async () => {
      try {
        const res = await fetch(`/api/families?userId=${currentUser}`);
        if (res.ok) {
          const data = await res.json();
          setFamilies(data);
          if (data.length > 0) {
            setSelectedFamily(data[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load families", error);
      } finally {
        setLoading(false);
      }
    };

    loadFamilies();
  }, [currentUser]);

  const currentFamily = families.find(f => f.id === selectedFamily);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const toggleParticipation = async (membershipId: string, currentValue: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/points/participation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId,
          participatesInLeaderboard: !currentValue,
        }),
      });

      if (res.ok) {
        setFamilies(prev => prev.map(f => ({
          ...f,
          members: f.members.map(m => 
            m.id === membershipId 
              ? { ...m, participatesInLeaderboard: !currentValue }
              : m
          )
        })));
        showToast("success", !currentValue ? "Participe au classement" : "Retiré du classement");
      } else {
        showToast("error", "Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error("Failed to update participation", error);
      showToast("error", "Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoAssignParticipation = async (membershipId: string, currentValue: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/points/participation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId,
          participatesInAutoAssign: !currentValue,
        }),
      });

      if (res.ok) {
        setFamilies(prev => prev.map(f => ({
          ...f,
          members: f.members.map(m =>
            m.id === membershipId
              ? { ...m, participatesInAutoAssign: !currentValue }
              : m
          )
        })));
        showToast("success", !currentValue ? "Participe à l'auto-attribution" : "Retiré de l'auto-attribution");
      } else {
        showToast("error", "Erreur lors de la mise à jour");
      }
    } catch (error) {
      console.error("Failed to update auto-assign participation", error);
      showToast("error", "Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  const openResetModal = (userId: string, name: string) => {
    setSelectedMemberForReset({ userId, name });
    setResetPeriod("this_week");
    setResetModalOpen(true);
  };

  const closeResetModal = () => {
    setResetModalOpen(false);
    setSelectedMemberForReset(null);
  };

  const confirmReset = async () => {
    if (!selectedMemberForReset || !selectedFamily) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/points/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedMemberForReset.userId,
          familyId: selectedFamily,
          period: resetPeriod,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast("success", `${data.deletedCount} point(s) supprimé(s)`);
        closeResetModal();
      } else {
        showToast("error", "Erreur lors de la réinitialisation");
      }
    } catch (error) {
      console.error("Failed to reset points", error);
      showToast("error", "Erreur lors de la réinitialisation");
    } finally {
      setSaving(false);
    }
  };

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const periodOptions: { value: ResetPeriod; label: string; full?: boolean }[] = [
    { value: "today", label: "Aujourd'hui" },
    { value: "yesterday", label: "Hier" },
    { value: "this_week", label: "Cette semaine" },
    { value: "last_week", label: "Semaine dernière" },
    { value: "this_month", label: "Ce mois" },
    { value: "last_month", label: "Mois dernier" },
    { value: "all_time", label: "Tout réinitialiser", full: true },
  ];

  if (loading) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <Link href="/settings" className={styles.backBtn}>
              <Icon name="arrowLeft" size={16} />
            </Link>
            <h1 className={styles.headerTitle}>Réglages des points</h1>
          </div>
        </header>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <Link href="/settings" className={styles.backBtn}>
              <Icon name="arrowLeft" size={16} />
            </Link>
            <h1 className={styles.headerTitle}>Réglages des points</h1>
          </div>
        </header>
        <div className={styles.content}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Icon name="user" size={48} />
            </div>
            <p>Connectez-vous pour accéder aux réglages</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/settings" className={styles.backBtn}>
            <Icon name="arrowLeft" size={16} />
          </Link>
          <h1 className={styles.headerTitle}>Réglages des points</h1>
        </div>
      </header>

      {/* Content */}
      <div className={styles.content}>
        {/* Family selector */}
        {families.length > 1 && (
          <div className={styles.familySelector}>
            <select
              value={selectedFamily}
              onChange={(e) => setSelectedFamily(e.target.value)}
              className={styles.familySelect}
            >
              {families.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Participation section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={`${styles.sectionIconWrapper} ${styles.sectionIconPrimary}`}>
              <Icon name="trophy" size={22} />
            </div>
            <div className={styles.sectionInfo}>
              <h2>Classement</h2>
              <p>Choisissez qui participe au classement par points</p>
            </div>
          </div>
          
          <div className={styles.memberList}>
            {currentFamily?.members.map(member => (
              <div key={member.id} className={styles.memberItem}>
                <span className={styles.memberName}>{member.user.name}</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={member.participatesInLeaderboard}
                    onChange={() => toggleParticipation(member.id, member.participatesInLeaderboard)}
                    disabled={saving}
                  />
                  <span className={styles.toggleTrack} />
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Auto-assign participation section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={`${styles.sectionIconWrapper} ${styles.sectionIconPrimary}`}>
              <Icon name="calendar" size={22} />
            </div>
            <div className={styles.sectionInfo}>
              <h2>Auto-attribution</h2>
              <p>Choisissez qui participe à l'auto-attribution des tâches</p>
            </div>
          </div>

          <div className={styles.memberList}>
            {currentFamily?.members.map(member => (
              <div key={member.id} className={styles.memberItem}>
                <span className={styles.memberName}>{member.user.name}</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={member.participatesInAutoAssign}
                    onChange={() => toggleAutoAssignParticipation(member.id, member.participatesInAutoAssign)}
                    disabled={saving}
                  />
                  <span className={styles.toggleTrack} />
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Reset section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={`${styles.sectionIconWrapper} ${styles.sectionIconWarning}`}>
              <Icon name="refresh" size={22} />
            </div>
            <div className={styles.sectionInfo}>
              <h2>Réinitialiser</h2>
              <p>Remettez les points d'un membre à zéro</p>
            </div>
          </div>
          
          <div className={styles.memberList}>
            {currentFamily?.members.map(member => (
              <div key={member.id} className={styles.memberItem}>
                <span className={styles.memberName}>{member.user.name}</span>
                <button
                  className={styles.resetBtn}
                  onClick={() => openResetModal(member.userId, member.user.name)}
                  disabled={saving}
                >
                  <Icon name="refresh" size={14} />
                  Réinitialiser
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}>
          <Icon name={toast.type === "success" ? "check" : "x"} size={16} />
          {toast.text}
        </div>
      )}

      {/* Reset modal */}
      {resetModalOpen && selectedMemberForReset && (
        <div className={styles.modalOverlay} onClick={closeResetModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Réinitialiser les points</h3>
              <button className={styles.modalClose} onClick={closeResetModal}>
                <Icon name="x" size={18} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <p className={styles.modalSubtitle}>
                Supprimer les points de <strong>{selectedMemberForReset.name}</strong> pour :
              </p>
              
              <div className={styles.periodGrid}>
                {periodOptions.map(option => (
                  <div 
                    key={option.value} 
                    className={`${styles.periodOption} ${option.full ? styles.periodOptionFull : ''}`}
                  >
                    <input
                      type="radio"
                      id={option.value}
                      name="resetPeriod"
                      value={option.value}
                      checked={resetPeriod === option.value}
                      onChange={() => setResetPeriod(option.value)}
                    />
                    <label htmlFor={option.value} className={styles.periodLabel}>
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>

              <div className={styles.warningBox}>
                <Icon name="alertTriangle" size={18} className={styles.warningIcon} />
                <span className={styles.warningText}>
                  Cette action est irréversible. Les validations de tâches seront supprimées.
                </span>
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeResetModal}>
                Annuler
              </button>
              <button 
                className={styles.btnDanger} 
                onClick={confirmReset}
                disabled={saving}
              >
                {saving ? "Suppression..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
