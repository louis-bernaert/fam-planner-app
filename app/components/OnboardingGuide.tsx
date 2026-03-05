"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./OnboardingGuide.module.css";
import Icon from "./Icon";
import { useTranslation } from "./LanguageProvider";
import { savePreferencesToDB } from "../lib/userPreferences";

type StepKey = "welcome" | "family" | "tabs" | "tasks" | "planner" | "points" | "calendar" | "installIos" | "ready";

const STEP_ICONS: Record<StepKey, string> = {
  welcome: "sparkles",
  family: "users",
  tabs: "home",
  tasks: "clipboardList",
  planner: "calendarDay",
  points: "trophy",
  calendar: "calendar",
  installIos: "mobileAlt",
  ready: "circleCheck",
};

interface OnboardingGuideProps {
  onComplete: () => void;
}

export function OnboardingGuide({ onComplete }: OnboardingGuideProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Detect iOS (not already installed as PWA)
  const [showIosStep, setShowIosStep] = useState(false);
  useEffect(() => {
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setShowIosStep(isIos && !isStandalone);
  }, []);

  const allStepKeys: StepKey[] = [
    "welcome", "family", "tabs", "tasks", "planner",
    "points", "calendar", "installIos", "ready",
  ];
  const stepKeys = allStepKeys.filter((k) => k !== "installIos" || showIosStep);
  const totalSteps = stepKeys.length;

  const goTo = useCallback((index: number) => {
    setCurrentStep(index);
    setAnimKey((k) => k + 1);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) goTo(currentStep + 1);
  }, [currentStep, totalSteps, goTo]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) goTo(currentStep - 1);
  }, [currentStep, goTo]);

  const handleComplete = useCallback(() => {
    localStorage.setItem("onboardingCompleted", "true");
    const raw = localStorage.getItem("sessionUser");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.id) savePreferencesToDB(user.id, { onboardingCompleted: true });
      } catch { /* ignore */ }
    }
    onComplete();
  }, [onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "Escape") handleComplete();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNext, handlePrev, handleComplete]);

  // Touch/swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
  };

  const key = stepKeys[currentStep];
  const stepData = t.onboarding[key] as { title: string; description: string };
  const iconName = STEP_ICONS[key];
  const isLast = currentStep === totalSteps - 1;

  return (
    <div
      className={styles.overlay}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {!isLast && (
        <button className={styles.skipBtn} onClick={handleComplete}>
          {t.onboarding.skip}
        </button>
      )}

      <div className={`${styles.slide} ${styles.slideEnter}`} key={animKey}>
        <div className={styles.iconCircle}>
          <Icon name={iconName} size={48} />
        </div>
        <h2 className={styles.title}>{stepData.title}</h2>
        <p className={styles.description}>{stepData.description}</p>
        <span className={styles.stepCounter}>
          {currentStep + 1} {t.onboarding.stepOf} {totalSteps}
        </span>
      </div>

      <div className={styles.dots}>
        {stepKeys.map((_, i) => (
          <button
            key={i}
            className={`${styles.dot} ${i === currentStep ? styles.dotActive : ""}`}
            onClick={() => goTo(i)}
            aria-label={`Step ${i + 1}`}
          />
        ))}
      </div>

      <div className={styles.nav}>
        <button
          className={`${styles.navBtn} ${currentStep === 0 ? styles.navBtnHidden : ""}`}
          onClick={handlePrev}
        >
          <Icon name="arrowLeft" size={16} />
          {t.onboarding.previous}
        </button>

        {isLast ? (
          <button className={styles.navBtnPrimary} onClick={handleComplete}>
            {t.onboarding.done}
            <Icon name="arrowRight" size={16} />
          </button>
        ) : (
          <button className={styles.navBtnPrimary} onClick={handleNext}>
            {t.onboarding.next}
            <Icon name="arrowRight" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
