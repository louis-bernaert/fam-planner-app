"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import { useTranslation } from "../components/LanguageProvider";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const email = searchParams?.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit() {
    setError("");
    if (!password || password.length < 6) {
      setError(t.resetPassword.passwordMinLength);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.resetPassword.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || t.resetPassword.resetError);
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t.resetPassword.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h2 className={styles.title}>{t.resetPassword.invalidLink}</h2>
          <p className={styles.description}>
            {t.resetPassword.invalidLinkDesc}
          </p>
          <Link href="/planner?auth=login" className={styles.link}>
            {t.resetPassword.backToLogin}
          </Link>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.successIcon}>
            <svg viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
              <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
            </svg>
          </div>
          <h2 className={styles.title}>{t.resetPassword.passwordChanged}</h2>
          <p className={styles.description}>
            {t.resetPassword.passwordChangedDesc}
          </p>
          <Link href="/planner?auth=login" className={styles.link}>
            {t.resetPassword.loginBtn}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <h2 className={styles.title}>{t.resetPassword.newPassword}</h2>
        <p className={styles.description}>
          {t.resetPassword.chooseNewPassword}
        </p>
        <div className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>{t.resetPassword.newPasswordLabel}</label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.resetPassword.minChars}
                className={styles.input}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg viewBox="0 0 640 512" width="16" height="16" fill="currentColor">
                    <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zM223.1 149.5C261.2 110.1 314 96 320 96c57.6 0 106 40 120 96c5.1 20.4 2.3 38.8-4.8 55.3L223.1 149.5zM135.5 175L89.4 142.3C58.5 173.1 35.5 209.3 22.5 237.7c-2.5 5.4-2.5 11.5 0 16.9c14.9 35.7 46.2 87.7 93 131.1C162.5 427.2 227.2 464 308 464c48.8 0 91.1-15 127.5-37.6l-48.5-38.1c-30.8 19.5-67.6 31.7-107 31.7c-86.8 0-156-56.6-181.5-135.2c-4.8-15-6.3-31.1-3.3-47L135.5 175z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 576 512" width="16" height="16" fill="currentColor">
                    <path d="M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4C142.5 443.2 207.2 480 288 480s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 92.9-131.1c3.3-7.9 3.3-16.7 0-24.6c-14.8-35.7-46.1-87.7-92.9-131.1C433.5 68.8 368.8 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64a64 64 0 1 0 0 128 64 64 0 1 0 0-128z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>{t.resetPassword.confirmPassword}</label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.resetPassword.confirmPlaceholder}
                className={styles.input}
              />
            </div>
          </div>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t.resetPassword.resetting : t.resetPassword.resetBtn}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <main className={styles.shell}>
          <div className={styles.card}>
            <p>{t.common.loading}</p>
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
