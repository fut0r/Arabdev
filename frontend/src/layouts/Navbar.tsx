import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TranslateIcon from '@mui/icons-material/Translate';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { UserAvatar } from '@/components/common';
import { docUrls, newTab } from '@/components/DocLinks';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { LanguageToggle, ThemeModeToggle } from '@/features/preferences/AppearanceControls';
import { useAppearance } from '@/features/preferences/useAppearance';
import { SearchBar } from '@/features/search/SearchBar';
import { layout } from '@/theme/tokens';

function AccountMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { direction, language } = usePreferences();
  const edge = direction === 'rtl' ? 'left' : 'right';
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!user) return null;
  const close = () => setAnchor(null);

  const links = [
    { to: '/profile/edit', label: t('profile.editProfile'), icon: <EditOutlinedIcon fontSize="small" /> },
    { to: '/drafts', label: t('nav.drafts'), icon: <DescriptionOutlinedIcon fontSize="small" /> },
    { to: '/bookmarks', label: t('nav.bookmarks'), icon: <BookmarkBorderIcon fontSize="small" /> },
    { to: '/settings', label: t('nav.settings'), icon: <SettingsOutlinedIcon fontSize="small" /> },
    ...(user.is_admin
      ? [{ to: '/admin/reports', label: t('nav.moderation'), icon: <FlagOutlinedIcon fontSize="small" /> }]
      : []),
  ];
  const urls = docUrls(language);
  const docs = [
    { href: urls.wiki, label: t('nav.wiki'), icon: <MenuBookOutlinedIcon fontSize="small" /> },
    { href: urls.privacy, label: t('nav.privacy'), icon: <PrivacyTipOutlinedIcon fontSize="small" /> },
    { href: urls.patchNotes, label: t('nav.patchNotes'), icon: <NewReleasesOutlinedIcon fontSize="small" /> },
  ];

  return (
    <>
      <Tooltip title={t('nav.account')}>
        <IconButton
          onClick={(event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)}
          aria-label={t('nav.account')}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          sx={{ p: 0.5 }}
        >
          <UserAvatar name={user.display_name} src={user.avatar_url} size={34} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: edge }}
        transformOrigin={{ vertical: 'top', horizontal: edge }}
        slotProps={{ paper: { sx: { width: 300, mt: 1 } } }}
      >
        <ButtonBase
          component={RouterLink}
          to={`/u/${user.username}`}
          onClick={close}
          sx={{
            display: 'flex',
            gap: 1.5,
            px: 2,
            py: 1.5,
            width: '100%',
            justifyContent: 'flex-start',
            textAlign: 'start',
          }}
        >
          <UserAvatar name={user.display_name} src={user.avatar_url} size={40} />
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700 }}>
              {user.display_name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap dir="ltr" sx={{ textAlign: 'start' }}>
              @{user.username}
            </Typography>
          </Box>
        </ButtonBase>
        <Divider />
        {links.map((link) => (
          <MenuItem key={link.to} component={RouterLink} to={link.to} onClick={close}>
            <ListItemIcon>{link.icon}</ListItemIcon>
            {link.label}
          </MenuItem>
        ))}
        <Divider />
        {docs.map((doc) => (
          <MenuItem key={doc.href} component="a" href={doc.href} {...newTab} onClick={close}>
            <ListItemIcon>{doc.icon}</ListItemIcon>
            {doc.label}
          </MenuItem>
        ))}
        <MenuItem component="a" href={urls.support} onClick={close}>
          <ListItemIcon>
            <MailOutlineIcon fontSize="small" />
          </ListItemIcon>
          {t('nav.support')}
        </MenuItem>
        <Divider />
        <Stack spacing={1.25} sx={{ px: 2, py: 1.25 }}>
          <ThemeModeToggle fullWidth />
          <LanguageToggle fullWidth />
        </Stack>
        <Divider />
        <MenuItem
          onClick={() => {
            close();
            void logout();
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          {t('common.signOut')}
        </MenuItem>
      </Menu>
    </>
  );
}

function GuestActions() {
  const { t } = useTranslation();
  const { language, setLanguage } = useAppearance();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Tooltip title={t('common.switchLanguage')}>
        <Button
          color="inherit"
          startIcon={<TranslateIcon />}
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          lang={language === 'ar' ? 'en' : 'ar'}
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          {language === 'ar' ? 'English' : 'العربية'}
        </Button>
      </Tooltip>
      <IconButton
        onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
        aria-label={`${t('common.switchLanguage')}: ${language === 'ar' ? 'English' : 'العربية'}`}
        sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
      >
        <TranslateIcon />
      </IconButton>
      {/* On phones "Sign in" lives in the bottom navigation. */}
      <Button
        component={RouterLink}
        to="/login"
        color="inherit"
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, whiteSpace: 'nowrap' }}
      >
        {t('common.signIn')}
      </Button>
      <Button component={RouterLink} to="/register" variant="contained" sx={{ whiteSpace: 'nowrap' }}>
        {t('common.signUp')}
      </Button>
    </Stack>
  );
}

export function Navbar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <AppBar position="sticky">
      <Toolbar
        disableGutters
        sx={{
          minHeight: `${layout.appBarHeight}px !important`,
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          mx: 'auto',
          px: { xs: 2, sm: 2, lg: 3 },
          gap: 2,
        }}
      >
        <Box sx={{ width: { lg: layout.navWidth }, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Logo size={28} />
        </Box>
        <Box sx={{ flex: 1, maxWidth: 520, display: { xs: 'none', md: 'block' } }}>
          <SearchBar />
        </Box>
        <Box sx={{ flex: 1, display: { xs: 'block', md: 'none' } }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', marginInlineStart: 'auto' }}>
          <IconButton
            component={RouterLink}
            to="/search"
            aria-label={t('search.label')}
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          >
            <SearchIcon />
          </IconButton>
          {user ? <AccountMenu /> : <GuestActions />}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
