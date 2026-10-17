import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { usersApi } from '@/api/users';
import { useNotify } from '@/components/Notifier';
import { useAuth, useCurrentUser } from '@/features/auth/AuthProvider';
import type { UserSettings } from '@/types/api';

export function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
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
export function useSettingsUpdater() {
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

export function SettingSwitch({
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
