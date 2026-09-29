import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { errorMessage } from '@/api/errors';
import { moderationApi } from '@/api/moderation';
import { POST_QUERY_ROOTS, queryKeys } from '@/api/queryKeys';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState, PageHeader, RelativeTime, Surface, UserAvatar } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { UserListSkeleton } from '@/components/LoadingState';
import { useNotify } from '@/components/Notifier';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { useOpenReports } from '@/layouts/navItems';
import type { AuthorAction, ReportCase, ReportItem, UserSummary } from '@/types/api';
import { formatFullDate } from '@/utils/format';
import { useSeo } from '@/utils/seo';

type TabKey = 'open' | 'resolved' | 'restricted';
const TABS: TabKey[] = ['open', 'resolved', 'restricted'];
const RESTRICT_DAYS = [1, 3, 7, 30, 90, 365];
const MAX_NOTE = 500;

function useInvalidateModeration() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['moderation'] });
    POST_QUERY_ROOTS.forEach((root) => void queryClient.invalidateQueries({ queryKey: [root] }));
  };
}

function Person({ user, fallback }: { user: UserSummary | null; fallback: string }) {
  if (!user) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {fallback}
      </Typography>
    );
  }
  return (
    <Link component={RouterLink} to={`/u/${user.username}`} variant="body2" sx={{ fontWeight: 700 }} dir="ltr">
      @{user.username}
    </Link>
  );
}

