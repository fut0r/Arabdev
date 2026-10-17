import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { authApi } from '@/api/auth';
import { applyFieldErrors, errorMessage } from '@/api/errors';
import { usersApi } from '@/api/users';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/Notifier';
import { useAuth, useCurrentUser } from '@/features/auth/AuthProvider';
import { PasswordField, PasswordStrength } from '@/features/auth/PasswordField';
import { VerifyCode } from '@/features/auth/VerifyCode';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import type { Challenge } from '@/types/api';

import { SettingsGroup } from './SettingsControls';

function EmailForm() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const notify = useNotify();
  const turnstile = useTurnstile({ action: 'email_change' });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: user.email, current_password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await usersApi.updateEmail(
        values.email.trim(),
        values.current_password,
        await turnstile.getToken(),
      );
      if (result.status === 'updated' && result.user) {
        setUser(result.user);
        reset({ email: result.user.email, current_password: '' });
        notify(t('settings.updated'));
      } else if (result.challenge) {
        setChallenge(result.challenge);
      }
    } catch (error) {
      if (!applyFieldErrors(error, setError, t, ['email', 'current_password'])) notify(errorMessage(error, t), 'error');
    } finally {
      turnstile.reset();
    }
  });

  if (challenge) {
    return (
      <Box sx={{ maxWidth: 480 }}>
        <VerifyCode
          challenge={challenge}
          submitLabel={t('settings.updateEmail')}
          onVerify={async (code) => {
            const me = await usersApi.verifyEmail({ challenge_id: challenge.challenge_id, code });
            setUser(me);
            reset({ email: me.email, current_password: '' });
            setChallenge(null);
            notify(t('settings.emailChanged'));
          }}
          onResend={() => authApi.resend(challenge.challenge_id)}
          onCancel={() => setChallenge(null)}
        />
      </Box>
    );
  }

  return (
    <Stack component="form" noValidate onSubmit={onSubmit} spacing={2} sx={{ maxWidth: 480 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" dir="ltr">
          {user.email}
        </Typography>
        {user.email_verified ? (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            icon={<VerifiedOutlinedIcon />}
            label={t('settings.emailVerified')}
          />
        ) : (
          <Chip size="small" variant="outlined" label={t('settings.emailUnverified')} />
        )}
      </Stack>
      <TextField
        label={t('settings.newEmail')}
        type="email"
        autoComplete="email"
        error={Boolean(errors.email)}
        helperText={errors.email?.message}
        slotProps={{ htmlInput: { dir: 'ltr' } }}
        {...register('email', { required: t('errors.required') })}
      />
      <PasswordField
        label={t('settings.currentPassword')}
        autoComplete="current-password"
        error={Boolean(errors.current_password)}
        helperText={errors.current_password?.message}
        {...register('current_password', { required: t('errors.required') })}
      />
      <TurnstileWidget handle={turnstile} sx={{ justifyContent: 'flex-start' }} />
      <Box>
        <Button type="submit" variant="outlined" color="inherit" loading={isSubmitting}>
          {t('settings.updateEmail')}
        </Button>
      </Box>
    </Stack>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const { acceptTokens } = useAuth();
  const notify = useNotify();
  const turnstile = useTurnstile({ action: 'password_change' });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { current_password: '', new_password: '', new_password_confirm: '' } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await usersApi.changePassword(values, await turnstile.getToken());
      if (result.status === 'updated' && result.tokens) {
        acceptTokens(result.tokens);
        reset();
        notify(t('settings.passwordChanged'));
      } else if (result.challenge) {
        setChallenge(result.challenge);
      }
    } catch (error) {
      if (!applyFieldErrors(error, setError, t, ['current_password', 'new_password', 'new_password_confirm'])) {
        notify(errorMessage(error, t), 'error');
      }
    } finally {
      turnstile.reset();
    }
  });

  if (challenge) {
    return (
      <Box sx={{ maxWidth: 480 }}>
        <VerifyCode
          challenge={challenge}
          submitLabel={t('settings.changePassword')}
          onVerify={async (code) => {
            acceptTokens(await usersApi.verifyPassword({ challenge_id: challenge.challenge_id, code }));
            reset();
            setChallenge(null);
            notify(t('settings.passwordChanged'));
          }}
          onResend={() => authApi.resend(challenge.challenge_id)}
          onCancel={() => setChallenge(null)}
        />
      </Box>
    );
  }

  return (
    <Stack component="form" noValidate onSubmit={onSubmit} spacing={2} sx={{ maxWidth: 480 }}>
      <PasswordField
        label={t('settings.currentPassword')}
        autoComplete="current-password"
        error={Boolean(errors.current_password)}
        helperText={errors.current_password?.message}
        {...register('current_password', { required: t('errors.required') })}
      />
      <PasswordField
        label={t('auth.newPassword')}
        autoComplete="new-password"
        error={Boolean(errors.new_password)}
        helperText={errors.new_password?.message ?? t('register.passwordRules')}
        {...register('new_password', {
          required: t('errors.required'),
          minLength: { value: 8, message: t('errors.password_too_short') },
        })}
      />
      <PasswordStrength password={watch('new_password')} />
      <PasswordField
        label={t('auth.confirmNewPassword')}
        autoComplete="new-password"
        error={Boolean(errors.new_password_confirm)}
        helperText={errors.new_password_confirm?.message}
        {...register('new_password_confirm', {
          required: t('errors.required'),
          validate: (value, values) => value === values.new_password || t('errors.passwords_mismatch'),
        })}
      />
      <TurnstileWidget handle={turnstile} sx={{ justifyContent: 'flex-start' }} />
      <Box>
        <Button type="submit" variant="outlined" color="inherit" loading={isSubmitting}>
          {t('settings.changePassword')}
        </Button>
      </Box>
    </Stack>
  );
}

function DeleteAccount() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await usersApi.deleteAccount(password);
      await logout();
    } catch (deleteError) {
      setError(errorMessage(deleteError, t));
      setPending(false);
    }
  };

  return (
    <>
      <Button variant="outlined" color="error" onClick={() => setOpen(true)}>
        {t('settings.deleteAccount')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('settings.deleteConfirmTitle')}
        description={t('settings.deleteConfirmBody')}
        confirmLabel={t('settings.deleteAccount')}
        pending={pending}
        confirmDisabled={!password}
        onClose={() => {
          setOpen(false);
          setPassword('');
          setError(null);
        }}
        onConfirm={() => void confirm()}
      >
        <TextField
          type="password"
          label={t('settings.currentPassword')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={Boolean(error)}
          helperText={error}
          fullWidth
          autoFocus
          autoComplete="current-password"
          sx={{ mt: 2 }}
        />
      </ConfirmDialog>
    </>
  );
}

export function AccountSection() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  return (
    <>
      <SettingsGroup title={t('settings.usernameSection')} description={t('settings.usernameHelp')}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography dir="ltr" sx={{ fontWeight: 700 }}>
            @{user.username}
          </Typography>
          <Button component={RouterLink} to="/settings/profile" size="small">
            {t('common.edit')}
          </Button>
        </Stack>
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.emailSection')} description={t('settings.emailHelp')}>
        <EmailForm />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.passwordSection')} description={t('settings.passwordHelp')}>
        <PasswordForm />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.dangerZone')} description={t('settings.dangerBody')}>
        <DeleteAccount />
      </SettingsGroup>
    </>
  );
}
