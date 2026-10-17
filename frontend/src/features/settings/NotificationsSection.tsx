import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import { useTranslation } from 'react-i18next';

import { useCurrentUser } from '@/features/auth/AuthProvider';
import type { UserSettings } from '@/types/api';

import { SettingsGroup, SettingSwitch, useSettingsUpdater } from './SettingsControls';

export function NotificationsSection() {
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
