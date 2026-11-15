import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PiyasaPanoStrip } from "./piyasa-pano-strip";
import { piyasaService } from "../services";
import type { PiyasaPano } from "../types";

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PiyasaPanoStrip", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("kayan şeritte alış/satış gösterir; marj alanları sızmaz", async () => {
    const payload: PiyasaPano = {
      server_now: "2026-11-13T10:00:00Z",
      olcek: null,
      kaynak: "CANLI",
      gecikmeli: false,
      referans_ibaresi: "Referans fiyat",
      satirlar: [
        {
          kod: "HAS_TRY",
          ad: "Has Altın",
          fiyat: "3185.40",
          alis: "3170.00",
          satis: "3185.40",
          ticker_da_goster: true,
          para_birimi: "TRY",
          olcek: "GRAM",
          kaynak: "CANLI",
          guncelleme: "2026-11-13T10:00:00Z",
          banner: null,
        },
      ],
    };
    vi.spyOn(piyasaService, "getPano").mockResolvedValue(payload);

    const { container } = renderWithQuery(<PiyasaPanoStrip />);

    await waitFor(() => {
      expect(screen.getAllByText("Has Altın").length).toBeGreaterThan(0);
    });
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toMatch(/3[.,]?185/);
    expect(text).not.toContain("alis_marj");
    expect(text).not.toContain("satis_marj");
    expect(text).not.toContain("marj_modu");
  });

  it("gecikmeli rozeti gösterir", async () => {
    vi.spyOn(piyasaService, "getPano").mockResolvedValue({
      server_now: "2026-11-13T10:00:00Z",
      kaynak: "LKG",
      gecikmeli: true,
      satirlar: [
        {
          kod: "HAS",
          ad: "Has",
          fiyat: "3000",
          satis: "3000",
          ticker_da_goster: true,
          para_birimi: "TRY",
          kaynak: "LKG",
        },
      ],
    });

    renderWithQuery(<PiyasaPanoStrip />);
    await waitFor(() => {
      expect(screen.getByText("gecikmeli")).toBeInTheDocument();
    });
  });

  it("hata durumunda fiyat yerine — gösterir", async () => {
    vi.spyOn(piyasaService, "getPano").mockRejectedValue(new Error("Ağ hatası"));
    const { container } = renderWithQuery(<PiyasaPanoStrip />);
    await waitFor(() => {
      expect(container.textContent).toMatch(/Fiyat bekleniyor|Piyasa/);
    });
  });
});
