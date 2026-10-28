import GitHubIcon from '@mui/icons-material/GitHub';
import { Alert, Button, Stack, TextField } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/errors';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
export function GitHubButton({ link = false }: { link?: boolean }) {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const [password, setPassword] = useState('');
  const config = useQuery({ queryKey: ['public-config'], queryFn: authApi.config });
  const start = useMutation({
    mutationFn: () => authApi.githubStart(language, link ? password : undefined),
    onSuccess: (data) => window.location.assign(data.url),
  });
  if (!config.data?.github_enabled) return null;
  return (
    <Stack spacing={2} sx={{ my: 2 }}>
      {link && (
        <TextField
          type="password"
          autoComplete="current-password"
          label={t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
      {start.isError && <Alert severity="error">{errorMessage(start.error, t)}</Alert>}
      <Button
        variant="outlined"
        startIcon={<GitHubIcon />}
        loading={start.isPending}
        disabled={link && !password}
        onClick={() => start.mutate()}
      >
        {t(link ? 'community.linkGitHub' : 'community.githubLogin')}
      </Button>
    </Stack>
  );
}
