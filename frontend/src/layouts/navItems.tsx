import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ExploreIcon from '@mui/icons-material/Explore';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import HomeIcon from '@mui/icons-material/Home';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import PersonIcon from '@mui/icons-material/Person';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { notificationsApi } from '@/api/misc';
import { moderationApi } from '@/api/moderation';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/features/auth/AuthProvider';
import { HOME_PATH } from '@/site';

export interface NavItem {
  key: string;
  to: string;
  labelKey: string;
  icon: ReactNode;
  activeIcon: ReactNode;
  badge?: number;
  end?: boolean;
}

export function useUnreadCount(): number {
  const { status } = useAuth();
  const { data } = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    enabled: status === 'authenticated',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
  return data ?? 0;
}

/** Open report cases, for moderators only. */
export function useOpenReports(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: queryKeys.moderationSummary,
    queryFn: moderationApi.summary,
    enabled: Boolean(user?.is_admin),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });
  return data?.open_cases ?? 0;
}

export function useNavItems(): NavItem[] {
  const { user } = useAuth();
  const unread = useUnreadCount();
  const openReports = useOpenReports();
  const items: NavItem[] = [
    {
      key: 'home',
      to: HOME_PATH,
      labelKey: 'nav.home',
      icon: <HomeOutlinedIcon />,
      activeIcon: <HomeIcon />,
      end: true,
    },
    {
      key: 'explore',
      to: '/explore',
      labelKey: 'nav.explore',
      icon: <ExploreOutlinedIcon />,
      activeIcon: <ExploreIcon />,
    },
  ];
  if (!user) return items;
  return [
    ...items,
    {
      key: 'notifications',
      to: '/notifications',
      labelKey: 'nav.notifications',
      icon: <NotificationsNoneIcon />,
      activeIcon: <NotificationsIcon />,
      badge: unread,
    },
    {
      key: 'bookmarks',
      to: '/bookmarks',
      labelKey: 'nav.bookmarks',
      icon: <BookmarkBorderIcon />,
      activeIcon: <BookmarkIcon />,
    },
    {
      key: 'profile',
      to: `/u/${user.username}`,
      labelKey: 'nav.profile',
      icon: <PersonOutlineIcon />,
      activeIcon: <PersonIcon />,
    },
    {
      key: 'settings',
      to: '/settings',
      labelKey: 'nav.settings',
      icon: <SettingsOutlinedIcon />,
      activeIcon: <SettingsIcon />,
    },
    ...(user.is_admin
      ? [
          {
            key: 'moderation',
            to: '/admin/reports',
            labelKey: 'nav.moderation',
            icon: <FlagOutlinedIcon />,
            activeIcon: <FlagIcon />,
            badge: openReports,
          },
        ]
      : []),
  ];
}
