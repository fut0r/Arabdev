import type {
  Decision,
  DecisionResult,
  ModerationSummary,
  Page,
  ReportAck,
  ReportCase,
  ReportReason,
  RestrictedAccount,
} from '@/types/api';

import { api } from './client';

export const reportsApi = {
  report: (postId: number, reason: ReportReason, details: string | null) =>
    api.post<ReportAck>(`/posts/${postId}/report`, { reason, details }).then((r) => r.data),
};

/** Moderators only: the API answers 403 admin_required for everyone else. */
export const moderationApi = {
  summary: () => api.get<ModerationSummary>('/admin/summary').then((r) => r.data),
  cases: (status: 'open' | 'resolved', page: number) =>
    api.get<Page<ReportCase>>('/admin/reports', { params: { status, page } }).then((r) => r.data),
  case: (reportId: number) => api.get<ReportCase>(`/admin/reports/${reportId}`).then((r) => r.data),
  decide: (reportId: number, decision: Decision) =>
    api.post<DecisionResult>(`/admin/reports/${reportId}/decision`, decision).then((r) => r.data),
  restricted: () => api.get<RestrictedAccount[]>('/admin/restricted').then((r) => r.data),
  lift: (userId: number) => api.post<RestrictedAccount>(`/admin/users/${userId}/lift`).then((r) => r.data),
};
