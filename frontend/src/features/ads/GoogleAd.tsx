import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ADSENSE, type AdUnitName } from '@/site';

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
  }
}

const SCRIPT_ID = 'adsbygoogle-script';
// Google marks a unit "filled" or "unfilled" within a second or two. Without either after this
// long, the script was blocked or the site is not serving yet, and the slot gives way.
const GIVE_UP_AFTER_MS = 6000;

/**
 * index.html already loads Google's script; this covers pages that render before it is there.
 * Ads are requested without personalisation, as the privacy policy promises.
 */
function ensureScript(): void {
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.requestNonPersonalizedAds = 1;
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.client}`;
  document.head.appendChild(script);
}

type Status = 'loading' | 'filled' | 'unfilled';

interface GoogleAdProps {
  unit: AdUnitName;
  /** Shown instead when Google has no ad for this slot (often an ArabDev house ad). */
  fallback?: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * One Google ad unit in a labelled frame. While Google decides, the slot keeps its height so the
 * page does not jump; when there is no ad, the fallback (or nothing) takes its place.
 */
export function GoogleAd({ unit, fallback = null, sx }: GoogleAdProps) {
  const { t } = useTranslation();
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [status, setStatus] = useState<Status>('loading');
  const config = ADSENSE.units[unit];

  useEffect(() => {
    const element = insRef.current;
    if (!element) return;
    if (!pushed.current) {
      pushed.current = true;
      ensureScript();
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // A blocked or failed script: the timer below hands the slot to the fallback.
      }
    }
    const read = () => {
      const value = element.getAttribute('data-ad-status');
      if (value === 'filled' || value === 'unfilled') setStatus(value);
    };
    const observer = new MutationObserver(read);
    observer.observe(element, { attributes: true, attributeFilter: ['data-ad-status'] });
    const timer = window.setTimeout(
      () => setStatus((current) => (current === 'loading' ? 'unfilled' : current)),
      GIVE_UP_AFTER_MS,
    );
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  if (status === 'unfilled') return fallback ? <Box sx={sx}>{fallback}</Box> : null;

  const fixed = 'width' in config;
  return (
    <Box sx={sx}>
      <Box
        component="aside"
        aria-label={t('ads.googleLabel')}
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: '1px dashed',
          borderColor: 'surface.borderStrong',
          bgcolor: 'surface.sunken',
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        <Typography
          variant="caption"
          component="p"
          sx={{ color: 'text.secondary', mb: 0.75, letterSpacing: 0, textAlign: 'start' }}
        >
          {t('ads.googleLabel')}
        </Typography>
        {fixed ? (
          <Box
            component="ins"
            ref={insRef}
            className="adsbygoogle"
            sx={{ display: 'inline-block', width: config.width, height: config.height }}
            data-ad-client={ADSENSE.client}
            data-ad-slot={config.slot}
          />
        ) : (
          <Box
            component="ins"
            ref={insRef}
            className="adsbygoogle"
            sx={{ display: 'block', minHeight: config.minHeight, width: '100%' }}
            data-ad-client={ADSENSE.client}
            data-ad-slot={config.slot}
            data-ad-format={config.format}
            {...('layoutKey' in config ? { 'data-ad-layout-key': config.layoutKey } : {})}
            {...(config.format === 'auto' ? { 'data-full-width-responsive': 'true' } : {})}
          />
        )}
      </Box>
    </Box>
  );
}
