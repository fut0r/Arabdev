import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { errorMessage } from '@/api/errors';
import { moderationApi } from '@/api/moderation';
import { queryKeys } from '@/api/queryKeys';
import { ErrorState, UserAvatar } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { UserListSkeleton } from '@/components/LoadingState';
import { useNotify } from '@/components/Notifier';
import { Pagination } from '@/components/Pagination';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { formatFullDate } from '@/utils/format';

import { CaseCard, Person } from './CaseCard';
import { useInvalidateModeration } from './useInvalidateModeration';

export function CaseList({ status }: { status: 'open' | 'resolved' }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const query = useQuery({
    queryKey: queryKeys.moderationCases(status, page),
    queryFn: () => moderationApi.cases(status, page),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <UserListSkeleton count={3} />;
  if (query.isError) return <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />;
  if (query.data.total === 0) {
    return (
      <EmptyState
        icon={<GppGoodOutlinedIcon />}
        title={status === 'open' ? t('moderation.emptyOpen') : t('moderation.emptyResolved')}
      />
    );
  }
  return (
    <Box sx={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
      {query.data.items.map((item, index) => (
        <Fragment key={`${item.case_id}-${item.reports.length}`}>
          {index > 0 && <Divider />}
          <CaseCard item={item} onDecided={() => undefined} />
        </Fragment>
      ))}
      <Divider />
      <Pagination
        page={page}
        pages={query.data.pages}
        onChange={(next) =>
          setParams((current) => {
            current.set('page', String(next));
            return current;
          })
        }
      />
    </Box>
  );
}

/** The case a moderator opened from the email: /admin/reports?report=42 */
export function LinkedCase({ reportId, onDone }: { reportId: number; onDone: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.moderationCase(reportId),
    queryFn: () => moderationApi.case(reportId),
  });
  if (query.isPending) return <UserListSkeleton count={1} />;
  if (query.isError) return <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />;
  return (
    <>
      <CaseCard item={query.data} onDecided={onDone} />
      <Divider />
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Button onClick={onDone}>{t('common.seeAll')}</Button>
      </Box>
    </>
  );
}

export function RestrictedList() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const notify = useNotify();
  const invalidate = useInvalidateModeration();
  const query = useQuery({ queryKey: queryKeys.restricted, queryFn: moderationApi.restricted });
  const lift = useMutation({
    mutationFn: moderationApi.lift,
    onSuccess: () => {
      notify(t('moderation.lifted'));
      invalidate();
    },
    onError: (error) => notify(errorMessage(error, t), 'error'),
  });

  if (query.isPending) return <UserListSkeleton count={3} />;
  if (query.isError) return <ErrorState message={errorMessage(query.error, t)} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) {
    return <EmptyState icon={<GppGoodOutlinedIcon />} title={t('moderation.emptyRestricted')} />;
  }
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {query.data.map((account, index) => (
        <Fragment key={account.id}>
          {index > 0 && <Divider component="li" role="presentation" />}
          <Stack component="li" direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1.5 }}>
            <UserAvatar name={account.display_name} src={account.avatar_url} size={40} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>
                  {account.display_name}
                </Typography>
                <Person user={account} fallback="" />
              </Stack>
              <Typography variant="body2" color={account.suspended ? 'error' : 'text.secondary'}>
                {account.suspended
                  ? t('moderation.suspended')
                  : account.restricted_until
                    ? t('moderation.restrictedUntil', { date: formatFullDate(account.restricted_until, language) })
                    : null}
              </Typography>
              {account.restriction_reason && (
                <Typography variant="caption" color="text.secondary" dir="auto" component="p">
                  {account.restriction_reason}
                </Typography>
              )}
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => lift.mutate(account.id)}
              loading={lift.isPending && lift.variables === account.id}
            >
              {t('moderation.lift')}
            </Button>
          </Stack>
        </Fragment>
      ))}
    </Box>
  );
}
