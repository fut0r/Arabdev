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

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; skipAuthRefresh?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const code = error.response?.data?.code;
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
