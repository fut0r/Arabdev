import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { usersApi } from '@/api/users';
import { useNotify } from '@/components/Notifier';
import { useCurrentUser } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { formatFullDate } from '@/utils/format';

import { SettingsGroup, SettingSwitch, useSettingsUpdater } from './SettingsControls';
import { TwoFactorSettings } from './TwoFactorSettings';

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

export function SecuritySection() {
  const { t } = useTranslation();
  const { settings } = useCurrentUser();
  const update = useSettingsUpdater();
  return (
    <>
      <SettingsGroup title={t('settings.signInSecurity')} description={t('settings.signInSecurityHelp')}>
        <TwoFactorSettings />
        <Divider />
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
