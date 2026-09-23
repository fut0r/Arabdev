import { useColorScheme } from '@mui/material/styles';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { docUrls, newTab } from '@/components/DocLinks';
import { useAuth } from '@/features/auth/AuthProvider';
import '@/features/landing/landing.css';
import { useAppearance } from '@/features/preferences/useAppearance';
import { useSeo } from '@/utils/seo';
import { HELLO_EMAIL, HOME_PATH, SUPPORT_EMAIL } from '@/site';

function Svg({ children, size = 17 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Arrow = () => (
  <span className="lp-arrow">
    <Svg size={15}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  </span>
);

const Check = () => (
  <Svg>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);

/** Fades blocks in as they scroll into view; skipped when the device asks for less motion. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const targets = root.current?.querySelectorAll('.lp-reveal');
    if (!targets?.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return root;
}

/** A hairline under the header once the page scrolls. */
function useStickyHeader() {
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () => header.current?.classList.toggle('is-stuck', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return header;
}

export default function LandingPage() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const { language, setLanguage, setMode } = useAppearance();
  const { mode, systemMode } = useColorScheme();
  const root = useReveal();
  const header = useStickyHeader();
  useSeo({ title: t('home.metaTitle'), description: t('home.heroLead'), canonical: '/' });

  // Signed in: straight to the dashboard. Otherwise sign in first.
  const signedIn = status === 'authenticated';
  const startHref = signedIn ? HOME_PATH : '/login';
  const startLabel = signedIn ? t('home.openApp') : t('home.getStarted');
  const docs = docUrls(language);
  // 'system' follows the device, so ask MUI what that resolves to before flipping the switch.
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';

  return (
    <div className="lp" ref={root}>
      <header className="lp-header" ref={header}>
        <div className="lp-shell lp-header-inner">
          <a className="lp-logo" href="#top" aria-label="ArabDev">
            <span>Arab</span>Dev
          </a>
          <nav className="lp-nav" aria-label={t('home.navLabel')}>
            <a href="#features">{t('home.navFeatures')}</a>
            <a href="#about">{t('home.navAbout')}</a>
            <a href="#start">{t('home.navStart')}</a>
            <a href="#docs">{t('home.navDocs')}</a>
            <a href="#contact">{t('home.navContact')}</a>
          </nav>
          <div className="lp-header-actions">
            <button
              type="button"
              className="lp-btn lp-btn-quiet lp-icon-btn"
              onClick={() => setMode(dark ? 'light' : 'dark')}
              aria-label={t('home.themeToggle')}
            >
              {dark ? (
                <Svg size={16}>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
                </Svg>
              ) : (
                <Svg size={16}>
                  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
                </Svg>
              )}
            </button>
            <button
              type="button"
              className="lp-btn lp-btn-quiet"
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              lang={language === 'ar' ? 'en' : 'ar'}
            >
              {language === 'ar' ? 'English' : 'العربية'}
            </button>
            {!signedIn && (
              <RouterLink className="lp-btn lp-hide-sm" to="/login">
                {t('common.signIn')}
              </RouterLink>
            )}
            <RouterLink className="lp-btn lp-btn-primary" to={signedIn ? HOME_PATH : '/register'}>
              {signedIn ? t('home.openApp') : t('common.signUp')}
            </RouterLink>
          </div>
        </div>
      </header>

      <main id="top">
        {/* hero */}
        <section className="lp-shell lp-hero">
          <div className="lp-hero-grid">
            <div>
              <h1 className="lp-h1">
                {t('home.heroLine1')}
                <br />
                <span>{t('home.heroHighlight')}</span>
              </h1>
              <p className="lp-lead">{t('home.heroLead')}</p>
              <div className="lp-cta">
                <RouterLink className="lp-btn lp-btn-primary lp-btn-lg" to={startHref}>
                  {startLabel}
                  <Arrow />
                </RouterLink>
                <RouterLink className="lp-btn lp-btn-lg" to="/explore">
                  {t('home.browse')}
                </RouterLink>
              </div>
              <ul className="lp-facts">
                <li>
                  <b>25</b> {t('home.stat1')}
                </li>
                <li>
                  <b>20</b> {t('home.stat2')}
                </li>
                <li>
                  <b>2</b> {t('home.stat3')}
                </li>
                <li>
                  <b>0</b> {t('home.stat4')}
                </li>
              </ul>
            </div>

            <div className="lp-laptop">
              <div className="lp-laptop-lid">
                <div className="lp-laptop-screen">
                  <img
                    src="/screenshots/dashboard.webp"
                    alt={t('home.screenshotAlt')}
                    width="1600"
                    height="944"
                    loading="eager"
                  />
                </div>
              </div>
              <div className="lp-laptop-base" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* features */}
        <section className="lp-shell lp-section" id="features">
          <div className="lp-reveal">
            <span className="lp-eyebrow">{t('home.featuresEyebrow')}</span>
            <h2 className="lp-h2">{t('home.featuresTitle')}</h2>
            <p className="lp-sub">{t('home.featuresSub')}</p>
          </div>
          <div className="lp-bento lp-reveal">
            <article className="lp-card">
              <h3>
                <Svg>
                  <path d="M4 5h16v14H4z" />
                  <path d="M9 10l-2 2 2 2" />
                  <path d="M15 10l2 2-2 2" />
                </Svg>
                {t('home.f1Title')}
              </h3>
              <p>{t('home.f1Body')}</p>
            </article>
            <article className="lp-card">
              <h3>
                <Svg>
                  <rect x="3" y="4" width="18" height="6" rx="2" />
                  <rect x="3" y="14" width="18" height="6" rx="2" />
                </Svg>
                {t('home.f2Title')}
              </h3>
              <p>{t('home.f2Body')}</p>
            </article>
            <article className="lp-card">
              <h3>
                <Svg>
                  <path d="M3 12V5h7l11 11-7 7z" />
                  <circle cx="7.5" cy="8.5" r="1.4" />
                </Svg>
                {t('home.f3Title')}
              </h3>
              <p>{t('home.f3Body')}</p>
            </article>
            <article className="lp-card">
              <h3>
                <Svg>
                  <path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7z" />
                  <path d="M10.5 20a2 2 0 0 0 3 0" />
                </Svg>
                {t('home.f4Title')}
              </h3>
              <p>{t('home.f4Body')}</p>
            </article>
            <article className="lp-card">
              <h3>
                <Svg>
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </Svg>
                {t('home.f5Title')}
              </h3>
              <p>{t('home.f5Body')}</p>
            </article>
            <article className="lp-card">
              <h3>
                <Svg>
                  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
                  <circle cx="12" cy="12" r="4" />
                </Svg>
                {t('home.f6Title')}
              </h3>
              <p>{t('home.f6Body')}</p>
            </article>
          </div>
        </section>

        {/* about */}
        <section className="lp-shell lp-section" id="about">
          <div className="lp-split">
            <div className="lp-reveal">
              <span className="lp-eyebrow">{t('home.aboutEyebrow')}</span>
              <h2 className="lp-h2">{t('home.aboutTitle')}</h2>
              <p className="lp-sub">{t('home.aboutBody1')}</p>
              <p className="lp-sub">{t('home.aboutBody2')}</p>
              <a className="lp-textlink" href={docs.wiki} {...newTab}>
                {t('home.aboutLink')}
                <Arrow />
              </a>
            </div>
            <ul className="lp-checks lp-reveal">
              <li>
                <Check />
                <div>
                  <b>{t('home.about1Title')}</b>
                  <p>{t('home.about1Body')}</p>
                </div>
              </li>
              <li>
                <Check />
                <div>
                  <b>{t('home.about2Title')}</b>
                  <p>{t('home.about2Body')}</p>
                </div>
              </li>
              <li>
                <Check />
                <div>
                  <b>{t('home.about3Title')}</b>
                  <p>{t('home.about3Body')}</p>
                </div>
              </li>
              <li>
                <Check />
                <div>
                  <b>{t('home.about4Title')}</b>
                  <p>{t('home.about4Body')}</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* steps */}
        <section className="lp-shell lp-section" id="start">
          <div className="lp-reveal">
            <span className="lp-eyebrow">{t('home.stepsEyebrow')}</span>
            <h2 className="lp-h2">{t('home.stepsTitle')}</h2>
          </div>
          <div className="lp-steps lp-reveal">
            <div className="lp-step">
              <b>01</b>
              <h3>{t('home.step1Title')}</h3>
              <p>{t('home.step1Body')}</p>
            </div>
            <div className="lp-step">
              <b>02</b>
              <h3>{t('home.step2Title')}</h3>
              <p>{t('home.step2Body')}</p>
            </div>
            <div className="lp-step">
              <b>03</b>
              <h3>{t('home.step3Title')}</h3>
              <p>{t('home.step3Body')}</p>
            </div>
          </div>
        </section>

        {/* privacy */}
        <section className="lp-shell lp-section" id="privacy">
          <div className="lp-split">
            <div className="lp-reveal">
              <span className="lp-eyebrow">{t('home.privacyEyebrow')}</span>
              <h2 className="lp-h2">{t('home.privacyTitle')}</h2>
              <p className="lp-sub">{t('home.privacyBody')}</p>
              <a className="lp-textlink" href={docs.privacy} {...newTab}>
                {t('home.privacyLink')}
                <Arrow />
              </a>
            </div>
            <ul className="lp-checks lp-reveal">
              <li>
                <Check />
                <div>
                  <b>{t('home.p1Title')}</b>
                  <p>{t('home.p1Body')}</p>
                </div>
              </li>
              <li>
                <Check />
                <div>
                  <b>{t('home.p2Title')}</b>
                  <p>{t('home.p2Body')}</p>
                </div>
              </li>
              <li>
                <Check />
                <div>
                  <b>{t('home.p3Title')}</b>
                  <p>{t('home.p3Body')}</p>
                </div>
              </li>
              <li>
                <Check />
                <div>
                  <b>{t('home.p4Title')}</b>
                  <p>{t('home.p4Body')}</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* docs */}
        <section className="lp-shell lp-section" id="docs">
          <div className="lp-reveal">
            <span className="lp-eyebrow">{t('home.docsEyebrow')}</span>
            <h2 className="lp-h2">{t('home.docsTitle')}</h2>
            <p className="lp-sub">{t('home.docsSub')}</p>
          </div>
          <div className="lp-bento lp-reveal">
            <a className="lp-card" href={docs.wiki} {...newTab}>
              <h3>{t('nav.wiki')}</h3>
              <p>{t('home.docsWiki')}</p>
              <span className="lp-card-link">
                <span className="lp-url">wiki.arabdev.site</span>
                <Arrow />
              </span>
            </a>
            <a className="lp-card" href={docs.privacy} {...newTab}>
              <h3>{t('nav.privacy')}</h3>
              <p>{t('home.docsPrivacy')}</p>
              <span className="lp-card-link">
                <span className="lp-url">privacy.arabdev.site</span>
                <Arrow />
              </span>
            </a>
            <a className="lp-card" href={docs.patchNotes} {...newTab}>
              <h3>{t('nav.patchNotes')}</h3>
              <p>{t('home.docsPatch')}</p>
              <span className="lp-card-link">
                <span className="lp-url">patch.arabdev.site</span>
                <Arrow />
              </span>
            </a>
          </div>
        </section>

        {/* contact */}
        <section className="lp-shell lp-section" id="contact">
          <div className="lp-reveal">
            <span className="lp-eyebrow">{t('home.contactEyebrow')}</span>
            <h2 className="lp-h2">{t('home.contactTitle')}</h2>
            <p className="lp-sub">{t('home.contactSub')}</p>
          </div>
          <div className="lp-contact lp-reveal">
            <article className="lp-card">
              <h3>{t('home.contactSupportTitle')}</h3>
              <p>{t('home.contactSupportBody')}</p>
              <a className="lp-mail" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
            </article>
            <article className="lp-card">
              <h3>{t('home.contactHelloTitle')}</h3>
              <p>{t('home.contactHelloBody')}</p>
              <a className="lp-mail" href={`mailto:${HELLO_EMAIL}`}>
                {HELLO_EMAIL}
              </a>
            </article>
          </div>
        </section>

        {/* closing call */}
        <section className="lp-shell lp-section">
          <div className="lp-final lp-reveal">
            <div>
              <h2>{t('home.finalTitle')}</h2>
              <p>{t('home.finalBody')}</p>
            </div>
            <RouterLink className="lp-btn lp-btn-primary lp-btn-lg" to={startHref}>
              {startLabel}
              <Arrow />
            </RouterLink>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell">
          <div className="lp-footer-grid">
            <div>
              <a className="lp-logo" href="#top" aria-label="ArabDev">
                <span>Arab</span>Dev
              </a>
              <p className="lp-footer-note">{t('home.footerAbout')}</p>
            </div>
            <div>
              <h4>{t('home.footerPlatform')}</h4>
              <ul>
                <li>
                  <RouterLink to={startHref}>{startLabel}</RouterLink>
                </li>
                <li>
                  <RouterLink to="/explore">{t('nav.explore')}</RouterLink>
                </li>
                <li>
                  <a href="#features">{t('home.navFeatures')}</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>{t('home.footerDocs')}</h4>
              <ul>
                <li>
                  <a href={docs.wiki} {...newTab}>
                    {t('nav.wiki')}
                  </a>
                </li>
                <li>
                  <a href={docs.privacy} {...newTab}>
                    {t('nav.privacy')}
                  </a>
                </li>
                <li>
                  <a href={docs.patchNotes} {...newTab}>
                    {t('nav.patchNotes')}
                  </a>
                </li>
                <li>
                  <a href={docs.license} {...newTab}>
                    {t('nav.license')}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4>{t('home.footerContact')}</h4>
              <ul>
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${HELLO_EMAIL}`} dir="ltr">
                    {HELLO_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span>{t('home.footerRights')}</span>
            <span dir="ltr">arabdev.site</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
