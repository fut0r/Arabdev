import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { RelativeTime, UserAvatar } from '@/components/common';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import type { ReportCase, ReportItem, UserSummary } from '@/types/api';
import { formatFullDate } from '@/utils/format';

import { DecisionForm } from './DecisionForm';

export function Person({ user, fallback }: { user: UserSummary | null; fallback: string }) {
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

export function CaseCard({ item, onDecided }: { item: ReportCase; onDecided: () => void }) {
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
