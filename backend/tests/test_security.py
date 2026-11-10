"""トークン・IP のハッシュ化"""

from __future__ import annotations

import hashlib

from backend.app import security


def test_hash_is_sha256_separated_by_purpose() -> None:
    assert security.hash_token("abc") == hashlib.sha256(b"token:abc").digest()
    assert security.hash_ip("203.0.113.1") == hashlib.sha256(b"ip:203.0.113.1").digest()
    assert security.hash_token("abc") != security.hash_ip("abc")  # 用途ごとに別の値になる
