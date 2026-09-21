import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TagIcon from '@mui/icons-material/Tag';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { discoveryApi } from '@/api/misc';
import { postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { Surface } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { usePageParam } from '@/hooks';
import { useSeo } from '@/utils/seo';

export default function TagPage() {
  const { t } = useTranslation();
  const slug = (useParams().slug ?? '').toLowerCase();
  const [page, setPage] = usePageParam();
  useSeo({
    title: `#${slug}`,
    description: t('tag.metaDescription', { tag: slug }),
    canonical: `/tags/${slug}`,
  });

  const detail = useQuery({ queryKey: queryKeys.tag(slug), queryFn: () => discoveryApi.tag(slug), retry: false });
  const posts = useQuery({
    queryKey: queryKeys.tagPosts(slug, page),
    queryFn: () => postsApi.feed({ tab: 'latest', page, tag: slug }),
    placeholderData: keepPreviousData,
  });

  return (
    <Surface>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', px: 2.5, py: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box
          aria-hidden
          sx={{
            width: 52,
            height: 52,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'accent.subtle',
            color: 'accent.text',
          }}
        >
          <TagIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h2" component="h1" dir="auto" noWrap>
            #{slug}
          </Typography>
          {detail.isPending ? (
            <Skeleton width={80} />
          ) : (
            <Typography color="text.secondary">
              {t('explore.postsCount', { count: detail.data?.posts_count ?? 0 })}
            </Typography>
          )}
        </Box>
      </Stack>
      <PagedPosts
        query={posts}
        page={page}
        onPageChange={setPage}
        withAds
        empty={
          <EmptyState
            icon={<TagIcon />}
            title={t('tag.emptyTitle', { tag: slug })}
            description={t('tag.emptyBody')}
            action={{ label: t('nav.createPost'), to: '/create', icon: <EditOutlinedIcon /> }}
          />
        }
      />
    </Surface>
  );
}
