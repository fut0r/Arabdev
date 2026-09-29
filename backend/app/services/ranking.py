"""How the "For you" feed and the trending list decide what comes first.

Both work on a bounded set of recent posts, score each one in Python and then page through the
result. That keeps the rules readable and identical on SQLite and PostgreSQL, and for a
community of this size the candidate set (a few hundred posts) is cheap to score per request.

For you
-------
    score = affinity x quality x freshness

* affinity: how close the post is to you. It starts at 1 and grows when you follow the author,
  when its tags match your interests, when you have liked or commented on the author's posts
  recently, and when people you follow liked, reposted or commented on it.
* quality: log2(2 + likes + 2 x comments + 3 x reposts). Discussion and sharing count for more
  than a like, and the logarithm keeps one viral post from drowning everything else.
* freshness: 1 / (hours since posting + 2) ^ 1.4, so new posts rise and old ones sink smoothly
  rather than dropping off a cliff at midnight.

Your own posts and posts you already liked are damped, since you have seen them. Finally the
list is spread out so no author takes more than two of any five neighbouring places.

Trending
--------
    score = (likes + 2 x comments + 3 x reposts) / (hours since posting + 2) ^ 1.5

over the last week: what is gathering attention fastest right now, not what has piled up the
most over seven days.
"""

import math
from collections import Counter, deque
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Comment, Follow, Like, Post, Repost, Tag, User, post_tags, user_interests
from app.repositories.posts import visible
from app.utils.time import utcnow

CANDIDATE_DAYS = 30
MAX_CANDIDATES = 600
AFFINITY_WINDOW = timedelta(days=90)
GRAVITY = 1.4
TRENDING_GRAVITY = 1.5
TRENDING_DAYS = 7

# How much each signal adds to affinity, and the most it can add.
WEIGHT_FOLLOWED = 2.0
WEIGHT_INTEREST = 1.0
MAX_INTEREST_MATCHES = 2
WEIGHT_AUTHOR_HISTORY = 0.5
MAX_AUTHOR_HISTORY = 4
WEIGHT_SOCIAL = 0.6
MAX_SOCIAL = 5
OWN_POST_FACTOR = 0.35
ALREADY_LIKED_FACTOR = 0.7

# No author may take more than MAX_PER_WINDOW of any DIVERSITY_WINDOW neighbouring places.
DIVERSITY_WINDOW = 5
MAX_PER_WINDOW = 2


def engagement(post: Post) -> int:
    return post.likes_count + 2 * post.comments_count + 3 * post.reposts_count


def _hours_since(moment: datetime, now: datetime) -> float:
    return max((now - moment).total_seconds() / 3600, 0.0)


def _candidates(db: Session, now: datetime) -> list[Post]:
    """Recent visible posts, topped up with older ones when the last month was quiet."""
    recent = list(
        db.scalars(
            select(Post)
            .where(visible(), Post.created_at >= now - timedelta(days=CANDIDATE_DAYS))
            .order_by(Post.created_at.desc(), Post.id.desc())
            .limit(MAX_CANDIDATES)
        ).unique()
    )
    if len(recent) < MAX_CANDIDATES:
        older = db.scalars(
            select(Post)
            .where(visible(), Post.created_at < now - timedelta(days=CANDIDATE_DAYS))
            .order_by(Post.created_at.desc(), Post.id.desc())
            .limit(MAX_CANDIDATES - len(recent))
        ).unique()
        recent.extend(older)
    return recent


def _counts(db: Session, stmt) -> dict[int, int]:
    return {key: count for key, count in db.execute(stmt).all()}


