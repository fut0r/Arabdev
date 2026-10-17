import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PhonelinkLockOutlinedIcon from '@mui/icons-material/PhonelinkLockOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/errors';
import { usersApi } from '@/api/users';
import { useNotify } from '@/components/Notifier';
import { useAuth, useCurrentUser } from '@/features/auth/AuthProvider';
import { PasswordField } from '@/features/auth/PasswordField';
import type { TwoFactorSetup } from '@/types/api';

type Step =
  | { name: 'closed' }
  | { name: 'password'; next: 'setup' | 'codes' }
  | { name: 'scan'; setup: TwoFactorSetup }
  | { name: 'codes'; codes: string[] }
  | { name: 'disable' };

/** "ABCD EFGH ..." is far easier to type into a phone than one long run of letters. */
function grouped(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const text = codes.join('\n');

  const download = () => {
    const url = URL.createObjectURL(new Blob([`ArabDev recovery codes\n\n${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'arabdev-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack spacing={2}>
      <Alert severity="warning">{t('twoFactor.codesWarning')}</Alert>
      <Box
        component="ol"
        dir="ltr"
        sx={{
          m: 0,
          p: 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
          listStylePosition: 'inside',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '1rem',
          bgcolor: 'surface.sunken',
          borderRadius: 2,
        }}
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </Box>
      <Stack direction="row" spacing={1}>
        <Button
          startIcon={<ContentCopyOutlinedIcon />}
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => notify(t('twoFactor.copied')),
              () => undefined,
            )
          }
        >
          {t('twoFactor.copy')}
        </Button>
        <Button startIcon={<DownloadOutlinedIcon />} onClick={download}>
          {t('twoFactor.download')}
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Two-step sign-in with an authenticator app: set it up (password, scan, first code), see the
 * recovery codes once, make new ones, or turn it off.
 */
export function TwoFactorSettings() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const notify = useNotify();
  const titleId = useId();
  const [step, setStep] = useState<Step>({ name: 'closed' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    setStep({ name: 'closed' });
    setPassword('');
    setCode('');
    setError(null);
  };

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure, t));
    } finally {
      setPending(false);
    }
  };

  const refreshMe = async () => setUser(await usersApi.me());

  const submitPassword = (next: 'setup' | 'codes') =>
    run(async () => {
      if (next === 'setup') {
        setStep({ name: 'scan', setup: await usersApi.twoFactorSetup(password) });
      } else {
        setStep({ name: 'codes', codes: await usersApi.newRecoveryCodes(password) });
        await refreshMe();
      }
      setPassword('');
    });

  const turnOn = () =>
    run(async () => {
      const codes = await usersApi.twoFactorEnable(code);
      setCode('');
      setStep({ name: 'codes', codes });
      await refreshMe();
      notify(t('twoFactor.enabled'));
    });

  const turnOff = () =>
    run(async () => {
      await usersApi.twoFactorDisable(password, code);
      await refreshMe();
      close();
      notify(t('twoFactor.disabled'));
    });

  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, py: 1.25 }}>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 500 }}>{t('twoFactor.title')}</Typography>
            <Chip
              size="small"
              color={user.two_factor_enabled ? 'success' : 'default'}
              label={user.two_factor_enabled ? t('twoFactor.on') : t('twoFactor.off')}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {user.two_factor_enabled
              ? t('twoFactor.codesLeft', { count: user.recovery_codes_left })
              : t('twoFactor.help')}
          </Typography>
        </Box>
        {user.two_factor_enabled ? (
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setStep({ name: 'password', next: 'codes' })}>{t('twoFactor.newCodes')}</Button>
            <Button color="error" onClick={() => setStep({ name: 'disable' })}>
              {t('twoFactor.turnOff')}
            </Button>
          </Stack>
        ) : (
          <Button
            variant="contained"
            startIcon={<PhonelinkLockOutlinedIcon />}
            onClick={() => setStep({ name: 'password', next: 'setup' })}
          >
            {t('twoFactor.setUp')}
          </Button>
        )}
      </Stack>

      <Dialog
        open={step.name !== 'closed'}
        onClose={pending || step.name === 'codes' ? undefined : close}
        aria-labelledby={titleId}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id={titleId} sx={{ fontFamily: 'var(--ad-font-heading)', fontWeight: 600 }}>
          {step.name === 'codes'
            ? t('twoFactor.codesTitle')
            : step.name === 'disable'
              ? t('twoFactor.turnOffTitle')
              : t('twoFactor.title')}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {step.name === 'password' && (
            <Stack spacing={2}>
              <Typography color="text.secondary">{t('twoFactor.passwordFirst')}</Typography>
              <PasswordField
                label={t('settings.currentPassword')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                fullWidth
              />
            </Stack>
          )}

          {step.name === 'scan' && (
            <Stack spacing={2} sx={{ alignItems: 'center' }}>
              <Typography color="text.secondary">{t('twoFactor.scan')}</Typography>
              <Box
                component="img"
                src={step.setup.qr_code}
                alt={t('twoFactor.qrAlt')}
                width={200}
                height={200}
                sx={{ borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: '#fff' }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'stretch' }}>
                {t('twoFactor.cantScan')}
              </Typography>
              <Box
                dir="ltr"
                sx={{
                  alignSelf: 'stretch',
                  p: 1.5,
                  textAlign: 'center',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  letterSpacing: '0.05em',
                  bgcolor: 'surface.sunken',
                  borderRadius: 2,
                  wordBreak: 'break-all',
                }}
              >
                {grouped(step.setup.secret)}
              </Box>
              <TextField
                label={t('twoFactor.firstCode')}
                value={code}
                onChange={(event) => setCode(digits(event.target.value))}
                fullWidth
                slotProps={{
                  htmlInput: {
                    dir: 'ltr',
                    inputMode: 'numeric',
                    autoComplete: 'one-time-code',
                    style: { textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.4em', fontWeight: 700 },
                  },
                }}
              />
            </Stack>
          )}

          {step.name === 'codes' && <RecoveryCodes codes={step.codes} />}

          {step.name === 'disable' && (
            <Stack spacing={2}>
              <Typography color="text.secondary">{t('twoFactor.turnOffHelp')}</Typography>
              <PasswordField
                label={t('settings.currentPassword')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                fullWidth
              />
              <TextField
                label={t('twoFactor.codeOrRecovery')}
                value={code}
                onChange={(event) => setCode(event.target.value.trim().slice(0, 11))}
                fullWidth
                slotProps={{ htmlInput: { dir: 'ltr', autoComplete: 'one-time-code', autoCapitalize: 'none' } }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {step.name === 'codes' ? (
            <Button variant="contained" onClick={close}>
              {t('twoFactor.saved')}
            </Button>
          ) : (
            <>
              <Button onClick={close} disabled={pending} color="inherit">
                {t('common.cancel')}
              </Button>
              {step.name === 'password' && (
                <Button
                  variant="contained"
                  loading={pending}
                  disabled={!password}
                  onClick={() => void submitPassword(step.next)}
                >
                  {t('common.continue')}
                </Button>
              )}
              {step.name === 'scan' && (
                <Button
                  variant="contained"
                  loading={pending}
                  disabled={code.length !== 6}
                  onClick={() => void turnOn()}
                >
                  {t('twoFactor.turnOn')}
                </Button>
              )}
              {step.name === 'disable' && (
                <Button
                  variant="contained"
                  color="error"
                  loading={pending}
                  disabled={!password || code.length < 6}
                  onClick={() => void turnOff()}
                >
                  {t('twoFactor.turnOff')}
                </Button>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
