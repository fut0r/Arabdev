import type { Comment, Draft, FeedTab, Page, Post, PostCounters, PostInput } from '@/types/api';

import { api, turnstileHeaders } from './client';

export type Interaction = 'like' | 'bookmark' | 'repost';

export const postsApi = {
  feed: (params: { tab: FeedTab; page: number; tag?: string }) =>
    api.get<Page<Post>>('/posts', { params }).then((r) => r.data),
  trending: (page: number) => api.get<Page<Post>>('/posts/trending', { params: { page } }).then((r) => r.data),
  get: (id: number) => api.get<Post>(`/posts/${id}`).then((r) => r.data),
  create: (payload: PostInput, turnstileToken?: string | null) =>
    api.post<Post>('/posts', payload, { headers: turnstileHeaders(turnstileToken) }).then((r) => r.data),
  update: (id: number, payload: PostInput) => api.put<Post>(`/posts/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/posts/${id}`),

  interact: (id: number, kind: Interaction, active: boolean) =>
    (active ? api.post<PostCounters>(`/posts/${id}/${kind}`) : api.delete<PostCounters>(`/posts/${id}/${kind}`)).then(
      (r) => r.data,
    ),

  comments: (id: number, page: number) =>
    api.get<Page<Comment>>(`/posts/${id}/comments`, { params: { page } }).then((r) => r.data),
  addComment: (id: number, content: string, parentId?: number | null, turnstileToken?: string | null) =>
    api
      .post<Comment>(
        `/posts/${id}/comments`,
        { content, parent_id: parentId ?? null },
        { headers: turnstileHeaders(turnstileToken) },
      )
      .then((r) => r.data),
  deleteComment: (commentId: number) => api.delete(`/comments/${commentId}`),
};

export const draftsApi = {
  list: (page: number) => api.get<Page<Draft>>('/drafts', { params: { page } }).then((r) => r.data),
  get: (id: number) => api.get<Draft>(`/drafts/${id}`).then((r) => r.data),
  create: (payload: PostInput) => api.post<Draft>('/drafts', payload).then((r) => r.data),
  update: (id: number, payload: PostInput) => api.put<Draft>(`/drafts/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/drafts/${id}`),
};
