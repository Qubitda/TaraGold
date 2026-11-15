"""B4 — org / onay sunum (maske + allowed_actions)."""

from __future__ import annotations

from django.utils import timezone

from api.masking import assert_masked
from firmalar.models import OnayTalebi, OrgBirimi, OrgUyeligi


def present_org(ob: OrgBirimi, *, can_manage: bool = False) -> dict:
    actions = []
    if can_manage and ob.aktif:
        actions.append("add_member")
    parent = getattr(ob, "parent", None)
    firma = getattr(ob, "firma", None)
    data = {
        "id": ob.pk,
        "kod": ob.kod,
        "ad": ob.ad,
        "aktif": ob.aktif,
        "parent_id": ob.parent_id,
        "parent_kod": getattr(parent, "kod", None) if parent else None,
        "parent_ad": getattr(parent, "ad", None) if parent else None,
        "firma_id": ob.firma_id,
        "firma_ad": getattr(firma, "ad", "") if firma else "",
        "allowed_actions": actions,
        "server_now": timezone.now().isoformat(),
    }
    assert_masked(data)
    return data


def present_org_member(uy: OrgUyeligi) -> dict:
    kullanici = getattr(uy, "kullanici", None)
    full_name = ""
    if kullanici is not None:
        full_name = f"{getattr(kullanici, 'first_name', '') or ''} {getattr(kullanici, 'last_name', '') or ''}".strip()
    data = {
        "id": uy.pk,
        "org_birimi_id": uy.org_birimi_id,
        "kullanici_id": uy.kullanici_id,
        "kullanici_username": getattr(kullanici, "username", "") if kullanici else "",
        "kullanici_ad_soyad": full_name,
        "olusturma_tarihi": uy.olusturma_tarihi.isoformat()
        if uy.olusturma_tarihi
        else None,
        "allowed_actions": ["view"],
        "server_now": timezone.now().isoformat(),
    }
    assert_masked(data)
    return data


def present_onay(ot: OnayTalebi, *, can_manage: bool = False) -> dict:
    # SM geçişleri public Durum sabitleriyle (servis private _TRANSITIONS yok).
    actions: list[str] = []
    if can_manage:
        if ot.durum == OnayTalebi.Durum.TASLAK:
            actions.extend(["submit", "reject"])
        elif ot.durum == OnayTalebi.Durum.BEKLEMEDE:
            actions.extend(["approve", "reject"])
    data = {
        "id": ot.pk,
        "durum": ot.durum,
        "tutar": str(ot.tutar),
        "para_birimi": ot.para_birimi,
        "gerekce": ot.gerekce or "",
        "org_birimi_id": ot.org_birimi_id,
        "order_id": ot.order_id,
        "olusturma_tarihi": ot.olusturma_tarihi.isoformat()
        if ot.olusturma_tarihi
        else None,
        "allowed_actions": actions,
        "server_now": timezone.now().isoformat(),
    }
    assert_masked(data)
    return data
