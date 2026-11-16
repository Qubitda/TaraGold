"""Django system checks — prod operasyonel güvenlik."""

from __future__ import annotations

import sys

from django.conf import settings
from django.core.checks import Error, Warning, register


def _running_tests() -> bool:
    return any(a == "test" or a.startswith("test") for a in sys.argv)


@register()
def check_shared_cache_for_throttle(app_configs, **kwargs):
    """LocMem yasak (test hariç); ALLOW_LOCMEM_CACHE yoksa Error.

    DEBUG dahil: ingest + web ayrı süreç; LocMem tick'leri paylaşmaz.
    """
    if _running_tests():
        return []
    caches = getattr(settings, "CACHES", {}) or {}
    default = caches.get("default") or {}
    backend = str(default.get("BACKEND") or "")
    if "locmem" not in backend.lower():
        return []
    if getattr(settings, "ALLOW_LOCMEM_CACHE", False):
        return [
            Warning(
                "ALLOW_LOCMEM_CACHE=1: LocMem bilerek açık "
                "(throttle/tick süreç başına; ingest↔web kopuk kalır).",
                id="taragold.W001",
            )
        ]
    return [
        Error(
            "CACHES default LocMemCache yasak (DEBUG dahil). "
            "DatabaseCache/Redis kullanın veya ALLOW_LOCMEM_CACHE=1.",
            id="taragold.E001",
        )
    ]


@register()
def check_ssl_redirect_proxy_header(app_configs, **kwargs):
    """SECURE_SSL_REDIRECT=True iken proxy header yoksa nginx döngüsü riski."""
    if _running_tests():
        return []
    if not getattr(settings, "SECURE_SSL_REDIRECT", False):
        return []
    header = getattr(settings, "SECURE_PROXY_SSL_HEADER", None)
    if header:
        return []
    return [
        Error(
            "SECURE_SSL_REDIRECT=True iken SECURE_PROXY_SSL_HEADER tanımlı değil. "
            "nginx arkasında yönlendirme döngüsü oluşur; "
            "SECURE_PROXY_SSL_HEADER=1 veya SSL redirect'i kapatın.",
            id="taragold.E003",
        )
    ]


@register()
def check_database_cache_table(app_configs, **kwargs):
    """DatabaseCache tablosu yoksa istekler 500 verir → açık Error."""
    if _running_tests():
        return []
    caches = getattr(settings, "CACHES", {}) or {}
    default = caches.get("default") or {}
    backend = str(default.get("BACKEND") or "")
    if "databasecache" not in backend.lower():
        return []
    table = str(default.get("LOCATION") or "").strip()
    if not table:
        return [
            Error(
                "DatabaseCache LOCATION boş. CACHE_LOCATION=taragold_cache ayarlayın.",
                id="taragold.E004",
            )
        ]
    try:
        from django.db import connection

        existing = set(connection.introspection.table_names())
    except Exception as exc:  # noqa: BLE001 — check sırasında DB yoksa uyar
        return [
            Warning(
                f"DatabaseCache tablo kontrolü yapılamadı: {exc}",
                id="taragold.W004",
            )
        ]
    if table not in existing:
        return [
            Error(
                f"DatabaseCache tablosu yok: {table}. "
                "Çalıştırın: python manage.py createcachetable",
                id="taragold.E004",
            )
        ]
    return []


@register()
def check_fake_providers_in_prod(app_configs, **kwargs):
    """DEBUG=False: fake ödeme/kargo yalnız ALLOW_FAKE_PROVIDERS=1 ile bilinçli.

    Canlı POS/carrier yok (elle tahsilat/takip). Staging'de fake açık kalabilir;
    prod-ish'te izinsiz fake → Error.
    """
    if getattr(settings, "DEBUG", False) or _running_tests():
        return []
    payment = (getattr(settings, "PAYMENT_PROVIDER", None) or "fake").strip().lower()
    carrier = (getattr(settings, "CARRIER_PROVIDER", None) or "fake").strip().lower()
    using_fake = payment == "fake" or carrier == "fake"
    if not using_fake:
        return []
    if getattr(settings, "ALLOW_FAKE_PROVIDERS", False):
        return [
            Warning(
                "ALLOW_FAKE_PROVIDERS=1: fake ödeme/kargo bilinçli açık "
                "(canlı POS/carrier yok; elle tahsilat/takip).",
                id="taragold.W002",
            )
        ]
    return [
        Error(
            "PAYMENT_PROVIDER/CARRIER_PROVIDER=fake iken ALLOW_FAKE_PROVIDERS=0 "
            "(DEBUG=False). Staging için ALLOW_FAKE_PROVIDERS=1 ayarlayın.",
            id="taragold.E002",
        )
    ]


@register()
def check_mfa_enforce_in_prod(app_configs, **kwargs):
    if getattr(settings, "DEBUG", False) or _running_tests():
        return []
    if getattr(settings, "MFA_ENFORCE_PLATFORM", False):
        return []
    return [
        Warning(
            "MFA_ENFORCE_PLATFORM=False: platform/act-as e-posta OTP kapalı.",
            id="taragold.W003",
        )
    ]
