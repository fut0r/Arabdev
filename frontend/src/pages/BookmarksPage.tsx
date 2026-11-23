import { Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { communityApi } from '@/api/community';
import { errorMessage } from '@/api/errors';
import { useNotify } from '@/components/Notifier';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
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
  const [collection, setCollection] = useState(-1);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [withNotes, setWithNotes] = useState(false);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const client = useQueryClient();
  const notify = useNotify();
  const groups = useQuery({ queryKey: ['collections'], queryFn: communityApi.collections });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['collections'] });
    void client.invalidateQueries({ queryKey: ['bookmarks'] });
    setName('');
    setDeleting(false);
  };
  const save = useMutation({
    mutationFn: () => communityApi.saveCollection(name.trim()),
    onSuccess: refresh,
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  const rename = useMutation({
    mutationFn: () => communityApi.saveCollection(name.trim(), collection),
    onSuccess: refresh,
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => communityApi.deleteCollection(collection),
    onSuccess: () => {
      setCollection(-1);
      setPage(1);
      refresh();
    },
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  useSeo({ title: t('bookmarks.title'), noindex: true });
  const filters = {
    collection_id: collection < 0 ? undefined : collection,
    oldest_first: oldestFirst || undefined,
    with_notes: withNotes || undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.bookmarks(page, filters),
    queryFn: () => usersApi.bookmarks(page, filters),
    placeholderData: keepPreviousData,
  });

  return (
    <Surface>
      <PageHeader title={t('bookmarks.title')} />
      <Stack spacing={2} sx={{ p: 2 }}>
        <TextField
          select
          label={t('community.collections')}
          value={collection}
          onChange={(e) => {
            setCollection(Number(e.target.value));
            setPage(1);
          }}
        >
          <MenuItem value={-1}>{t('community.allCollections')}</MenuItem>
          <MenuItem value={0}>{t('community.unfiled')}</MenuItem>
          {groups.data?.map((c) => (
            <MenuItem value={c.id} key={c.id}>
              {c.name} ({c.posts_count})
            </MenuItem>
          ))}
        </TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <FormControlLabel
            label={t('bookmarks.withNotes')}
            control={
              <Checkbox
                checked={withNotes}
                onChange={(_, checked) => {
                  setWithNotes(checked);
                  setPage(1);
                }}
              />
            }
          />
          <FormControlLabel
            label={t('bookmarks.oldestFirst')}
            control={
              <Checkbox
                checked={oldestFirst}
                onChange={(_, checked) => {
                  setOldestFirst(checked);
                  setPage(1);
                }}
              />
            }
          />
        </Stack>
        <Box component="details" sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
          <Box component="summary" sx={{ cursor: 'pointer', py: 1, fontWeight: 600 }}>
            {t('bookmarks.manageCollections')}
          </Box>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <Stack
              component="form"
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) save.mutate();
              }}
            >
              <TextField
                fullWidth
                label={t('community.collectionName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
              <Button type="submit" disabled={!name.trim()} loading={save.isPending}>
                {t('community.newCollection')}
              </Button>
            </Stack>
            {collection > 0 && (
              <Button disabled={!name.trim()} loading={rename.isPending} onClick={() => rename.mutate()}>
                {t('community.renameCollection')}
              </Button>
            )}
            {collection > 0 && (
              <Button color="error" onClick={() => setDeleting(true)}>
                {t('community.deleteCollection')}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
      <ConfirmDialog
        open={deleting}
        title={t('community.deleteCollection')}
        description={t('community.deleteCollectionHelp')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      <PagedPosts
        query={query}
        page={page}
        onPageChange={setPage}
        empty={
          withNotes ? (
            <EmptyState icon={<BookmarkBorderIcon />} title={t('bookmarks.noNotes')} />
          ) : (
            <EmptyState
              icon={<BookmarkBorderIcon />}
              title={t('bookmarks.emptyTitle')}
              description={t('bookmarks.emptyBody')}
              action={{ label: t('bookmarks.emptyAction'), to: HOME_PATH }}
            />
          )
        }
      />
    </Surface>
  );
}
