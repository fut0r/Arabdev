import Divider from '@mui/material/Divider';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { useFeedAds } from '@/features/ads/AdCard';
import { FeedAd, feedAdAfter } from '@/features/ads/placements';
import type { Post } from '@/types/api';

import { PostCard } from './PostCard';

interface PostListProps {
  posts: Post[];
  page?: number;
  withAds?: boolean;
}

export function PostList({ posts, page = 1, withAds = false }: PostListProps) {
  const { t } = useTranslation();
  // ArabDev's own ads, used when Google has nothing for a slot.
  const houseAds = useFeedAds(page, withAds);

  return (
    <div role="feed" aria-label={t('feed.feedLabel')} aria-busy="false">
      {posts.map((post, index) => {
        const ad = withAds ? feedAdAfter(index, posts.length) : null;
        return (
          <Fragment key={`${post.id}-${post.reposted_by?.id ?? 'own'}`}>
            {index > 0 && <Divider component="div" role="presentation" />}
            <PostCard post={post} />
            {ad !== null && <FeedAd position={ad} houseAds={houseAds} />}
          </Fragment>
        );
      })}
    </div>
  );
}
