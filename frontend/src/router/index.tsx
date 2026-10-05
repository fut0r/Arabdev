import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';

import { AppLayout } from '@/layouts/AppLayout';
import { HOME_PATH } from '@/site';

import { GuestOnly, RequireAuth, RootRoute } from './guards';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const TagPage = lazy(() => import('@/pages/TagPage'));
const PostPage = lazy(() => import('@/pages/PostPage'));
const EditorPage = lazy(() => import('@/pages/EditorPage'));
const DraftsPage = lazy(() => import('@/pages/DraftsPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const FollowListPage = lazy(() => import('@/pages/FollowListPage'));
const EditProfilePage = lazy(() => import('@/pages/EditProfilePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ModerationPage = lazy(() => import('@/pages/ModerationPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));

/** Pages marked wide use the right-hand column too (no sidebar). */
export interface RouteHandle {
  wide?: boolean;
}

const wide: RouteHandle = { wide: true };

export const router = createBrowserRouter([
  {
    element: <RootRoute />,
    children: [
      // arabdev.site/ is the public homepage, for visitors and signed-in members alike.
      { index: true, element: <LandingPage /> },
      {
        path: '/login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: '/register',
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <AppLayout />,
        children: [
          {
            path: HOME_PATH.slice(1),
            element: (
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            ),
          },
          { path: 'explore', element: <ExplorePage /> },
          { path: 'about', element: <AboutPage /> },
          { path: 'contact', element: <ContactPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'tags/:slug', element: <TagPage /> },
          { path: 'posts/:postId', element: <PostPage /> },
          {
            path: 'posts/:postId/edit',
            element: (
              <RequireAuth>
                <EditorPage />
              </RequireAuth>
            ),
            handle: wide,
          },
          {
            path: 'create',
            element: (
              <RequireAuth>
                <EditorPage />
              </RequireAuth>
            ),
            handle: wide,
          },
          {
            path: 'drafts',
            element: (
              <RequireAuth>
                <DraftsPage />
              </RequireAuth>
            ),
          },
          {
            path: 'drafts/:draftId',
            element: (
              <RequireAuth>
                <EditorPage />
              </RequireAuth>
            ),
            handle: wide,
          },
          {
            path: 'notifications',
            element: (
              <RequireAuth>
                <NotificationsPage />
              </RequireAuth>
            ),
          },
          {
            path: 'bookmarks',
            element: (
              <RequireAuth>
                <BookmarksPage />
              </RequireAuth>
            ),
          },
          {
            path: 'profile/edit',
            element: (
              <RequireAuth>
                <EditProfilePage />
              </RequireAuth>
            ),
            handle: wide,
          },
          { path: 'settings', element: <Navigate to="/settings/account" replace /> },
          {
            path: 'settings/:section',
            element: (
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            ),
            handle: wide,
          },
          { path: 'admin', element: <Navigate to="/admin/reports" replace /> },
          {
            path: 'admin/reports',
            element: (
              <RequireAuth>
                <ModerationPage />
              </RequireAuth>
            ),
            handle: wide,
          },
          { path: 'u/:username', element: <ProfilePage /> },
          { path: 'u/:username/:list', element: <FollowListPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
