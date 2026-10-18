import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import { Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router';

import { LoadingState } from '@/components/LoadingState';
import { Logo } from '@/components/Logo';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { HumanCheck } from '@/features/security/HumanCheck';
import { HOME_PATH } from '@/site';

function Splash() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Box sx={{ width: 180, textAlign: 'center' }}>
        <Logo size={40} to={null} />
        <LinearProgress sx={{ mt: 3, height: 3, borderRadius: 2 }} />
      </Box>
    </Box>
  );
}

function SessionGate() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  return (
    <Suspense fallback={<LoadingState minHeight={400} />}>
      <Outlet />
    </Suspense>
  );
}

/** Root route: providers that need the router (auth navigates on sign-out). */
export function RootRoute() {
  return (
    <AuthProvider>
      <ScrollRestoration />
      <SessionGate />
      <HumanCheck />
    </AuthProvider>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }
  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') ? from : HOME_PATH} replace />;
  }
  return children;
}
