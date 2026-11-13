import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("canlı satırları ve LKG banner uyarısını yasak alan sızdırmadan gösterir", async () => {
    const payload: PiyasaPano = {
      server_now: "2026-11-13T10:00:00Z",
      olcek: null,
      satirlar: [
        {
          kod: "HAS_TRY",
          ad: "Has Altın (TRY)",
          fiyat: "3185.40",
          para_birimi: "TRY",
          olcek: "GRAM",
          kaynak: "CANLI",
          guncelleme: "2026-11-13T10:00:00Z",
          banner: null,
        },
        {
          kod: "HAS_ONS_TRY",
          ad: "Has Altın (ONS)",
          fiyat: "99077.09",
          para_birimi: "TRY",
          olcek: "ONS",
          kaynak: "LKG",
          guncelleme: "2026-11-13T09:50:00Z",
          banner: "Son bilinen geçerli kur (LKG) aktif.",
        },
      ],
    };
    const spy = vi
      .spyOn(piyasaService, "getPano")
      .mockResolvedValue(payload);

    const { container } = renderWithQuery(<PiyasaPanoStrip />);

    await waitFor(() => {
      expect(screen.getByText("HAS_TRY")).toBeInTheDocument();
    });
    expect(screen.getByText("HAS_ONS_TRY")).toBeInTheDocument();
    expect(screen.getByText("CANLI")).toBeInTheDocument();
    expect(screen.getAllByText("LKG").length).toBeGreaterThanOrEqual(2);
    expect(spy).toHaveBeenCalledWith(undefined);

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("alis_marj");
    expect(text).not.toContain("satis_marj");
    expect(text).not.toContain("marj_modu");
    expect(text).not.toContain("saf_birim");
  });

  it("ölçek seçimiyle getPano(olcek) çağrılır", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(piyasaService, "getPano")
      .mockImplementation(async (olcek) => ({
        server_now: "2026-11-13T10:00:00Z",
        olcek: olcek ?? null,
        satirlar: [
          {
            kod: olcek === "KG" ? "HAS_KG_TRY" : "HAS_TRY",
            ad: "Has Altın",
            fiyat: olcek === "KG" ? "3185400.00" : "3185.40",
            para_birimi: "TRY",
            olcek: olcek ?? "GRAM",
            kaynak: "CANLI",
            guncelleme: "2026-11-13T10:00:00Z",
            banner: null,
          },
        ],
      }));

    renderWithQuery(<PiyasaPanoStrip />);

    await waitFor(() => {
      expect(screen.getByText("HAS_TRY")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "KG" }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("KG");
      expect(screen.getByText("HAS_KG_TRY")).toBeInTheDocument();
    });
  });

  it("hata durumunda Yenile butonu gösterir", async () => {
    vi.spyOn(piyasaService, "getPano").mockRejectedValue(
      new Error("Ağ hatası")
    );

    renderWithQuery(<PiyasaPanoStrip />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Piyasa panosunu yenile/i })
      ).toBeInTheDocument();
    });
  });
});
