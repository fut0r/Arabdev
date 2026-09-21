import type {
  EmailChangeResult,
  FollowState,
  Me,
  Page,
  PasswordChangeResult,
  Post,
  Profile,
  Reply,
  SignedInSession,
  TokenResponse,
  UserCard,
  UserSettings,
} from '@/types/api';

import { api, turnstileHeaders } from './client';
import { fitForUpload } from '@/utils/upload';

export interface ProfilePayload {
  display_name: string;
  bio: string | null;
  location: string | null;
  website: string | null;
}

export const usersApi = {
  me: () => api.get<Me>('/users/me').then((r) => r.data),
  updateProfile: (payload: ProfilePayload) => api.patch<Me>('/users/me/profile', payload).then((r) => r.data),
  updateUsername: (username: string) => api.patch<Me>('/users/me/username', { username }).then((r) => r.data),
  updateEmail: (email: string, current_password: string, turnstileToken?: string | null) =>
    api
      .post<EmailChangeResult>(
        '/users/me/email',
        { email, current_password },
        { headers: turnstileHeaders(turnstileToken) },
      )
      .then((r) => r.data),
  verifyEmail: (payload: { challenge_id: string; code: string }) =>
    api.post<Me>('/users/me/email/verify', payload).then((r) => r.data),
  changePassword: (
    payload: { current_password: string; new_password: string; new_password_confirm: string },
    turnstileToken?: string | null,
  ) =>
    api
      .post<PasswordChangeResult>('/users/me/password', payload, { headers: turnstileHeaders(turnstileToken) })
      .then((r) => r.data),
  verifyPassword: (payload: { challenge_id: string; code: string }) =>
    api.post<TokenResponse>('/users/me/password/verify', payload).then((r) => r.data),

  sessions: () => api.get<SignedInSession[]>('/users/me/sessions').then((r) => r.data),
  endSession: (id: number) => api.delete(`/users/me/sessions/${id}`),
  endOtherSessions: () => api.post<{ detail: string }>('/users/me/sessions/revoke-others').then((r) => r.data),
  exportData: () => api.get('/users/me/export', { responseType: 'blob' }).then((r) => r.data as Blob),
  updateInterests: (interest_ids: number[]) => api.put<Me>('/users/me/interests', { interest_ids }).then((r) => r.data),
  updateSettings: (payload: Partial<UserSettings>) =>
    api.patch<UserSettings>('/users/me/settings', payload).then((r) => r.data),
  completeOnboarding: () => api.post<Me>('/users/me/onboarding/complete').then((r) => r.data),
  uploadAvatar: async (file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', await fitForUpload(file));
    return api
      .post<Me>('/users/me/avatar', form, {
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      })
      .then((r) => r.data);
  },
  removeAvatar: () => api.delete<Me>('/users/me/avatar').then((r) => r.data),
  deleteAccount: (password: string) => api.delete('/users/me', { data: { password } }),
  bookmarks: (page: number) => api.get<Page<Post>>('/users/me/bookmarks', { params: { page } }).then((r) => r.data),

  recommended: (limit = 6) => api.get<UserCard[]>('/users/recommended', { params: { limit } }).then((r) => r.data),
  profile: (username: string) => api.get<Profile>(`/users/${encodeURIComponent(username)}`).then((r) => r.data),
  posts: (username: string, page: number) =>
    api.get<Page<Post>>(`/users/${encodeURIComponent(username)}/posts`, { params: { page } }).then((r) => r.data),
  replies: (username: string, page: number) =>
    api.get<Page<Reply>>(`/users/${encodeURIComponent(username)}/replies`, { params: { page } }).then((r) => r.data),
  followers: (username: string, page: number) =>
    api
      .get<Page<UserCard>>(`/users/${encodeURIComponent(username)}/followers`, { params: { page } })
      .then((r) => r.data),
  following: (username: string, page: number) =>
    api
      .get<Page<UserCard>>(`/users/${encodeURIComponent(username)}/following`, { params: { page } })
      .then((r) => r.data),
  follow: (userId: number) => api.post<FollowState>(`/users/${userId}/follow`).then((r) => r.data),
  unfollow: (userId: number) => api.delete<FollowState>(`/users/${userId}/follow`).then((r) => r.data),
};
