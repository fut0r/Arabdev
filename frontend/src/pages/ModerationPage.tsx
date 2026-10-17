import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import Badge from '@mui/material/Badge';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { PageHeader, Surface } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOpenReports } from '@/layouts/navItems';
import { useSeo } from '@/utils/seo';
import { CaseList, LinkedCase, RestrictedList } from '@/features/moderation/CaseLists';

type TabKey = 'open' | 'resolved' | 'restricted';
const TABS: TabKey[] = ['open', 'resolved', 'restricted'];

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
