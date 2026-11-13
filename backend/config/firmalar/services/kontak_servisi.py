"""FirmaKontak yardımcıları (ADR-0033)."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction

from firmalar import roles
from firmalar.models import FirmaKontak
from firmalar.services.uyelik_servisi import upsert_uyelik

User = get_user_model()


def kullaniciya_cevir(
    *,
    kontak: FirmaKontak,
    username: str,
    password: str,
    rol: str = roles.FIRMA_ADMIN,
) -> User:
    """Kontaktan kullanıcı oluştur — otomatik bağ yok; açık çağrı."""
    if not kontak.eposta:
        raise ValidationError({"eposta": "Kontak e-postası zorunlu."})
    username = (username or "").strip()
    if not username:
        raise ValidationError({"username": "Kullanıcı adı zorunlu."})
    if User.objects.filter(username__iexact=username).exists():
        raise ValidationError({"username": "Kullanıcı adı kullanımda."})

    with transaction.atomic():
        user = User(
            username=username,
            email=kontak.eposta,
            firma=kontak.firma,
            rol=rol,
            first_name=(kontak.ad_soyad or "").split(" ", 1)[0][:150],
            is_active=True,
        )
        user.set_password(password)
        user.save()
        upsert_uyelik(kullanici=user, firma=kontak.firma, rol=rol, aktif=True)
        return user
