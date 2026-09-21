import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { SectionHeading, Surface } from '@/components/common';
import { DocLinks } from '@/components/DocLinks';
import { AdSlot } from '@/features/ads/AdCard';
import { AdSenseUnit, hasAdSense } from '@/features/ads/AdSense';
import { PopularTags } from '@/features/discovery/PopularTags';
import { RecommendedDevelopers } from '@/features/users/RecommendedDevelopers';
import { API_ORIGIN } from '@/site';
import { layout } from '@/theme/tokens';

/** Desktop-only context column: people to follow, one clearly-labelled ad, popular tags. */
export function RightSidebar() {
  const { t } = useTranslation();
  return (
    <Box
      component="aside"
      aria-label={t('sidebar.whoToFollow')}
      sx={{
        display: { xs: 'none', lg: 'block' },
        width: layout.sidebarWidth,
        flexShrink: 0,
        position: 'sticky',
        top: layout.appBarHeight,
        alignSelf: 'flex-start',
        maxHeight: `calc(100vh - ${layout.appBarHeight}px)`,
        overflowY: 'auto',
        py: 2,
        scrollbarWidth: 'thin',
      }}
    >
      <Stack spacing={2}>
        <Surface>
          <SectionHeading
            action={
              <Link component={RouterLink} to="/explore" variant="body2">
                {t('sidebar.seeMore')}
              </Link>
            }
          >
            {t('sidebar.whoToFollow')}
          </SectionHeading>
          <RecommendedDevelopers limit={4} dense />
        </Surface>

        {hasAdSense('sidebar') ? <AdSenseUnit placement="sidebar" /> : <AdSlot placement="sidebar" />}

        <Surface>
          <SectionHeading>{t('sidebar.popularTags')}</SectionHeading>
          <PopularTags limit={10} />
        </Surface>

        <Box sx={{ px: 1 }}>
          <DocLinks />
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
            © {new Date().getFullYear()} ArabDev ·{' '}
            <Link href={`${API_ORIGIN}/api/docs`} color="inherit" target="_blank" rel="noopener">
              {t('nav.apiDocs')}
            </Link>
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
