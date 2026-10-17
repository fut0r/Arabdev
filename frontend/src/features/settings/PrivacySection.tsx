import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { useTranslation } from 'react-i18next';

import { docUrls, newTab } from '@/components/DocLinks';
import { useCurrentUser } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import type { UserSettings } from '@/types/api';

import { BlockedAccounts } from './BlockedAccounts';
import { SettingsGroup, SettingSwitch, useSettingsUpdater } from './SettingsControls';

export function PrivacySection() {
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
      <SettingsGroup title={t('block.title')} description={t('block.help')}>
        <BlockedAccounts />
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
