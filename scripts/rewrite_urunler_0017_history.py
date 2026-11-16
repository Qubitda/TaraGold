"""0017 tek dosya → üç parçaya bölündükten sonra django_migrations uyumu.

Eski kayıt: urunler.0017_varyant_ayar_metal (uygulanmış)
Yeni zincir: nullable → fill → constraints → 0018

Şema zaten uygulanmış DB'lerde: eski adı sil, üç parçayı fake-applied yaz.
Çalıştır: cd backend/config && python ../../scripts/rewrite_urunler_0017_history.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "config"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.db import transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone


OLD = "0017_varyant_ayar_metal"
NEW = [
    "0017_varyant_ayar_nullable",
    "0017_varyant_ayar_fill",
    "0017_varyant_ayar_constraints",
]


def main() -> int:
    recorder = MigrationRecorder.Migration
    with transaction.atomic():
        old_qs = recorder.objects.filter(app="urunler", name=OLD)
        had_old = old_qs.exists()
        if had_old:
            old_qs.delete()
            print(f"removed urunler.{OLD}")
        for name in NEW:
            obj, created = recorder.objects.get_or_create(
                app="urunler",
                name=name,
                defaults={"applied": timezone.now()},
            )
            print(f"{'created' if created else 'exists'} urunler.{name} applied={obj.applied}")
        if not had_old and not any(
            recorder.objects.filter(app="urunler", name=n).exists() for n in NEW
        ):
            print("WARN: neither old nor new 0017 rows found — empty DB? use migrate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
