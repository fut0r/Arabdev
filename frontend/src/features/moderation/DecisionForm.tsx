import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { moderationApi } from '@/api/moderation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/Notifier';
import type { AuthorAction, ReportCase } from '@/types/api';

import { useInvalidateModeration } from './useInvalidateModeration';

const RESTRICT_DAYS = [1, 3, 7, 30, 90, 365];
const MAX_NOTE = 500;

export function DecisionForm({ item, onDecided }: { item: ReportCase; onDecided: () => void }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const invalidate = useInvalidateModeration();
  const actionLabelId = useId();
  const [removePost, setRemovePost] = useState(false);
  const [authorAction, setAuthorAction] = useState<AuthorAction>('none');
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const canActOnAuthor = Boolean(item.author) && !item.author?.is_admin && !item.author?.suspended;
  const acting = removePost || authorAction !== 'none';

  const mutation = useMutation({
    mutationFn: (dismiss: boolean) =>
      moderationApi.decide(item.case_id, {
        remove_post: dismiss ? false : removePost,
        author_action: dismiss ? 'none' : authorAction,
        restrict_days: days,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setConfirming(false);
      notify(t('moderation.decided'));
      invalidate();
      onDecided();
    },
    onError: (error) => {
      setConfirming(false);
      notify(errorMessage(error, t), 'error');
    },
  });

  return (
    <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
        {t('moderation.decisionTitle')}
      </Typography>
      {item.post && (
        <>
          <FormControlLabel
            control={<Checkbox checked={removePost} onChange={(event) => setRemovePost(event.target.checked)} />}
            label={t('moderation.removePost')}
          />
          <FormHelperText sx={{ mt: -0.75, mb: 1.5, mx: 0 }}>{t('moderation.removePostHelp')}</FormHelperText>
        </>
      )}

      <FormLabel id={actionLabelId} sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
        {t('moderation.authorAction')}
      </FormLabel>
      {item.author?.is_admin && <FormHelperText sx={{ mx: 0 }}>{t('moderation.authorIsModerator')}</FormHelperText>}
      <RadioGroup
        aria-labelledby={actionLabelId}
        value={authorAction}
        onChange={(event) => setAuthorAction(event.target.value as AuthorAction)}
      >
        <FormControlLabel value="none" control={<Radio size="small" />} label={t('moderation.actionNone')} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <FormControlLabel
            value="restrict"
            control={<Radio size="small" />}
            label={t('moderation.actionRestrict')}
            disabled={!canActOnAuthor}
            sx={{ mr: 0 }}
          />
          <Select
            size="small"
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setAuthorAction('restrict');
            }}
            disabled={!canActOnAuthor}
            inputProps={{ 'aria-label': t('moderation.actionRestrict') }}
            sx={{ minWidth: 120 }}
          >
            {RESTRICT_DAYS.map((value) => (
              <MenuItem key={value} value={value}>
                {t('moderation.days', { count: value })}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        <FormControlLabel
          value="suspend"
          control={<Radio size="small" />}
          label={t('moderation.actionSuspend')}
          disabled={!canActOnAuthor}
        />
        <FormHelperText sx={{ mt: -0.5, mx: 0 }}>{t('moderation.actionSuspendHelp')}</FormHelperText>
      </RadioGroup>

      <TextField
        label={t('moderation.note')}
        helperText={`${t('moderation.noteHelp')} ${t('common.characters', { count: note.length, max: MAX_NOTE })}`}
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
        multiline
        minRows={2}
        fullWidth
        sx={{ mt: 2 }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<GppGoodOutlinedIcon />}
          onClick={() => mutation.mutate(true)}
          loading={mutation.isPending && !confirming}
          disabled={mutation.isPending}
        >
          {t('moderation.dismiss')}
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<ShieldOutlinedIcon />}
          onClick={() => setConfirming(true)}
          disabled={!acting || mutation.isPending}
        >
          {t('moderation.apply')}
        </Button>
      </Stack>

      <ConfirmDialog
        open={confirming}
        title={t('moderation.confirmTitle')}
        description={t('moderation.confirmBody')}
        confirmLabel={t('moderation.apply')}
        pending={mutation.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => mutation.mutate(false)}
      />
    </Box>
  );
}
