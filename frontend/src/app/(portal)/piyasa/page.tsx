import { PiyasaPanoPage } from "@/features/piyasa";

/**
 * Portal canlı piyasa — shell padding iptal; viewport yüksekliğine sığdır.
 * Üst başlık Header'da; sayfa içinde tekrar "Canlı Piyasa" yok.
 */
export default function PiyasaRoutePage() {
  return (
    <div className="-m-6 flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden md:-m-8">
      <PiyasaPanoPage />
    </div>
  );
}
