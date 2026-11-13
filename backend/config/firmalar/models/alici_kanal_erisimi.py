"""AliciKanalErisimi — alıcı/API kanal + FiyatGrubu (ADR-0033).

Ticari şartlar `fiyatlama.FiyatSozlesmesi`’nde kalır; bu tablo erişim + varsayılan
fiyat grubu kataloğudur (çoğaltma yok).
"""

from __future__ import annotations

from django.db import models


class AliciKanalErisimi(models.Model):
    firma = models.ForeignKey(
        "firmalar.Firma",
        on_delete=models.CASCADE,
        related_name="kanal_erisimleri",
        help_text="ALICI_KUYUMCU veya API_MUSTERISI firması.",
    )
    satis_kanali = models.ForeignKey(
        "tanimlar.SatisKanali",
        on_delete=models.PROTECT,
        related_name="alici_erisimleri",
    )
    fiyat_grubu = models.ForeignKey(
        "tanimlar.FiyatGrubu",
        on_delete=models.PROTECT,
        related_name="alici_kanal_erisimleri",
    )
    aktif = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Alıcı kanal erişimi"
        verbose_name_plural = "Alıcı kanal erişimleri"
        constraints = [
            models.UniqueConstraint(
                fields=["firma", "satis_kanali"],
                name="alicikanalerisimi_firma_kanal_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"F{self.firma_id}/K{self.satis_kanali_id}"
