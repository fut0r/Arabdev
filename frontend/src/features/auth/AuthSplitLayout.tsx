import CodeIcon from '@mui/icons-material/Code';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { DocLinks } from '@/components/DocLinks';
import { Logo } from '@/components/Logo';
import { LanguageToggle } from '@/features/preferences/AppearanceControls';
import { headingFont } from '@/theme/typography';

const TOPICS = [
  'JavaScript',
  'Python',
  'Rust',
  'React',
  'FastAPI',
  'Go',
  'DevOps',
  'Linux',
  'AI',
  'UI/UX',
  'Open Source',
];

/** The "what is ArabDev" half of the landing page. Always dark, regardless of theme. */
function PlatformPresentation() {
  const { t } = useTranslation();
  const features = [
    { icon: <GroupsOutlinedIcon />, title: t('landing.featureConnectTitle'), body: t('landing.featureConnectBody') },
    { icon: <CodeIcon />, title: t('landing.featureShareTitle'), body: t('landing.featureShareBody') },
    { icon: <ExploreOutlinedIcon />, title: t('landing.featureDiscoverTitle'), body: t('landing.featureDiscoverBody') },
    { icon: <ForumOutlinedIcon />, title: t('landing.featureLearnTitle'), body: t('landing.featureLearnBody') },
  ];

  return (
    <Box
      component="section"
      aria-labelledby="landing-headline"
      sx={{
        bgcolor: '#121214',
        color: '#F2F2F0',
        px: { xs: 3, sm: 6, lg: 9 },
        py: { xs: 6, md: 8 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        borderTop: { xs: '4px solid', md: 'none' },
        borderLeft: { md: '4px solid' },
        borderColor: { xs: 'primary.main', md: 'primary.main' },
      }}
    >
      <Box sx={{ maxWidth: 620 }}>
        <Typography variant="overline" component="p" sx={{ color: '#FF6B76', mb: 1.5 }}>
          {t('landing.eyebrow')}
        </Typography>
        <Typography
          id="landing-headline"
          component="h2"
          sx={{
            fontFamily: headingFont,
            fontWeight: 700,
            fontSize: { xs: '1.75rem', md: '2.25rem', lg: '2.5rem' },
            lineHeight: 1.35,
            mb: 2,
          }}
        >
          {t('landing.headline')}
        </Typography>
        <Typography sx={{ color: '#B5B5B0', fontSize: '1.0625rem', mb: { xs: 4, md: 5 } }}>
          {t('landing.lead')}
        </Typography>

        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
            columnGap: 4,
            rowGap: 3.5,
          }}
        >
          {features.map((feature) => (
            <Stack component="li" key={feature.title} direction="row" spacing={1.75}>
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
                  {feature.title}
                </Typography>
                <Typography sx={{ color: '#A3A3A0', fontSize: '0.9375rem', lineHeight: 1.65 }}>
                  {feature.body}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Box>

        <Typography sx={{ color: '#85857F', fontSize: '0.8125rem', fontWeight: 700, mt: { xs: 5, md: 6 }, mb: 1.5 }}>
          {t('landing.topicsLabel')}
        </Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }} dir="ltr">
          {TOPICS.map((topic) => (
            <Box
              key={topic}
              component="span"
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: 1.5,
                border: '1px solid #2F2F33',
                color: '#D6D6D2',
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              {topic}
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

/** Split landing layout: authentication on one side, the platform on the other. */
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(440px, 5fr) minmax(0, 6fr)' },
        bgcolor: 'background.paper',
      }}
    >
      <Box
        component="main"
        id="main"
        sx={{ display: 'flex', flexDirection: 'column', px: { xs: 3, sm: 6, lg: 8 }, py: { xs: 3, md: 4 } }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={32} to="/login" />
          <LanguageToggle />
        </Stack>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ width: '100%', maxWidth: 400, mx: 'auto', py: { xs: 5, md: 6 } }}>{children}</Box>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 0.5, sm: 2 }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Typography variant="caption" color="text.secondary">
            © {new Date().getFullYear()} ArabDev
          </Typography>
          <DocLinks />
        </Stack>
      </Box>
      <PlatformPresentation />
    </Box>
  );
}
