import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { SUPPORT_EMAIL } from '@/site';
import { formatFullDate } from '@/utils/format';

/** Tells a restricted member why they can't publish, and until when. */
export function RestrictionNotice() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = usePreferences();
  if (!user?.restricted_until || new Date(user.restricted_until).getTime() <= Date.now()) return null;

  return (
    <Alert severity="warning" sx={{ mb: { xs: 0, sm: 2 }, borderRadius: { xs: 0, sm: 2 } }}>
      <AlertTitle sx={{ fontWeight: 700 }}>
        {t('restriction.title', { date: formatFullDate(user.restricted_until, language) })}
      </AlertTitle>
      <Typography variant="body2">{t('restriction.body')}</Typography>
      {user.restriction_reason && (
        <Typography variant="body2" dir="auto" sx={{ mt: 0.75 }}>
          {t('restriction.reason', { reason: user.restriction_reason })}
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: 0.75 }}>
        {t('restriction.appeal')}{' '}
        <Link href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
          {SUPPORT_EMAIL}
        </Link>
      </Typography>
    </Alert>
  );
}
