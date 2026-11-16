import { OpsPiyasaAyarPanel } from "@/features/piyasa";

export default function PiyasaAyarlariPage() {
  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">
          Canlı Piyasa Ayarları
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Bağlantı testi · canlı/elle fiyat · ekran/şerit görünürlüğü.
        </p>
      </div>
      <OpsPiyasaAyarPanel />
    </div>
  );
}
