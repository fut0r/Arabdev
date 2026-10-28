import { discoveryApi } from '@/api/misc';
import { communityApi } from '@/api/community';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CodeIcon from '@mui/icons-material/Code';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import GitHubIcon from '@mui/icons-material/GitHub';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useColorScheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { Surface } from '@/components/common';
import { DocLinks, docUrls, newTab } from '@/components/DocLinks';
import { Logo } from '@/components/Logo';
import { HomepageAd } from '@/features/ads/placements';
import { useAuth } from '@/features/auth/AuthProvider';
import { PopularTags } from '@/features/discovery/PopularTags';
import { PostCard } from '@/features/posts/PostCard';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { MobileNavigation } from '@/layouts/MobileNavigation';
import { Navbar } from '@/layouts/Navbar';
import { CURRENT_YEAR, HOME_PATH, SOURCE_URL } from '@/site';
import { layout } from '@/theme/tokens';
import { headingFont } from '@/theme/typography';
import { useSeo } from '@/utils/seo';

const LATEST_COUNT = 3;

/** The same width and side padding as the app, so the homepage lines up with the dashboard. */
function Container({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ width: '100%', maxWidth: layout.contentMaxWidth, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 } }}>
      {children}
    </Box>
  );
}

/** The dashboard inside a laptop, matching the visitor's language and colour scheme. */
function LaptopScreenshot() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';
  return (
    <Box
      component="img"
      src={`/screenshots/macbook-dashboard-${language}-${dark ? 'dark' : 'light'}.webp`}
      alt={t('home.screenshotAlt')}
      width={1600}
      height={969}
      fetchPriority="high"
      sx={{ display: 'block', width: '100%', height: 'auto' }}
    />
  );
}

function Hero() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const { direction } = usePreferences();
  const signedIn = status === 'authenticated';
  return (
    <Container>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
          gap: { xs: 4, md: 6 },
          alignItems: 'center',
          py: { xs: 5, md: 8 },
        }}
      >
        <Box>
          <Typography variant="overline" component="p" sx={{ color: 'primary.main', mb: 1.5 }}>
            {t('home.eyebrow')}
          </Typography>
          <Typography
            component="h1"
            sx={{
              fontFamily: headingFont,
              fontWeight: 700,
              fontSize: { xs: '2rem', md: '2.5rem', lg: '2.875rem' },
              lineHeight: 1.3,
              mb: 2,
            }}
          >
            {t('home.title')}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '1.0625rem', lineHeight: 1.85, mb: 3.5 }}>
            {t('home.lead')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              component={RouterLink}
              to={signedIn ? HOME_PATH : '/register'}
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />}
            >
              {signedIn ? t('home.openApp') : t('common.signUp')}
            </Button>
            <Button component={RouterLink} to="/explore" variant="outlined" color="inherit" size="large">
              {t('home.browse')}
            </Button>
          </Stack>
          {!signedIn && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t('home.note')}
            </Typography>
          )}
        </Box>
        <LaptopScreenshot />
      </Box>
    </Container>
  );
}

/** The newest posts, shown exactly as they look in the feed. */
function LatestPosts() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: queryKeys.feed('latest', 1),
    queryFn: () => postsApi.feed({ tab: 'latest', page: 1 }),
    staleTime: 60_000,
  });
  const featured = useQuery({
    queryKey: ['browse', { sort: 'featured', page: 1 }],
    queryFn: () => communityApi.browse({ sort: 'featured', page: 1 }),
  });
  const hasFeatured = Boolean(featured.data?.items.length);
  const posts = (hasFeatured ? featured.data?.items : data?.items)?.slice(0, LATEST_COUNT) ?? [];

  return (
    <Container>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: `minmax(0, 1fr) ${layout.sidebarWidth}px` },
          gap: { xs: 2, lg: 3 },
          alignItems: 'start',
        }}
      >
        {posts.length > 0 && (
          <Surface component="section" aria-labelledby="latest-title">
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.75 }}>
              <Typography id="latest-title" variant="h5" component="h2">
                {t(hasFeatured ? 'community.featured' : 'home.latestTitle')}
              </Typography>
              <Link component={RouterLink} to="/explore" variant="body2" sx={{ fontWeight: 700 }}>
                {t('home.latestAll')}
              </Link>
            </Stack>
            {posts.map((post) => (
              <Fragment key={post.id}>
                <Divider />
                <PostCard post={post} />
              </Fragment>
            ))}
          </Surface>
        )}
        <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: { lg: layout.appBarHeight + 16 } }}>
          <Surface>
            <Typography variant="h5" component="h2" sx={{ px: 2, pt: 2, pb: 1 }}>
              {t('sidebar.popularTags')}
            </Typography>
            <PopularTags limit={8} />
          </Surface>
          <HomepageAd kind="display" />
        </Stack>
      </Box>
    </Container>
  );
}

