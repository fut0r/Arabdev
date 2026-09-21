import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { errorMessage } from '@/api/errors';
import { draftsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { ErrorState, PageHeader, Surface } from '@/components/common';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { UserListSkeleton } from '@/components/LoadingState';
import { useNotify } from '@/components/Notifier';
import { Pagination } from '@/components/Pagination';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { usePageParam } from '@/hooks';
import { useSeo } from '@/utils/seo';
import type { Draft } from '@/types/api';
import { formatRelativeTime } from '@/utils/format';
import { htmlToText } from '@/utils/html';

export default function DraftsPage() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [page, setPage] = usePageParam();
  const [deleting, setDeleting] = useState<Draft | null>(null);
  useSeo({ title: t('drafts.title'), noindex: true });

  const query = useQuery({
    queryKey: queryKeys.drafts(page),
    queryFn: () => draftsApi.list(page),
    placeholderData: keepPreviousData,
  });
  const removal = useMutation({
    mutationFn: (draft: Draft) => draftsApi.remove(draft.id),
    onSuccess: () => {
      setDeleting(null);
      notify(t('drafts.deleted'));
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  return (
    <Surface>
      <PageHeader
        title={t('drafts.title')}
        action={
          <Button component={RouterLink} to="/create" variant="contained" startIcon={<EditOutlinedIcon />}>
            {t('nav.createPost')}
          </Button>
        }
      />
      {query.isPending ? (
        <UserListSkeleton count={3} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />
      ) : query.data.total === 0 ? (
        <EmptyState
          icon={<DescriptionOutlinedIcon />}
          title={t('drafts.emptyTitle')}
          description={t('drafts.emptyBody')}
          action={{ label: t('drafts.emptyAction'), to: '/create', icon: <EditOutlinedIcon /> }}
        />
      ) : (
        <>
          {query.data.items.map((draft, index) => {
            const excerpt = htmlToText(draft.content_html).slice(0, 180);
            return (
              <Fragment key={draft.id}>
                {index > 0 && <Divider />}
                <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', px: 2, py: 2 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Link
                      component={RouterLink}
                      to={`/drafts/${draft.id}`}
                      color="text.primary"
                      variant="h5"
                      dir="auto"
                      sx={{ display: 'block', fontWeight: 600 }}
                    >
                      {draft.title || t('drafts.untitled')}
                    </Link>
                    {excerpt && (
                      <Typography variant="body2" color="text.secondary" dir="auto" sx={{ mt: 0.5 }} noWrap>
                        {excerpt}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
                      {t('drafts.lastEdited', { time: formatRelativeTime(draft.updated_at, language) })}
                      {draft.tags.length > 0 && ` · ${draft.tags.map((tag) => `#${tag}`).join(' ')}`}
                    </Typography>
                  </Box>
                  <Button
                    component={RouterLink}
                    to={`/drafts/${draft.id}`}
                    size="small"
                    variant="outlined"
                    color="inherit"
                  >
                    {t('drafts.continueEditing')}
                  </Button>
                  <Tooltip title={t('drafts.deleteDraft')}>
                    <IconButton onClick={() => setDeleting(draft)} aria-label={t('drafts.deleteDraft')} size="small">
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Fragment>
            );
          })}
          <Divider />
          <Pagination page={page} pages={query.data.pages} onChange={setPage} />
        </>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('drafts.deleteDraft')}
        description={deleting?.title || t('drafts.untitled')}
        confirmLabel={t('common.delete')}
        pending={removal.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removal.mutate(deleting)}
      />
    </Surface>
  );
}
