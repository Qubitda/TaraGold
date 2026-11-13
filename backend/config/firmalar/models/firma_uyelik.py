"""FirmaUyelik — kullanıcı↔firma (ADR-0033). Kullanici.firma denormalize birincil."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from firmalar import roles


class FirmaUyelik(models.Model):
    kullanici = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="firma_uyelikleri",
    )
    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="uyelikler",
    )
    rol = models.CharField(max_length=30, choices=roles.ROLE_CHOICES)
    aktif = models.BooleanField(default=True)
    olusturma = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Firma üyeliği"
        verbose_name_plural = "Firma üyelikleri"
        ordering = ["-aktif", "-olusturma", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["kullanici", "firma"],
                name="firmauyelik_kullanici_firma_uniq",
            ),
            # K3: kullanıcı başına tek aktif üyelik (ileride kaldırılabilir — ADR-0033)
            models.UniqueConstraint(
                fields=["kullanici"],
                condition=models.Q(aktif=True),
                name="firmauyelik_tek_aktif_uyelik",
            ),
        ]

    def __str__(self) -> str:
        return f"U{self.kullanici_id}→F{self.firma_id}/{self.rol}"
