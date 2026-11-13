"""FirmaUyelik — kullanıcı↔firma (ADR-0033 / ADR-0035 çoklu üyelik & birincil bağlam)."""

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
    birincil = models.BooleanField(
        default=False,
        help_text="Aktif oturum bağlamı (Kullanici.firma/rol senkronu).",
    )
    olusturma = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Firma üyeliği"
        verbose_name_plural = "Firma üyelikleri"
        ordering = ["-birincil", "-aktif", "-olusturma", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["kullanici", "firma"],
                name="firmauyelik_kullanici_firma_uniq",
            ),
            # ADR-0035: kullanıcı birden çok firmada aktif üyeliğe sahip olabilir;
            # yalnız bir adet birincil (oturum) bağlamı olur.
            models.UniqueConstraint(
                fields=["kullanici"],
                condition=models.Q(birincil=True),
                name="firmauyelik_tek_birincil_uyelik",
            ),
        ]

    def __str__(self) -> str:
        return f"U{self.kullanici_id}→F{self.firma_id}/{self.rol}"
