"""Two-factor sign-in with an authenticator app."""

from pydantic import BaseModel, Field


class PasswordConfirm(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class TwoFactorSetupOut(BaseModel):
    # Shown once, so the account holder can type it into an app that cannot scan.
    secret: str
    otpauth_uri: str
    # An SVG data URI of the same URI as a QR code.
    qr_code: str


class TwoFactorCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=12)


class TwoFactorDisableIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=12)


class RecoveryCodesOut(BaseModel):
    """One-time codes, shown only now. Each signs in once without the app."""

    recovery_codes: list[str]
