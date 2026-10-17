import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { useTranslation } from 'react-i18next';

import { useCurrentUser } from '@/features/auth/AuthProvider';
import { LanguageToggle, ThemeModeToggle } from '@/features/preferences/AppearanceControls';
import type { UserSettings } from '@/types/api';

import { SettingsGroup, SettingSwitch, useSettingsUpdater } from './SettingsControls';

export function AppearanceSection() {
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
