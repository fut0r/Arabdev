import type { AuthResult, Challenge, FieldAvailability, PublicConfig, TokenResponse } from '@/types/api';

import { api, turnstileHeaders } from './client';

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  language: 'ar' | 'en';
}

export const authApi = {
  /** The Turnstile site key and whether emailed codes are in use. Safe to cache. */
  config: () => api.get<PublicConfig>('/auth/config').then((r) => r.data),

  login: (payload: { email: string; password: string; remember_me: boolean }, turnstileToken?: string | null) =>
    api
      .post<AuthResult>('/auth/login', payload, {
        skipAuthRefresh: true,
        headers: turnstileHeaders(turnstileToken),
      })
      .then((r) => r.data),

  register: (payload: RegisterPayload, turnstileToken?: string | null) =>
    api
      .post<AuthResult>('/auth/register', payload, {
        skipAuthRefresh: true,
        headers: turnstileHeaders(turnstileToken),
      })
      .then((r) => r.data),

  /** Finishes a sign-in or a sign-up with the code from the email. */
  verify: (payload: { challenge_id: string; code: string }) =>
    api.post<TokenResponse>('/auth/verify', payload, { skipAuthRefresh: true }).then((r) => r.data),

  resend: (challengeId: string) =>
    api.post<Challenge>('/auth/resend', { challenge_id: challengeId }, { skipAuthRefresh: true }).then((r) => r.data),

  logout: () => api.post('/auth/logout', null, { skipAuthRefresh: true }),

  availability: (params: { username?: string; email?: string }, signal?: AbortSignal) =>
    api
      .get<{ username: FieldAvailability | null; email: FieldAvailability | null }>('/auth/availability', {
        params,
        signal,
      })
      .then((r) => r.data),

  forgotPassword: (email: string, turnstileToken?: string | null) =>
    api.post('/auth/forgot-password', { email }, { headers: turnstileHeaders(turnstileToken) }).then((r) => r.data),

  resetPassword: (payload: { token: string; password: string; password_confirm: string }) =>
    api.post('/auth/reset-password', payload).then((r) => r.data),
};
