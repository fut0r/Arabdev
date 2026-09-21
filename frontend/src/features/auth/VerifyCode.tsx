import MarkEmailUnreadOutlinedIcon from '@mui/icons-material/MarkEmailUnreadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import type { Challenge } from '@/types/api';

const CODE_LENGTH = 6;

/** Seconds left, counted down once a second. Restarts whenever a new code is sent. */
function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    setLeft(initial);
    if (initial <= 0) return;
    const timer = window.setInterval(() => setLeft((value) => (value <= 1 ? 0 : value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [initial]);
  return left;
}

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

interface VerifyCodeProps {
  challenge: Challenge;
  /** Runs when six digits are in. Throw to show an error and keep the form open. */
  onVerify: (code: string) => Promise<void>;
  /** Asks for a fresh code and returns the updated challenge. */
  onResend: () => Promise<Challenge>;
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
}

/**
 * The second step of anything that emails a code: sign-in, sign-up, and changing an
 * email address or password. One input, a resend button with its own cooldown, and a
 * way back.
 */
export function VerifyCode({ challenge, onVerify, onResend, onCancel, cancelLabel, submitLabel }: VerifyCodeProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(challenge);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const submitted = useRef(false);

  const resendIn = useCountdown(current.resend_in);
  const expiresIn = useCountdown(current.expires_in);

  useEffect(() => setCurrent(challenge), [challenge]);

  const submit = useCallback(
    async (value: string) => {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        await onVerify(value);
      } catch (failure) {
        setError(errorMessage(failure, t));
        setCode('');
        submitted.current = false;
      } finally {
        setPending(false);
      }
    },
    [onVerify, t],
  );

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    // Six digits in means the visitor is done typing: no need to press a button.
    if (digits.length === CODE_LENGTH && !submitted.current) {
      submitted.current = true;
      void submit(digits);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const refreshed = await onResend();
      setCurrent(refreshed);
      setCode('');
      submitted.current = false;
      setNotice(t('verify.resent'));
    } catch (failure) {
      setError(errorMessage(failure, t));
    } finally {
      setResending(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <MarkEmailUnreadOutlinedIcon color="primary" sx={{ fontSize: 34, mb: 1 }} />
        <Typography variant="h3" component="h2" sx={{ mb: 0.5 }}>
          {t('verify.title')}
        </Typography>
        <Typography color="text.secondary">
          {t('verify.subtitle')}{' '}
          <Box component="b" dir="ltr">
            {current.email}
          </Box>
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {notice && !error && <Alert severity="success">{notice}</Alert>}

      <Box
        component="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === CODE_LENGTH) void submit(code);
        }}
      >
        <Stack spacing={2}>
          <TextField
            label={t('verify.codeLabel')}
            value={code}
            onChange={(event) => onChange(event.target.value)}
            autoFocus
            fullWidth
            disabled={pending}
            slotProps={{
              htmlInput: {
                dir: 'ltr',
                inputMode: 'numeric',
                autoComplete: 'one-time-code',
                pattern: '[0-9]*',
                maxLength: CODE_LENGTH,
                'aria-label': t('verify.codeLabel'),
                style: { textAlign: 'center', fontSize: '1.6rem', letterSpacing: '0.5em', fontWeight: 700 },
              },
            }}
            helperText={expiresIn > 0 ? t('verify.expiresIn', { time: clock(expiresIn) }) : t('verify.expired')}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            loading={pending}
            disabled={code.length !== CODE_LENGTH}
          >
            {submitLabel ?? t('verify.submit')}
          </Button>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Button onClick={() => void resend()} disabled={resendIn > 0 || resending} loading={resending} size="small">
              {resendIn > 0 ? t('verify.resendIn', { seconds: resendIn }) : t('verify.resend')}
            </Button>
            {onCancel && (
              <Button onClick={onCancel} color="inherit" size="small">
                {cancelLabel ?? t('common.cancel')}
              </Button>
            )}
          </Stack>
        </Stack>
      </Box>

      <Typography variant="body2" color="text.secondary">
        {t('verify.spamHint')}
      </Typography>
    </Stack>
  );
}
