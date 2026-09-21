"""Shapes shared by every flow that emails a six-digit code."""

from typing import Literal

from pydantic import BaseModel, Field

Purpose = Literal["register", "login", "email_change", "password_change"]


class ChallengeOut(BaseModel):
    """A code is waiting in an inbox; answer it with the challenge id."""

    challenge_id: str
    # Partly hidden, so the screen confirms which inbox to open without publishing it.
    email: str
    purpose: Purpose
    expires_in: int
    resend_in: int


class VerifyCodeIn(BaseModel):
    challenge_id: str = Field(min_length=8, max_length=64)
    code: str = Field(min_length=4, max_length=12)


class ChallengeIn(BaseModel):
    challenge_id: str = Field(min_length=8, max_length=64)
