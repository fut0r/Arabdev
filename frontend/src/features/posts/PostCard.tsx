import BlockIcon from '@mui/icons-material/Block';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import LinkIcon from '@mui/icons-material/Link';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RepeatIcon from '@mui/icons-material/Repeat';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router';

import { RelativeTime, UserAvatar } from '@/components/common';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/Notifier';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReportDialog } from '@/features/moderation/ReportDialog';
import { useBlockActions } from '@/features/users/BlockControls';
import type { Post } from '@/types/api';
import { hostnameOf } from '@/utils/format';

import { PostActions } from './PostActions';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { BookmarkEditor } from './BookmarkEditor';
import { Button, Chip, Dialog, DialogActions } from '@mui/material';
import { useDeletePost } from './usePostMutations';

export function PostMenu({ post, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotify();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const blocking = useBlockActions();
  const deletion = useDeletePost(() => {
    setConfirming(false);
    onDeleted?.();
  });
  const isOwner = user?.id === post.author.id;
  const canDelete = isOwner || Boolean(user?.is_admin);

  const report = () => {
    setAnchor(null);
    if (!user) {
      navigate('/login', { state: { from: `/posts/${post.id}` } });
      return;
    }
    setReporting(true);
  };

  const copyLink = async () => {
    setAnchor(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`);
      notify(t('common.linkCopied'));
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label={t('post.moreActions')}
        aria-haspopup="menu"
        onClick={(event: MouseEvent<HTMLElement>) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
        sx={{ color: 'text.secondary', mt: -0.5 }}
      >
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
      >
        {isOwner && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              navigate(`/posts/${post.id}/edit`);
            }}
          >
            <ListItemIcon>
              <EditOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {t('post.editPost')}
          </MenuItem>
        )}
        <MenuItem onClick={() => void copyLink()}>
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          {t('common.copyLink')}
        </MenuItem>
        {!isOwner && (
          <MenuItem onClick={report}>
            <ListItemIcon>
              <FlagOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {t('report.action')}
          </MenuItem>
        )}
        {!isOwner && user && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              blocking.ask({ id: post.author.id, username: post.author.username });
            }}
          >
            <ListItemIcon>
              <BlockIcon fontSize="small" />
            </ListItemIcon>
            {t('block.blockUser', { username: post.author.username })}
          </MenuItem>
        )}
        {canDelete && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setConfirming(true);
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'inherit' }}>
              <DeleteOutlineIcon fontSize="small" />
            </ListItemIcon>
            {t('post.deletePost')}
          </MenuItem>
        )}
      </Menu>
      <ConfirmDialog
        open={confirming}
        title={t('post.deleteConfirmTitle')}
        description={t('post.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        pending={deletion.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => deletion.mutate(post.id)}
      />
      {!isOwner && user && <ReportDialog postId={post.id} open={reporting} onClose={() => setReporting(false)} />}
      {blocking.dialog}
    </>
  );
}

export function PostImage({ post, maxHeight = 460 }: { post: Post; maxHeight?: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!post.image) return null;
  return (
    <>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={t('community.openImage')}
        sx={{ display: 'block', p: 0, width: '100%' }}
      >
        <Box
          component="img"
          src={post.image.url}
          alt={post.title ? `${t('post.attachedImage')}: ${post.title}` : t('post.attachedImage')}
          width={post.image.width}
          height={post.image.height}
          loading="lazy"
          decoding="async"
          sx={{
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight,
            objectFit: 'cover',
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            mt: 1.5,
            bgcolor: 'surface.sunken',
          }}
        />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xl" onClick={(e) => e.stopPropagation()}>
        <Box
          component="img"
          src={post.image.url}
          alt={post.title ?? t('post.attachedImage')}
          sx={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }}
        />
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('community.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function PostLink({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <Box
      component="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(event) => event.stopPropagation()}
      aria-label={`${t('post.openLink')}: ${hostnameOf(url)}`}
      sx={{
        mt: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1.5,
        py: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        color: 'text.primary',
        textDecoration: 'none',
        '&:hover': { bgcolor: 'action.hover', borderColor: 'surface.borderStrong' },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1.5,
          bgcolor: 'surface.sunken',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <LinkIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
          {hostnameOf(url)}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="p" dir="ltr" sx={{ textAlign: 'start' }}>
          {url}
        </Typography>
      </Box>
      <OpenInNewIcon fontSize="small" sx={{ color: 'text.secondary' }} />
    </Box>
  );
}

export function PostTags({ post }: { post: Post }) {
  if (!post.tags.length) return null;
  return (
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', mt: 1.25, gap: 0.5 }}>
      {post.tags.map((tag) => (
        <Link
          key={tag.slug}
          component={RouterLink}
          to={`/tags/${encodeURIComponent(tag.slug)}`}
          onClick={(event) => event.stopPropagation()}
          underline="none"
          dir="auto"
          sx={{
            px: 0.75,
            py: 0.125,
            borderRadius: 1,
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'text.secondary',
            border: 1,
            borderColor: 'transparent',
            '&:hover': { borderColor: 'divider', color: 'text.primary', bgcolor: 'action.hover' },
          }}
        >
          <Box component="span" sx={{ color: 'accent.text', opacity: 0.8 }}>
            #
          </Box>
          {tag.slug}
        </Link>
      ))}
    </Stack>
  );
}

export function PostByline({ post, size = 'feed' }: { post: Post; size?: 'feed' | 'page' }) {
  const { t } = useTranslation();
  const profileUrl = `/u/${post.author.username}`;
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', minWidth: 0, flexWrap: 'wrap', rowGap: 0 }}>
      <Link
        component={RouterLink}
        to={profileUrl}
        onClick={(event) => event.stopPropagation()}
        color="text.primary"
        sx={{ fontWeight: 700, fontSize: size === 'page' ? '1rem' : '0.9375rem' }}
      >
        {post.author.display_name}
      </Link>
      <Typography variant="body2" color="text.secondary" dir="ltr" component="span">
        @{post.author.username}
      </Typography>
      <Typography variant="body2" color="text.secondary" component="span" aria-hidden>
        ·
      </Typography>
      <Typography variant="body2" color="text.secondary" component="span">
        <RelativeTime iso={post.created_at} />
      </Typography>
      {post.edited_at && (
        <Typography variant="caption" color="text.secondary" component="span">
          ({t('post.edited')})
        </Typography>
      )}
    </Stack>
  );
}

/** A post in a list. Compact: title and a clamped preview; the full post is one click away. */
export function PostCard({ post }: { post: Post }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { appearance } = usePreferences();
  const [organizing, setOrganizing] = useState(false);
  const url = `/posts/${post.id}`;

  const openPost = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, [role="menuitem"]') || window.getSelection()?.toString()) return;
    navigate(url);
  };

  return (
    <Box
      component="article"
      aria-labelledby={`post-${post.id}-title`}
      onClick={openPost}
      sx={{
        px: 2,
        pt: appearance.density === 'compact' ? 1 : 2,
        pb: 1.25,
        cursor: 'pointer',
        transition: 'background-color 120ms',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {post.reposted_by && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75, pl: 3.5, color: 'text.secondary' }}>
          <RepeatIcon sx={{ fontSize: 16 }} aria-hidden />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {post.reposted_by.id === user?.id
              ? t('post.youReposted')
              : t('post.repostedBy', { name: post.reposted_by.display_name })}
          </Typography>
        </Stack>
      )}
      <Stack direction="row" spacing={1.5}>
        <Box
          component={RouterLink}
          to={`/u/${post.author.username}`}
          onClick={(event) => event.stopPropagation()}
          aria-label={post.author.display_name}
          sx={{ flexShrink: 0, borderRadius: '50%', height: 'fit-content' }}
        >
          <UserAvatar name={post.author.display_name} src={post.author.avatar_url} size={40} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <PostByline post={post} />
            <PostMenu post={post} />
          </Stack>

          <Typography
            id={`post-${post.id}-title`}
            variant="h4"
            component="h2"
            dir="auto"
            sx={{ mt: 0.25, mb: 0.5, fontSize: { xs: '1.0625rem', sm: '1.1875rem' } }}
          >
            <Link component={RouterLink} to={url} color="inherit" underline="hover" sx={{ fontWeight: 'inherit' }}>
              {post.title || t('post.by', { name: post.author.display_name })}
            </Link>
          </Typography>

          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, my: 1 }}>
            <Chip size="small" label={t(`community.${post.kind}`)} />
            {post.accepted_comment_id && <Chip size="small" color="success" label={t('community.solved')} />}
            <Typography variant="caption" color="text.secondary">
              {t('post.readTime', { count: post.reading_minutes })}
            </Typography>
          </Stack>
          <Typography dir="auto" sx={{ my: 1, lineHeight: 1.8 }}>
            {post.excerpt?.slice(0, appearance.density === 'compact' ? 140 : 280)}
            {post.excerpt?.length > (appearance.density === 'compact' ? 140 : 280) ? '…' : ''}
          </Typography>
          <Link component={RouterLink} to={url} variant="body2">
            {t('common.readMore')}
          </Link>
          {appearance.density !== 'compact' && <PostImage post={post} maxHeight={180} />}
          <PostTags post={post} />
          <PostActions post={post} />
          {post.bookmarked && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                setOrganizing(true);
              }}
            >
              {t('community.organize')}
            </Button>
          )}
          {organizing && <BookmarkEditor post={post} onClose={() => setOrganizing(false)} />}
        </Box>
      </Stack>
    </Box>
  );
}
