import { useColorScheme } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { authApi, type RegisterPayload } from '@/api/auth';
import { refreshSession, registerSessionHandlers, setAccessToken } from '@/api/client';
import { useNotify } from '@/components/Notifier';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import type { AuthResult, Challenge, Me, TokenResponse } from '@/types/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * A non-sensitive hint that this browser has signed in before. Without it, a visitor
 * has no refresh cookie, so the startup refresh request is skipped entirely.
 */
const SESSION_HINT_KEY = 'arabdev.session';
const sessionHint = {
  get: () => {
    try {
      return localStorage.getItem(SESSION_HINT_KEY) === '1';
    } catch {
      return true;
    }
  },
  set: (value: boolean) => {
    try {
      if (value) localStorage.setItem(SESSION_HINT_KEY, '1');
      else localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      /* storage unavailable: we'll just try the refresh */
    }
  },
};

/** Either the session started, or a six-digit code has to be entered first. */
export type SignInOutcome =
  { status: 'authenticated'; user: Me } | { status: 'verification_required'; challenge: Challenge };

interface AuthContextValue {
  status: AuthStatus;
  user: Me | null;
  login: (
    email: string,
    password: string,
    rememberMe: boolean,
    turnstileToken?: string | null,
  ) => Promise<SignInOutcome>;
  register: (payload: RegisterPayload, turnstileToken?: string | null) => Promise<SignInOutcome>;
  /** Finishes a sign-in or sign-up with the emailed code. */
  verifyCode: (challengeId: string, code: string) => Promise<Me>;
  resendCode: (challengeId: string) => Promise<Challenge>;
  logout: () => Promise<void>;
  acceptTokens: (data: TokenResponse) => void;
  setUser: (user: Me) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<Me | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useNotify();
  const { t } = useTranslation();
  const { setLanguage } = usePreferences();
  const { setMode } = useColorScheme();
  const bootstrapped = useRef(false);

  /** A signed-in user's saved appearance settings win over this browser's defaults. */
  const applyPreferences = useCallback(
    (me: Me) => {
      setLanguage(me.settings.language);
      setMode(me.settings.theme);
    },
    [setLanguage, setMode],
  );

  // "Reduce animation" is a single attribute the stylesheet keys off (see theme.ts).
  useEffect(() => {
    const root = document.documentElement;
    if (user?.settings.reduce_motion) root.setAttribute('data-reduce-motion', 'true');
    else root.removeAttribute('data-reduce-motion');
  }, [user?.settings.reduce_motion]);

  const acceptTokens = useCallback((data: TokenResponse) => {
    sessionHint.set(true);
    setAccessToken(data.access_token);
    setUserState(data.user);
    setStatus('authenticated');
  }, []);

  const endSession = useCallback(() => {
    sessionHint.set(false);
    setAccessToken(null);
    setUserState(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    registerSessionHandlers({
      onTokenRefreshed: (data) => setUserState(data.user),
      onSessionEnded: () => {
        endSession();
        notify(t('auth.sessionExpired'), 'warning');
        navigate('/login', { replace: true });
      },
    });
  }, [endSession, navigate, notify, t]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (!sessionHint.get()) {
      setStatus('anonymous');
      return;
    }
    refreshSession()
      .then((data) => {
        acceptTokens(data);
        applyPreferences(data.user);
      })
      .catch(() => {
        sessionHint.set(false);
        setStatus('anonymous');
      });
  }, [acceptTokens, applyPreferences]);

  const start = useCallback(
    (result: AuthResult, withPreferences: boolean): SignInOutcome => {
      if (result.status === 'authenticated' && result.tokens) {
        queryClient.clear();
        acceptTokens(result.tokens);
        if (withPreferences) applyPreferences(result.tokens.user);
        return { status: 'authenticated', user: result.tokens.user };
      }
      // No account is created and no session exists until the code is confirmed.
      return { status: 'verification_required', challenge: result.challenge! };
    },
    [acceptTokens, applyPreferences, queryClient],
  );

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean, turnstileToken?: string | null) =>
      start(await authApi.login({ email, password, remember_me: rememberMe }, turnstileToken), true),
    [start],
  );

  const register = useCallback(
    async (payload: RegisterPayload, turnstileToken?: string | null) =>
      start(await authApi.register(payload, turnstileToken), false),
    [start],
  );

  const verifyCode = useCallback(
    async (challengeId: string, code: string) => {
      const data = await authApi.verify({ challenge_id: challengeId, code });
      queryClient.clear();
      acceptTokens(data);
      applyPreferences(data.user);
      return data.user;
    },
    [acceptTokens, applyPreferences, queryClient],
  );

  const resendCode = useCallback((challengeId: string) => authApi.resend(challengeId), []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      endSession();
      navigate('/login', { replace: true });
    }
  }, [endSession, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, verifyCode, resendCode, logout, acceptTokens, setUser: setUserState }),
    [status, user, login, register, verifyCode, resendCode, logout, acceptTokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** The signed-in user. Only call this under a route guarded by RequireAuth. */
export function useCurrentUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser called without a signed-in user');
  return user;
}
