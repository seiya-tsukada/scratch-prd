"""パスワードのハッシュ化（Argon2id）と強度の確認"""

from __future__ import annotations

from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from backend.app import config

# argon2-cffi の既定値（RFC 9106 の低メモリ設定: m=64MiB, t=3, p=4）。OWASP の最低基準を上回る
_hasher = PasswordHasher()

# よく使われるパスワード（長さの条件を満たしていても拒否する）
COMMON_PASSWORDS = frozenset(
    {
        "1234567890",
        "12345678910",
        "0123456789",
        "1111111111",
        "0000000000",
        "qwertyuiop",
        "qwerty1234",
        "1q2w3e4r5t",
        "1qaz2wsx3edc",
        "password12",
        "password123",
        "password1234",
        "passw0rd123",
        "iloveyou12",
        "abcdefghij",
        "abcd123456",
        "abc1234567",
        "letmein123",
        "welcome123",
        "admin12345",
        "administrator",
        "changeme123",
        "asdfghjkl1",
        "zaq12wsxcde",
    }
)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@lru_cache
def _dummy_hash() -> str:
    return _hasher.hash("dummy-password-for-timing")


def verify_dummy(password: str) -> None:
    """存在しないメールアドレスでも同じだけ時間をかけ、応答時間から登録の有無を推測させない"""
    verify_password(_dummy_hash(), password)


def password_problem(password: str) -> str | None:
    """パスワードが条件を満たさなければ理由（英語の短い説明）を返す"""
    if len(password) < config.MIN_PASSWORD_CHARS:
        return f"Password must be at least {config.MIN_PASSWORD_CHARS} characters"
    if len(password) > config.MAX_PASSWORD_CHARS:
        return f"Password must be at most {config.MAX_PASSWORD_CHARS} characters"
    if password.lower() in COMMON_PASSWORDS or len(set(password)) < 3:
        return "Password is too common"
    return None
