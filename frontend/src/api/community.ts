import { api } from './client';
import type { BookmarkCollection, Page, Post, Series, TagStat, UserCard } from '@/types/api';
export interface BrowseParams {
  page: number;
  sort?: string;
  days?: number;
  kind?: string;
  language?: string;
  unanswered?: boolean;
  series_id?: number;
}
export const communityApi = {
  browse: (params: BrowseParams) => api.get<Page<Post>>('/browse', { params }).then((r) => r.data),
  developers: (page: number, q: string, interest?: string) =>
    api.get<Page<UserCard>>('/developers', { params: { page, q, interest } }).then((r) => r.data),
  collections: () => api.get<BookmarkCollection[]>('/library/collections').then((r) => r.data),
  saveCollection: (name: string, id?: number) =>
    (id
      ? api.put<BookmarkCollection>(`/library/collections/${id}`, { name })
      : api.post<BookmarkCollection>('/library/collections', { name })
    ).then((r) => r.data),
  deleteCollection: (id: number) => api.delete(`/library/collections/${id}`),
  bookmark: (id: number, collection_id: number | null, note: string) =>
    api.put<Post>(`/library/bookmarks/${id}`, { collection_id, note: note || null }).then((r) => r.data),
  ownSeries: () => api.get<Series[]>('/series/mine').then((r) => r.data),
  series: (id: number) => api.get<Series>(`/series/${id}`).then((r) => r.data),
  saveSeries: (title: string, description: string, id?: number) =>
    (id
      ? api.put<Series>(`/series/${id}`, { title, description })
      : api.post<Series>('/series', { title, description })
    ).then((r) => r.data),
  deleteSeries: (id: number) => api.delete(`/series/${id}`),
  acceptAnswer: (id: number, comment_id: number | null) =>
    api.put<Post>(`/posts/${id}/answer`, { comment_id }).then((r) => r.data),
  feature: (id: number, featured: boolean) => api.put<Post>(`/posts/${id}/featured`, { featured }).then((r) => r.data),
  followedTags: () => api.get<TagStat[]>('/topics/following').then((r) => r.data),
  followTag: (slug: string, following: boolean) => api.put(`/topics/${encodeURIComponent(slug)}/follow`, { following }),
};
