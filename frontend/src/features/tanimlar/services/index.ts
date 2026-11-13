import { apiFetch } from "@/lib/api/client";
import type {
  OpsDefinitionKaynak,
  OpsDefinitionRow,
  OpsDefinitionsPage,
  SalesChannel,
  SalesChannelPage,
} from "../types";

function normalizeSalesChannelPage(
  data: SalesChannelPage | SalesChannel[] | null | undefined
): SalesChannelPage {
  if (!data) return { count: 0, results: [] };
  if (Array.isArray(data)) {
    return { count: data.length, results: data };
  }
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    count: typeof data.count === "number" ? data.count : results.length,
    results,
    server_now: data.server_now,
  };
}

export const tanimlarService = {
  /** Sayfalı / sarmalanmış yanıt (yönetim ekranı). */
  async getSalesChannelsPage(): Promise<SalesChannelPage> {
    const data = await apiFetch<SalesChannelPage | SalesChannel[]>("/sales-channels/");
    return normalizeSalesChannelPage(data);
  },

  /**
   * Dizi olarak aktif satış kanalları.
   * Quote/catalog gibi tüketiciler için geriye dönük dizi API’si.
   */
  async getSalesChannels(): Promise<SalesChannel[]> {
    const page = await this.getSalesChannelsPage();
    return page.results;
  },

  listSalesChannels(): Promise<SalesChannel[]> {
    return this.getSalesChannels();
  },

  getOpsDefinitions(
    kaynak: OpsDefinitionKaynak,
    includeRefs = true
  ): Promise<OpsDefinitionsPage> {
    const q = includeRefs ? "?include_refs=1" : "";
    return apiFetch<OpsDefinitionsPage>(`/ops/definitions/${kaynak}/${q}`);
  },

  createOpsDefinition(
    kaynak: OpsDefinitionKaynak,
    body: Record<string, unknown>
  ): Promise<OpsDefinitionRow> {
    return apiFetch<OpsDefinitionRow>(`/ops/definitions/${kaynak}/`, {
      method: "POST",
      body,
    });
  },

  updateOpsDefinition(
    kaynak: OpsDefinitionKaynak,
    id: number | string,
    body: Record<string, unknown>
  ): Promise<OpsDefinitionRow> {
    return apiFetch<OpsDefinitionRow>(`/ops/definitions/${kaynak}/${id}/`, {
      method: "PATCH",
      body,
    });
  },

  deleteOpsDefinition(
    kaynak: OpsDefinitionKaynak,
    id: number | string
  ): Promise<{ deleted: boolean; id: number; kaynak: string }> {
    return apiFetch<{ deleted: boolean; id: number; kaynak: string }>(
      `/ops/definitions/${kaynak}/${id}/`,
      { method: "DELETE" }
    );
  },
};

