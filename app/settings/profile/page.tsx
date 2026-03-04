"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../settings.module.css";
import Icon from "../../components/Icon";
import { useTranslation } from "../../components/LanguageProvider";

function makeFullName(first?: string, last?: string, fallback?: string) {
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return fallback ?? "User";
}

export default function ProfileSettingsPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    // Load user from localStorage
    const stored = localStorage.getItem("sessionUser");
    if (stored) {
      const parsed = JSON.parse(stored);
      setCurrentUser(parsed);
      
      // Extract firstName/lastName from name if not set
      let firstName = parsed.firstName || "";
      let lastName = parsed.lastName || "";
      if (!firstName && !lastName && parsed.name) {
        const parts = parsed.name.split(" ");
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || "";
      }
      
      setFormData({
        firstName,
        lastName,
        email: parsed.email || "",
        password: "",
      });
    }
    setIsLoading(false);
  }, []);

  const saveProfile = async () => {
    if (!currentUser?.id) return;
    
    setIsSaving(true);
    setMessage("");
    
    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          ...(formData.password ? { password: formData.password } : {}),
        }),
      });
      
      if (res.ok) {
        const updatedUser = await res.json();
        
        // Update localStorage
        const stored = localStorage.getItem("sessionUser");
        if (stored) {
          const parsed = JSON.parse(stored);
          const newUserData = { ...parsed, ...updatedUser };
          localStorage.setItem("sessionUser", JSON.stringify(newUserData));
          setCurrentUser(newUserData);
        }
        
        setFormData((prev) => ({ ...prev, password: "" }));
        setMessage(t.settings.profileUpdated);
      } else {
        setMessage(t.settings.profileUpdateError);
      }
    } catch (err) {
      console.error("Failed to update user", err);
      setMessage(t.settings.profileUpdateError);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link href="/settings" className={styles.backButtonArrow}>
            <Icon name="arrowLeft" size={20} />
          </Link>
          <h1 className={styles.pageTitle}>{t.settings.profileSettings}</h1>
        </div>
        <div className={styles.section}>
          <p>{t.common.loading}</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link href="/settings" className={styles.backButtonArrow}>
            <Icon name="arrowLeft" size={20} />
          </Link>
          <h1 className={styles.pageTitle}>{t.settings.profileSettings}</h1>
        </div>
        <div className={styles.section}>
          <p>{t.settings.loginToAccess}</p>
          <Link href="/planner?auth=login" style={{ color: 'var(--color-primary)', marginTop: '1rem', display: 'inline-block' }}>
            {t.planner.loginBtn}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <Link href="/settings" className={styles.backButtonArrow}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1 className={styles.pageTitle}>{t.settings.profileSettings}</h1>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t.settings.hello}, {makeFullName(currentUser.firstName, currentUser.lastName, currentUser.name)}
        </h3>
        <p className={styles.mutedSmall} style={{ marginBottom: 'var(--space-4)' }}>
          {t.settings.editInfo}
        </p>
        
        <div className={styles.formGridSmall}>
          <label className={styles.label}>{t.settings.firstName}</label>
          <input
            className={styles.input}
            value={formData.firstName}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, firstName: e.target.value }))
            }
            placeholder={currentUser.firstName || t.settings.firstName}
          />
          
          <label className={styles.label}>{t.settings.lastName}</label>
          <input
            className={styles.input}
            value={formData.lastName}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, lastName: e.target.value }))
            }
            placeholder={currentUser.lastName || t.settings.lastName}
          />
          
          <label className={styles.label}>{t.planner.email}</label>
          <input
            className={styles.input}
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder={t.planner.email}
          />
          
          <label className={styles.label}>{t.settings.newPassword}</label>
          <input
            className={styles.input}
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            placeholder={t.settings.leaveEmpty}
          />
        </div>

        <div style={{ marginTop: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button 
            onClick={saveProfile} 
            disabled={isSaving}
            className={styles.smallButton}
            style={{ padding: 'var(--space-2) var(--space-4)' }}
          >
            {isSaving ? t.common.saving : t.common.save2}
          </button>
          {message && (
            <span className={styles.mutedSmall} style={{ color: message === t.settings.profileUpdated ? 'var(--color-success)' : 'var(--color-error)' }}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
