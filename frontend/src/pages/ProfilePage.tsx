import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LinkIcon from '@mui/icons-material/Link';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import PostAddOutlinedIcon from '@mui/icons-material/PostAddOutlined';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router';

import { errorCode, errorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { usersApi } from '@/api/users';
import { ErrorState, RelativeTime, Surface, UserAvatar } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { UserListSkeleton } from '@/components/LoadingState';
import { Pagination } from '@/components/Pagination';
import { CommentText } from '@/features/comments/Comments';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { FollowButton } from '@/features/users/FollowButton';
import { interestName } from '@/features/users/UserCard';
import { usePageParam } from '@/hooks';
import { useSeo, summarise } from '@/utils/seo';
import { displayFont } from '@/theme/typography';
import type { Profile } from '@/types/api';
import { formatCount, formatMonthYear, hostnameOf } from '@/utils/format';
import { HOME_PATH, SITE_URL } from '@/site';

type ProfileTab = 'posts' | 'replies' | 'saved';

function Stat({ value, label, to }: { value: number; label: string; to?: string }) {
  const { language } = usePreferences();
  const content = (
    <>
      <Box
        component="span"
        sx={{ fontFamily: displayFont, fontSize: '1.25rem', color: 'text.primary', letterSpacing: '0.02em' }}
      >
        {formatCount(value, language)}
      </Box>{' '}
      <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>
        {label}
      </Box>
    </>
  );
  return to ? (
    <Link component={RouterLink} to={to} underline="hover" color="inherit">
      {content}
    </Link>
  ) : (
    <Box component="span">{content}</Box>
  );
}

function ProfileHeader({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const base = `/u/${profile.username}`;
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, pt: 3, pb: 2.5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <UserAvatar
          name={profile.display_name}
          src={profile.avatar_url}
          size={96}
          sx={{ border: 1, borderColor: 'divider' }}
        />
        <Box sx={{ pt: 1 }}>
          {profile.is_me ? (
            <Button
              component={RouterLink}
              to="/profile/edit"
              variant="outlined"
              color="inherit"
              startIcon={<EditOutlinedIcon />}
            >
              {t('profile.editProfile')}
            </Button>
          ) : (
            <FollowButton
              userId={profile.id}
              username={profile.username}
              following={profile.is_following}
              size="medium"
            />
          )}
        </Box>
      </Stack>

      <Typography variant="h2" component="h1" sx={{ mt: 2, lineHeight: 1.3 }}>
        {profile.display_name}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography color="text.secondary" dir="ltr">
          @{profile.username}
        </Typography>
        {profile.follows_you && <Chip size="small" label={t('profile.followsYou')} />}
      </Stack>

      {profile.bio && (
        <Typography dir="auto" sx={{ mt: 1.5, whiteSpace: 'pre-wrap', maxWidth: 560 }}>
          {profile.bio}
        </Typography>
      )}

      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.5, mt: 1.5, color: 'text.secondary' }}
      >
        {profile.location && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <LocationOnOutlinedIcon fontSize="small" aria-label={t('profile.location')} />
            <Typography variant="body2">{profile.location}</Typography>
          </Stack>
        )}
        {profile.website && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <LinkIcon fontSize="small" aria-label={t('profile.website')} />
            <Link href={profile.website} target="_blank" rel="noopener noreferrer nofollow" variant="body2">
              {hostnameOf(profile.website)}
            </Link>
          </Stack>
        )}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <CalendarMonthOutlinedIcon fontSize="small" aria-hidden />
          <Typography variant="body2">
            {t('profile.joined', { date: formatMonthYear(profile.created_at, language) })}
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2.5, mt: 2 }}>
        <Stat
          value={profile.following_count}
          label={t('profile.following')}
          to={profile.follow_lists_visible ? `${base}/following` : undefined}
        />
        <Stat
          value={profile.followers_count}
          label={t('profile.followers')}
          to={profile.follow_lists_visible ? `${base}/followers` : undefined}
        />
        <Stat value={profile.posts_count} label={t('profile.posts')} />
      </Stack>

      {profile.interests.length > 0 && (
        <Stack
          direction="row"
          useFlexGap
          sx={{ flexWrap: 'wrap', gap: 0.75, mt: 2 }}
          aria-label={t('profile.interests')}
        >
          {profile.interests.map((interest) => (
            <Chip
              key={interest.id}
              label={interestName(interest, language)}
              size="small"
              variant="outlined"
              component={RouterLink}
              to={`/tags/${interest.slug}`}
              clickable
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function RepliesTab({ username }: { username: string }) {
  const { t } = useTranslation();
  const [page, setPage] = usePageParam();
  const query = useQuery({
    queryKey: queryKeys.userReplies(username, page),
    queryFn: () => usersApi.replies(username, page),
    placeholderData: keepPreviousData,
  });
  if (query.isPending) return <UserListSkeleton count={3} />;
  if (query.isError) return <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />;
  if (!query.data.total) {
    return (
      <EmptyState
        icon={<ChatBubbleOutlineOutlinedIcon />}
        title={t('profile.emptyRepliesTitle')}
        description={t('profile.emptyRepliesBody')}
      />
    );
  }
  return (
    <>
      {query.data.items.map((reply, index) => (
        <Fragment key={reply.id}>
          {index > 0 && <Divider />}
          <Box sx={{ px: 2, py: 1.75 }}>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.5 }}>
              <RelativeTime iso={reply.created_at} /> ·{' '}
              <Link component={RouterLink} to={`/posts/${reply.post.id}#comments`} dir="auto">
                {t('comments.onPost', { title: reply.post.title || reply.post.excerpt })}
              </Link>
            </Typography>
            <CommentText text={reply.content} />
          </Box>
        </Fragment>
      ))}
      <Divider />
      <Pagination page={page} pages={query.data.pages} onChange={setPage} />
    </>
  );
}

function PostsTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const [page, setPage] = usePageParam();
  const query = useQuery({
    queryKey: queryKeys.userPosts(profile.username, page),
    queryFn: () => usersApi.posts(profile.username, page),
    placeholderData: keepPreviousData,
  });
  return (
    <PagedPosts
      query={query}
      page={page}
      onPageChange={setPage}
      empty={
        <EmptyState
          icon={<PostAddOutlinedIcon />}
          title={t('profile.emptyPostsTitle')}
          description={
            profile.is_me ? t('profile.emptyPostsBodyMe') : t('profile.emptyPostsBody', { username: profile.username })
          }
          action={
            profile.is_me ? { label: t('feed.emptyAction'), to: '/create', icon: <EditOutlinedIcon /> } : undefined
          }
        />
      }
    />
  );
}

function SavedTab() {
  const { t } = useTranslation();
  const [page, setPage] = usePageParam();
  const query = useQuery({
    queryKey: queryKeys.bookmarks(page),
    queryFn: () => usersApi.bookmarks(page),
    placeholderData: keepPreviousData,
  });
  return (
    <PagedPosts
      query={query}
      page={page}
      onPageChange={setPage}
      empty={
        <EmptyState
          icon={<BookmarkBorderIcon />}
          title={t('bookmarks.emptyTitle')}
          description={t('bookmarks.emptyBody')}
        />
      }
    />
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const username = (useParams().username ?? '').toLowerCase();
  const [params, setParams] = useSearchParams();
  const query = useQuery({ queryKey: queryKeys.profile(username), queryFn: () => usersApi.profile(username) });
  const profile = query.data;
  useSeo({
    title: profile ? `${profile.display_name} (@${profile.username})` : `@${username}`,
    description: profile?.bio
      ? summarise(profile.bio)
      : profile
        ? t('profile.metaDescription', { name: profile.display_name })
        : null,
    canonical: `/u/${username}`,
    type: 'profile',
    image: profile?.avatar_url ? `${SITE_URL}${profile.avatar_url}` : null,
    jsonLd: profile
      ? {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: profile.display_name,
            alternateName: `@${profile.username}`,
            description: profile.bio ?? undefined,
            url: `${SITE_URL}/u/${profile.username}`,
          },
        }
      : null,
  });

  const requested = params.get('tab') as ProfileTab | null;
  const tabs: ProfileTab[] = profile?.is_me ? ['posts', 'replies', 'saved'] : ['posts', 'replies'];
  const tab: ProfileTab = requested && tabs.includes(requested) ? requested : 'posts';

  if (query.isPending) {
    return (
      <Surface>
        <Box sx={{ p: 3 }}>
          <Skeleton variant="circular" width={96} height={96} />
          <Skeleton width="40%" height={40} sx={{ mt: 2 }} />
          <Skeleton width="25%" />
          <Skeleton width="80%" sx={{ mt: 2 }} />
        </Box>
      </Surface>
    );
  }
  if (query.isError) {
    return (
      <Surface>
        {errorCode(query.error) === 'user_not_found' ? (
          <EmptyState
            icon={<PersonOffOutlinedIcon />}
            title={t('profile.notFound')}
            action={{ label: t('common.goHome'), to: HOME_PATH }}
          />
        ) : (
          <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />
        )}
      </Surface>
    );
  }

  return (
    <Surface>
      <ProfileHeader profile={query.data} />
      <Tabs
        value={tab}
        onChange={(_, value: ProfileTab) => setParams(value === 'posts' ? {} : { tab: value })}
        variant="fullWidth"
        sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="posts" label={t('profile.posts')} />
        <Tab value="replies" label={t('profile.replies')} />
        {query.data.is_me && <Tab value="saved" label={t('profile.bookmarks')} />}
      </Tabs>
      {tab === 'posts' && <PostsTab profile={query.data} />}
      {tab === 'replies' && <RepliesTab username={query.data.username} />}
      {tab === 'saved' && <SavedTab />}
    </Surface>
  );
}
