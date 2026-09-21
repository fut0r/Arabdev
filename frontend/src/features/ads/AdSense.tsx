import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ADSENSE } from '@/site';

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
  }
}

const SCRIPT_ID = 'adsbygoogle-script';

/**
 * Loads Google's ad script once, and only when an ad is actually on screen.
 *
 * Ads are requested as non-personalised: Google is told not to build a profile from the
 * people reading ArabDev, which is what the privacy policy promises.
 */
function loadAdSense(): void {
  if (document.getElementById(SCRIPT_ID)) return;
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.requestNonPersonalizedAds = 1;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.client}`;
  document.head.appendChild(script);
}

export type AdPlacement = 'feed' | 'sidebar' | 'article';

const FORMATS: Record<AdPlacement, { format: string; layoutKey?: string; minHeight: number }> = {
  // "fluid" units take the shape of the list they sit in, so a feed ad looks like part
  // of the page instead of a box dropped on top of it.
  feed: { format: 'fluid', layoutKey: '-fb+5w+4e-db+86', minHeight: 140 },
  article: { format: 'fluid', minHeight: 200 },
  sidebar: { format: 'auto', minHeight: 250 },
};

/**
 * One Google ad unit, clearly labelled.
 *
 * Renders nothing when the placement has no slot id configured, so the site works
 * unchanged until the ad units exist in the AdSense account.
 */
export function AdSenseUnit({ placement }: { placement: AdPlacement }) {
  const { t } = useTranslation();
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [filled, setFilled] = useState(true);
  const slot = ADSENSE.slots[placement];
  const config = FORMATS[placement];

  useEffect(() => {
    if (!slot || pushed.current || !insRef.current) return;
    pushed.current = true;
    loadAdSense();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* a blocked or failed script is not worth breaking the page over */
    }
    // An unfilled unit reports itself; collapse it rather than leave a gap.
    const element = insRef.current;
    const timer = window.setTimeout(() => {
      if (element.getAttribute('data-ad-status') === 'unfilled') setFilled(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [slot]);

  if (!slot || !filled) return null;

  return (
    <Box
      component="aside"
      aria-label={t('ads.label')}
      sx={{
        m: placement === 'feed' ? { xs: 1.5, sm: 2 } : 0,
        p: 1.5,
        borderRadius: 2,
        border: '1px dashed',
        borderColor: 'surface.borderStrong',
        bgcolor: 'surface.sunken',
        overflow: 'hidden',
      }}
    >
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.75, letterSpacing: 0 }}>
        {t('ads.label')}
      </Typography>
      <Box
        component="ins"
        ref={insRef}
        className="adsbygoogle"
        sx={{ display: 'block', minHeight: config.minHeight, width: '100%' }}
        data-ad-client={ADSENSE.client}
        data-ad-slot={slot}
        data-ad-format={config.format}
        {...(config.layoutKey ? { 'data-ad-layout-key': config.layoutKey } : {})}
        data-full-width-responsive="true"
      />
    </Box>
  );
}

/** Whether Google ads are configured for a placement at all. */
export function hasAdSense(placement: AdPlacement): boolean {
  return Boolean(ADSENSE.slots[placement]);
}
