"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../settings.module.css";
import plannerStyles from "../../planner/page.module.css";
import Icon from "../../components/Icon";

type CalendarMember = {
  id: string;
  name: string;
  membershipId: string;
  color: string;
  calendarUrl: string | null;
};

export default function CalendarSettingsPage() {
  const [calendarMembers, setCalendarMembers] = useState<CalendarMember[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Load family from localStorage (sessionUser or selectedFamily)
  useEffect(() => {
    // Try sessionUser first (most reliable)
    const sessionUser = localStorage.getItem("sessionUser");
    if (sessionUser) {
      try {
        const parsed = JSON.parse(sessionUser);
        if (parsed.familyIds?.[0]) {
          setSelectedFamily(parsed.familyIds[0]);
          return;
        }
      } catch (e) {
        console.error("Failed to parse sessionUser", e);
      }
    }
    
    // Fallback to selectedFamily
    const savedFamily = localStorage.getItem("selectedFamily");
    if (savedFamily) {
      setSelectedFamily(savedFamily);
    }
  }, []);

  // Load calendar members
  useEffect(() => {
    if (!selectedFamily) {
      setIsLoading(false);
      return;
    }
    
    const loadMembers = async () => {
      try {
        const res = await fetch(`/api/calendar/members?familyId=${selectedFamily}`);
        if (res.ok) {
          const data = await res.json();
          setCalendarMembers(data);
        }
      } catch (error) {
        console.error("Failed to load calendar members", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadMembers();
  }, [selectedFamily]);

  const updateMemberLocalState = (memberId: string, field: "color" | "calendarUrl", value: string) => {
    setCalendarMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, [field]: value } : m))
    );
  };

  const updateMemberCalendarSettings = async (membershipId: string, color?: string, calendarUrl?: string) => {
    try {
      const res = await fetch(`/api/calendar/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color, calendarUrl }),
      });
      if (!res.ok) {
        console.error("Failed to update member settings");
      }
    } catch (error) {
      console.error("Failed to update member settings", error);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Paramètres du calendrier</h1>
          <p className={styles.subtitle}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!selectedFamily) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Paramètres du calendrier</h1>
          <p className={styles.subtitle}>Veuillez d'abord sélectionner une famille dans le planner.</p>
        </div>
        <div className={styles.backLinkArrow}>
          <Link href="/settings">
            <Icon name="arrowLeft" size={20} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Paramètres du calendrier</h1>
        <p className={styles.subtitle}>Configurez les couleurs et liens iCal pour chaque membre</p>
      </div>

      <div className={styles.section}>
        {calendarMembers.length === 0 ? (
          <p className={styles.mutedSmall}>Aucun membre trouvé dans cette famille.</p>
        ) : (
          <div className={plannerStyles.memberSettings} style={{ padding: 0 }}>
            <div className={plannerStyles.memberSettingsList}>
              {calendarMembers.map((member) => (
              <div key={member.id} className={plannerStyles.memberRow}>
                <div className={plannerStyles.memberInfo}>
                  <label className={plannerStyles.memberColorDot} style={{ backgroundColor: member.color, position: 'relative', cursor: 'pointer' }}>
                    {member.color && (
                      <span className={plannerStyles.memberColorCheck}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="9" cy="9" r="8" stroke="#fff" strokeWidth="2" fill="none" />
                          <path d="M5 9.5L8 12.5L13 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                    <input
                      type="color"
                      value={member.color}
                      onChange={(e) => {
                        updateMemberLocalState(member.id, "color", e.target.value);
                        updateMemberCalendarSettings(member.membershipId, e.target.value, member.calendarUrl || undefined);
                      }}
                      title="Couleur du membre"
                      className={plannerStyles.hiddenColorInput}
                    />
                  </label>
                  <span className={plannerStyles.memberName}>{member.name}</span>
                </div>
                <div className={plannerStyles.memberInputs}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Lien iCal du membre</span>
                    <input
                      type="text"
                      placeholder="URL iCal (webcal://...)"
                      value={member.calendarUrl || ""}
                      onChange={(e) => updateMemberLocalState(member.id, "calendarUrl", e.target.value)}
                      className={plannerStyles.calendarUrlInput}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <button
                    type="button"
                    className={plannerStyles.pasteBtn}
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        updateMemberLocalState(member.id, "calendarUrl", text);
                      } catch (err) {
                        console.error("Failed to paste:", err);
                        const manualText = prompt("Collez l'URL iCal ici:");
                        if (manualText) {
                          updateMemberLocalState(member.id, "calendarUrl", manualText);
                        }
                      }
                    }}
                    title="Coller depuis le presse-papiers"
                  >
                    <Icon name="paste" size={12} style={{ marginRight: '4px' }} />Coller
                  </button>
                  <button
                    type="button"
                    className={plannerStyles.saveBtn}
                    onClick={() => {
                      updateMemberCalendarSettings(member.membershipId, member.color, member.calendarUrl || undefined);
                      alert("URL sauvegardée !");
                    }}
                  >
                    <Icon name="circleCheck" size={12} style={{ marginRight: '4px' }} />Sauvegarder
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={plannerStyles.helpBox}>
            <strong>Comment obtenir l'URL iCal d'Apple Calendar ?</strong>
            <ol>
              <li>Ouvrez Apple Calendar sur Mac ou iCloud.com</li>
              <li>Clic droit sur le calendrier → Partager le calendrier</li>
              <li>Cochez "Calendrier public" et copiez l'URL</li>
              <li>Collez l'URL ici (commence par webcal:// ou https://)</li>
            </ol>
          </div>
        </div>
        )}
      </div>

      <div className={styles.backLinkArrow}>
        <Link href="/settings">
          <Icon name="arrowLeft" size={20} />
        </Link>
      </div>
    </div>
  );
}
