import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';

import { errorMessage } from '@/api/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { PasswordField } from '@/features/auth/PasswordField';
import { VerifyCode } from '@/features/auth/VerifyCode';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import { useDocumentTitle } from '@/hooks';
import { HOME_PATH } from '@/site';
import type { Challenge } from '@/types/api';

interface LoginValues {
  email: string;
  password: string;
  remember: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, verifyCode, resendCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const turnstile = useTurnstile({ action: 'login' });
  useDocumentTitle(t('auth.signInTitle'));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ defaultValues: { email: '', password: '', remember: true } });

  const goHome = () => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith('/') ? from : HOME_PATH, { replace: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const token = await turnstile.getToken();
      const outcome = await login(values.email.trim(), values.password, values.remember, token);
      if (outcome.status === 'authenticated') goHome();
      else setChallenge(outcome.challenge);
    } catch (error) {
      setServerError(errorMessage(error, t));
    } finally {
      // Each token is good for one request, so throw it away either way.
      turnstile.reset();
    }
  });

  if (challenge) {
    return (
      <AuthSplitLayout>
        <VerifyCode
          challenge={challenge}
          submitLabel={t('auth.signInButton')}
          cancelLabel={t('verify.useAnotherAccount')}
          onVerify={async (code) => {
            await verifyCode(challenge.challenge_id, code);
            goHome();
          }}
          onResend={() => resendCode(challenge.challenge_id)}
          onCancel={() => setChallenge(null)}
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
        {t('auth.signInTitle')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t('auth.signInSubtitle')}
      </Typography>

      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.25}>
          {serverError && (
            <Alert severity="error" role="alert">
              {serverError}
            </Alert>
          )}
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
              pattern: { value: EMAIL_PATTERN, message: t('errors.email_invalid') },
            })}
          />
          <PasswordField
            label={t('auth.password')}
            autoComplete="current-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            {...register('password', { required: t('errors.required') })}
          />
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
          >
            <FormControlLabel
              control={<Checkbox defaultChecked {...register('remember')} />}
              label={t('auth.rememberMe')}
            />
            <Link component={RouterLink} to="/forgot-password" variant="body2">
              {t('auth.forgotPassword')}
            </Link>
          </Stack>
          <TurnstileWidget handle={turnstile} />
          <Button type="submit" variant="contained" size="large" fullWidth loading={isSubmitting}>
            {t('auth.signInButton')}
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ my: 3.5, color: 'text.secondary', fontSize: '0.875rem' }}>{t('auth.noAccount')}</Divider>
      <Button component={RouterLink} to="/register" variant="outlined" size="large" fullWidth color="inherit">
        {t('auth.createAccount')}
      </Button>
    </AuthSplitLayout>
  );
}
