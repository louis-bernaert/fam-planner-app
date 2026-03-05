export type UserPreferences = {
  language: "fr" | "en";
  theme: "light" | "dark" | "system";
  accentColor: "blue" | "purple" | "green" | "orange" | "red" | "pink" | "teal";
  notif_freeTasks: boolean;
  notif_evalTasks: boolean;
  onboardingCompleted: boolean;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: "fr",
  theme: "system",
  accentColor: "blue",
  notif_freeTasks: true,
  notif_evalTasks: true,
  onboardingCompleted: false,
};

export function resolvePreferences(
  dbPrefs: Partial<UserPreferences> | null | undefined
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(dbPrefs ?? {}) };
}

export function readPreferencesFromLocalStorage(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  const language = localStorage.getItem("language") as UserPreferences["language"] | null;
  const theme = localStorage.getItem("theme") as UserPreferences["theme"] | null;
  const accentColor = localStorage.getItem("accentColor") as UserPreferences["accentColor"] | null;
  const notifFree = localStorage.getItem("notif_freeTasks");
  const notifEval = localStorage.getItem("notif_evalTasks");

  return {
    language: language === "en" ? "en" : "fr",
    theme: theme && ["light", "dark", "system"].includes(theme) ? theme as UserPreferences["theme"] : "system",
    accentColor: accentColor && ["blue", "purple", "green", "orange", "red", "pink", "teal"].includes(accentColor) ? accentColor as UserPreferences["accentColor"] : "blue",
    notif_freeTasks: notifFree !== "false",
    notif_evalTasks: notifEval !== "false",
    onboardingCompleted: localStorage.getItem("onboardingCompleted") === "true",
  };
}

export function writePreferencesToLocalStorage(prefs: UserPreferences): void {
  localStorage.setItem("language", prefs.language);
  localStorage.setItem("theme", prefs.theme);
  localStorage.setItem("accentColor", prefs.accentColor);
  localStorage.setItem("notif_freeTasks", String(prefs.notif_freeTasks));
  localStorage.setItem("notif_evalTasks", String(prefs.notif_evalTasks));
  localStorage.setItem("onboardingCompleted", String(prefs.onboardingCompleted));
}

export async function savePreferencesToDB(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  try {
    await fetch(`/api/users/${userId}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
  } catch (err) {
    console.error("Failed to save preferences to DB:", err);
  }
}

export function dispatchPreferencesUpdated(prefs: UserPreferences): void {
  window.dispatchEvent(new CustomEvent("preferences-updated", { detail: prefs }));
}
