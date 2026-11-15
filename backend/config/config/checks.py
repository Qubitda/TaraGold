"""Django system checks — prod operasyonel güvenlik."""

from __future__ import annotations

import sys

from django.conf import settings
from django.core.checks import Error, Warning, register


def _running_tests() -> bool:
    return any(a == "test" or a.startswith("test") for a in sys.argv)


@register()
def check_shared_cache_for_throttle(app_configs, **kwargs):
    """DEBUG=False: LocMem yasak (ALLOW_LOCMEM_CACHE yoksa Error)."""
    if getattr(settings, "DEBUG", False) or _running_tests():
        return []
    caches = getattr(settings, "CACHES", {}) or {}
    default = caches.get("default") or {}
    backend = str(default.get("BACKEND") or "")
    if "locmem" not in backend.lower():
        return []
    if getattr(settings, "ALLOW_LOCMEM_CACHE", False):
        return [
            Warning(
                "ALLOW_LOCMEM_CACHE=1: LocMem prod'da bilerek açık "
                "(throttle limitleri worker başına).",
                id="taragold.W001",
            )
        ]
    return [
        Error(
            "CACHES default LocMemCache prod'da yasak. "
            "DatabaseCache/Redis kullanın veya ALLOW_LOCMEM_CACHE=1.",
            id="taragold.E001",
        )
    ]


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
