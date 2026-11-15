from .varyant_fiyat import VaryantFiyat
from .servis_bedeli_kurali import ServisBedeliKurali
from .fiyat_sozlesmesi import FiyatSozlesmesi
from .fiyat_sozlesmesi_kalemi import FiyatSozlesmesiKalemi
from .price_calculation_log import PriceCalculationLog
from .price_quote import PriceQuote, PriceQuoteLine
from .price_lock import PriceLock
from .contract_release import (
    ContractReleaseConsumption,
    ContractReleaseEvent,
    ContractReleasePlan,
)
from .fiyat_batch import FiyatBatchIslek, FiyatBatchSatir
# Legacy tables (belgeler FK); üretim yolu yok
from .tedarikci_teklif import TedarikciTeklif
from .teklif_tas_maliyeti import TeklifTasMaliyeti

__all__ = [
    "VaryantFiyat",
    "ServisBedeliKurali",
    "TedarikciTeklif",
    "TeklifTasMaliyeti",
    "FiyatSozlesmesi",
    "FiyatSozlesmesiKalemi",
    "PriceCalculationLog",
    "PriceQuote",
    "PriceQuoteLine",
    "PriceLock",
    "ContractReleasePlan",
    "ContractReleaseEvent",
    "ContractReleaseConsumption",
    "FiyatBatchIslek",
    "FiyatBatchSatir",
]
