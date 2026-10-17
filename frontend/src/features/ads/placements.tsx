/**
 * Where ads go. Every placement rule lives here, so they are easy to read and to change.
 *
 *   Homepage   one ad after the latest posts, and a 728×90 banner on wide screens (1–2)
 *   Dashboard  in-feed ads after posts 3, 9 and 15, plus one in the sidebar (up to 4)
 *   A post     one ad between the post and its discussion
 *   Elsewhere  the sidebar ad on large screens
 *
 * Ads never outnumber posts: an in-feed ad only appears when more posts follow it. When Google
 * has nothing to show, ArabDev's own labelled ads fill the feed and sidebar slots.
 */

import useMediaQuery from '@mui/material/useMediaQuery';

import type { Ad } from '@/types/api';

import { AdCard, AdSlot } from './AdCard';
import { GoogleAd } from './GoogleAd';

/** In-feed ads go after these post numbers (1-based), and only if another post follows. */
export const FEED_AD_AFTER = [3, 9, 15];

/** Which in-feed ad, if any, follows the post at `index` (0-based) in a list of `count` posts. */
export function feedAdAfter(index: number, count: number): number | null {
  const position = FEED_AD_AFTER.indexOf(index + 1);
  return position !== -1 && index + 1 < count ? position : null;
}

/** An in-feed ad. The two feed units alternate, so neighbouring ads differ. */
export function FeedAd({ position, houseAds }: { position: number; houseAds?: Ad[] }) {
  const houseAd = houseAds?.length ? houseAds[position % houseAds.length] : undefined;
  return (
    <GoogleAd
      unit={position % 2 === 0 ? 'feed' : 'feedAlt'}
      fallback={houseAd ? <AdCard ad={houseAd} /> : null}
      sx={{ borderTop: 1, borderColor: 'divider', p: houseAd ? 0 : { xs: 1.5, sm: 2 } }}
    />
  );
}

export function SidebarAd() {
  return <GoogleAd unit="display" fallback={<AdSlot placement="sidebar" />} />;
}

/** Between a post and its discussion. */
export function ArticleAd() {
  return <GoogleAd unit="display" sx={{ px: { xs: 2, sm: 3 }, pb: 2 }} />;
}

/** The homepage's ads: one display unit, and the 728×90 banner where it fits. */
export function HomepageAd({ kind }: { kind: 'display' | 'banner' }) {
  const wide = useMediaQuery('(min-width: 800px)');
  if (kind === 'banner' && !wide) return null;
  return <GoogleAd unit={kind} />;
}
