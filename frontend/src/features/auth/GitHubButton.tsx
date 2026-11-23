import GitHubIcon from '@mui/icons-material/GitHub';
import { Alert, Button, Stack, TextField } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/errors';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { API_ORIGIN } from '@/site';

/**
 * The start URL comes from the API response, so it is not trusted blindly: the backend builds
 * `https://github.com/login/oauth/authorize?...`, and anything else — a compromised or spoofed
 * response pointing at a look-alike host, a `javascript:` URL, or a protocol-relative URL —
 * must not become a full-page redirect. A URL is allowed only when it is https on github.com,
 * or same-origin with the configured API base (API_ORIGIN, or the page's own origin when the
 * API is served from it).
 */
function isSafeGitHubStartUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && url.hostname === 'github.com') return true;
    const apiOrigin = API_ORIGIN ? new URL(API_ORIGIN, window.location.origin).origin : window.location.origin;
    return url.origin === apiOrigin;
  } catch {
    return false;
  }
}

export function GitHubButton({ link = false }: { link?: boolean }) {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const [password, setPassword] = useState('');
  const [startBlocked, setStartBlocked] = useState(false);
  const config = useQuery({ queryKey: ['public-config'], queryFn: authApi.config });
  const start = useMutation({
    mutationFn: () => authApi.githubStart(language, link ? password : undefined),
    onSuccess: (data) => {
      if (!isSafeGitHubStartUrl(data.url)) {
        setStartBlocked(true);
        return;
      }
      window.location.assign(data.url);
    },
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
      {startBlocked && <Alert severity="error">{t('errors.generic')}</Alert>}
      <Button
        variant="outlined"
        startIcon={<GitHubIcon />}
        loading={start.isPending}
        disabled={link && !password}
        onClick={() => {
          setStartBlocked(false);
          start.mutate();
        }}
      >
        {t(link ? 'community.linkGitHub' : 'community.githubLogin')}
      </Button>
    </Stack>
  );
}