function ReportRow({ report }: { report: ReportItem }) {
  const { t } = useTranslation();
  return (
    <Box component="li" sx={{ py: 1.25 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip size="small" color="error" variant="outlined" label={t(`report.reasons.${report.reason}`)} />
        <Typography variant="body2" color="text.secondary" component="span">
          {t('moderation.reportedBy')}
        </Typography>
        <Person user={report.reporter} fallback={t('moderation.unknownUser')} />
        <Typography variant="body2" color="text.secondary" component="span">
          · <RelativeTime iso={report.created_at} />
        </Typography>
      </Stack>
      {report.details && (
        <Typography
          variant="body2"
          dir="auto"
          sx={{ mt: 0.75, px: 1.5, py: 1, bgcolor: 'surface.sunken', borderRadius: 1.5, whiteSpace: 'pre-wrap' }}
        >
          {report.details}
        </Typography>
      )}
    </Box>
  );
}

function DecisionForm({ item, onDecided }: { item: ReportCase; onDecided: () => void }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const invalidate = useInvalidateModeration();
  const actionLabelId = useId();
  const [removePost, setRemovePost] = useState(false);
  const [authorAction, setAuthorAction] = useState<AuthorAction>('none');
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const canActOnAuthor = Boolean(item.author) && !item.author?.is_admin && !item.author?.suspended;
  const acting = removePost || authorAction !== 'none';

  const mutation = useMutation({
    mutationFn: (dismiss: boolean) =>
      moderationApi.decide(item.case_id, {
        remove_post: dismiss ? false : removePost,
        author_action: dismiss ? 'none' : authorAction,
        restrict_days: days,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setConfirming(false);
      notify(t('moderation.decided'));
      invalidate();
      onDecided();
    },
    onError: (error) => {
      setConfirming(false);
      notify(errorMessage(error, t), 'error');
    },
  });

  return (
    <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
        {t('moderation.decisionTitle')}
      </Typography>
      {item.post && (
        <>
          <FormControlLabel
            control={<Checkbox checked={removePost} onChange={(event) => setRemovePost(event.target.checked)} />}
            label={t('moderation.removePost')}
          />
          <FormHelperText sx={{ mt: -0.75, mb: 1.5, mx: 0 }}>{t('moderation.removePostHelp')}</FormHelperText>
        </>
      )}

      <FormLabel id={actionLabelId} sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
        {t('moderation.authorAction')}
      </FormLabel>
      {item.author?.is_admin && <FormHelperText sx={{ mx: 0 }}>{t('moderation.authorIsModerator')}</FormHelperText>}
      <RadioGroup
        aria-labelledby={actionLabelId}
        value={authorAction}
        onChange={(event) => setAuthorAction(event.target.value as AuthorAction)}
      >
        <FormControlLabel value="none" control={<Radio size="small" />} label={t('moderation.actionNone')} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <FormControlLabel
            value="restrict"
            control={<Radio size="small" />}
            label={t('moderation.actionRestrict')}
            disabled={!canActOnAuthor}
            sx={{ mr: 0 }}
          />
          <Select
            size="small"
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setAuthorAction('restrict');
            }}
            disabled={!canActOnAuthor}
            inputProps={{ 'aria-label': t('moderation.actionRestrict') }}
            sx={{ minWidth: 120 }}
          >
            {RESTRICT_DAYS.map((value) => (
              <MenuItem key={value} value={value}>
                {t('moderation.days', { count: value })}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        <FormControlLabel
          value="suspend"
          control={<Radio size="small" />}
          label={t('moderation.actionSuspend')}
          disabled={!canActOnAuthor}
        />
        <FormHelperText sx={{ mt: -0.5, mx: 0 }}>{t('moderation.actionSuspendHelp')}</FormHelperText>
      </RadioGroup>

      <TextField
        label={t('moderation.note')}
        helperText={`${t('moderation.noteHelp')} ${t('common.characters', { count: note.length, max: MAX_NOTE })}`}
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
        multiline
        minRows={2}
        fullWidth
        sx={{ mt: 2 }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<GppGoodOutlinedIcon />}
          onClick={() => mutation.mutate(true)}
          loading={mutation.isPending && !confirming}
          disabled={mutation.isPending}
        >
          {t('moderation.dismiss')}
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<ShieldOutlinedIcon />}
          onClick={() => setConfirming(true)}
          disabled={!acting || mutation.isPending}
        >
          {t('moderation.apply')}
        </Button>
      </Stack>

      <ConfirmDialog
        open={confirming}
        title={t('moderation.confirmTitle')}
        description={t('moderation.confirmBody')}
        confirmLabel={t('moderation.apply')}
        pending={mutation.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => mutation.mutate(false)}
      />
    </Box>
  );
}

function Outcome({ report }: { report: ReportItem }) {
  const { t } = useTranslation();
  const actions = report.action ? report.action.split(',') : [];
  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          size="small"
          color={report.status === 'actioned' ? 'error' : 'success'}
          label={t(`moderation.status_${report.status}`)}
        />
        {actions.map((action) => (
          <Chip key={action} size="small" variant="outlined" label={t(`moderation.action_${action}`)} />
        ))}
        {report.moderator && (
          <Typography variant="caption" color="text.secondary">
            {t('moderation.decidedBy', { name: report.moderator.display_name })}
          </Typography>
        )}
        {report.resolved_at && (
          <Typography variant="caption" color="text.secondary">
            · <RelativeTime iso={report.resolved_at} />
          </Typography>
        )}
      </Stack>
      {report.resolution_note && (
        <Typography variant="body2" dir="auto" sx={{ mt: 0.75 }} color="text.secondary">
          {report.resolution_note}
        </Typography>
      )}
    </Box>
  );
}

function CaseCard({ item, onDecided }: { item: ReportCase; onDecided: () => void }) {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const open = item.reports.some((report) => report.status === 'open');
  const title = item.post?.title ?? item.post_title;
  const author = item.author;

  return (
    <Box component="section" aria-label={title ?? undefined} sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <Chip
          size="small"
          icon={<FlagOutlinedIcon />}
          label={t('moderation.reportsCount', { count: item.reports.length })}
        />
        {open && item.post && (
          <Chip
            size="small"
            color={item.hidden ? 'warning' : 'default'}
            variant={item.hidden ? 'filled' : 'outlined'}
            label={item.hidden ? t('moderation.hiddenChip') : t('moderation.visibleChip')}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          <RelativeTime iso={item.first_reported_at} />
        </Typography>
      </Stack>

      <Typography variant="h5" component="h2" dir="auto" sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>
        {item.post ? (
          <Link component={RouterLink} to={`/posts/${item.post.id}`} color="inherit" underline="hover">
            {title || t('post.by', { name: item.post.author.display_name })}
          </Link>
        ) : (
          title || '—'
        )}
      </Typography>

      {author && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', mt: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" component="span">
            {t('moderation.by')}
          </Typography>
          <UserAvatar name={author.display_name} src={author.avatar_url} size={22} />
          <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
            {author.display_name}
          </Typography>
          <Person user={author} fallback="" />
          {author.suspended && <Chip size="small" color="error" label={t('moderation.authorSuspended')} />}
          {author.restricted_until && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={t('moderation.authorRestricted', { date: formatFullDate(author.restricted_until, language) })}
            />
          )}
        </Stack>
      )}

      <Typography
        variant="body2"
        dir="auto"
        color="text.secondary"
        sx={{ mt: 1, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {item.post_excerpt}
      </Typography>
      {!item.post && open && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          {t('moderation.postGone')}
        </Typography>
      )}
      {item.post && (
        <Button
          component={RouterLink}
          to={`/posts/${item.post.id}`}
          target="_blank"
          size="small"
          endIcon={<OpenInNewIcon fontSize="small" />}
          sx={{ mt: 0.5, px: 0 }}
        >
          {t('moderation.openPost')}
        </Button>
      )}

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1 }}>
        {item.reports.map((report) => (
          <ReportRow key={report.id} report={report} />
        ))}
      </Box>

      {open ? <DecisionForm item={item} onDecided={onDecided} /> : <Outcome report={item.reports[0]} />}
    </Box>
  );
}

function CaseList({ status }: { status: 'open' | 'resolved' }) {
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
function LinkedCase({ reportId, onDone }: { reportId: number; onDone: () => void }) {
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

function RestrictedList() {
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

export default function ModerationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const openCases = useOpenReports();
  const [params, setParams] = useSearchParams();
  useSeo({ title: t('moderation.metaTitle'), noindex: true });

  const tabParam = params.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && TABS.includes(tabParam) ? tabParam : 'open';
  const linked = Number(params.get('report'));
  const setTab = (next: TabKey) => setParams(next === 'open' ? {} : { tab: next });

  if (!user?.is_admin) {
    return (
      <Surface>
        <EmptyState icon={<ShieldOutlinedIcon />} title={t('moderation.notModerator')} />
      </Surface>
    );
  }

  return (
    <Surface>
      <PageHeader title={t('moderation.title')} subtitle={t('moderation.subtitle')} />
      <Tabs
        value={tab}
        onChange={(_, next: TabKey) => setTab(next)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab
          value="open"
          label={
            <Badge color="error" badgeContent={openCases} max={99} invisible={!openCases} sx={{ mr: 1.5 }}>
              {t('moderation.tabOpen')}
            </Badge>
          }
        />
        <Tab value="resolved" label={t('moderation.tabResolved')} />
        <Tab value="restricted" label={t('moderation.tabRestricted')} />
      </Tabs>
      {Number.isInteger(linked) && linked > 0 ? (
        <LinkedCase reportId={linked} onDone={() => setParams({})} />
      ) : tab === 'restricted' ? (
        <RestrictedList />
      ) : (
        <CaseList status={tab} />
      )}
    </Surface>
  );
}
