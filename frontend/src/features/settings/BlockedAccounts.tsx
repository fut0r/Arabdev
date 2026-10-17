import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { errorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { usersApi } from '@/api/users';
import { UserAvatar } from '@/components/common';
import { useNotify } from '@/components/Notifier';
import { Pagination } from '@/components/Pagination';

/** The accounts you have blocked, each with a way to unblock. */
export function BlockedAccounts() {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: queryKeys.blocked(page),
    queryFn: () => usersApi.blocked(page),
    placeholderData: keepPreviousData,
  });
  const unblock = useMutation({
    mutationFn: usersApi.unblock,
    onSuccess: () => {
      notify(t('block.unblocked'));
      void queryClient.invalidateQueries({ queryKey: ['blocked'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  if (query.isPending) return null;
  if (query.isError || query.data.total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('block.none')}
      </Typography>
    );
  }

  return (
    <Box>
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {query.data.items.map((account) => (
          <Stack component="li" key={account.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <UserAvatar name={account.display_name} src={account.avatar_url} size={36} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Link component={RouterLink} to={`/u/${account.username}`} color="inherit" sx={{ fontWeight: 700 }}>
                {account.display_name}
              </Link>
              <Typography variant="body2" color="text.secondary" dir="ltr" sx={{ textAlign: 'start' }}>
                @{account.username}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => unblock.mutate(account.id)}
              loading={unblock.isPending && unblock.variables === account.id}
            >
              {t('block.unblock')}
            </Button>
          </Stack>
        ))}
      </Stack>
      {query.data.pages > 1 && <Pagination page={page} pages={query.data.pages} onChange={setPage} />}
    </Box>
  );
}
