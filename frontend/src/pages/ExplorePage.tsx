import { Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Stack, Tab, Tabs, TextField } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { communityApi } from '@/api/community';
import { PageHeader, Surface } from '@/components/common';
import { EmptyState } from '@/components/EmptyState';
import { PopularTags } from '@/features/discovery/PopularTags';
import { PagedPosts } from '@/features/posts/PagedPosts';
import { SearchBar } from '@/features/search/SearchBar';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSeo } from '@/utils/seo';
export default function ExplorePage({ projects = false }: { projects?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort = ['latest', 'trending', 'featured'].includes(params.get('sort') ?? '') ? params.get('sort')! : 'latest';
  const kind = projects
    ? 'project'
    : ['article', 'question', 'project', 'note'].includes(params.get('kind') ?? '')
      ? params.get('kind')!
      : '';
  const language = ['ar', 'en', 'mul'].includes(params.get('language') ?? '') ? params.get('language')! : '';
  const days = [0, 7, 30].includes(Number(params.get('days'))) ? Number(params.get('days')) : 0;
  const unanswered = kind === 'question' && params.get('unanswered') === 'true';
  const change = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      if (key !== 'page') next.delete('page');
      return next;
    });
  const filters = {
    page,
    sort,
    kind: kind || undefined,
    language: language || undefined,
    days: sort === 'trending' ? days : 0,
    unanswered,
  };
  const query = useQuery({
    queryKey: ['browse', filters],
    queryFn: () => communityApi.browse(filters),
    placeholderData: keepPreviousData,
  });
  const followed = useQuery({
    queryKey: ['followed-tags'],
    queryFn: communityApi.followedTags,
    enabled: Boolean(user),
  });
  useSeo({
    title: t(projects ? 'community.projects' : 'explore.title'),
    canonical: projects ? '/projects' : '/explore',
  });
  return (
    <Stack spacing={2}>
      <Surface>
        <PageHeader title={t(projects ? 'community.projects' : 'explore.title')} />
        <Stack spacing={2} sx={{ p: 2 }}>
          <SearchBar />
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button component={RouterLink} to="/developers">
              {t('community.developers')}
            </Button>
            <Button component={RouterLink} to={projects ? '/explore' : '/projects'}>
              {t(projects ? 'explore.title' : 'community.projects')}
            </Button>
          </Stack>
          <PopularTags limit={8} />
          {!!followed.data?.length && (
            <Box>
              <Box sx={{ mb: 1 }}>{t('community.followedTags')}</Box>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {followed.data.map((tag) => (
                  <Chip
                    key={tag.slug}
                    component={RouterLink}
                    to={`/tags/${tag.slug}`}
                    clickable
                    label={`#${tag.name}`}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Surface>
      <Surface>
        <Tabs
          value={sort}
          onChange={(_, value: string) => change('sort', value)}
          variant="fullWidth"
          aria-label={t('explore.title')}
        >
          {['latest', 'trending', 'featured'].map((value) => (
            <Tab key={value} value={value} label={t(`community.${value}`)} />
          ))}
        </Tabs>
        <Stack sx={{ p: 2, gap: 2, flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap' }}>
          {!projects && (
            <TextField
              select
              label={t('community.allKinds')}
              value={kind}
              onChange={(e) => change('kind', e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">{t('community.allKinds')}</MenuItem>
              {['article', 'question', 'project', 'note'].map((k) => (
                <MenuItem key={k} value={k}>
                  {t(`community.${k}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label={t('community.allLanguages')}
            value={language}
            onChange={(e) => change('language', e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">{t('community.allLanguages')}</MenuItem>
            {['ar', 'en', 'mul'].map((k) => (
              <MenuItem key={k} value={k}>
                {t(`community.${k}`)}
              </MenuItem>
            ))}
          </TextField>
          {sort === 'trending' && (
            <TextField
              select
              label={t('community.trending')}
              value={days}
              onChange={(e) => change('days', e.target.value)}
            >
              {[
                [0, 'allTime'],
                [7, 'week'],
                [30, 'month'],
              ].map(([v, k]) => (
                <MenuItem key={v} value={v}>
                  {t(`community.${k}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
          {kind === 'question' && (
            <FormControlLabel
              control={
                <Checkbox checked={unanswered} onChange={(e) => change('unanswered', String(e.target.checked))} />
              }
              label={t('community.unanswered')}
            />
          )}
        </Stack>
        <PagedPosts
          query={query}
          page={page}
          onPageChange={(v) => change('page', String(v))}
          empty={<EmptyState icon={null} compact title={t('community.empty')} />}
        />
      </Surface>
    </Stack>
  );
}
