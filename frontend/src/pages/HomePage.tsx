import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import PostAddOutlinedIcon from '@mui/icons-material/PostAddOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { Surface, UserAvatar } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { useCurrentUser } from '@/features/auth/AuthProvider';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { useDocumentTitle, usePageParam } from '@/hooks';
import { layout } from '@/theme/tokens';
import type { FeedTab } from '@/types/api';

const TABS: FeedTab[] = ['for_you', 'following', 'latest'];

function Composer() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'center', px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider' }}
    >
      <UserAvatar name={user.display_name} src={user.avatar_url} size={40} />
      <ButtonBase
        component={RouterLink}
        to="/create"
        sx={{
          flex: 1,
          justifyContent: 'flex-start',
          height: 44,
          px: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'surface.sunken',
          color: 'text.secondary',
          fontSize: '0.9375rem',
          '&:hover': { borderColor: 'surface.borderStrong' },
        }}
      >
        {t('feed.composerPrompt')}
      </ButtonBase>
      <Button
        component={RouterLink}
        to="/create"
        variant="contained"
        startIcon={<EditOutlinedIcon />}
        sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
      >
        {t('feed.composerAction')}
      </Button>
    </Stack>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = usePageParam();
  const { settings } = useCurrentUser();
  const requested = params.get('tab') as FeedTab | null;
  // ?tab= wins; otherwise the feed opens where Settings says it should.
  const preferred = TABS.includes(settings.default_feed) ? settings.default_feed : 'for_you';
  const tab: FeedTab = requested && TABS.includes(requested) ? requested : preferred;
  useDocumentTitle(t('feed.title'));

  const query = useQuery({
    queryKey: queryKeys.feed(tab, page),
    queryFn: () => postsApi.feed({ tab, page }),
    placeholderData: keepPreviousData,
  });

  const changeTab = (next: FeedTab) => setParams(next === preferred ? {} : { tab: next });

  const empty =
    tab === 'following' ? (
      <EmptyState
        icon={<GroupAddOutlinedIcon />}
        title={t('feed.emptyFollowingTitle')}
        description={t('feed.emptyFollowingBody')}
        action={{ label: t('feed.emptyFollowingAction'), to: '/explore' }}
      />
    ) : (
      <EmptyState
        icon={<PostAddOutlinedIcon />}
        title={t('feed.emptyTitle')}
        description={t('feed.emptyBody')}
        action={{ label: t('feed.emptyAction'), to: '/create', icon: <EditOutlinedIcon /> }}
      />
    );

  return (
    <Surface component="section" aria-label={t('feed.title')}>
      <Box
        sx={{
          position: 'sticky',
          top: layout.appBarHeight,
          zIndex: 2,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value: FeedTab) => changeTab(value)}
          variant="fullWidth"
          aria-label={t('feed.title')}
        >
          <Tab value="for_you" label={t('feed.tabForYou')} />
          <Tab value="following" label={t('feed.tabFollowing')} />
          <Tab value="latest" label={t('feed.tabLatest')} />
        </Tabs>
      </Box>
      <Composer />
      <PagedPosts query={query} page={page} onPageChange={setPage} empty={empty} withAds />
    </Surface>
  );
}
