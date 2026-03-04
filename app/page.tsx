"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";
import { useTranslation } from "./components/LanguageProvider";

export default function HomePage() {
  const { t } = useTranslation();

  const features = [
    { icon: "⚖️", title: t.landing.measurableEquity, text: t.landing.measurableEquityText, highlight: t.landing.measurableEquityHighlight },
    { icon: "📅", title: t.landing.autoPlanning, text: t.landing.autoPlanningText, highlight: t.landing.autoPlanningHighlight },
    { icon: "🎮", title: t.landing.gamification, text: t.landing.gamificationText, highlight: t.landing.gamificationHighlight },
    { icon: "👨‍👩‍👧‍👦", title: t.landing.multiGen, text: t.landing.multiGenText, highlight: t.landing.multiGenHighlight },
    { icon: "📊", title: t.landing.realTimeTracking, text: t.landing.realTimeTrackingText, highlight: t.landing.realTimeTrackingHighlight },
    { icon: "🔔", title: t.landing.smartReminders, text: t.landing.smartRemindersText, highlight: t.landing.smartRemindersHighlight },
  ];

  const testimonials = [
    { text: t.landing.testimonial1, author: t.landing.testimonial1Author, role: t.landing.testimonial1Role, avatar: "👩‍👧‍👦" },
    { text: t.landing.testimonial2, author: t.landing.testimonial2Author, role: t.landing.testimonial2Role, avatar: "👨‍💻" },
    { text: t.landing.testimonial3, author: t.landing.testimonial3Author, role: t.landing.testimonial3Role, avatar: "👨‍👩‍👧‍👦" },
  ];

  const stats = [
    { value: "2h", label: t.landing.statHours },
    { value: "100%", label: t.landing.statTransparency },
    { value: "∞", label: t.landing.statDisputes },
  ];

  const problems = [
    { icon: "😤", text: t.landing.problem1 },
    { icon: "🤷", text: t.landing.problem2 },
    { icon: "😩", text: t.landing.problem3 },
    { icon: "💬", text: t.landing.problem4 },
  ];

  return (
    <main className={styles.page}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroSplit}>
          {/* Logo à gauche */}
          <div className={styles.heroLogo}>
            <Image
              src="/logo/logo_avec_nom_couleur.png"
              alt="Fam'Planner"
              width={600}
              height={600}
              className={styles.logo}
              priority
            />
          </div>
          
          {/* Contenu à droite */}
          <div className={styles.heroContent}>
            <div className={styles.badge}>
              <span>✨</span> {t.landing.badge}
            </div>
            
            <h1 className={styles.title}>
              {t.landing.title1}<br />
              <span className={styles.accent}>{t.landing.title2}</span>
            </h1>
            
            <p className={styles.description}>
              {t.landing.description}
            </p>
            
            <div className={styles.buttons}>
              <Link href="/planner?auth=signup" className={styles.btnPrimary}>
                <span>🚀</span> {t.landing.startFree}
              </Link>
              <Link href="/planner?auth=login" className={styles.btnSecondary}>
                {t.landing.alreadyAccount}
              </Link>
            </div>

            <p className={styles.noCard}>{t.landing.noCard}</p>
          </div>
        </div>

        {/* Stats flottants */}
        <div className={styles.floatingStats}>
          {stats.map((stat, idx) => (
            <div key={idx} className={styles.statBubble}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Problem Section */}
      <section className={styles.problemSection}>
        <h2 className={styles.sectionTitle}>
          {t.landing.recognizeTitle}
        </h2>
        <div className={styles.problemGrid}>
          {problems.map((problem, idx) => (
            <div key={idx} className={styles.problemCard}>
              <span className={styles.problemIcon}>{problem.icon}</span>
              <p>{problem.text}</p>
            </div>
          ))}
        </div>
        <div className={styles.solutionArrow}>
          <span>👇</span>
          <p>{t.landing.solvesAll}</p>
        </div>
      </section>

      {/* Séparateur */}
      <div className={styles.sectionDivider}></div>

      {/* Features Section */}
      <section className={styles.featuresSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>{t.landing.featuresLabel}</span>
          <h2 className={styles.sectionTitle}>
            {t.landing.featuresTitle}
          </h2>
        </div>
        <div className={styles.featuresGrid}>
          {features.map((feature) => (
            <div key={feature.title} className={styles.featureCard}>
              <div className={styles.featureHeader}>
                <span className={styles.featureIcon}>{feature.icon}</span>
                <span className={styles.featureHighlight}>{feature.highlight}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Séparateur */}
      <div className={styles.sectionDivider}></div>

      {/* How it works */}
      <section className={styles.howSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>{t.landing.simpleLabel}</span>
          <h2 className={styles.sectionTitle}>
            {t.landing.readyIn3Steps}
          </h2>
        </div>
        <div className={styles.stepsContainer}>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepIcon}>👨‍👩‍👧‍👦</div>
            <h3>{t.landing.step1Title}</h3>
            <p>{t.landing.step1Text}</p>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepIcon}>📝</div>
            <h3>{t.landing.step2Title}</h3>
            <p>{t.landing.step2Text}</p>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepIcon}>✨</div>
            <h3>{t.landing.step3Title}</h3>
            <p>{t.landing.step3Text}</p>
          </div>
        </div>
      </section>

      {/* Séparateur */}
      <div className={styles.sectionDivider}></div>

      {/* Testimonials */}
      <section className={styles.testimonialsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>{t.landing.testimonialsLabel}</span>
          <h2 className={styles.sectionTitle}>
            {t.landing.testimonialsTitle}
          </h2>
        </div>
        <div className={styles.testimonialsGrid}>
          {testimonials.map((testimonial, idx) => (
            <div key={idx} className={styles.testimonialCard}>
              <div className={styles.testimonialQuote}>"</div>
              <p className={styles.testimonialText}>{testimonial.text}</p>
              <div className={styles.testimonialAuthor}>
                <span className={styles.testimonialAvatar}>{testimonial.avatar}</span>
                <div>
                  <strong>{testimonial.author}</strong>
                  <span>{testimonial.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Séparateur */}
      <div className={styles.sectionDivider}></div>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <h2>{t.landing.ctaTitle}</h2>
          <p>
            {t.landing.ctaText1}<br />
            {t.landing.ctaText2}
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/planner?auth=signup" className={styles.btnPrimary}>
              <span>🎉</span> {t.landing.createHousehold}
            </Link>
          </div>
          <div className={styles.ctaFeatures}>
            <span>✓ {t.landing.free}</span>
            <span>✓ {t.landing.noCommitment}</span>
            <span>✓ {t.landing.secureData}</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <p>{t.landing.footer}</p>
          <div className={styles.footerLinks}>
            <Link href="/planner?auth=login">{t.landing.loginLink}</Link>
            <Link href="/planner?auth=signup">{t.landing.signupLink}</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
