import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import i18n from '@/i18n';
import { API_ORIGIN } from '@/site';
import type { ApiErrorBody, TokenResponse } from '@/types/api';

/**
 * The access token lives in memory only. The refresh token is an httpOnly cookie scoped
 * to /api/v1/auth, so JavaScript never sees it. On a 401 the client refreshes once
 * (shared by all concurrent requests) and retries.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<TokenResponse> | null = null;
let onSessionEnded: (() => void) | null = null;
let onTokenRefreshed: ((data: TokenResponse) => void) | null = null;

/**
 * The human pass (backend/app/services/human_check.py): proof that a browser solved an invisible
 * Turnstile check in the last 30 minutes, sent with requests that change something. When the
 * server asks for one, the solver registered by <HumanCheck /> runs Turnstile and the request
 * is repeated once, so people never see this happen.
 */
const HUMAN_HEADER = 'X-ArabDev-Human';
let humanPass: { token: string; expiresAt: number } | null = null;
let humanSolver: (() => Promise<string | null>) | null = null;
let humanInFlight: Promise<string> | null = null;

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api/v1`,
  withCredentials: true,
  timeout: 20_000,
  headers: { 'X-ArabDev-Client': 'web' },
});

/** Cloudflare Turnstile proves a browser is behind the request; the header is dropped
 * when there is no token, so endpoints that do not ask for one are unaffected. */
export function turnstileHeaders(token?: string | null): Record<string, string> | undefined {
  return token ? { 'X-Turnstile-Token': token } : undefined;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  // A human pass belongs to one account; a new sign-in solves its own.
  if (token === null) humanPass = null;
}

export function hasAccessToken() {
  return accessToken !== null;
}

export function registerSessionHandlers(handlers: {
  onSessionEnded: () => void;
  onTokenRefreshed: (data: TokenResponse) => void;
}) {
  onSessionEnded = handlers.onSessionEnded;
  onTokenRefreshed = handlers.onTokenRefreshed;
}

export function refreshSession(): Promise<TokenResponse> {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post<TokenResponse>('/auth/refresh', null, { skipAuthRefresh: true } as AxiosRequestConfig)
      .then((response) => {
        setAccessToken(response.data.access_token);
        onTokenRefreshed?.(response.data);
        return response.data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function registerHumanSolver(solver: (() => Promise<string | null>) | null) {
  humanSolver = solver;
}

/** Solve the check and trade the token for a pass; concurrent callers share one attempt. */
export function obtainHumanPass(): Promise<string> {
  if (!humanInFlight) {
    humanInFlight = (async () => {
      const turnstileToken = humanSolver ? await humanSolver() : null;
      if (!turnstileToken) throw new Error('The human check could not run');
      const { data } = await api.post<{ token: string; expires_in: number }>('/users/me/human-check', null, {
        headers: turnstileHeaders(turnstileToken),
      });
      humanPass = { token: data.token, expiresAt: Date.now() + data.expires_in * 1000 };
      return data.token;
    })().finally(() => {
      humanInFlight = null;
    });
  }
  return humanInFlight;
}

const READS = new Set(['get', 'head', 'options']);

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  config.headers['Accept-Language'] = i18n.language;
  // Sent a little before it runs out, so a slow request never arrives with an expired pass.
  const writes = !READS.has((config.method ?? 'get').toLowerCase());
  if (writes && humanPass && humanPass.expiresAt - Date.now() > 30_000) {
    config.headers[HUMAN_HEADER] = humanPass.token;
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & {
  _retried?: boolean;
  _humanRetried?: boolean;
  skipAuthRefresh?: boolean;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const code = error.response?.data?.code;

    if (config && code === 'human_check_required' && !config._humanRetried && humanSolver) {
      config._humanRetried = true;
      humanPass = null;
      try {
        config.headers[HUMAN_HEADER] = await obtainHumanPass();
      } catch {
        return Promise.reject(error); // shown as "confirm you're not a robot"
      }
      return api(config);
    }
    const isAuthFailure = error.response?.status === 401 && (code === 'token_invalid' || code === 'not_authenticated');

    if (!config || !isAuthFailure || config._retried || config.skipAuthRefresh || !accessToken) {
      return Promise.reject(error);
    }
    config._retried = true;
    try {
      await refreshSession();
      return api(config);
    } catch (refreshError) {
      setAccessToken(null);
      onSessionEnded?.();
      return Promise.reject(refreshError);
    }
  },
);

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuthRefresh?: boolean;
  }
}
