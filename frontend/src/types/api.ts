/** Shapes returned by the ArabDev REST API (/api/v1). */

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Interest {
  id: number;
  slug: string;
  name_en: string;
  name_ar: string;
}

export interface UserSummary {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface UserCard extends UserSummary {
  bio: string | null;
  interests: Interest[];
  followers_count: number;
  is_following: boolean;
  follows_you: boolean;
}

export interface Profile extends UserCard {
  location: string | null;
  website: string | null;
  created_at: string;
  following_count: number;
  posts_count: number;
  is_me: boolean;
  follow_lists_visible: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type MentionsFrom = 'everyone' | 'following' | 'none';

export interface UserSettings {
  theme: ThemeMode;
  language: 'ar' | 'en';
  default_feed: FeedTab;
  reduce_motion: boolean;
  discoverable: boolean;
  show_follow_lists: boolean;
  mentions_from: MentionsFrom;
  login_code_required: boolean;
  email_security_alerts: boolean;
  email_product_updates: boolean;
  notify_likes: boolean;
  notify_comments: boolean;
  notify_follows: boolean;
  notify_reposts: boolean;
  notify_mentions: boolean;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  display_name: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  interests: Interest[];
  onboarding_completed: boolean;
  email_verified: boolean;
  is_admin: boolean;
  created_at: string;
  followers_count: number;
  following_count: number;
  settings: UserSettings;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: Me;
}

/** A six-digit code is waiting in an inbox. */
export interface Challenge {
  challenge_id: string;
  /** Partly hidden, e.g. l***a@example.com */
  email: string;
  purpose: 'register' | 'login' | 'email_change' | 'password_change';
  expires_in: number;
  resend_in: number;
}

export interface AuthResult {
  status: 'authenticated' | 'verification_required';
  tokens: TokenResponse | null;
  challenge: Challenge | null;
}

export interface EmailChangeResult {
  status: 'updated' | 'verification_required';
  user: Me | null;
  challenge: Challenge | null;
}

export interface PasswordChangeResult {
  status: 'updated' | 'verification_required';
  tokens: TokenResponse | null;
  challenge: Challenge | null;
}

export interface PublicConfig {
  turnstile_site_key: string | null;
  email_codes: boolean;
}

export interface SignedInSession {
  id: number;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  remember: boolean;
  current: boolean;
}

export interface FieldAvailability {
  available: boolean;
  code: string | null;
  detail: string | null;
}

export interface Tag {
  slug: string;
  name: string;
}

export interface TagStat extends Tag {
  posts_count: number;
}

export interface TagDetail extends TagStat {
  interest_slug: string | null;
}

export interface Image {
  id: number;
  url: string;
  width: number;
  height: number;
}

export interface Post {
  id: number;
  title: string | null;
  content_html: string;
  link_url: string | null;
  image: Image | null;
  tags: Tag[];
  author: UserSummary;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  reading_minutes: number;
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
  reposted_by: UserSummary | null;
}

export interface PostCounters {
  post_id: number;
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
}

export interface PostInput {
  title: string | null;
  content_html: string;
  link_url: string | null;
  image_media_id: number | null;
  tags: string[];
  draft_id?: number | null;
}

export interface Draft {
  id: number;
  title: string | null;
  content_html: string;
  link_url: string | null;
  image: Image | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface PostRef {
  id: number;
  title: string | null;
  excerpt: string;
  author_username: string;
}

export interface Comment {
  id: number;
  post_id: number;
  parent_id: number | null;
  content: string;
  author: UserSummary;
  created_at: string;
  can_delete: boolean;
}

export interface Reply extends Comment {
  post: PostRef;
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'repost' | 'mention';

export interface Notification {
  id: number;
  type: NotificationType;
  actor: UserSummary;
  post: PostRef | null;
  comment_excerpt: string | null;
  is_read: boolean;
  created_at: string;
}

export type SearchType = 'all' | 'posts' | 'users' | 'tags';

export interface SearchResults {
  query: string;
  type: SearchType;
  posts: Page<Post> | null;
  users: Page<UserCard> | null;
  tags: Page<TagStat> | null;
}

export interface Media {
  id: number;
  kind: string;
  url: string;
  width: number;
  height: number;
  content_type: string;
  size_bytes: number;
}

export interface Ad {
  id: number;
  sponsor: string;
  title: string;
  body: string;
  cta_label: string;
  target_url: string;
  image_url: string | null;
  placement: string;
}

export interface FollowState {
  user_id: number;
  following: boolean;
  followers_count: number;
}

export interface ApiErrorBody {
  detail: string;
  code: string;
  field?: string;
  errors?: { field: string | null; code: string; message: string }[];
}

export type FeedTab = 'for_you' | 'following' | 'latest';
