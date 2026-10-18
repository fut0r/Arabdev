import Box from '@mui/material/Box';
import { useEffect } from 'react';

import { obtainHumanPass, registerHumanSolver } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';

import { useTurnstile } from './Turnstile';

const ATTEMPTS = 10;
const RETRY_MS = 500;
// Long enough for the page to settle; the first like or follow then needs no wait.
const PREFETCH_AFTER_MS = 3000;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * One hidden Turnstile check for the whole app, used for every request that changes something
 * (see api/client.ts). It is invisible unless Cloudflare needs a click, which for most people is
 * never; then the widget appears at the bottom of the screen.
 */
export function HumanCheck() {
  const { status } = useAuth();
  const { attach, getToken, reset, enabled } = useTurnstile({ action: 'human_check', mode: 'hidden' });
  const active = status === 'authenticated' && enabled;

  useEffect(() => {
    if (!active) return;
    registerHumanSolver(async () => {
      try {
        // The script may still be loading on the first request; give it a few seconds.
        for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
          const token = await getToken();
          if (token) return token;
          await wait(RETRY_MS);
        }
        return null;
      } finally {
        reset(); // each token is good for one request
      }
    });
    const prefetch = window.setTimeout(() => {
      obtainHumanPass().catch(() => {
        /* the next protected request tries again */
      });
    }, PREFETCH_AFTER_MS);
    return () => {
      window.clearTimeout(prefetch);
      registerHumanSolver(null);
    };
  }, [active, getToken, reset]);

  if (!active) return null;
  return (
    <Box
      ref={attach}
      sx={{
        position: 'fixed',
        insetInline: 0,
        bottom: { xs: 80, md: 24 },
        zIndex: (theme) => theme.zIndex.snackbar,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        '& > *': { pointerEvents: 'auto' },
      }}
    />
  );
}
