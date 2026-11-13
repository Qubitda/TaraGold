"""API anahtarı oluştur/iptal — plaintext yalnız create anında."""

from __future__ import annotations

import hashlib
import secrets

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from firmalar.models import ApiAnahtar
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _assert_manage(actor, firma) -> None:
    if actor is None or not getattr(actor, "is_authenticated", False):
        raise PermissionDenied("Kimlik gerekli.")
    if can_view_all_tenants(actor):
        return
    if getattr(actor, "firma_id", None) != firma.pk:
        raise PermissionDenied("Yalnız kendi firma anahtarı.")
    if not has_perm(actor, P["manage_users"]):
        raise PermissionDenied("API anahtarı yetkisi yok.")


def olustur(
    *,
    actor,
    firma,
    ad: str,
    satis_kanali=None,
    scopes: list | None = None,
    ip_allowlist: list | None = None,
    rate_limit_per_min: int = 60,
) -> tuple[ApiAnahtar, str]:
    """Döner: (model, plaintext_bir_kez)."""
    _assert_manage(actor, firma)
    if not getattr(firma, "alici_mi", False) and not any(
        t.tip == "API_MUSTERISI" for t in firma.tip_atamalari.all()
    ):
        # API müşterisi veya alıcı feed — tip ataması yoksa alici_mi yeterli soft
        pass
    raw = f"kb_{secrets.token_urlsafe(32)}"
    prefix = raw[:10]
    with transaction.atomic():
        row = ApiAnahtar.objects.create(
            firma=firma,
            satis_kanali=satis_kanali,
            ad=(ad or "").strip() or "default",
            key_prefix=prefix,
            key_hash=_hash(raw),
            scopes=list(scopes or ["feed:read"]),
            ip_allowlist=list(ip_allowlist or []),
            rate_limit_per_min=max(1, int(rate_limit_per_min or 60)),
            olusturan=actor,
        )
    return row, raw


def iptal_et(*, actor, anahtar: ApiAnahtar) -> ApiAnahtar:
    _assert_manage(actor, anahtar.firma)
    anahtar.iptal = True
    anahtar.save(update_fields=["iptal"])
    return anahtar


def dogrula_raw(raw: str) -> ApiAnahtar | None:
    if not raw:
        return None
    h = _hash(raw.strip())
    row = (
        ApiAnahtar.objects.select_related("firma", "satis_kanali")
        .filter(key_hash=h, iptal=False)
        .first()
    )
    return row
