import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Navigate, useParams } from 'react-router';

import { authApi } from '@/api/auth';
import { applyFieldErrors, errorMessage } from '@/api/errors';
import { usersApi } from '@/api/users';
import { Surface } from '@/components/common';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { docUrls, newTab } from '@/components/DocLinks';
import { useNotify } from '@/components/Notifier';
import { useAuth, useCurrentUser } from '@/features/auth/AuthProvider';
import { PasswordField, PasswordStrength } from '@/features/auth/PasswordField';
import { VerifyCode } from '@/features/auth/VerifyCode';
import { LanguageToggle, ThemeModeToggle } from '@/features/preferences/AppearanceControls';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { ProfileEditor } from '@/features/profile/ProfileEditor';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import { useSeo } from '@/utils/seo';
import { layout } from '@/theme/tokens';
import { formatFullDate } from '@/utils/format';
import type { Challenge, UserSettings } from '@/types/api';

const SECTIONS = [
  { key: 'account', icon: <BadgeOutlinedIcon /> },
  { key: 'profile', icon: <PersonOutlineOutlinedIcon /> },
  { key: 'security', icon: <ShieldOutlinedIcon /> },
  { key: 'appearance', icon: <PaletteOutlinedIcon /> },
  { key: 'privacy', icon: <LockOutlinedIcon /> },
  { key: 'notifications', icon: <NotificationsNoneIcon /> },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ py: 3, '&:first-of-type': { pt: 0 } }}>
      <Typography variant="h5" component="h2">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {description}
        </Typography>
      )}
      <Box sx={{ mt: 2 }}>{children}</Box>
    </Box>
  );
}

/** Settings toggles save immediately and roll back if the server refuses. */
function useSettingsUpdater() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const notify = useNotify();
  return async (patch: Partial<UserSettings>) => {
    const previous = user;
    setUser({ ...user, settings: { ...user.settings, ...patch } });
    try {
      const settings = await usersApi.updateSettings(patch);
      setUser({ ...user, settings });
      notify(t('settings.updated'));
    } catch (error) {
      setUser(previous);
      notify(errorMessage(error, t), 'error');
    }
  };
}

function SettingSwitch({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', py: 1.25 }}>
      <Box>
        <Typography sx={{ fontWeight: 500 }} component="span" id={`setting-${label}`}>
          {label}
        </Typography>
        {help && (
          <Typography variant="body2" color="text.secondary">
            {help}
          </Typography>
        )}
      </Box>
      <Switch
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        slotProps={{ input: { 'aria-labelledby': `setting-${label}` } }}
      />
    </Stack>
  );
}

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

