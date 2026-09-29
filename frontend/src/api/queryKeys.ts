import type { FeedTab, SearchType } from '@/types/api';

/** Every TanStack Query key in one place, so invalidation stays consistent. */
export const queryKeys = {
  feed: (tab: FeedTab, page: number) => ['feed', tab, page] as const,
  trending: (page: number) => ['trending', page] as const,
  post: (id: number) => ['post', id] as const,
  comments: (postId: number, page: number) => ['comments', postId, page] as const,
  tag: (slug: string) => ['tag', slug] as const,
  tagPosts: (slug: string, page: number) => ['tag-posts', slug, page] as const,
  profile: (username: string) => ['profile', username] as const,
  userPosts: (username: string, page: number) => ['user-posts', username, page] as const,
  userReplies: (username: string, page: number) => ['user-replies', username, page] as const,
  followers: (username: string, page: number) => ['followers', username, page] as const,
  following: (username: string, page: number) => ['following', username, page] as const,
  bookmarks: (page: number) => ['bookmarks', page] as const,
  drafts: (page: number) => ['drafts', page] as const,
  draft: (id: number) => ['draft', id] as const,
  notifications: (page: number) => ['notifications', page] as const,
  unreadCount: ['unread-count'] as const,
  search: (q: string, type: SearchType, page: number) => ['search', q, type, page] as const,
  searchPreview: (q: string) => ['search-preview', q] as const,
  popularTags: ['popular-tags'] as const,
  recommended: (limit: number) => ['recommended', limit] as const,
  interests: ['interests'] as const,
  ads: (placement: string, lang: string, offset: number) => ['ads', placement, lang, offset] as const,
  moderationSummary: ['moderation', 'summary'] as const,
  moderationCases: (status: 'open' | 'resolved', page: number) => ['moderation', 'cases', status, page] as const,
  moderationCase: (reportId: number) => ['moderation', 'case', reportId] as const,
  restricted: ['moderation', 'restricted'] as const,
};

/** Query roots whose data contains posts (either Page<Post> or Post). */
export const POST_QUERY_ROOTS = [
  'feed',
  'trending',
  'post',
  'tag-posts',
  'user-posts',
  'bookmarks',
  'search',
  'search-preview',
];

/** Query roots whose data contains user cards with follow state. */
export const USER_QUERY_ROOTS = ['profile', 'followers', 'following', 'recommended', 'search', 'search-preview'];
