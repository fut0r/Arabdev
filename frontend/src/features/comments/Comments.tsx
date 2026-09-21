import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, forwardRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { updatePostInCaches } from '@/api/cache';
import { errorMessage } from '@/api/errors';
import { postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { ErrorState, RelativeTime, UserAvatar } from '@/components/common';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { UserListSkeleton } from '@/components/LoadingState';
import { useNotify } from '@/components/Notifier';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Comment } from '@/types/api';

const MAX_LENGTH = 2000;
const MENTION = /(@[a-zA-Z][a-zA-Z0-9_]{2,19})/g;

/**
 * Text with @mentions. Each mention is isolated as left-to-right, so "@zyad" doesn't turn
 * into "zyad@" inside Arabic sentences. split() puts the matches at odd indices.
 */
export function MentionText({ text, linkify = true }: { text: string; linkify?: boolean }) {
  return text.split(MENTION).map((part, index): ReactNode => {
    if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
    return linkify ? (
      <Link key={index} component={RouterLink} to={`/u/${part.slice(1).toLowerCase()}`} dir="ltr">
        {part}
      </Link>
    ) : (
      <bdi key={index} dir="ltr">
        {part}
      </bdi>
    );
  });
}

export function CommentText({ text }: { text: string }) {
  return (
    <Typography
      dir="auto"
      variant="body2"
      sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.9375rem' }}
    >
      <MentionText text={text} />
    </Typography>
  );
}

function CommentItem({
  comment,
  parent,
  onReply,
  onDelete,
}: {
  comment: Comment;
  parent: Comment | undefined;
  onReply: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <Stack component="li" direction="row" spacing={1.5} sx={{ px: 2, py: 1.75 }}>
      <Box
        component={RouterLink}
        to={`/u/${comment.author.username}`}
        sx={{ height: 'fit-content', borderRadius: '50%' }}
      >
        <UserAvatar name={comment.author.display_name} src={comment.author.avatar_url} size={34} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Link
            component={RouterLink}
            to={`/u/${comment.author.username}`}
            color="text.primary"
            sx={{ fontWeight: 700 }}
          >
            {comment.author.display_name}
          </Link>
          <Typography variant="body2" color="text.secondary" dir="ltr" component="span">
            @{comment.author.username}
          </Typography>
          <Typography variant="body2" color="text.secondary" component="span">
            · <RelativeTime iso={comment.created_at} />
          </Typography>
        </Stack>
        {parent && (
          <Typography variant="caption" color="text.secondary" component="p">
            {t('comments.replyingTo', { username: parent.author.username })}
          </Typography>
        )}
        <Box sx={{ mt: 0.25 }}>
          <CommentText text={comment.content} />
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, ml: -1 }}>
          {user && (
            <Button
              size="small"
              color="inherit"
              startIcon={<ReplyIcon />}
              onClick={() => onReply(comment)}
              sx={{ color: 'text.secondary' }}
            >
              {t('comments.reply')}
            </Button>
          )}
          {comment.can_delete && (
            <Tooltip title={t('comments.delete')}>
              <IconButton
                size="small"
                onClick={() => onDelete(comment)}
                aria-label={t('comments.delete')}
                sx={{ color: 'text.secondary' }}
              >
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

interface ComposerProps {
  postId: number;
  replyTo: Comment | null;
  onCancelReply: () => void;
  onPosted: () => void;
}

export const CommentComposer = forwardRef<HTMLTextAreaElement, ComposerProps>(function CommentComposer(
  { postId, replyTo, onCancelReply, onPosted },
  ref,
) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const turnstile = useTurnstile({ action: 'comment', mode: 'invisible' });

  const mutation = useMutation({
    mutationFn: async () => postsApi.addComment(postId, text.trim(), replyTo?.id, await turnstile.getToken()),
    onSuccess: () => {
      setText('');
      onCancelReply();
      updatePostInCaches(queryClient, postId, (post) => ({ ...post, comments_count: post.comments_count + 1 }));
      onPosted();
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
    onSettled: () => turnstile.reset(),
  });

  if (!user) {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 2 }}>
        <Typography color="text.secondary">{t('comments.signInPrompt')}</Typography>
        <Button component={RouterLink} to="/login" state={{ from: `/posts/${postId}` }} variant="contained">
          {t('common.signIn')}
        </Button>
      </Stack>
    );
  }

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) mutation.mutate();
      }}
      sx={{ px: 2, py: 2 }}
    >
      <Stack direction="row" spacing={1.5}>
        <UserAvatar name={user.display_name} src={user.avatar_url} size={34} />
        <Box sx={{ flex: 1 }}>
          {replyTo && (
            <Chip
              size="small"
              label={t('comments.replyingTo', { username: replyTo.author.username })}
              onDelete={onCancelReply}
              deleteIcon={<CloseIcon aria-label={t('comments.cancelReply')} />}
              sx={{ mb: 1 }}
            />
          )}
          <TextField
            inputRef={ref}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('comments.placeholder')}
            multiline
            minRows={2}
            maxRows={12}
            fullWidth
            slotProps={{ htmlInput: { maxLength: MAX_LENGTH, dir: 'auto', 'aria-label': t('comments.placeholder') } }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && text.trim()) mutation.mutate();
            }}
          />
          <TurnstileWidget handle={turnstile} sx={{ mt: 1 }} />
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.characters', { count: text.length, max: MAX_LENGTH })}
            </Typography>
            <Button type="submit" variant="contained" disabled={!text.trim()} loading={mutation.isPending}>
              {t('comments.submit')}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
});

