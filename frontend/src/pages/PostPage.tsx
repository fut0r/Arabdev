import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';

import { errorCode, errorMessage } from '@/api/errors';
import { postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { usersApi } from '@/api/users';
import { ErrorState, Surface, UserAvatar } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { CommentsSection } from '@/features/comments/Comments';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { PostActions } from '@/features/posts/PostActions';
import { PostByline, PostImage, PostLink, PostMenu, PostTags } from '@/features/posts/PostCard';
import { PostContent } from '@/features/posts/PostContent';
import { FollowButton } from '@/features/users/FollowButton';
import { useSeo, summarise } from '@/utils/seo';
import { headingFont } from '@/theme/typography';
import { HOME_PATH, SITE_URL } from '@/site';

/** Follow state comes from the author's profile (a post only carries a summary of its author). */
function AuthorFollowButton({ userId, username }: { userId: number; username: string }) {
  const { user } = useAuth();
  const enabled = Boolean(user) && user?.id !== userId;
  const { data } = useQuery({
    queryKey: queryKeys.profile(username),
    queryFn: () => usersApi.profile(username),
    enabled,
    staleTime: 60_000,
  });
  if (!enabled || !data) return null;
  return <FollowButton userId={userId} username={username} following={data.is_following} />;
}

export default function PostPage() {
  const { t } = useTranslation();
  const { direction } = usePreferences();
  const navigate = useNavigate();
  const postId = Number(useParams().postId);
  const query = useQuery({
    queryKey: queryKeys.post(postId),
    queryFn: () => postsApi.get(postId),
    enabled: Number.isInteger(postId),
  });
  const post = query.data;
  const plainText = post ? post.content_html.replace(/<[^>]*>/g, ' ') : '';
  useSeo({
    title: post?.title ?? (post ? t('post.by', { name: post.author.display_name }) : null),
    description: post ? summarise(plainText) : null,
    canonical: `/posts/${postId}`,
    type: 'article',
    image: post?.image?.url ? `${SITE_URL}${post.image.url}` : null,
    publishedAt: post?.created_at,
    authorName: post?.author.display_name,
    jsonLd: post
      ? {
          '@context': 'https://schema.org',
          '@type': 'DiscussionForumPosting',
          headline: post.title || summarise(plainText, 80),
          articleBody: summarise(plainText, 500),
          datePublished: post.created_at,
          dateModified: post.edited_at ?? post.updated_at,
          author: { '@type': 'Person', name: post.author.display_name, url: `${SITE_URL}/u/${post.author.username}` },
          url: `${SITE_URL}/posts/${post.id}`,
          keywords: post.tags.map((tag) => tag.name).join(', '),
          commentCount: post.comments_count,
          interactionStatistic: {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/LikeAction',
            userInteractionCount: post.likes_count,
          },
          inLanguage: 'ar',
        }
      : null,
  });

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(HOME_PATH));

  return (
    <Surface component="article" aria-labelledby="post-title">
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', px: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tooltip title={t('post.backToFeed')}>
          <IconButton onClick={back} aria-label={t('post.backToFeed')}>
            <ArrowBackIcon sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
          </IconButton>
        </Tooltip>
        {post && (
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
            {t('post.readTime', { count: post.reading_minutes })}
          </Typography>
        )}
      </Stack>

      {query.isPending ? (
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Skeleton variant="circular" width={48} height={48} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="40%" />
              <Skeleton width="25%" />
            </Box>
          </Stack>
          <Skeleton height={48} sx={{ mt: 2 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} />
          ))}
        </Box>
      ) : query.isError ? (
        errorCode(query.error) === 'post_not_found' ? (
          <EmptyState
            icon={<SearchOffOutlinedIcon />}
            title={t('post.notFound')}
            action={{ label: t('common.goHome'), to: HOME_PATH }}
          />
        ) : (
          <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />
        )
      ) : post ? (
        <>
          <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2.5, pb: 1.5 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box component={RouterLink} to={`/u/${post.author.username}`} sx={{ borderRadius: '50%' }}>
                <UserAvatar name={post.author.display_name} src={post.author.avatar_url} size={48} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <PostByline post={post} size="page" />
              </Box>
              <AuthorFollowButton userId={post.author.id} username={post.author.username} />
              <PostMenu post={post} onDeleted={() => navigate(HOME_PATH, { replace: true })} />
            </Stack>

            <Typography
              id="post-title"
              component="h1"
              dir="auto"
              sx={{
                fontFamily: headingFont,
                fontWeight: 700,
                fontSize: { xs: '1.625rem', md: '2rem' },
                lineHeight: 1.35,
                mt: 2.5,
                mb: 2,
              }}
            >
              {post.title || t('post.by', { name: post.author.display_name })}
            </Typography>

            <PostContent html={post.content_html} />
            <PostImage post={post} maxHeight={720} />
            {post.link_url && <PostLink url={post.link_url} />}
            <PostTags post={post} />
            <Box sx={{ mt: 1.5, pt: 0.5, borderTop: 1, borderColor: 'divider' }}>
              <PostActions
                post={post}
                onComment={() => document.getElementById('comments')?.querySelector('textarea')?.focus()}
              />
            </Box>
          </Box>
          <Divider />
          <CommentsSection postId={post.id} commentsCount={post.comments_count} />
        </>
      ) : null}
    </Surface>
  );
}
