import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Navigate, useParams } from 'react-router';

import { Surface } from '@/components/common';
import { ProfileEditor } from '@/features/profile/ProfileEditor';
import { useSeo } from '@/utils/seo';
import { layout } from '@/theme/tokens';
import { AccountSection } from '@/features/settings/AccountSection';
import { AppearanceSection } from '@/features/settings/AppearanceSection';
import { NotificationsSection } from '@/features/settings/NotificationsSection';
import { PrivacySection } from '@/features/settings/PrivacySection';
import { SecuritySection } from '@/features/settings/SecuritySection';

const SECTIONS = [
  { key: 'account', icon: <BadgeOutlinedIcon /> },
  { key: 'profile', icon: <PersonOutlineOutlinedIcon /> },
  { key: 'security', icon: <ShieldOutlinedIcon /> },
  { key: 'appearance', icon: <PaletteOutlinedIcon /> },
  { key: 'privacy', icon: <LockOutlinedIcon /> },
  { key: 'notifications', icon: <NotificationsNoneIcon /> },
] as const;
type Section = (typeof SECTIONS)[number]['key'];
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
