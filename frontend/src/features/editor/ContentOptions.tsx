import { Button, MenuItem, Stack, TextField } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { communityApi } from '@/api/community';
import { errorMessage } from '@/api/errors';
import { useNotify } from '@/components/Notifier';
import type { ContentMetadata } from '@/types/api';
export const EMPTY_METADATA: ContentMetadata = {
  kind: 'article',
  language: 'auto',
  repository_url: null,
  demo_url: null,
  series_id: null,
  series_order: 1,
};
export function metadataOf(value: ContentMetadata): ContentMetadata {
  const { kind, language, repository_url, demo_url, series_id, series_order } = value;
  return { kind, language, repository_url, demo_url, series_id, series_order };
}
export function ContentOptions({
  value,
  onChange,
}: {
  value: ContentMetadata;
  onChange: (value: ContentMetadata) => void;
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const series = useQuery({ queryKey: ['own-series'], queryFn: communityApi.ownSeries });
  const create = useMutation({
    mutationFn: () => communityApi.saveSeries(title.trim(), ''),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ['own-series'] });
      onChange({ ...value, series_id: data.id });
      setTitle('');
    },
    onError: (e) => notify(errorMessage(e, t), 'error'),
  });
  const patch = (next: Partial<ContentMetadata>) => onChange({ ...value, ...next });
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          fullWidth
          label={t('community.allKinds')}
          value={value.kind}
          onChange={(e) => patch({ kind: e.target.value as ContentMetadata['kind'] })}
        >
          {['article', 'question', 'project', 'note'].map((k) => (
            <MenuItem key={k} value={k}>
              {t(`community.${k}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          fullWidth
          label={t('community.allLanguages')}
          value={value.language}
          onChange={(e) => patch({ language: e.target.value as ContentMetadata['language'] })}
        >
          {['auto', 'ar', 'en', 'mul'].map((k) => (
            <MenuItem key={k} value={k}>
              {t(`community.${k}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {value.kind === 'project' && (
        <>
          <TextField
            label={t('community.repository')}
            type="url"
            value={value.repository_url ?? ''}
            onChange={(e) => patch({ repository_url: e.target.value || null })}
            slotProps={{ htmlInput: { maxLength: 500, dir: 'ltr' } }}
          />
          <TextField
            label={t('community.demo')}
            type="url"
            value={value.demo_url ?? ''}
            onChange={(e) => patch({ demo_url: e.target.value || null })}
            slotProps={{ htmlInput: { maxLength: 500, dir: 'ltr' } }}
          />
        </>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          fullWidth
          label={t('community.series')}
          value={value.series_id ?? 0}
          disabled={!series.data}
          onChange={(e) => patch({ series_id: Number(e.target.value) || null })}
        >
          <MenuItem value={0}>{t('community.noSeries')}</MenuItem>
          {series.data?.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.title}
            </MenuItem>
          ))}
        </TextField>
        {value.series_id && (
          <TextField
            label={t('community.part')}
            type="number"
            value={value.series_order}
            onChange={(e) => patch({ series_order: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
            slotProps={{ htmlInput: { min: 1, max: 999 } }}
          />
        )}
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          label={t('community.seriesTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
        <Button loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate()}>
          {t('community.createSeries')}
        </Button>
      </Stack>
    </Stack>
  );
}
