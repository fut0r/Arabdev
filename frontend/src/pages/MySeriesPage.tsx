import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { communityApi } from '@/api/community';
import { errorMessage } from '@/api/errors';
import { PageHeader, Surface, ErrorState } from '@/components/common';
import { LoadingState } from '@/components/LoadingState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/Notifier';
import { useSeo } from '@/utils/seo';
import type { Series } from '@/types/api';
export default function MySeriesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const notify = useNotify();
  const query = useQuery({ queryKey: ['own-series'], queryFn: communityApi.ownSeries });
  const [editing, setEditing] = useState<Series | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Series | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  useSeo({ title: t('community.mySeries'), noindex: true });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['own-series'] });
    void client.invalidateQueries({ queryKey: ['series'] });
    void client.invalidateQueries({ queryKey: ['browse'] });
    setOpen(false);
    setDeleting(null);
  };
  const save = useMutation({
    mutationFn: () => communityApi.saveSeries(title.trim(), description.trim(), editing?.id),
    onSuccess: refresh,
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => communityApi.deleteSeries(deleting!.id),
    onSuccess: refresh,
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  return (
    <Surface>
      <PageHeader title={t('community.mySeries')} />
      <Stack spacing={2} sx={{ p: 2 }}>
        <Button
          variant="contained"
          onClick={() => {
            setEditing(null);
            setTitle('');
            setDescription('');
            setOpen(true);
          }}
        >
          {t('community.createSeries')}
        </Button>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={t('community.loadError')} onRetry={() => void query.refetch()} />
        ) : (
          query.data.map((s) => (
            <Stack key={s.id} spacing={1} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="h4" component={RouterLink} to={`/series/${s.id}`}>
                {s.title}
              </Typography>
              <Typography dir="auto">{s.description}</Typography>
              <Stack direction="row">
                <Button
                  onClick={() => {
                    setEditing(s);
                    setTitle(s.title);
                    setDescription(s.description ?? '');
                    setOpen(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button color="error" onClick={() => setDeleting(s)}>
                  {t('common.delete')}
                </Button>
              </Stack>
            </Stack>
          ))
        )}
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth>
        <DialogTitle>{t('community.series')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('community.seriesTitle')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              multiline
              minRows={3}
              label={t('community.seriesDescription')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button disabled={!title.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {t('community.save')}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('common.delete')}
        description={t('community.deleteSeriesHelp')}
        confirmLabel={t('common.delete')}
        pending={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
      />
    </Surface>
  );
}
