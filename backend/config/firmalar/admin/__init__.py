"""Admin kayıtlarını alt modüllerden yükler."""

from .firma_admin import (
    AliciKanalErisimiAdmin,
    FirmaAdmin,
    FirmaAdresiAdmin,
    FirmaAdresiInline,
    FirmaBankaHesabiAdmin,
    FirmaBankaHesabiInline,
    FirmaKontakAdmin,
    FirmaUyelikAdmin,
    TedarikciKanalIzniAdmin,
)
from .kullanici_admin import KullaniciAdmin
from . import firma_invite_admin  # noqa: F401 — FirmaInvite register
from . import org_admin  # noqa: F401 — OrgBirimi/OrgUyeligi register
