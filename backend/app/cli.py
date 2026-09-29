"""Management commands.

    python -m app.cli seed            # interests + house ads (safe to run repeatedly)
    python -m app.cli seed --demo     # ...plus fictional developers and posts for local development
    python -m app.cli make-admin USERNAME
"""

import argparse
import random
import sys
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Ad, Comment, Follow, Interest, Like, Post, Repost, User
from app.repositories import tags as tags_repo
from app.repositories import users as users_repo
from app.seed_data import HOUSE_ADS, INTERESTS
from app.services.auth_service import purge_expired_tokens
from app.utils.html import html_to_text, sanitize_post_html
from app.utils.time import utcnow


def seed_reference_data(db: Session) -> None:
    existing = {i.slug: i for i in db.scalars(select(Interest))}
    for position, (slug, name_en, name_ar) in enumerate(INTERESTS):
        interest = existing.get(slug) or Interest(slug=slug)
        interest.name_en, interest.name_ar, interest.position = name_en, name_ar, position
        db.add(interest)

    if db.scalar(select(Ad.id).limit(1)) is None:
        for ad in HOUSE_ADS:
            db.add(Ad(**ad))
    db.commit()


def seed_demo_data(db: Session) -> None:
    from app.demo_data import (
        DEMO_COMMENTS,
        DEMO_EMAIL_DOMAIN,
        DEMO_FOLLOWS,
        DEMO_PASSWORD,
        DEMO_POSTS,
        DEMO_REPOSTS,
        DEMO_USERS,
    )

    if users_repo.get_by_username(db, DEMO_USERS[0][0]) is not None:
        print("Demo data already present; skipping.")
        return

    interests = {i.slug: i for i in db.scalars(select(Interest))}
    password_hash = hash_password(DEMO_PASSWORD)
    now = utcnow()
    users: dict[str, User] = {}
    for index, (username, display_name, bio, location, interest_slugs) in enumerate(DEMO_USERS):
        user = users_repo.create_user(
            db, username=username, email=f"{username}@{DEMO_EMAIL_DOMAIN}", hashed_password=password_hash
        )
        user.profile.display_name = display_name
        user.profile.bio = bio
        user.profile.location = location
        user.onboarding_completed = True
        user.created_at = now - timedelta(days=40 - index)
        user.interests = [interests[slug] for slug in interest_slugs if slug in interests]
        users[username] = user
    db.flush()

    posts: list[Post] = []
    for author, days_ago, title, html, tags, link in DEMO_POSTS:
        clean = sanitize_post_html(html)
        post = Post(
            author_id=users[author].id,
            title=title,
            content_html=clean,
            content_text=html_to_text(clean),
            link_url=link,
            tags=tags_repo.get_or_create(db, tags),
            created_at=now - timedelta(days=days_ago),
        )
        post.updated_at = post.created_at
        db.add(post)
        posts.append(post)
    db.flush()

    for follower, followee in DEMO_FOLLOWS:
        db.add(Follow(follower_id=users[follower].id, followee_id=users[followee].id))

    for username, post_index, text in DEMO_COMMENTS:
        post = posts[post_index]
        db.add(
            Comment(
                post_id=post.id,
                author_id=users[username].id,
                content=text,
                created_at=post.created_at + timedelta(hours=2),
            )
        )
        post.comments_count += 1

    for username, post_index in DEMO_REPOSTS:
        post = posts[post_index]
        db.add(Repost(user_id=users[username].id, post_id=post.id, created_at=post.created_at + timedelta(hours=3)))
        post.reposts_count += 1

    rng = random.Random(7)
    usernames = list(users)
    for post in posts:
        for username in rng.sample(usernames, rng.randint(0, 6)):
            if users[username].id != post.author_id:
                db.add(Like(user_id=users[username].id, post_id=post.id))
                post.likes_count += 1

    db.commit()
    print(f"Created {len(users)} demo developers and {len(posts)} posts. Their shared password is in the README.")


def make_admin(db: Session, username: str) -> None:
    user = users_repo.get_by_username(db, username)
    if user is None:
        sys.exit(f"No user named {username!r}")
    user.is_admin = True
    db.commit()
    print(f"{user.username} is now an administrator.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    seed = sub.add_parser("seed", help="Insert reference data (interests, house ads)")
    seed.add_argument("--demo", action="store_true", help="Also create fictional demo accounts and posts")
    admin = sub.add_parser("make-admin", help="Grant administrator rights")
    admin.add_argument("username")
    sub.add_parser("purge-tokens", help="Delete ended sign-in sessions and old password reset links")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.command == "seed":
            seed_reference_data(db)
            print("Reference data is up to date.")
            if args.demo:
                seed_demo_data(db)
        elif args.command == "make-admin":
            make_admin(db, args.username)
        elif args.command == "purge-tokens":
            sessions, resets = purge_expired_tokens(db)
            print(f"Deleted {sessions} ended sessions and {resets} old password reset links.")


if __name__ == "__main__":
    main()
