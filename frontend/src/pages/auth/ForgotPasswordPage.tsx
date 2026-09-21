import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/errors';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import { useDocumentTitle } from '@/hooks';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { direction } = usePreferences();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const turnstile = useTurnstile({ action: 'forgot_password' });
  useDocumentTitle(t('auth.forgotTitle'));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await authApi.forgotPassword(email.trim(), await turnstile.getToken());
      setSentTo(email.trim());
    } catch (error) {
      setServerError(errorMessage(error, t));
    } finally {
      turnstile.reset();
    }
  });

  const backIcon = <ArrowBackIcon sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />;

  return (
    <AuthSplitLayout>
      <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
        {t('auth.forgotTitle')}
      </Typography>
      {sentTo ? (
        <Stack spacing={2.5} sx={{ mt: 3 }}>
          <Alert icon={<MarkEmailReadOutlinedIcon />} severity="success">
            {t('auth.resetSent', { email: sentTo })}
          </Alert>
          {import.meta.env.DEV && (
            <Typography variant="body2" color="text.secondary">
              {t('auth.resetDevHint')}
            </Typography>
          )}
          <Button component={RouterLink} to="/login" startIcon={backIcon} color="inherit">
            {t('auth.backToSignIn')}
          </Button>
        </Stack>
      ) : (
        <>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {t('auth.forgotSubtitle')}
          </Typography>
          <Box component="form" noValidate onSubmit={onSubmit}>
            <Stack spacing={2.25}>
              {serverError && <Alert severity="error">{serverError}</Alert>}
              <TextField
                label={t('auth.email')}
                type="email"
                autoComplete="email"
                autoFocus
                fullWidth
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
                slotProps={{ htmlInput: { dir: 'ltr' } }}
                {...register('email', {
                  required: t('errors.required'),
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('errors.email_invalid') },
                })}
              />
              <TurnstileWidget handle={turnstile} />
              <Button type="submit" variant="contained" size="large" fullWidth loading={isSubmitting}>
                {t('auth.sendResetLink')}
              </Button>
              <Button component={RouterLink} to="/login" startIcon={backIcon} color="inherit">
                {t('auth.backToSignIn')}
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </AuthSplitLayout>
  );
}
