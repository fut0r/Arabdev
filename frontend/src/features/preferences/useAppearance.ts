import { useColorScheme } from '@mui/material/styles';
import { useCallback, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { usersApi } from '@/api/users';
import { useAuth } from '@/features/auth/AuthProvider';
import { useNotify } from '@/components/Notifier';
import type { Language } from '@/i18n';
import type { ThemeMode, UserSettings } from '@/types/api';
import { DEFAULT_APPEARANCE, type AppearancePreferences } from './appearance';

import { usePreferences } from './PreferencesProvider';

let saveQueue: Promise<unknown> = Promise.resolve();

/**
 * Theme and language, applied instantly and saved to the account when signed in,
 * so the choice follows the user to other devices.
 */
export function useAppearance() {
  const { mode, setMode } = useColorScheme();
  const { language, setLanguage, appearance, setAppearance } = usePreferences();
  const { user, setUser } = useAuth();
  const currentUser = useRef(user?.id);
  useLayoutEffect(() => {
    currentUser.current = user?.id;
    return () => {
      currentUser.current = undefined;
    };
  }, [user?.id]);
  const notify = useNotify();
  const { t } = useTranslation();

  const persist = useCallback(
    (patch: Partial<UserSettings>) => {
      if (!user) return;
      const userId = user.id;
      saveQueue = saveQueue
        .catch(() => undefined)
        .then(() => {
          if (currentUser.current !== userId) return;
          return usersApi.updateSettings(patch);
        })
        .then(() =>
          setUser((current) =>
            current?.id === userId ? { ...current, settings: { ...current.settings, ...patch } } : current,
          ),
        )
        .catch(() => notify(t('appearance.syncFailed'), 'error'));
    },
    [user, setUser, notify, t],
  );

  const changeMode = useCallback(
    (next: ThemeMode) => {
      setMode(next);
      persist({ theme: next });
    },
    [setMode, persist],
  );

  const changeLanguage = useCallback(
    (next: Language) => {
      setLanguage(next);
      persist({ language: next });
    },
    [setLanguage, persist],
  );

  const changeAppearance = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      setAppearance(patch);
      persist(patch);
    },
    [setAppearance, persist],
  );

  return {
    mode: (mode ?? 'system') as ThemeMode,
    setMode: changeMode,
    language,
    setLanguage: changeLanguage,
    appearance,
    setAppearance: changeAppearance,
    resetAppearance: () => changeAppearance(DEFAULT_APPEARANCE),
  };
}
