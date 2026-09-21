import DoneAllIcon from '@mui/icons-material/DoneAll';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { notificationsApi } from '@/api/misc';
import { queryKeys } from '@/api/queryKeys';
import { ErrorState, PageHeader, Surface } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { UserListSkeleton } from '@/components/LoadingState';
import { useNotify } from '@/components/Notifier';
import { Pagination } from '@/components/Pagination';
import { NotificationItem } from '@/features/notifications/NotificationItem';
import { usePageParam } from '@/hooks';
import { useSeo } from '@/utils/seo';
import type { Notification, Page } from '@/types/api';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [page, setPage] = usePageParam();
  useSeo({ title: t('notifications.title'), noindex: true });

  const query = useQuery({
    queryKey: queryKeys.notifications(page),
    queryFn: () => notificationsApi.list(page),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const unread = queryClient.getQueryData<number>(queryKeys.unreadCount) ?? 0;

  const markRead = (notification: Notification) => {
    if (notification.is_read) return;
    queryClient.setQueryData<Page<Notification>>(queryKeys.notifications(page), (data) =>
      data ? { ...data, items: data.items.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)) } : data,
    );
    queryClient.setQueryData<number>(queryKeys.unreadCount, (count) => Math.max(0, (count ?? 1) - 1));
    void notificationsApi.markRead(notification.id).catch(() => undefined);
  };

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.unreadCount, 0);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  return (
    <Surface>
      <PageHeader
        title={t('notifications.title')}
        action={
          <Button
            size="small"
            startIcon={<DoneAllIcon />}
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
            disabled={!unread && !query.data?.items.some((n) => !n.is_read)}
          >
            {t('notifications.markAllRead')}
          </Button>
        }
      />
      {query.isPending ? (
        <UserListSkeleton count={5} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />
      ) : query.data.total === 0 ? (
        <EmptyState
          icon={<NotificationsNoneIcon />}
          title={t('notifications.emptyTitle')}
          description={t('notifications.emptyBody')}
          action={{ label: t('notifications.emptyAction'), to: '/create', icon: <EditOutlinedIcon /> }}
        />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, opacity: query.isPlaceholderData ? 0.6 : 1 }}>
          {query.data.items.map((notification, index) => (
            <Fragment key={notification.id}>
              {index > 0 && <Divider component="li" role="presentation" />}
              <li>
                <NotificationItem notification={notification} onOpen={() => markRead(notification)} />
              </li>
            </Fragment>
          ))}
          <Divider component="li" role="presentation" />
          <li>
            <Pagination page={page} pages={query.data.pages} onChange={setPage} />
          </li>
        </Box>
      )}
    </Surface>
  );
}
