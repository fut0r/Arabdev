import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { authApi } from '@/api/auth';
import { applyFieldErrors, errorMessage } from '@/api/errors';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { PasswordField, PasswordStrength } from '@/features/auth/PasswordField';
import { useSeo } from '@/utils/seo';

interface ResetValues {
  password: string;
  password_confirm: string;
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  useSeo({ title: t('auth.resetTitle'), noindex: true });

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ defaultValues: { password: '', password_confirm: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await authApi.resetPassword({ token, ...values });
      setDone(true);
    } catch (error) {
      if (!applyFieldErrors(error, setError, t, ['password', 'password_confirm']))
        setServerError(errorMessage(error, t));
    }
  });

  return (
    <AuthSplitLayout>
      <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
        {t('auth.resetTitle')}
      </Typography>
      {done ? (
        <Stack spacing={2.5} sx={{ mt: 3 }}>
          <Alert severity="success">{t('auth.resetDone')}</Alert>
          <Button component={RouterLink} to="/login" variant="contained" size="large">
            {t('common.signIn')}
          </Button>
        </Stack>
      ) : !token ? (
        <Stack spacing={2.5} sx={{ mt: 3 }}>
          <Alert severity="warning">{t('auth.resetMissingToken')}</Alert>
          <Button component={RouterLink} to="/forgot-password" variant="outlined" color="inherit">
            {t('auth.sendResetLink')}
          </Button>
        </Stack>
      ) : (
        <>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {t('auth.resetSubtitle')}
          </Typography>
          <Box component="form" noValidate onSubmit={onSubmit}>
            <Stack spacing={2.25}>
              {serverError && (
                <Alert
                  severity="error"
                  action={
                    <Button component={RouterLink} to="/forgot-password" color="inherit" size="small">
                      {t('auth.sendResetLink')}
                    </Button>
                  }
                >
                  {serverError}
                </Alert>
              )}
              <PasswordField
                label={t('auth.newPassword')}
                autoComplete="new-password"
                autoFocus
                fullWidth
                error={Boolean(errors.password)}
                helperText={errors.password?.message ?? t('register.passwordRules')}
                {...register('password', {
                  required: t('errors.required'),
                  minLength: { value: 8, message: t('errors.password_too_short') },
                })}
              />
              <PasswordStrength password={watch('password')} />
              <PasswordField
                label={t('auth.confirmNewPassword')}
                autoComplete="new-password"
                fullWidth
                error={Boolean(errors.password_confirm)}
                helperText={errors.password_confirm?.message}
                {...register('password_confirm', {
                  required: t('errors.required'),
                  validate: (value, values) => value === values.password || t('errors.passwords_mismatch'),
                })}
              />
              <Button type="submit" variant="contained" size="large" fullWidth loading={isSubmitting}>
                {t('auth.resetButton')}
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </AuthSplitLayout>
  );
}
