import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import IosShareIcon from '@mui/icons-material/IosShare';
import RepeatIcon from '@mui/icons-material/Repeat';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useNotify } from '@/components/Notifier';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import type { Post } from '@/types/api';
import { formatCount } from '@/utils/format';

import { useInteraction } from './usePostMutations';

interface ActionProps {
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function Action({ icon, label, count, active, activeColor = 'accent.text', pressed, onClick, disabled }: ActionProps) {
  const { language } = usePreferences();
  return (
    <Tooltip title={label}>
      <ButtonBase
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        disabled={disabled}
        aria-label={count !== undefined ? `${label} (${count})` : label}
        aria-pressed={pressed}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          minWidth: 44,
          height: 44,
          px: 1,
          borderRadius: 999,
          color: active ? activeColor : 'text.secondary',
          fontWeight: 700,
          fontSize: '0.875rem',
          transition: 'background-color 120ms, color 120ms',
          '&:hover': { bgcolor: 'accent.subtle', color: activeColor },
          '& svg': { fontSize: 20 },
        }}
      >
        {icon}
        {count !== undefined && count > 0 && <Box component="span">{formatCount(count, language)}</Box>}
      </ButtonBase>
    </Tooltip>
  );
}

export function PostActions({ post, onComment }: { post: Post; onComment?: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const interaction = useInteraction();
  const isOwn = user?.id === post.author.id;

  const requireAuth = (action: () => void) => () => {
    if (!user) {
      notify(t('post.signInToInteract'), 'info');
      navigate('/login', { state: { from: `/posts/${post.id}` } });
      return;
    }
    action();
  };

  const share = async () => {
    const url = `${window.location.origin}/posts/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title ?? 'ArabDev', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      notify(t('common.linkCopied'));
    } catch {
      /* the user closed the share sheet */
    }
  };

  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 1, ml: -1, maxWidth: 460 }}>
      <Action
        icon={<ChatBubbleOutlineIcon />}
        label={t('post.comment')}
        count={post.comments_count}
        onClick={onComment ?? (() => navigate(`/posts/${post.id}#comments`))}
      />
      <Action
        icon={<RepeatIcon />}
        label={post.reposted ? t('post.undoRepost') : t('post.repost')}
        count={post.reposts_count}
        active={post.reposted}
        activeColor="success.main"
        pressed={post.reposted}
        disabled={isOwn}
        onClick={requireAuth(() => interaction.mutate({ post, kind: 'repost', active: !post.reposted }))}
      />
      <Action
        icon={post.liked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
        label={post.liked ? t('post.unlike') : t('post.like')}
        count={post.likes_count}
        active={post.liked}
        pressed={post.liked}
        onClick={requireAuth(() => interaction.mutate({ post, kind: 'like', active: !post.liked }))}
      />
      <Action
        icon={post.bookmarked ? <BookmarkIcon /> : <BookmarkBorderIcon />}
        label={post.bookmarked ? t('post.removeBookmark') : t('post.bookmark')}
        active={post.bookmarked}
        pressed={post.bookmarked}
        onClick={requireAuth(() => interaction.mutate({ post, kind: 'bookmark', active: !post.bookmarked }))}
      />
      <Action icon={<IosShareIcon />} label={t('post.share')} onClick={() => void share()} />
    </Stack>
  );
}
