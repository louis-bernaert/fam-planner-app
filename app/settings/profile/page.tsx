"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../settings.module.css";
import Icon from "../../components/Icon";

function makeFullName(first?: string, last?: string, fallback?: string) {
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return fallback ?? "Utilisateur";
}

export default function ProfileSettingsPage() {
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
        setMessage("Profil mis à jour avec succès !");
      } else {
        setMessage("Erreur lors de la mise à jour");
      }
    } catch (err) {
      console.error("Failed to update user", err);
      setMessage("Erreur lors de la mise à jour");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link href="/settings" className={styles.backButton}>
            <Icon name="arrowLeft" size={14} />
            Retour
          </Link>
          <h1 className={styles.pageTitle}>Réglages profil</h1>
        </div>
        <div className={styles.section}>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link href="/settings" className={styles.backButton}>
            <Icon name="arrowLeft" size={14} />
            Retour
          </Link>
          <h1 className={styles.pageTitle}>Réglages profil</h1>
        </div>
        <div className={styles.section}>
          <p>Veuillez vous connecter pour accéder à vos paramètres.</p>
          <Link href="/planner?auth=login" style={{ color: 'var(--color-primary)', marginTop: '1rem', display: 'inline-block' }}>
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <Link href="/settings" className={styles.backButton}>
          <Icon name="arrowLeft" size={14} />
          Retour
        </Link>
        <h1 className={styles.pageTitle}>Réglages profil</h1>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Bonjour, {makeFullName(currentUser.firstName, currentUser.lastName, currentUser.name)}
        </h3>
        <p className={styles.mutedSmall} style={{ marginBottom: 'var(--space-4)' }}>
          Modifiez vos informations personnelles ci-dessous.
        </p>
        
        <div className={styles.formGridSmall}>
          <label className={styles.label}>Prénom</label>
          <input
            className={styles.input}
            value={formData.firstName}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, firstName: e.target.value }))
            }
            placeholder={currentUser.firstName || "Prénom"}
          />
          
          <label className={styles.label}>Nom</label>
          <input
            className={styles.input}
            value={formData.lastName}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, lastName: e.target.value }))
            }
            placeholder={currentUser.lastName || "Nom"}
          />
          
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="Email"
          />
          
          <label className={styles.label}>Nouveau mot de passe</label>
          <input
            className={styles.input}
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, password: e.target.value }))
            }
            placeholder="Laisser vide pour ne pas changer"
          />
        </div>

        <div style={{ marginTop: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button 
            onClick={saveProfile} 
            disabled={isSaving}
            className={styles.smallButton}
            style={{ padding: 'var(--space-2) var(--space-4)' }}
          >
            {isSaving ? "Enregistrement..." : "Sauvegarder"}
          </button>
          {message && (
            <span className={styles.mutedSmall} style={{ color: message.includes('succès') ? 'var(--color-success)' : 'var(--color-error)' }}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