/** Discussion under a post: composer, then comments oldest-first, 20 per page. */
export function CommentsSection({ postId, commentsCount }: { postId: number; commentsCount: number }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);
  const [composer, setComposer] = useState<HTMLTextAreaElement | null>(null);

  const query = useQuery({
    queryKey: queryKeys.comments(postId, page),
    queryFn: () => postsApi.comments(postId, page),
    placeholderData: keepPreviousData,
  });

  const removal = useMutation({
    mutationFn: (comment: Comment) => postsApi.deleteComment(comment.id),
    onSuccess: () => {
      setDeleting(null);
      notify(t('comments.deleted'));
      void queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.post(postId) });
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  const onPosted = async () => {
    await queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    const total = (query.data?.total ?? 0) + 1;
    setPage(Math.max(1, Math.ceil(total / 20)));
  };

  const byId = new Map((query.data?.items ?? []).map((comment) => [comment.id, comment]));

  return (
    <Box component="section" id="comments" aria-labelledby="comments-title" sx={{ scrollMarginTop: 80 }}>
      <Typography id="comments-title" variant="h4" component="h2" sx={{ px: 2, pt: 2.5 }}>
        {t('comments.title')}
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, mx: 1 }}>
          ({commentsCount})
        </Box>
      </Typography>
      <CommentComposer
        ref={setComposer}
        postId={postId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onPosted={() => void onPosted()}
      />
      <Divider />
      {query.isPending ? (
        <UserListSkeleton count={2} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />
      ) : query.data.total === 0 ? (
        <EmptyState
          compact
          icon={<ChatBubbleOutlineOutlinedIcon />}
          title={t('comments.emptyTitle')}
          description={t('comments.emptyBody')}
        />
      ) : (
        <>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, opacity: query.isPlaceholderData ? 0.6 : 1 }}>
            {query.data.items.map((comment, index) => (
              <Fragment key={comment.id}>
                {index > 0 && <Divider component="li" role="presentation" />}
                <CommentItem
                  comment={comment}
                  parent={comment.parent_id ? byId.get(comment.parent_id) : undefined}
                  onReply={(target) => {
                    setReplyTo(target);
                    composer?.focus();
                  }}
                  onDelete={setDeleting}
                />
              </Fragment>
            ))}
          </Box>
          <Pagination page={page} pages={query.data.pages} onChange={setPage} />
        </>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('comments.delete')}
        description={deleting?.content.slice(0, 160) ?? ''}
        confirmLabel={t('common.delete')}
        pending={removal.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removal.mutate(deleting)}
      />
    </Box>
  );
}
