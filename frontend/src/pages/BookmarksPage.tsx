import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/api/queryKeys';
import { usersApi } from '@/api/users';
import { PageHeader, Surface } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { usePageParam } from '@/hooks';
import { useSeo } from '@/utils/seo';
import { HOME_PATH } from '@/site';

export default function BookmarksPage() {
  const { t } = useTranslation();
  const [page, setPage] = usePageParam();
  useSeo({ title: t('bookmarks.title'), noindex: true });
  const query = useQuery({
    queryKey: queryKeys.bookmarks(page),
    queryFn: () => usersApi.bookmarks(page),
    placeholderData: keepPreviousData,
  });

  return (
    <Surface>
      <PageHeader title={t('bookmarks.title')} />
      <PagedPosts
        query={query}
        page={page}
        onPageChange={setPage}
        empty={
          <EmptyState
            icon={<BookmarkBorderIcon />}
            title={t('bookmarks.emptyTitle')}
            description={t('bookmarks.emptyBody')}
            action={{ label: t('bookmarks.emptyAction'), to: HOME_PATH }}
          />
        }
      />
    </Surface>
  );
}
