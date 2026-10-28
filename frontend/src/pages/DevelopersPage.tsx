import { Box, TextField, MenuItem } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { discoveryApi } from '@/api/misc';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { communityApi } from '@/api/community';
import { PageHeader, Surface, ErrorState } from '@/components/common';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { UserCard } from '@/features/users/UserCard';
import { useSeo } from '@/utils/seo';
export default function DevelopersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [interest, setInterest] = useState('');
  const { language } = usePreferences();
  const interests = useQuery({ queryKey: ['interests'], queryFn: discoveryApi.interests });
  const query = useQuery({
    queryKey: ['developers', page, q, interest],
    queryFn: () => communityApi.developers(page, q, interest || undefined),
    placeholderData: keepPreviousData,
  });
  useSeo({ title: t('community.developers'), canonical: '/developers' });
  return (
    <Surface>
      <PageHeader title={t('community.developers')} />
      <Box
        component="form"
        sx={{ p: 2 }}
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          fullWidth
          label={t('community.searchDevelopers')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        <TextField
          select
          fullWidth
          label={t('community.interest')}
          value={interest}
          onChange={(e) => {
            setInterest(e.target.value);
            setPage(1);
          }}
        >
          <MenuItem value="">{t('community.allInterests')}</MenuItem>
          {interests.data?.map((i) => (
            <MenuItem key={i.id} value={i.slug}>
              {language === 'ar' ? i.name_ar : i.name_en}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t('community.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <Box sx={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
          {query.data.items.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
          {!query.data.total && <EmptyState icon={null} title={t('community.empty')} />}
          <Pagination page={page} pages={query.data.pages} onChange={setPage} />
        </Box>
      )}
    </Surface>
  );
}
