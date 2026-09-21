import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { PageHeader, SectionHeading, Surface } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { PopularTags } from '@/features/discovery/PopularTags';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { SearchBar } from '@/features/search/SearchBar';
import { RecommendedDevelopers } from '@/features/users/RecommendedDevelopers';
import { usePageParam } from '@/hooks';
import { useSeo } from '@/utils/seo';

export default function ExplorePage() {
  const { t } = useTranslation();
  const [page, setPage] = usePageParam();
  useSeo({ title: t('explore.title'), description: t('explore.metaDescription'), canonical: '/explore' });

  const trending = useQuery({
    queryKey: queryKeys.trending(page),
    queryFn: () => postsApi.trending(page),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack spacing={2}>
      <Surface>
        <PageHeader title={t('explore.title')} />
        <Box sx={{ p: 2 }}>
          <SearchBar />
        </Box>
      </Surface>

      {/* On large screens these live in the sidebar; here they lead the page. */}
      <Box
        sx={{
          display: { xs: 'grid', lg: 'none' },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
          gap: 2,
        }}
      >
        <Surface>
          <SectionHeading>{t('explore.popularTags')}</SectionHeading>
          <PopularTags limit={6} />
        </Surface>
        <Surface>
          <SectionHeading>{t('explore.recommended')}</SectionHeading>
          <RecommendedDevelopers limit={4} dense />
        </Surface>
      </Box>

      <Surface component="section" aria-labelledby="trending-title">
        <Box id="trending-title">
          <SectionHeading>{t('explore.trending')}</SectionHeading>
        </Box>
        <PagedPosts
          query={trending}
          page={page}
          onPageChange={setPage}
          empty={<EmptyState compact icon={<TrendingUpIcon />} title={t('explore.noTrending')} />}
        />
      </Surface>
    </Stack>
  );
}
