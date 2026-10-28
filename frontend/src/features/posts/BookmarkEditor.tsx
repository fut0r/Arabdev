import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { communityApi } from '@/api/community';
import { POST_QUERY_ROOTS } from '@/api/queryKeys';
import { errorMessage } from '@/api/errors';
import { useNotify } from '@/components/Notifier';
import type { Post } from '@/types/api';
export function BookmarkEditor({ post, onClose }: { post: Post; onClose: () => void }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const client = useQueryClient();
  const [collection, setCollection] = useState(post.bookmark_collection_id ?? 0);
  const [note, setNote] = useState(post.bookmark_note ?? '');
  const groups = useQuery({ queryKey: ['collections'], queryFn: communityApi.collections });
  const save = useMutation({
    mutationFn: () => communityApi.bookmark(post.id, collection || null, note),
    onSuccess: () => {
      for (const root of [...POST_QUERY_ROOTS, 'collections']) void client.invalidateQueries({ queryKey: [root] });
      onClose();
    },
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" onClick={(e) => e.stopPropagation()}>
      <DialogTitle>{t('community.organize')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <TextField
            select
            label={t('community.collections')}
            value={collection}
            onChange={(e) => setCollection(Number(e.target.value))}
            disabled={!groups.data}
          >
            <MenuItem value={0}>{t('community.unfiled')}</MenuItem>
            {groups.data?.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('community.noteLabel')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 1000, dir: 'auto' } }}
          />
          {groups.isError && <Button onClick={() => void groups.refetch()}>{t('community.loadError')}</Button>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" loading={save.isPending} disabled={!groups.data} onClick={() => save.mutate()}>
          {t('community.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
