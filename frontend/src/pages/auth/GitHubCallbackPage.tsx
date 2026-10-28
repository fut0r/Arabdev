import { Alert, Button } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { VerifyCode } from '@/features/auth/VerifyCode';
import { LoadingState } from '@/components/LoadingState';
import { useAppearance } from '@/features/preferences/useAppearance';
import type { Challenge } from '@/types/api';
export default function GitHubCallbackPage() {
  const { t } = useTranslation();
  const { status, acceptTokens, verifyCode, resendCode } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { setAppearance, setLanguage, setMode } = useAppearance();
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (status === 'loading' || started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    window.history.replaceState(null, '', '/auth/github/callback');
    if (!code || !state) {
      queueMicrotask(() => setError(t('community.githubCancelled')));
      return;
    }
    void authApi
      .githubComplete(code, state)
      .then((result) => {
        if (result.status === 'authenticated' && result.tokens) {
          client.clear();
          acceptTokens(result.tokens);
          setAppearance(result.tokens.user.settings);
          setLanguage(result.tokens.user.settings.language);
          setMode(result.tokens.user.settings.theme);
          navigate('/dashboard', { replace: true });
        } else setChallenge(result.challenge!);
      })
      .catch((e) => setError(errorMessage(e, t)));
  }, [status, acceptTokens, navigate, t, client, setAppearance, setLanguage, setMode]);
  return (
    <AuthSplitLayout>
      {error ? (
        <>
          <Alert severity="error">{error}</Alert>
          <Button component={RouterLink} to="/login">
            {t('common.signIn')}
          </Button>
        </>
      ) : challenge ? (
        <VerifyCode
          challenge={challenge}
          onVerify={async (code) => {
            await verifyCode(challenge.challenge_id, code);
            navigate('/dashboard', { replace: true });
          }}
          onResend={() => resendCode(challenge.challenge_id)}
          onCancel={() => navigate('/login')}
        />
      ) : (
        <LoadingState />
      )}
    </AuthSplitLayout>
  );
}
