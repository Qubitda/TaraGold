"""F7-010 + ADR-0036 — Kör havuz DTO maske assert."""

from __future__ import annotations

from typing import Any

BUYER_FORBIDDEN_KEYS = frozenset(
    {
        "tedarikci_id",
        "tedarikci_firma_id",
        "supplier_id",
        "supplier_firma_id",
        "supplier_name",
        "tedarikci_ad",
        "tedarikci",
        "maliyet",
        "cost",
        "cost_price",
        "marj",
        "kanal_marj",
        "iscilik",
        "iscilik_vergisiz",
        "iscilik_override",
        "alici_kalem",
        "tedarikci_kalem",
        "hesap_girdisi",
        "alis_marj",
        "satis_marj",
        "marj_modu",
        "alis_detay",
        "satis_detay",
        "saf_birim_fiyat",
        "gozlem",
        "gozlem_id",
        "usd_try",
    }
)

SUPPLIER_FORBIDDEN_KEYS = frozenset(
    {
        "alici_ad",
        "buyer_name",
        "alici_unvan",
        "alici_firma_id",
        "buyer_id",
        "maliyet",
        "cost",
        "marj",
        "kanal_marj",
        "toplam_vergisiz",
        "snapshot_satir_tutari_vergisiz",
        "snapshot_birim_fiyat_vergisiz",
    }
)

# Geriye uyumlu birleşik set (varsayılan genel yüzey)
FORBIDDEN_KEYS = frozenset(
    {
        "tedarikci_id",
        "tedarikci_firma_id",
        "supplier_id",
        "supplier_firma_id",
        "maliyet",
        "cost",
        "cost_price",
        "alici_ad",
        "buyer_name",
        "alici_unvan",
        "supplier_name",
        "tedarikci_ad",
        "iscilik_vergisiz",
    }
)


def assert_masked(
    payload: Any, *, path: str = "$", context: str = "auto"
) -> None:
    """DTO içinde yasak anahtar yok; nested dict/list yürür."""
    if context == "buyer":
        forbidden = FORBIDDEN_KEYS | BUYER_FORBIDDEN_KEYS
    elif context == "supplier":
        forbidden = FORBIDDEN_KEYS | SUPPLIER_FORBIDDEN_KEYS
    else:
        forbidden = FORBIDDEN_KEYS

    if isinstance(payload, dict):
        for key, val in payload.items():
            lk = str(key).lower()
            if lk in forbidden:
                raise AssertionError(f"Kör havuz sızıntısı ({context}): {path}.{key}")
            assert_masked(val, path=f"{path}.{key}", context=context)
    elif isinstance(payload, (list, tuple)):
        for i, item in enumerate(payload):
            assert_masked(item, path=f"{path}[{i}]", context=context)


def strip_forbidden(
    payload: dict[str, Any], *, context: str = "auto"
) -> dict[str, Any]:
    """Savunmacı: yasak anahtarları düşür (presenter sonrası)."""
    if context == "buyer":
        forbidden = FORBIDDEN_KEYS | BUYER_FORBIDDEN_KEYS
    elif context == "supplier":
        forbidden = FORBIDDEN_KEYS | SUPPLIER_FORBIDDEN_KEYS
    else:
        forbidden = FORBIDDEN_KEYS
    return {k: v for k, v in payload.items() if str(k).lower() not in forbidden}
