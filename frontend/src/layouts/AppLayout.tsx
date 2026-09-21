import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useMatches } from 'react-router';

import { LoadingState } from '@/components/LoadingState';
import { useAuth } from '@/features/auth/AuthProvider';
import { OnboardingDialog } from '@/features/onboarding/OnboardingDialog';
import type { RouteHandle } from '@/router';
import { layout } from '@/theme/tokens';

import { MobileNavigation } from './MobileNavigation';
import { Navbar } from './Navbar';
import { RightSidebar } from './RightSidebar';
import { Sidebar } from './Sidebar';

/**
 *  ┌──────────┬───────────────────┬────────────┐
 *  │ Sidebar  │ main (dominant)   │ RightSidebar│   lg+
 *  ├──────────┼───────────────────┴────────────┤
 *  │ icon rail│ main                           │   md
 *  ├──────────┴────────────────────────────────┤
 *  │ main + bottom navigation                  │   xs–sm
 */
export function AppLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const matches = useMatches();
  const wide = matches.some((match) => (match.handle as RouteHandle | undefined)?.wide);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        pb: { xs: `calc(${layout.mobileNavHeight + 8}px + env(safe-area-inset-bottom))`, md: 0 },
      }}
    >
      <Link
        href="#main"
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: (theme) => theme.zIndex.tooltip,
          bgcolor: 'background.paper',
          px: 2,
          py: 1,
          borderRadius: 1,
          '&:focus': { top: 8 },
        }}
      >
        {t('common.skipToContent')}
      </Link>

      <Navbar />

      <Box
        sx={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          mx: 'auto',
          px: { xs: 0, sm: 2, lg: 3 },
          display: 'flex',
          gap: { md: 2, lg: 3 },
          alignItems: 'flex-start',
        }}
      >
        <Sidebar />
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            flex: 1,
            minWidth: 0,
            py: { xs: 0, sm: 2 },
            maxWidth: wide ? 'none' : { lg: layout.feedMaxWidth },
            '&:focus': { outline: 'none' },
          }}
        >
          <Suspense fallback={<LoadingState minHeight={400} />}>
            <Outlet />
          </Suspense>
        </Box>
        {!wide && <RightSidebar />}
      </Box>

      <MobileNavigation />
      {user && !user.onboarding_completed && <OnboardingDialog />}
    </Box>
  );
}
