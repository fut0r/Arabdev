import Box from '@mui/material/Box';
import { useColorScheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authApi } from '@/api/auth';
import { usePreferences } from '@/features/preferences/PreferencesProvider';

import { loadTurnstile, type TurnstileApi } from './turnstileScript';

/** The site key and whether codes are on. Fetched once and kept for the session. */
export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: authApi.config,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

interface UseTurnstileOptions {
  /** Names the protected action, checked against the token on the server. */
  action: string;
  /** 'visible' draws the widget in the form; 'invisible' solves it in the background. */
  mode?: 'visible' | 'invisible';
}

export interface TurnstileHandle {
  /** Attach to the element the widget should live in. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** A fresh single-use token, or null when Turnstile is not configured. */
  getToken: () => Promise<string | null>;
  /** Throw the current token away; call after a request used it. */
  reset: () => void;
  /** True once the widget is configured and the script is loading or ready. */
  enabled: boolean;
  error: string | null;
}

const TOKEN_WAIT_MS = 20_000;

/**
 * Renders one Turnstile widget and hands out tokens for it.
 *
 * Tokens are single-use and expire after five minutes, so a token is taken at the moment
 * a form is submitted, not when the page loads, and the widget is reset afterwards.
 */
export function useTurnstile({ action, mode = 'visible' }: UseTurnstileOptions): TurnstileHandle {
  const { data: config } = usePublicConfig();
  const { language } = usePreferences();
  const { mode: themeMode, systemMode } = useColorScheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const waitersRef = useRef<((token: string | null) => void)[]>([]);
  const [error, setError] = useState<string | null>(null);

  const siteKey = config?.turnstile_site_key ?? null;
  const dark = (themeMode === 'system' ? systemMode : themeMode) === 'dark';

  const settle = useCallback((token: string | null) => {
    tokenRef.current = token;
    waitersRef.current.splice(0).forEach((resolve) => resolve(token));
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    void loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        apiRef.current = api;
        widgetRef.current =
          api.render(container, {
            sitekey: siteKey,
            action,
            theme: dark ? 'dark' : 'light',
            language,
            size: 'flexible',
            // Invisible widgets wait to be asked; visible ones only appear when the
            // visitor actually has to do something.
            execution: mode === 'invisible' ? 'execute' : 'render',
            appearance: mode === 'invisible' ? 'execute' : 'interaction-only',
            'refresh-expired': 'auto',
            callback: (token) => {
              setError(null);
              settle(token);
            },
            'error-callback': (code) => {
              setError(code ?? 'error');
              settle(null);
            },
            'expired-callback': () => settle(null),
            'timeout-callback': () => settle(null),
          }) ?? null;
      })
      .catch(() => {
        if (!cancelled) setError('unavailable');
      });

    return () => {
      cancelled = true;
      settle(null);
      const widgetId = widgetRef.current;
      widgetRef.current = null;
      if (widgetId && apiRef.current) {
        try {
          apiRef.current.remove(widgetId);
        } catch {
          /* the widget is already gone */
        }
      }
    };
    // Re-rendering on theme or language change keeps the widget matching the page.
  }, [siteKey, action, dark, language, mode, settle]);

  const reset = useCallback(() => {
    tokenRef.current = null;
    if (widgetRef.current && apiRef.current) {
      try {
        apiRef.current.reset(widgetRef.current);
      } catch {
        /* nothing to reset */
      }
    }
  }, []);

  const getToken = useCallback(async () => {
    if (!siteKey) return null; // Turnstile is off: the server is not asking for a token.
    if (tokenRef.current) return tokenRef.current;
    const api = apiRef.current;
    const widgetId = widgetRef.current;
    if (!api || !widgetId) return null;

    const existing = api.getResponse(widgetId);
    if (existing && !api.isExpired(widgetId)) {
      tokenRef.current = existing;
      return existing;
    }
    const waiting = new Promise<string | null>((resolve) => {
      waitersRef.current.push(resolve);
      window.setTimeout(() => resolve(tokenRef.current), TOKEN_WAIT_MS);
    });
    try {
      api.execute(widgetId);
    } catch {
      /* already running: the callback still fires */
    }
    return waiting;
  }, [siteKey]);

  return { containerRef, getToken, reset, enabled: Boolean(siteKey), error };
}

/**
 * The widget's slot in a form. It takes no space until Turnstile decides to ask
 * something, which for most visitors is never.
 */
export function TurnstileWidget({ handle, sx }: { handle: TurnstileHandle; sx?: object }) {
  if (!handle.enabled) return null;
  return (
    <Box
      ref={handle.containerRef}
      sx={{ '&:empty': { display: 'none' }, display: 'flex', justifyContent: 'center', ...sx }}
    />
  );
}
