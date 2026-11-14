"""SMTP parola şifreli saklama — ek bağımlılık gerektirmez (HMAC-SHA256 authenticated stream cipher).

Anahtar kaynağı:
1. settings.EMAIL_ENCRYPTION_KEY (opsiyonel ortam değişkeni)
2. Yoksa settings.SECRET_KEY üzerinden PBKDF2-HMAC-SHA256 ile türetilir.

Geriye uyum: Eski `django.core.signing.dumps` formatını okuyabilir;
yeni tüm kayıtlar `enc:v1:<b64>` formatında şifrelenmiş ve bütünlük doğrulamalı saklanır.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from functools import lru_cache

from django.conf import settings
from django.core import signing

_PREFIX = "enc:v1:"
_LEGACY_SALT = "bildirim.smtp.password.v1"
_KDF_SALT = b"taragold.bildirim.smtp.encryption.v1"


def _raw_key_material() -> str:
    custom = (getattr(settings, "EMAIL_ENCRYPTION_KEY", "") or "").strip()
    if custom:
        return custom
    return str(getattr(settings, "SECRET_KEY", "") or "")


@lru_cache(maxsize=8)
def _derive_keys(secret_material: str) -> tuple[bytes, bytes]:
    if not secret_material:
        raise ValueError("SECRET_KEY veya EMAIL_ENCRYPTION_KEY tanımlı olmalıdır.")
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        secret_material.encode("utf-8"),
        _KDF_SALT,
        100_000,
        dklen=64,
    )
    return dk[:32], dk[32:]


def _keystream(enc_key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        block = hashlib.sha256(
            enc_key + nonce + counter.to_bytes(4, "big")
        ).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:length])


def seal_password(plain: str | None) -> str:
    """Parolayı authenticated encryption (`enc:v1:...`) ile şifreler."""
    if plain is None:
        return ""
    plain_str = str(plain)
    if not plain_str:
        return ""
    enc_key, mac_key = _derive_keys(_raw_key_material())
    nonce = os.urandom(16)
    pt = plain_str.encode("utf-8")
    stream = _keystream(enc_key, nonce, len(pt))
    ct = bytes(a ^ b for a, b in zip(pt, stream))
    tag = hmac.new(mac_key, b"v1" + nonce + ct, hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(nonce + tag + ct).decode("ascii")
    return f"{_PREFIX}{token}"


def unseal_password(sealed: str | None) -> str:
    """Şifreli parolayı çözer; bozuk/geçersiz veride boş string döner."""
    if not sealed:
        return ""
    raw = str(sealed)
    if raw.startswith(_PREFIX):
        try:
            blob = base64.urlsafe_b64decode(raw[len(_PREFIX) :].encode("ascii"))
            if len(blob) < 48:
                return ""
            nonce = blob[:16]
            tag = blob[16:48]
            ct = blob[48:]
            enc_key, mac_key = _derive_keys(_raw_key_material())
            expected = hmac.new(
                mac_key, b"v1" + nonce + ct, hashlib.sha256
            ).digest()
            if not hmac.compare_digest(tag, expected):
                return ""
            stream = _keystream(enc_key, nonce, len(ct))
            pt = bytes(a ^ b for a, b in zip(ct, stream))
            return pt.decode("utf-8")
        except Exception:
            return ""

    # Geriye uyum: önceki signing.dumps formatı
    try:
        return str(signing.loads(raw, salt=_LEGACY_SALT))
    except signing.BadSignature:
        return ""


def has_usable_secret() -> bool:
    return bool(_raw_key_material())
