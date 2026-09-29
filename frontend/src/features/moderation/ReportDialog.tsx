import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { reportsApi } from '@/api/moderation';
import { useNotify } from '@/components/Notifier';
import { REPORT_REASONS, type ReportReason } from '@/types/api';

const MAX_DETAILS = 1000;

/** Asks why a post should be reviewed. The author is told it was reported, never by whom. */
export function ReportDialog({ postId, open, onClose }: { postId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const titleId = useId();
  const reasonLabelId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  const close = () => {
    onClose();
    setReason(null);
    setDetails('');
  };

  const mutation = useMutation({
    mutationFn: () => reportsApi.report(postId, reason as ReportReason, details.trim() || null),
    onSuccess: (ack) => {
      notify(
        ack.already_reported ? t('report.alreadySent') : t('report.sent'),
        ack.already_reported ? 'info' : 'success',
      );
      close();
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  return (
    <Dialog
      open={open}
      onClose={mutation.isPending ? undefined : close}
      aria-labelledby={titleId}
      maxWidth="xs"
      fullWidth
      onClick={(event) => event.stopPropagation()}
    >
      <DialogTitle id={titleId} sx={{ fontFamily: 'var(--ad-font-heading)', fontWeight: 600 }}>
        {t('report.title')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('report.intro')}</DialogContentText>
        <FormControl component="fieldset" fullWidth>
          <FormLabel id={reasonLabelId} sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('report.reasonLabel')}
          </FormLabel>
          <RadioGroup
            aria-labelledby={reasonLabelId}
            value={reason ?? ''}
            onChange={(event) => setReason(event.target.value as ReportReason)}
          >
            {REPORT_REASONS.map((value) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio size="small" />}
                label={t(`report.reasons.${value}`)}
                sx={{ my: -0.25 }}
              />
            ))}
          </RadioGroup>
        </FormControl>
        <TextField
          label={t('report.detailsLabel')}
          helperText={`${t('report.detailsHelp')} ${t('common.characters', { count: details.length, max: MAX_DETAILS })}`}
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, MAX_DETAILS))}
          multiline
          minRows={2}
          maxRows={6}
          fullWidth
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={close} disabled={mutation.isPending} color="inherit">
          {t('common.cancel')}
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          variant="contained"
          color="error"
          loading={mutation.isPending}
          disabled={!reason}
        >
          {t('report.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
