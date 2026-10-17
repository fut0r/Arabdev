import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { POST_QUERY_ROOTS, USER_QUERY_ROOTS } from '@/api/queryKeys';
import { usersApi } from '@/api/users';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNotify } from '@/components/Notifier';

interface Target {
  id: number;
  username: string;
}

/**
 * Blocking and unblocking, with the confirmation that explains what a block does.
 * Returns `ask(target, blocked)` and the dialog to render.
 */
export function useBlockActions() {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);

  const refresh = () => {
    [...POST_QUERY_ROOTS, ...USER_QUERY_ROOTS, 'blocked', 'comments', 'notifications', 'unread-count'].forEach(
      (root) => void queryClient.invalidateQueries({ queryKey: [root] }),
    );
  };

  const block = useMutation({
    mutationFn: (user: Target) => usersApi.block(user.id),
    onSuccess: (_, user) => {
      setTarget(null);
      notify(t('block.blocked', { username: user.username }));
      refresh();
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });
  const unblock = useMutation({
    mutationFn: (user: Target) => usersApi.unblock(user.id),
    onSuccess: () => {
      notify(t('block.unblocked'));
      refresh();
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  const ask = (user: Target, alreadyBlocked = false) => {
    if (alreadyBlocked) unblock.mutate(user);
    else setTarget(user);
  };

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title={t('block.confirmTitle', { username: target?.username ?? '' })}
      description={t('block.confirmBody')}
      confirmLabel={t('block.block')}
      pending={block.isPending}
      onClose={() => setTarget(null)}
      onConfirm={() => target && block.mutate(target)}
    />
  );

  return { ask, dialog, pending: block.isPending || unblock.isPending };
}

/** Shown on the profile of someone you blocked. */
export function BlockedNotice({ id, username }: Target) {
  const { t } = useTranslation();
  const { ask, pending } = useBlockActions();
  return (
    <Alert
      severity="info"
      sx={{ mx: { xs: 2, sm: 3 }, mb: 2 }}
      action={
        <Button color="inherit" size="small" loading={pending} onClick={() => ask({ id, username }, true)}>
          {t('block.unblock')}
        </Button>
      }
    >
      {t('block.youBlocked', { username })}
    </Alert>
  );
}
