import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

const features = [
  {
    icon: "⚖️",
    title: "Équité mesurable",
    text: "Fini les disputes ! Chaque tâche a un score basé sur le temps et la pénibilité.",
    highlight: "Score intelligent",
  },
  {
    icon: "📅",
    title: "Planning automatique",
    text: "L'algorithme prend en compte les disponibilités de chacun pour une répartition optimale.",
    highlight: "Gain de temps",
  },
  {
    icon: "🎮",
    title: "Gamification motivante",
    text: "Points, classements et récompenses : toute la famille s'implique avec plaisir !",
    highlight: "Fun garanti",
  },
  {
    icon: "👨‍👩‍👧‍👦",
    title: "Multi-générations",
    text: "Adultes, ados, enfants : des tâches adaptées à l'âge et aux capacités de chacun.",
    highlight: "Inclusif",
  },
  {
    icon: "📊",
    title: "Suivi en temps réel",
    text: "Visualisez qui fait quoi, suivez les contributions et célébrez les efforts.",
    highlight: "Transparence",
  },
  {
    icon: "🔔",
    title: "Rappels intelligents",
    text: "Notifications personnalisées pour ne jamais oublier une tâche importante.",
    highlight: "Zéro oubli",
  },
];

const testimonials = [
  {
    text: "Depuis qu'on utilise Fam'Planner, les disputes sur les tâches ménagères ont disparu. Les enfants adorent gagner des points !",
    author: "Marie L.",
    role: "Maman de 3 enfants",
    avatar: "👩‍👧‍👦",
  },
  {
    text: "Enfin une app qui comprend que faire la vaisselle et tondre la pelouse, ce n'est pas le même effort !",
    author: "Thomas D.",
    role: "Papa en télétravail",
    avatar: "👨‍💻",
  },
  {
    text: "Mes ados participent maintenant sans qu'on ait besoin de leur demander 10 fois. Le système de points les motive vraiment.",
    author: "Sophie M.",
    role: "Famille recomposée",
    avatar: "👨‍👩‍👧‍👦",
  },
];

const stats = [
  { value: "2h", label: "de discussions évitées par semaine" },
  { value: "100%", label: "de transparence sur la répartition" },
  { value: "∞", label: "de disputes en moins" },
];

const problems = [
  { icon: "😤", text: "\"C'est toujours moi qui fais tout !\"" },
  { icon: "🤷", text: "\"Qui devait sortir les poubelles ?\"" },
  { icon: "😩", text: "\"Les enfants ne participent jamais\"" },
  { icon: "💬", text: "\"On passe notre temps à négocier\"" },
];

export default function HomePage() {
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
              <span>✨</span> Nouveau : Système de délégation des tâches
            </div>
            
            <h1 className={styles.title}>
              La paix des ménages,<br />
              <span className={styles.accent}>enfin mesurable</span>
            </h1>
            
            <p className={styles.description}>
              Répartissez équitablement les tâches familiales grâce à un système de points 
              intelligent. Fini les disputes, place à l'harmonie !
            </p>
            
            <div className={styles.buttons}>
              <Link href="/planner?auth=signup" className={styles.btnPrimary}>
                <span>🚀</span> Commencer gratuitement
              </Link>
              <Link href="/planner?auth=login" className={styles.btnSecondary}>
                J'ai déjà un compte
              </Link>
            </div>

            <p className={styles.noCard}>Gratuit • Sans carte bancaire • En 2 minutes</p>
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
          Vous reconnaissez ces situations ?
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
          <p>Fam'Planner résout tout ça</p>
        </div>
      </section>

      {/* Séparateur */}
      <div className={styles.sectionDivider}></div>

      {/* Features Section */}
      <section className={styles.featuresSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>Fonctionnalités</span>
          <h2 className={styles.sectionTitle}>
            Tout ce qu'il faut pour une famille organisée
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
          <span className={styles.sectionBadge}>Simple comme bonjour</span>
          <h2 className={styles.sectionTitle}>
            Prêt en 3 étapes
          </h2>
        </div>
        <div className={styles.stepsContainer}>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepIcon}>👨‍👩‍👧‍👦</div>
            <h3>Créez votre foyer</h3>
            <p>Ajoutez les membres de la famille avec leur rôle et disponibilités</p>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepIcon}>📝</div>
            <h3>Définissez les tâches</h3>
            <p>Listez vos tâches avec durée, fréquence et niveau de pénibilité</p>
          </div>
          <div className={styles.stepArrow}>→</div>
          <div className={styles.stepCard}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepIcon}>✨</div>
            <h3>Laissez la magie opérer</h3>
            <p>L'algorithme répartit équitablement et chacun suit ses points</p>
          </div>
        </div>
      </section>

      {/* Séparateur */}
      <div className={styles.sectionDivider}></div>

      {/* Testimonials */}
      <section className={styles.testimonialsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>Témoignages</span>
          <h2 className={styles.sectionTitle}>
            Ils ont retrouvé la sérénité
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
          <h2>Prêt à transformer votre quotidien ?</h2>
          <p>
            Rejoignez les familles qui ont choisi l'équité et la sérénité.<br />
            Inscription gratuite, résultats immédiats.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/planner?auth=signup" className={styles.btnPrimary}>
              <span>🎉</span> Créer mon foyer maintenant
            </Link>
          </div>
          <div className={styles.ctaFeatures}>
            <span>✓ Gratuit</span>
            <span>✓ Sans engagement</span>
            <span>✓ Données sécurisées</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <p>© 2026 Fam'Planner — Fait avec ❤️ pour les familles</p>
          <div className={styles.footerLinks}>
            <Link href="/planner?auth=login">Connexion</Link>
            <Link href="/planner?auth=signup">Inscription</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