function AccountSection() {
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

/** Reads a user agent well enough to recognise your own phone in a list. */
function describeDevice(agent: string | null, unknown: string): string {
  if (!agent) return unknown;
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /OPR\/|Opera/.test(agent)
      ? 'Opera'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Chrome\//.test(agent)
          ? 'Chrome'
          : /Safari\//.test(agent)
            ? 'Safari'
            : unknown;
  const system = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(agent)
      ? 'iOS'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : '';
  return system ? `${browser} · ${system}` : browser;
}

function SessionList() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: sessions, isLoading } = useQuery({ queryKey: ['sessions'], queryFn: usersApi.sessions });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });

  const end = async (id: number) => {
    setBusy(true);
    try {
      await usersApi.endSession(id);
      await refresh();
      notify(t('settings.sessionEnded'));
    } catch (error) {
      notify(errorMessage(error, t), 'error');
    } finally {
      setBusy(false);
    }
  };

  const endOthers = async () => {
    setBusy(true);
    try {
      await usersApi.endOtherSessions();
      await refresh();
      notify(t('settings.othersSignedOut'));
    } catch (error) {
      notify(errorMessage(error, t), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Typography color="text.secondary">{t('common.loading')}</Typography>;

  return (
    <Stack spacing={1}>
      {sessions?.map((session) => (
        <Stack
          key={session.id}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{
            alignItems: { sm: 'center' },
            justifyContent: 'space-between',
            p: 1.5,
            border: 1,
            borderColor: 'surface.border',
            borderRadius: 2,
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
            {/Android|iPhone|iPad|Mobile/.test(session.user_agent ?? '') ? (
              <PhoneIphoneOutlinedIcon color="action" />
            ) : (
              <ComputerOutlinedIcon color="action" />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {describeDevice(session.user_agent, t('settings.unknownDevice'))}
                </Typography>
                {session.current && <Chip size="small" color="primary" label={t('settings.thisDevice')} />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('settings.signedInAt', { date: formatFullDate(session.created_at, language) })}
              </Typography>
            </Box>
          </Stack>
          {!session.current && (
            <Button size="small" color="inherit" disabled={busy} onClick={() => void end(session.id)}>
              {t('settings.endSession')}
            </Button>
          )}
        </Stack>
      ))}
      {(sessions?.length ?? 0) > 1 && (
        <Box>
          <Button color="error" variant="outlined" size="small" disabled={busy} onClick={() => void endOthers()}>
            {t('settings.signOutOthers')}
          </Button>
        </Box>
      )}
    </Stack>
  );
}

function DataExport() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [pending, setPending] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      const blob = await usersApi.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'arabdev-data.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify(errorMessage(error, t), 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outlined"
      color="inherit"
      startIcon={<DownloadOutlinedIcon />}
      loading={pending}
      onClick={() => void download()}
    >
      {t('settings.downloadData')}
    </Button>
  );
}

function SecuritySection() {
  const { t } = useTranslation();
  const { settings } = useCurrentUser();
  const update = useSettingsUpdater();
  return (
    <>
      <SettingsGroup title={t('settings.signInSecurity')} description={t('settings.signInSecurityHelp')}>
        <SettingSwitch
          label={t('settings.loginCode')}
          help={t('settings.loginCodeHelp')}
          checked={settings.login_code_required}
          onChange={(value) => void update({ login_code_required: value })}
        />
        <Divider />
        <SettingSwitch
          label={t('settings.securityAlerts')}
          help={t('settings.securityAlertsHelp')}
          checked={settings.email_security_alerts}
          onChange={(value) => void update({ email_security_alerts: value })}
        />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.devices')} description={t('settings.devicesHelp')}>
        <SessionList />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.yourData')} description={t('settings.yourDataHelp')}>
        <DataExport />
      </SettingsGroup>
    </>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const { settings } = useCurrentUser();
  const update = useSettingsUpdater();
  return (
    <>
      <SettingsGroup title={t('settings.theme')} description={t('settings.themeHelp')}>
        <ThemeModeToggle size="medium" />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.language')} description={t('settings.languageHelp')}>
        <LanguageToggle size="medium" />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.defaultFeed')} description={t('settings.defaultFeedHelp')}>
        <RadioGroup
          value={settings.default_feed}
          onChange={(event) => void update({ default_feed: event.target.value as UserSettings['default_feed'] })}
          aria-label={t('settings.defaultFeed')}
        >
          <FormControlLabel value="for_you" control={<Radio />} label={t('feed.tabForYou')} />
          <FormControlLabel value="following" control={<Radio />} label={t('feed.tabFollowing')} />
          <FormControlLabel value="latest" control={<Radio />} label={t('feed.tabLatest')} />
        </RadioGroup>
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.motion')}>
        <SettingSwitch
          label={t('settings.reduceMotion')}
          help={t('settings.reduceMotionHelp')}
          checked={settings.reduce_motion}
          onChange={(value) => void update({ reduce_motion: value })}
        />
      </SettingsGroup>
    </>
  );
}

function PrivacySection() {
  const { t } = useTranslation();
  const { settings } = useCurrentUser();
  const { language } = usePreferences();
  const update = useSettingsUpdater();
  return (
    <>
      <SettingsGroup title={t('settings.privacy')} description={t('settings.privacyDesc')}>
        <SettingSwitch
          label={t('settings.discoverable')}
          help={t('settings.discoverableHelp')}
          checked={settings.discoverable}
          onChange={(value) => void update({ discoverable: value })}
        />
        <Divider />
        <SettingSwitch
          label={t('settings.showFollowLists')}
          help={t('settings.showFollowListsHelp')}
          checked={settings.show_follow_lists}
          onChange={(value) => void update({ show_follow_lists: value })}
        />
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.mentionsFrom')}>
        <RadioGroup
          value={settings.mentions_from}
          onChange={(event) => void update({ mentions_from: event.target.value as UserSettings['mentions_from'] })}
          aria-label={t('settings.mentionsFrom')}
        >
          <FormControlLabel value="everyone" control={<Radio />} label={t('settings.mentionsEveryone')} />
          <FormControlLabel value="following" control={<Radio />} label={t('settings.mentionsFollowing')} />
          <FormControlLabel value="none" control={<Radio />} label={t('settings.mentionsNone')} />
        </RadioGroup>
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.privacyPolicyTitle')} description={t('settings.privacyPolicyBody')}>
        <Link href={docUrls(language).privacy} {...newTab} sx={{ fontWeight: 700 }}>
          {t('settings.privacyPolicyLink')}
        </Link>
      </SettingsGroup>
    </>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();
  const { settings } = useCurrentUser();
  const update = useSettingsUpdater();
  const items: { key: keyof UserSettings; label: string }[] = [
    { key: 'notify_likes', label: t('settings.notifyLikes') },
    { key: 'notify_comments', label: t('settings.notifyComments') },
    { key: 'notify_follows', label: t('settings.notifyFollows') },
    { key: 'notify_reposts', label: t('settings.notifyReposts') },
    { key: 'notify_mentions', label: t('settings.notifyMentions') },
  ];
  return (
    <>
      <SettingsGroup title={t('settings.notifications')} description={t('settings.notificationsHelp')}>
        {items.map((item, index) => (
          <Box key={item.key}>
            {index > 0 && <Divider />}
            <SettingSwitch
              label={item.label}
              checked={Boolean(settings[item.key])}
              onChange={(value) => void update({ [item.key]: value })}
            />
          </Box>
        ))}
      </SettingsGroup>
      <Divider />
      <SettingsGroup title={t('settings.emailPreferences')} description={t('settings.emailPreferencesHelp')}>
        <SettingSwitch
          label={t('settings.securityAlerts')}
          help={t('settings.securityAlertsHelp')}
          checked={settings.email_security_alerts}
          onChange={(value) => void update({ email_security_alerts: value })}
        />
        <Divider />
        <SettingSwitch
          label={t('settings.productUpdates')}
          help={t('settings.productUpdatesHelp')}
          checked={settings.email_product_updates}
          onChange={(value) => void update({ email_product_updates: value })}
        />
        <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
          {t('settings.noMarketing')}
        </Alert>
      </SettingsGroup>
    </>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const section = useParams().section as Section;
  useSeo({ title: t('settings.title'), noindex: true });
  if (!SECTIONS.some((item) => item.key === section)) return <Navigate to="/settings/account" replace />;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '260px minmax(0, 1fr)' },
        gap: 2,
        alignItems: 'start',
      }}
    >
      <Surface sx={{ position: { md: 'sticky' }, top: layout.appBarHeight + 16 }}>
        <Typography variant="h3" component="h1" sx={{ px: 2, pt: 2, pb: { xs: 0, md: 1 } }}>
          {t('settings.title')}
        </Typography>
        <List component="nav" aria-label={t('settings.title')} sx={{ display: { xs: 'none', md: 'block' }, px: 1 }}>
          {SECTIONS.map((item) => (
            <ListItemButton
              key={item.key}
              component={RouterLink}
              to={`/settings/${item.key}`}
              selected={section === item.key}
              aria-current={section === item.key ? 'page' : undefined}
              sx={{ mb: 0.5, '&.Mui-selected': { bgcolor: 'accent.subtle', color: 'accent.text' } }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={t(`settings.${item.key}`)}
                secondary={t(`settings.${item.key}Desc`)}
                slotProps={{ primary: { sx: { fontWeight: 700 } }, secondary: { sx: { fontSize: '0.8125rem' } } }}
              />
            </ListItemButton>
          ))}
        </List>
        <Tabs
          value={section}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ display: { xs: 'flex', md: 'none' }, px: 1 }}
          aria-label={t('settings.title')}
        >
          {SECTIONS.map((item) => (
            <Tab
              key={item.key}
              value={item.key}
              label={t(`settings.${item.key}`)}
              component={RouterLink}
              to={`/settings/${item.key}`}
            />
          ))}
        </Tabs>
      </Surface>

      <Surface sx={{ p: { xs: 2, sm: 3 } }}>
        {section === 'account' && <AccountSection />}
        {section === 'profile' && <ProfileEditor />}
        {section === 'security' && <SecuritySection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'privacy' && <PrivacySection />}
        {section === 'notifications' && <NotificationsSection />}
      </Surface>
    </Box>
  );
}
