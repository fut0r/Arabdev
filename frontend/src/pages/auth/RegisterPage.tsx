import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router';

import { authApi } from '@/api/auth';
import { applyFieldErrors, errorMessage } from '@/api/errors';
import { docUrls, newTab } from '@/components/DocLinks';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { PasswordField, PasswordStrength } from '@/features/auth/PasswordField';
import { USERNAME_PATTERN, useUsernameAvailability } from '@/features/auth/useUsernameAvailability';
import { VerifyCode } from '@/features/auth/VerifyCode';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import { useDocumentTitle } from '@/hooks';
import { HOME_PATH } from '@/site';
import type { Challenge } from '@/types/api';

interface RegisterValues {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = ['username', 'email', 'password', 'password_confirm'] as const;

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register: createAccount, verifyCode, resendCode } = useAuth();
  const { language } = usePreferences();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const turnstile = useTurnstile({ action: 'register' });
  useDocumentTitle(t('register.title'));

  const {
    register,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    mode: 'onTouched',
    defaultValues: { username: '', email: '', password: '', password_confirm: '' },
  });

  const password = watch('password');
  const availability = useUsernameAvailability(watch('username'));
  const usernameTaken = availability.result && !availability.result.available;

  const checkEmail = async (email: string) => {
    if (!EMAIL_PATTERN.test(email)) return;
    try {
      const result = await authApi.availability({ email: email.trim() });
      if (result.email && !result.email.available)
        setError('email', { type: 'server', message: t('errors.email_taken') });
    } catch {
      /* the submit will surface real problems */
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (usernameTaken) return;
    try {
      const token = await turnstile.getToken();
      const outcome = await createAccount(
        {
          username: values.username.trim(),
          email: values.email.trim(),
          password: values.password,
          password_confirm: values.password_confirm,
          language,
        },
        token,
      );
      if (outcome.status === 'authenticated') navigate(HOME_PATH, { replace: true });
      else setChallenge(outcome.challenge);
    } catch (error) {
      if (!applyFieldErrors(error, setError, t, FIELDS)) setServerError(errorMessage(error, t));
    } finally {
      // Each token is good for one request.
      turnstile.reset();
    }
  });

  if (challenge) {
    return (
      <AuthSplitLayout>
        <VerifyCode
          challenge={challenge}
          submitLabel={t('register.submit')}
          cancelLabel={t('verify.changeEmail')}
          onVerify={async (code) => {
            await verifyCode(challenge.challenge_id, code);
            navigate(HOME_PATH, { replace: true });
          }}
          onResend={() => resendCode(challenge.challenge_id)}
          onCancel={() => setChallenge(null)}
        />
      </AuthSplitLayout>
    );
  }

  let usernameHelper: ReactNode = t('register.usernameHelp');
  if (errors.username) usernameHelper = errors.username.message;
  else if (usernameTaken) usernameHelper = t(`errors.${availability.result?.code ?? 'username_taken'}`);
  else if (availability.result?.available)
    usernameHelper = t('register.usernameAvailable', { username: availability.value });

  return (
    <AuthSplitLayout>
      <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
        {t('register.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t('register.subtitle')}
      </Typography>

      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.25}>
          {serverError && <Alert severity="error">{serverError}</Alert>}
          <TextField
            label={t('register.username')}
            autoComplete="username"
            autoFocus
            fullWidth
            error={Boolean(errors.username) || Boolean(usernameTaken)}
            helperText={usernameHelper}
            slotProps={{
              htmlInput: { dir: 'ltr', maxLength: 20, autoCapitalize: 'none', spellCheck: false },
              input: {
                startAdornment: <InputAdornment position="start">@</InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    {availability.checking ? (
                      <CircularProgress size={18} aria-label={t('register.checking')} />
                    ) : availability.result?.available && !errors.username ? (
                      <CheckCircleOutlineIcon color="success" aria-hidden />
                    ) : null}
                  </InputAdornment>
                ),
              },
              formHelperText: {
                sx: availability.result?.available && !errors.username ? { color: 'success.main' } : undefined,
              },
            }}
            {...register('username', {
              required: t('errors.required'),
              pattern: { value: USERNAME_PATTERN, message: t('errors.username_invalid') },
              onChange: () => clearErrors('username'),
            })}
          />
          <TextField
            label={t('register.email')}
            type="email"
            autoComplete="email"
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            slotProps={{ htmlInput: { dir: 'ltr' } }}
            {...register('email', {
              required: t('errors.required'),
              pattern: { value: EMAIL_PATTERN, message: t('errors.email_invalid') },
              onBlur: (event) => void checkEmail(event.target.value),
            })}
          />
          <PasswordField
            label={t('register.password')}
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message ?? t('register.passwordRules')}
            {...register('password', {
              required: t('errors.required'),
              minLength: { value: 8, message: t('errors.password_too_short') },
              maxLength: { value: 128, message: t('errors.password_too_long') },
              validate: (value) => (/[A-Za-z؀-ۿ]/.test(value) && /\d/.test(value)) || t('errors.password_too_weak'),
            })}
          />
          <PasswordStrength password={password} />
          <PasswordField
            label={t('register.confirmPassword')}
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.password_confirm)}
            helperText={errors.password_confirm?.message}
            {...register('password_confirm', {
              required: t('errors.required'),
              validate: (value, values) => value === values.password || t('errors.passwords_mismatch'),
            })}
          />
          <TurnstileWidget handle={turnstile} />
          <Button type="submit" variant="contained" size="large" fullWidth loading={isSubmitting}>
            {t('register.submit')}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {t('register.privacyNote')}{' '}
            <Link href={docUrls(language).privacy} {...newTab}>
              {t('register.privacyLink')}
            </Link>
          </Typography>
        </Stack>
      </Box>

      <Divider sx={{ my: 3.5, color: 'text.secondary', fontSize: '0.875rem' }}>{t('auth.haveAccount')}</Divider>
      <Button component={RouterLink} to="/login" variant="outlined" size="large" fullWidth color="inherit">
        {t('common.signIn')}
      </Button>
    </AuthSplitLayout>
  );
}
