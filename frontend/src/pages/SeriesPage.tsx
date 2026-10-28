import { useQuery } from '@tanstack/react-query';
import { useParams, Link as RouterLink } from 'react-router';
import { Link, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { communityApi } from '@/api/community';
import { PageHeader, Surface, ErrorState } from '@/components/common';
import { LoadingState } from '@/components/LoadingState';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { EmptyState } from '@/components/EmptyState';
import { usePageParam } from '@/hooks';
import { useSeo } from '@/utils/seo';
export default function SeriesPage() {
  const id = Number(useParams().seriesId);
  const { t } = useTranslation();
  const [page, setPage] = usePageParam();
  const series = useQuery({ queryKey: ['series', id], queryFn: () => communityApi.series(id) });
  const posts = useQuery({
    queryKey: ['browse', { series_id: id, page }],
    queryFn: () => communityApi.browse({ series_id: id, page }),
  });
  useSeo({ title: series.data?.title ?? t('community.series'), canonical: `/series/${id}` });
  return (
    <Surface>
      {series.isPending ? (
        <LoadingState />
      ) : series.isError ? (
        <ErrorState message={t('community.loadError')} />
      ) : (
        <>
          <PageHeader title={series.data.title} />
          <Typography sx={{ px: 2 }} dir="auto">
            {series.data.description}
          </Typography>
          <Link component={RouterLink} to={`/u/${series.data.author.username}`} sx={{ m: 2, display: 'inline-block' }}>
            {series.data.author.display_name}
          </Link>
        </>
      )}
      <PagedPosts
        query={posts}
        page={page}
        onPageChange={setPage}
        empty={<EmptyState icon={null} title={t('community.empty')} />}
      />
    </Surface>
  );
}
