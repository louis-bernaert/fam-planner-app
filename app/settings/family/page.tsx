"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import styles from "../settings.module.css";
import Icon from "../../components/Icon";

function makeFullName(first?: string, last?: string, fallback?: string) {
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return fallback ?? "Utilisateur";
}

export default function FamilySettingsPage() {
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedFamily, setSelectedFamily] = useState<string>("");
  const [users, setUsers] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  
  // Family management
  const [newFamilyName, setNewFamilyName] = useState("");
  const [joinFamilyCode, setJoinFamilyCode] = useState("");
  const [paramMessage, setParamMessage] = useState("");
  const [editFamilyId, setEditFamilyId] = useState("");
  const [editFamilyName, setEditFamilyName] = useState("");
  
  // Member management
  const [newUserFirst, setNewUserFirst] = useState("");
  const [newUserLast, setNewUserLast] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [addUserMessage, setAddUserMessage] = useState("");

  // Kick member
  const [memberToKick, setMemberToKick] = useState<{
    userId: string;
    name: string;
    familyId: string;
    familyName: string;
  } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("sessionUser");
    if (stored) {
      const parsed = JSON.parse(stored);
      setSelectedUser(parsed.id);
      if (parsed.familyIds?.[0]) setSelectedFamily(parsed.familyIds[0]);
      loadData(parsed.id, parsed.familyIds?.[0]);
    }
    const savedFamily = localStorage.getItem("selectedFamily");
    if (savedFamily) {
      setSelectedFamily(savedFamily);
    }
  }, []);

  const loadData = async (userId?: string, familyId?: string) => {
    const uid = userId || selectedUser;
    if (!uid) return;
    
    try {
      const familiesRes = await fetch(`/api/families?userId=${uid}`);
      const familiesData = await familiesRes.json();
      
      if (Array.isArray(familiesData)) {
        setFamilies(familiesData);
        
        // Load users from family memberships
        const allUsers: any[] = [];
        for (const family of familiesData) {
          if (family.members) {
            for (const member of family.members) {
              if (member.user && !allUsers.find(u => u.id === member.user.id)) {
                allUsers.push({
                  ...member.user,
                  familyId: family.id,
                  isAdmin: member.role === "admin",
                });
              }
            }
          }
        }
        setUsers(allUsers);
        
        // Set selected family if not set
        if (!selectedFamily && familiesData.length > 0) {
          setSelectedFamily(familiesData[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load data", err);
    }
  };

  const currentFamily = useMemo(
    () => families.find((f) => f.id === selectedFamily),
    [families, selectedFamily]
  );

  const addFamily = async () => {
    if (!newFamilyName.trim() || !selectedUser) return;
    try {
      const res = await fetch("/api/families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFamilyName, userId: selectedUser }),
      });
      if (res.ok) {
        const newFamily = await res.json();
        setFamilies((prev) => [...prev, newFamily]);
        setSelectedFamily(newFamily.id);
        setNewFamilyName("");
        // Reload data to get updated users list
        loadData(selectedUser);
      }
    } catch (err) {
      console.error("Failed to create family", err);
    }
  };

  const deleteFamily = async (familyId: string) => {
    try {
      const res = await fetch(`/api/families/${familyId}`, { method: "DELETE" });
      if (res.ok) {
        setFamilies((prev) => prev.filter((f) => f.id !== familyId));
        if (selectedFamily === familyId) {
          setSelectedFamily(families.find((f) => f.id !== familyId)?.id ?? "");
        }
      }
    } catch (err) {
      console.error("Failed to delete family", err);
    }
  };

  const startEditFamily = (familyId: string) => {
    const family = families.find((f) => f.id === familyId);
    if (family) {
      setEditFamilyId(familyId);
      setEditFamilyName(family.name);
    }
  };

  const saveEditFamily = async () => {
    if (!editFamilyId || !editFamilyName.trim()) return;
    try {
      const res = await fetch(`/api/families/${editFamilyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editFamilyName }),
      });
      if (res.ok) {
        setFamilies((prev) =>
          prev.map((f) => (f.id === editFamilyId ? { ...f, name: editFamilyName } : f))
        );
        setEditFamilyId("");
        setEditFamilyName("");
      }
    } catch (err) {
      console.error("Failed to update family", err);
    }
  };

  const joinFamilyByCode = async () => {
    if (!joinFamilyCode.trim() || !selectedUser) return;
    setParamMessage("");
    try {
      const res = await fetch("/api/families/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinFamilyCode, userId: selectedUser }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.family) {
          const found = families.find((f) => f.id === data.family.id);
          if (!found) {
            setFamilies((prev) => [...prev, data.family]);
          }
          setSelectedFamily(data.family.id);
          setParamMessage("Famille rejointe avec succès !");
        }
      } else {
        setParamMessage("Code invalide ou famille introuvable.");
      }
    } catch (err) {
      setParamMessage("Erreur lors de la tentative.");
    }
    setJoinFamilyCode("");
  };

  const leaveFamily = async () => {
    if (!selectedFamily || !selectedUser) return;
    try {
      const res = await fetch("/api/families/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: selectedFamily, userId: selectedUser }),
      });
      if (res.ok) {
        const remainingFamilies = families.filter((f) => f.id !== selectedFamily);
        setFamilies(remainingFamilies);
        setSelectedFamily(remainingFamilies[0]?.id ?? "");
      }
    } catch (err) {
      console.error("Failed to leave family", err);
    }
  };

  const addUser = async () => {
    if (!newUserEmail.trim()) {
      setAddUserMessage("Email requis");
      return;
    }
    if (!selectedFamily) {
      setAddUserMessage("Sélectionnez une famille");
      return;
    }
    setAddUserMessage("");
    try {
      const res = await fetch("/api/users/add-to-family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail,
          firstName: newUserFirst,
          lastName: newUserLast,
          familyId: selectedFamily,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUsers((prev) => {
            const exists = prev.find((u) => u.id === data.user.id);
            if (exists) {
              return prev.map((u) =>
                u.id === data.user.id ? { ...u, familyId: selectedFamily } : u
              );
            }
            return [...prev, { ...data.user, familyId: selectedFamily }];
          });
        }
        setNewUserFirst("");
        setNewUserLast("");
        setNewUserEmail("");
        setAddUserMessage("Membre ajouté avec succès !");
      } else {
        const errorData = await res.json();
        setAddUserMessage(errorData.error || "Erreur lors de l'ajout");
      }
    } catch (err) {
      setAddUserMessage("Erreur lors de l'ajout");
    }
  };

  const toggleAdminRole = async (membershipId: string, currentRole: string, familyId: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    try {
      const res = await fetch("/api/memberships", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId,
          role: newRole,
          requesterId: selectedUser,
        }),
      });
      if (res.ok) {
        setFamilies((prev) =>
          prev.map((f) =>
            f.id === familyId
              ? {
                  ...f,
                  members: f.members.map((m: any) =>
                    m.id === membershipId ? { ...m, role: newRole } : m
                  ),
                }
              : f
          )
        );
      } else {
        const errorData = await res.json();
        alert(errorData.error || "Erreur lors de la modification du rôle");
      }
    } catch (err) {
      console.error("Failed to update role", err);
    }
  };

  const kickMember = async () => {
    if (!memberToKick) return;
    try {
      const res = await fetch(`/api/families/${memberToKick.familyId}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: memberToKick.userId,
          requesterId: selectedUser,
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.filter(
            (u) =>
              !(u.id === memberToKick.userId && u.familyId === memberToKick.familyId)
          )
        );
        // Also update the family members in families state
        setFamilies((prev) =>
          prev.map((f) =>
            f.id === memberToKick.familyId
              ? {
                  ...f,
                  members: f.members.filter(
                    (m: any) => m.userId !== memberToKick.userId
                  ),
                }
              : f
          )
        );
        setMemberToKick(null);
      } else {
        const errorData = await res.json();
        alert(errorData.error || "Erreur lors de l'exclusion");
        setMemberToKick(null);
      }
    } catch (err) {
      console.error("Failed to kick member", err);
      setMemberToKick(null);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <Link href="/settings" className={styles.backButtonArrow}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1 className={styles.pageTitle}>Réglages famille</h1>
      </div>

      {/* Current Family Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Famille actuelle</h3>
        
        {families.length > 0 ? (
          <div className={styles.inlineForm}>
            <select 
              value={selectedFamily} 
              onChange={(e) => setSelectedFamily(e.target.value)}
              className={styles.select}
            >
              {families.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button onClick={leaveFamily} disabled={!currentFamily}>Quitter</button>
          </div>
        ) : (
          <p className={styles.mutedSmall}>Aucune famille</p>
        )}
        
        <div className={styles.divider} />
        
        <label className={styles.label}>Rejoindre une famille par code</label>
        <div className={styles.inlineForm}>
          <input
            value={joinFamilyCode}
            onChange={(e) => setJoinFamilyCode(e.target.value)}
            placeholder="Code de la famille"
          />
          <button onClick={joinFamilyByCode}>Rejoindre</button>
        </div>
        {paramMessage && <p className={styles.mutedSmall}>{paramMessage}</p>}
      </div>

      {/* Create Family Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Créer une famille</h3>
        <div className={styles.inlineForm}>
          <input
            value={newFamilyName}
            onChange={(e) => setNewFamilyName(e.target.value)}
            placeholder="Nom de famille"
          />
          <button onClick={addFamily}>Créer</button>
        </div>
      </div>

      {/* Family List Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Familles créées</h3>
        <div className={styles.listBox}>
          {families.map((f) => {
            const familyMembers = users.filter((u) => u.familyId === f.id);
            const isCurrentUserAdmin = f.members?.some(
              (m: any) => m.userId === selectedUser && m.role === "admin"
            );
            return (
              <div key={f.id}>
                <div className={styles.listRow}>
                  {editFamilyId === f.id ? (
                    <>
                      <input
                        value={editFamilyName}
                        onChange={(e) => setEditFamilyName(e.target.value)}
                        className={styles.input}
                        placeholder="Nom de famille"
                      />
                      <div className={styles.rowActions}>
                        <button className={styles.smallButton} onClick={saveEditFamily}>Enregistrer</button>
                        <button className={styles.smallGhost} onClick={() => setEditFamilyId("")}>Annuler</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>{f.name}</strong>
                        <p className={styles.mutedSmall}>Code: {f.code}</p>
                      </div>
                      <div className={styles.rowActions}>
                        <button
                          className={`${styles.smallButton} ${styles.iconOnly}`}
                          onClick={() => startEditFamily(f.id)}
                          aria-label="Modifier"
                          title="Modifier"
                        >
                          <Icon name="pen" size={12} />
                        </button>
                        <button
                          className={`${styles.smallGhost} ${styles.iconOnly}`}
                          onClick={() => deleteFamily(f.id)}
                          aria-label="Supprimer"
                          title="Supprimer"
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {!editFamilyId || editFamilyId !== f.id ? (
                  <div className={styles.familyMembers}>
                    {familyMembers.length === 0 ? (
                      <p className={styles.mutedSmall}>Aucun membre</p>
                    ) : (
                      familyMembers.map((member) => {
                        const membership = f.members?.find(
                          (m: any) => m.userId === member.id
                        );
                        const memberRole = membership?.role;
                        const membershipId = membership?.id;
                        const isMemberAdmin = memberRole === "admin";
                        const canKick =
                          isCurrentUserAdmin &&
                          !isMemberAdmin &&
                          member.id !== selectedUser;
                        const canToggleAdmin =
                          isCurrentUserAdmin &&
                          member.id !== selectedUser &&
                          membershipId;
                        return (
                          <div key={member.id} className={styles.memberChip}>
                            {makeFullName(member.firstName, member.lastName, member.name)}
                            {isMemberAdmin && <span className={styles.adminBadge}>(admin)</span>}
                            {canToggleAdmin && (
                              <button
                                className={styles.kickButton}
                                onClick={() => toggleAdminRole(membershipId, memberRole || "member", f.id)}
                                aria-label={isMemberAdmin ? "Révoquer admin" : "Nommer admin"}
                                title={isMemberAdmin ? "Révoquer admin" : "Nommer admin"}
                                style={isMemberAdmin ? { color: 'var(--color-primary, #3b82f6)' } : undefined}
                              >
                                <Icon name="star" size={10} />
                              </button>
                            )}
                            {canKick && (
                              <button
                                className={styles.kickButton}
                                onClick={() =>
                                  setMemberToKick({
                                    userId: member.id,
                                    name: makeFullName(member.firstName, member.lastName, member.name),
                                    familyId: f.id,
                                    familyName: f.name,
                                  })
                                }
                                aria-label="Exclure"
                                title="Exclure de la famille"
                              >
                                <Icon name="xmark" size={10} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {families.length === 0 && <p className={styles.mutedSmall}>Aucune famille.</p>}
        </div>
      </div>

      {/* Add Member Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Ajouter un membre existant</h3>
        <p className={styles.mutedSmall} style={{ marginBottom: 'var(--space-3)' }}>
          Ajoutez un utilisateur existant à la famille sélectionnée (email requis).
        </p>
        <div className={styles.inlineForm}>
          <input
            value={newUserFirst}
            onChange={(e) => setNewUserFirst(e.target.value)}
            placeholder="Prénom"
          />
          <input
            value={newUserLast}
            onChange={(e) => setNewUserLast(e.target.value)}
            placeholder="Nom"
          />
          <input
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="Email (utilisateur existant)"
          />
          <button onClick={addUser}>Ajouter</button>
        </div>
        {addUserMessage && <p className={styles.mutedSmall}>{addUserMessage}</p>}
      </div>

      {/* Kick Member Confirmation Modal */}
      {memberToKick && (
        <div className={styles.modalOverlay} onClick={() => setMemberToKick(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Exclure un membre</h3>
              <button className={styles.modalClose} onClick={() => setMemberToKick(null)}>
                <Icon name="xmark" size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                Voulez-vous vraiment exclure <strong>{memberToKick.name}</strong> de la
                famille <strong>{memberToKick.familyName}</strong> ?
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setMemberToKick(null)}>
                Annuler
              </button>
              <button className={styles.btnDanger} onClick={kickMember}>
                Exclure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