/** Dark, like the panel beside the sign-in form. */
function Features() {
  const { t } = useTranslation();
  const topics = useQuery({ queryKey: queryKeys.popularTags, queryFn: () => discoveryApi.popularTags() });
  const features = [
    { icon: <CodeIcon />, key: 'f1' },
    { icon: <ViewAgendaOutlinedIcon />, key: 'f2' },
    { icon: <LocalOfferOutlinedIcon />, key: 'f3' },
    { icon: <ForumOutlinedIcon />, key: 'f4' },
    { icon: <LockOutlinedIcon />, key: 'f5' },
    { icon: <DarkModeOutlinedIcon />, key: 'f6' },
  ];
  return (
    <Box
      component="section"
      aria-labelledby="features-title"
      sx={{
        bgcolor: '#121214',
        color: '#F2F2F0',
        borderTop: '4px solid',
        borderColor: 'primary.main',
        py: { xs: 4, md: 5 },
        mt: { xs: 5, md: 7 },
      }}
    >
      <Container>
        <Typography
          id="features-title"
          component="h2"
          sx={{ fontFamily: headingFont, fontWeight: 700, fontSize: { xs: '1.625rem', md: '2rem' }, mb: 1 }}
        >
          {t('home.featuresTitle')}
        </Typography>
        <Typography sx={{ color: '#B5B5B0', fontSize: '1.0625rem', mb: { xs: 4, md: 5 }, maxWidth: 640 }}>
          {t('home.featuresSub')}
        </Typography>
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
            columnGap: 4,
            rowGap: 4,
          }}
        >
          {features.map((feature) => (
            <Stack component="li" key={feature.key} direction="row" spacing={1.75}>
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 2,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#FF6B76',
                  border: '1px solid rgba(255, 107, 118, 0.35)',
                  bgcolor: 'rgba(255, 107, 118, 0.08)',
                }}
              >
                {feature.icon}
              </Box>
              <Box>
                <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>
                  {t(`home.${feature.key}Title`)}
                </Typography>
                <Typography sx={{ color: '#A3A3A0', fontSize: '0.9375rem', lineHeight: 1.7 }}>
                  {t(`home.${feature.key}Body`)}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Box>
        <Typography sx={{ color: '#85857F', fontSize: '0.8125rem', fontWeight: 700, mt: { xs: 5, md: 6 }, mb: 1.5 }}>
          {t('landing.topicsLabel')}
        </Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }} dir="ltr">
          {(topics.data ?? [])
            .filter((topic) => topic.posts_count > 0)
            .slice(0, 10)
            .map((topic) => (
              <Box
                key={topic.slug}
                component={RouterLink}
                to={`/tags/${encodeURIComponent(topic.slug)}`}
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1.5,
                  border: '1px solid #2F2F33',
                  color: '#D6D6D2',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  '&:hover': { borderColor: '#55555C', color: '#FFFFFF' },
                }}
              >
                {topic.name}
              </Box>
            ))}
        </Stack>
      </Container>
    </Box>
  );
}

function InfoCard({ icon, title, body, link }: { icon: ReactNode; title: string; body: string; link: ReactNode }) {
  return (
    <Surface sx={{ p: { xs: 2.5, sm: 3 } }}>
      <Box sx={{ color: 'primary.main', mb: 1.5, display: 'flex' }}>{icon}</Box>
      <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ lineHeight: 1.8, mb: 2 }}>
        {body}
      </Typography>
      {link}
    </Surface>
  );
}

function OpenAndPrivate() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  return (
    <Container>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 2,
          py: { xs: 5, md: 7 },
        }}
      >
        <InfoCard
          icon={<GitHubIcon />}
          title={t('home.openTitle')}
          body={t('home.openBody')}
          link={
            <Link href={SOURCE_URL} {...newTab} sx={{ fontWeight: 700 }}>
              {t('home.openLink')}
            </Link>
          }
        />
        <InfoCard
          icon={<PrivacyTipOutlinedIcon />}
          title={t('home.privacyTitle')}
          body={t('home.privacyBody')}
          link={
            <Link href={docUrls(language).privacy} {...newTab} sx={{ fontWeight: 700 }}>
              {t('home.privacyLink')}
            </Link>
          }
        />
      </Box>
    </Container>
  );
}

function FinalCall() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  return (
    <Container>
      <HomepageAd kind="banner" />
      <Surface
        sx={{
          p: { xs: 3, sm: 4 },
          my: { xs: 4, md: 5 },
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" component="h2" sx={{ mb: 0.5 }}>
            {t('home.finalTitle')}
          </Typography>
          <Typography color="text.secondary">{t('home.finalBody')}</Typography>
        </Box>
        <Button
          component={RouterLink}
          to={signedIn ? '/create' : '/register'}
          variant="contained"
          size="large"
          sx={{ flexShrink: 0 }}
        >
          {signedIn ? t('nav.createPost') : t('common.signUp')}
        </Button>
      </Surface>
    </Container>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', py: 3 }}>
      <Container>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
        >
          <Stack spacing={0.5}>
            <Logo size={24} />
            <Typography variant="caption" color="text.secondary">
              © {CURRENT_YEAR} ArabDev · {t('home.footerAbout')}
            </Typography>
          </Stack>
          <DocLinks />
        </Stack>
      </Container>
    </Box>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  useSeo({ title: t('home.metaTitle'), description: t('home.lead'), canonical: '/' });
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        pb: { xs: `calc(${layout.mobileNavHeight + 8}px + env(safe-area-inset-bottom))`, md: 0 },
      }}
    >
      <Navbar />
      <Box component="main" id="main">
        <Hero />
        <LatestPosts />
        <Features />
        <OpenAndPrivate />
        <FinalCall />
      </Box>
      <Footer />
      <MobileNavigation />
    </Box>
  );
}
