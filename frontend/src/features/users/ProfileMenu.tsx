import BlockIcon from '@mui/icons-material/Block';
import LinkIcon from '@mui/icons-material/Link';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import RssFeedIcon from '@mui/icons-material/RssFeed';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNotify } from '@/components/Notifier';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Profile } from '@/types/api';

import { useBlockActions } from './BlockControls';

/** The ⋯ menu on someone else's profile: copy the link, their RSS feed, block or unblock. */
export function ProfileMenu({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotify();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { ask, dialog } = useBlockActions();
  const close = () => setAnchor(null);

  const copyLink = async () => {
    close();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`);
      notify(t('common.linkCopied'));
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <IconButton
        aria-label={t('profile.moreActions')}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ border: 1, borderColor: 'divider' }}
      >
        <MoreHorizIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem onClick={() => void copyLink()}>
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          {t('common.copyLink')}
        </MenuItem>
        <MenuItem component="a" href={`/u/${profile.username}/rss.xml`} target="_blank" rel="noopener" onClick={close}>
          <ListItemIcon>
            <RssFeedIcon fontSize="small" />
          </ListItemIcon>
          {t('profile.rss')}
        </MenuItem>
        {user && (
          <MenuItem
            onClick={() => {
              close();
              ask({ id: profile.id, username: profile.username }, profile.blocked);
            }}
            sx={{ color: profile.blocked ? undefined : 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'inherit' }}>
              <BlockIcon fontSize="small" />
            </ListItemIcon>
            {profile.blocked
              ? t('block.unblockUser', { username: profile.username })
              : t('block.blockUser', { username: profile.username })}
          </MenuItem>
        )}
      </Menu>
      {dialog}
    </>
  );
}