def diversify(posts: list[Post]) -> list[Post]:
    """Reorder so that no author crowds a stretch of the feed, keeping the ranking otherwise."""
    result: list[Post] = []
    waiting: deque[Post] = deque()
    pending = deque(posts)

    def fits(post: Post) -> bool:
        recent = result[-(DIVERSITY_WINDOW - 1):]
        return sum(1 for other in recent if other.author_id == post.author_id) < MAX_PER_WINDOW

    while pending or waiting:
        placed = False
        # Posts held back earlier go first as soon as they fit again.
        for _ in range(len(waiting)):
            post = waiting.popleft()
            if fits(post):
                result.append(post)
                placed = True
                break
            waiting.append(post)
        if placed:
            continue
        if pending:
            post = pending.popleft()
            if fits(post):
                result.append(post)
            else:
                waiting.append(post)
        else:
            # Only crowded authors are left: place them rather than drop them.
            result.append(waiting.popleft())
    return result


def for_you(db: Session, viewer: User) -> list[Post]:
    now = utcnow()
    posts = _candidates(db, now)
    if not posts:
        return []
    ids = [post.id for post in posts]

    followed = set(db.scalars(select(Follow.followee_id).where(Follow.follower_id == viewer.id)))
    interest_matches = _counts(
        db,
        select(post_tags.c.post_id, func.count())
        .join(Tag, Tag.id == post_tags.c.tag_id)
        .where(
            post_tags.c.post_id.in_(ids),
            Tag.interest_id.in_(select(user_interests.c.interest_id).where(user_interests.c.user_id == viewer.id)),
        )
        .group_by(post_tags.c.post_id),
    )
    since = now - AFFINITY_WINDOW
    author_history = Counter(
        _counts(
            db,
            select(Post.author_id, func.count())
            .join(Like, Like.post_id == Post.id)
            .where(Like.user_id == viewer.id, Like.created_at >= since)
            .group_by(Post.author_id),
        )
    ) + Counter(
        _counts(
            db,
            select(Post.author_id, func.count())
            .join(Comment, Comment.post_id == Post.id)
            .where(Comment.author_id == viewer.id, Comment.created_at >= since)
            .group_by(Post.author_id),
        )
    )
    social: Counter[int] = Counter()
    if followed:
        for model, author_column in ((Like, Like.user_id), (Repost, Repost.user_id), (Comment, Comment.author_id)):
            social.update(
                _counts(
                    db,
                    select(model.post_id, func.count(author_column.distinct()))
                    .where(model.post_id.in_(ids), author_column.in_(list(followed)))
                    .group_by(model.post_id),
                )
            )
    liked = set(db.scalars(select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(ids))))

    def score(post: Post) -> float:
        affinity = 1.0
        if post.author_id in followed:
            affinity += WEIGHT_FOLLOWED
        affinity += WEIGHT_INTEREST * min(interest_matches.get(post.id, 0), MAX_INTEREST_MATCHES)
        affinity += WEIGHT_AUTHOR_HISTORY * min(author_history.get(post.author_id, 0), MAX_AUTHOR_HISTORY)
        affinity += WEIGHT_SOCIAL * min(social.get(post.id, 0), MAX_SOCIAL)
        quality = math.log2(2 + engagement(post))
        freshness = 1 / (_hours_since(post.created_at, now) + 2) ** GRAVITY
        value = affinity * quality * freshness
        if post.author_id == viewer.id:
            value *= OWN_POST_FACTOR
        elif post.id in liked:
            value *= ALREADY_LIKED_FACTOR
        return value

    ranked = sorted(posts, key=lambda post: (score(post), post.created_at, post.id), reverse=True)
    return diversify(ranked)


def trending(db: Session, days: int = TRENDING_DAYS) -> list[Post]:
    now = utcnow()
    posts = list(
        db.scalars(
            select(Post)
            .where(visible(), Post.created_at >= now - timedelta(days=days))
            .order_by(Post.created_at.desc())
            .limit(MAX_CANDIDATES)
        ).unique()
    )
    active = [post for post in posts if engagement(post) > 0]
    if not active:
        return []

    def velocity(post: Post) -> float:
        return engagement(post) / (_hours_since(post.created_at, now) + 2) ** TRENDING_GRAVITY

    ranked = sorted(active, key=lambda post: (velocity(post), post.created_at, post.id), reverse=True)
    # The week's posts nobody has reacted to yet follow, newest first, so the page never runs dry.
    return ranked + [post for post in posts if engagement(post) == 0]
