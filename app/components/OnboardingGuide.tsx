"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./OnboardingGuide.module.css";
import Icon from "./Icon";
import { useTranslation } from "./LanguageProvider";
import { savePreferencesToDB } from "../lib/userPreferences";

type StepKey = "welcome" | "tabs" | "settings" | "tasks" | "planner" | "points" | "installIos" | "ready";

interface StepConfig {
  key: StepKey;
  target: string | null; // data-onboarding attribute value, null for centered card
  tabAction?: string;    // tab to navigate to before showing this step
  icon: string;
}

const ALL_STEPS: StepConfig[] = [
  { key: "welcome", target: null, icon: "sparkles" },
  { key: "tabs", target: "tabbar", icon: "home" },
  { key: "settings", target: "settings-btn", icon: "gear" },
  { key: "tasks", target: "tab-taches", tabAction: "taches", icon: "clipboardList" },
  { key: "planner", target: "tab-planificateur", tabAction: "planificateur", icon: "calendarDay" },
  { key: "points", target: "tab-points", tabAction: "points", icon: "trophy" },
  { key: "installIos", target: null, icon: "mobileAlt" },
  { key: "ready", target: null, icon: "circleCheck" },
];

interface OnboardingGuideProps {
  onComplete: () => void;
  onNavigateTab?: (tab: string) => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingGuide({ onComplete, onNavigateTab }: OnboardingGuideProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [animKey, setAnimKey] = useState(0);
  const resizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Detect iOS
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

  const steps = ALL_STEPS.filter((s) => s.key !== "installIos" || showIosStep);
  const totalSteps = steps.length;
  const step = steps[currentStep];
  const isLast = currentStep === totalSteps - 1;
  const stepData = t.onboarding[step.key] as { title: string; description: string };

  // Position spotlight and tooltip around target element
  const positionSpotlight = useCallback(() => {
    if (!step.target) {
      setSpotlightRect(null);
      return;
    }

    const el = document.querySelector(`[data-onboarding="${step.target}"]`);
    if (!el) {
      setSpotlightRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 8;
    const sr: SpotlightRect = {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
    setSpotlightRect(sr);

    // Position tooltip below or above the spotlight
    const tooltipWidth = Math.min(340, window.innerWidth - 32);
    const spaceBelow = window.innerHeight - (sr.top + sr.height);
    const spaceAbove = sr.top;
    const placeBelow = spaceBelow > 180 || spaceBelow > spaceAbove;

    let tooltipTop: number;
    if (placeBelow) {
      tooltipTop = sr.top + sr.height + 12;
    } else {
      tooltipTop = sr.top - 12; // will use transform to move up
    }

    let tooltipLeft = sr.left + sr.width / 2 - tooltipWidth / 2;
    tooltipLeft = Math.max(16, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - 16));

    const style: React.CSSProperties = {
      top: placeBelow ? tooltipTop : undefined,
      bottom: placeBelow ? undefined : window.innerHeight - sr.top + 12,
      left: tooltipLeft,
      width: tooltipWidth,
    };
    setTooltipStyle(style);
  }, [step.target]);

  // Navigate to step
  const goTo = useCallback((index: number) => {
    const nextStep = steps[index];

    // Navigate tab if needed
    if (nextStep.tabAction && onNavigateTab) {
      onNavigateTab(nextStep.tabAction);
    }

    setCurrentStep(index);
    setAnimKey((k) => k + 1);
  }, [steps, onNavigateTab]);

  // After step change, reposition spotlight (with delay for tab transition)
  useEffect(() => {
    const delay = step.tabAction ? 100 : 0;
    const timer = setTimeout(() => positionSpotlight(), delay);
    return () => clearTimeout(timer);
  }, [currentStep, step.tabAction, positionSpotlight]);

  // Reposition on resize
  useEffect(() => {
    const handleResize = () => {
      clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => positionSpotlight(), 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer.current);
    };
  }, [positionSpotlight]);

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

  // Navigation buttons shared between tooltip and center card
  const navButtons = (
    <div className={styles.nav}>
      <button
        className={`${styles.navBtn} ${currentStep === 0 ? styles.navBtnHidden : ""}`}
        onClick={handlePrev}
      >
        <Icon name="arrowLeft" size={14} />
        {t.onboarding.previous}
      </button>

      {!isLast && (
        <button className={styles.skipBtn} onClick={handleComplete}>
          {t.onboarding.skip}
        </button>
      )}

      {isLast ? (
        <button className={styles.navBtnPrimary} onClick={handleComplete}>
          {t.onboarding.done}
          <Icon name="arrowRight" size={14} />
        </button>
      ) : (
        <button className={styles.navBtnPrimary} onClick={handleNext}>
          {t.onboarding.next}
          <Icon name="arrowRight" size={14} />
        </button>
      )}
    </div>
  );

  const dotsEl = (
    <div className={styles.dots}>
      {steps.map((_, i) => (
        <button
          key={i}
          className={`${styles.dot} ${i === currentStep ? styles.dotActive : ""}`}
          onClick={() => goTo(i)}
          aria-label={`Step ${i + 1}`}
        />
      ))}
    </div>
  );

  // CENTERED CARD (steps without target)
  if (!step.target || !spotlightRect) {
    return (
      <div className={styles.overlay}>
        <div className={styles.centerBackdrop}>
          <div className={styles.centerCard} key={animKey}>
            <div className={styles.iconCircle}>
              <Icon name={step.icon} size={40} />
            </div>
            <h2 className={styles.title}>{stepData.title}</h2>
            <p className={styles.description}>{stepData.description}</p>
            <span className={styles.stepCounter}>
              {currentStep + 1} {t.onboarding.stepOf} {totalSteps}
            </span>
            {dotsEl}
            {navButtons}
          </div>
        </div>
      </div>
    );
  }

  // SPOTLIGHT + TOOLTIP (steps with target)
  return (
    <div className={styles.overlay} onClick={handleNext}>
      <div
        className={styles.spotlight}
        style={{
          top: spotlightRect.top,
          left: spotlightRect.left,
          width: spotlightRect.width,
          height: spotlightRect.height,
        }}
      />
      <div
        className={styles.tooltip}
        style={tooltipStyle}
        key={animKey}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>{stepData.title}</h2>
        <p className={styles.description}>{stepData.description}</p>
        <span className={styles.stepCounter}>
          {currentStep + 1} {t.onboarding.stepOf} {totalSteps}
        </span>
        {dotsEl}
        {navButtons}
      </div>
    </div>
  );
}
