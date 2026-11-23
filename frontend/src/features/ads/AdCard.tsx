import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { adsApi } from '@/api/misc';
import { queryKeys } from '@/api/queryKeys';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import type { Ad } from '@/types/api';

interface AdCardProps {
  ad: Ad;
  variant?: 'feed' | 'sidebar';
}

/**
 * A reusable ad unit. It is always labelled "Sponsored" with the sponsor's name, sits on
 * a tinted surface with a dashed frame, and never mimics a post (no avatar, no actions).
 */
export function AdCard({ ad, variant = 'feed' }: AdCardProps) {
  const { t } = useTranslation();
  // Same check as the post-login redirect in router/guards.tsx: a single leading slash only.
  // '//evil.com' and '/\evil.com' are protocol-relative URLs browsers resolve off-site, so
  // they must go through the external (target=_blank, rel=sponsored noopener) branch instead.
  const internal = ad.target_url.startsWith('/') && !ad.target_url.startsWith('//') && !ad.target_url.startsWith('/\\');
  const recordClick = () => void adsApi.click(ad.id).catch(() => undefined);

  return (
    <Box
      component="aside"
      aria-label={t('ads.label')}
      sx={{
        position: 'relative',
        m: variant === 'feed' ? { xs: 1.5, sm: 2 } : 0,
        p: 2,
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'surface.borderStrong',
        bgcolor: 'surface.sunken',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography
          variant="overline"
          component="p"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          <Box component="span" sx={{ px: 0.75, border: 1, borderColor: 'text.secondary', borderRadius: 0.75 }}>
            {t('ads.label')}
          </Box>
          {t('ads.promotedBy', { sponsor: ad.sponsor })}
        </Typography>
        <Tooltip title={t('ads.whyAd')}>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-label={t('ads.whyAd')} />
        </Tooltip>
      </Stack>
      <Typography variant="h6" component="p" sx={{ mb: 0.5 }}>
        {ad.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {ad.body}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        onClick={recordClick}
        {...(internal
          ? { component: RouterLink, to: ad.target_url }
          : { href: ad.target_url, target: '_blank', rel: 'sponsored noopener noreferrer' })}
      >
        {ad.cta_label}
      </Button>
    </Box>
  );
}

/** Ads for the feed: a predictable pair per page, rotating with the page number. */
export function useFeedAds(page: number, enabled = true) {
  const { language } = usePreferences();
  const offset = (page - 1) * 2;
  return useQuery({
    queryKey: queryKeys.ads('feed', language, offset),
    queryFn: () => adsApi.list({ placement: 'feed', lang: language, limit: 2, offset }),
    staleTime: 5 * 60_000,
    enabled,
  }).data;
}

export function AdSlot({ placement }: { placement: 'sidebar' }) {
  const { language } = usePreferences();
  const { data } = useQuery({
    queryKey: queryKeys.ads(placement, language, 0),
    queryFn: () => adsApi.list({ placement, lang: language, limit: 1, offset: new Date().getDate() }),
    staleTime: 10 * 60_000,
  });
  if (!data?.length) return null;
  return <AdCard ad={data[0]} variant="sidebar" />;
}
