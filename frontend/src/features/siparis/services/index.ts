import { apiDownloadPost, apiFetch, newIdempotencyKey } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import type {
  BuyerCart,
  BuyerOrder,
  BulkOrderResult,
  CheckoutResult,
  SupplierHazirlamaEmri,
} from "../types";

export const siparisService = {
  getMyCart(): Promise<BuyerCart> {
    return apiFetch<BuyerCart>("/carts/me/");
  },
  getCartById(id: number | string): Promise<BuyerCart> {
    return apiFetch<BuyerCart>(`/carts/${id}/`);
  },
  addCartLine(quoteId: number, miktar: string): Promise<BuyerCart> {
    return apiFetch<BuyerCart>("/carts/me/lines/", {
      method: "POST",
      body: { quote_id: quoteId, miktar },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  updateCartLine(lineId: number, miktar: string): Promise<BuyerCart> {
    return apiFetch<BuyerCart>(`/carts/me/lines/${lineId}/`, {
      method: "PATCH",
      body: { miktar },
      idempotencyKey: newIdempotencyKey(),
    });
  },
  removeCartLine(lineId: number): Promise<void> {
    return apiFetch<void>(`/carts/me/lines/${lineId}/`, {
      method: "DELETE",
      idempotencyKey: newIdempotencyKey(),
    });
  },
  createCheckout(
    data?: {
      teslimat_adresi_id?: number;
      fatura_adresi_id?: number;
      siparis_notu?: string;
    },
    idempotencyKey?: string
  ): Promise<CheckoutResult & { id?: number }> {
    return apiFetch<CheckoutResult & { id?: number }>("/checkouts/", {
      method: "POST",
      body: {
        teslimat_adresi_id: data?.teslimat_adresi_id,
        fatura_adresi_id: data?.fatura_adresi_id,
        siparis_notu: data?.siparis_notu || "",
      },
      idempotencyKey: idempotencyKey || newIdempotencyKey(),
    });
  },
  createOrderFromCheckout(
    checkoutId: number,
    idempotencyKey?: string
  ): Promise<BuyerOrder> {
    return apiFetch<BuyerOrder>("/orders/from-checkout/", {
      method: "POST",
      body: { checkout_id: checkoutId },
      idempotencyKey: idempotencyKey || newIdempotencyKey(),
    });
  },
  /** Checkout + order zinciri — anahtar/checkout_id deneme boyunca sabit tutulabilir. */
  async checkout(data?: {
    teslimat_adresi_id?: number;
    fatura_adresi_id?: number;
    siparis_notu?: string;
    checkoutIdempotencyKey?: string;
    orderIdempotencyKey?: string;
    existingCheckoutId?: number;
  }): Promise<BuyerOrder> {
    let checkoutId = data?.existingCheckoutId;
    if (!checkoutId) {
      const result = await this.createCheckout(data, data?.checkoutIdempotencyKey);
      if (result.order_id) {
        return this.getOrderDetail(result.order_id);
      }
      checkoutId = result.checkout_id ?? result.id;
    }
    if (!checkoutId) {
      throw new Error("Checkout id alınamadı.");
    }
    return this.createOrderFromCheckout(checkoutId, data?.orderIdempotencyKey);
  },
  requoteCartLine(lineId: number): Promise<BuyerCart> {
    return apiFetch<{ cart: BuyerCart }>(`/carts/me/lines/${lineId}/`, {
      method: "POST",
      body: { action: "requote" },
      idempotencyKey: newIdempotencyKey(),
    }).then((res) => res.cart);
  },
  getOrders(params?: Record<string, string>): Promise<Paginated<BuyerOrder>> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiFetch<Paginated<BuyerOrder>>(`/orders/${query}`);
  },
  getOrderDetail(id: number | string): Promise<BuyerOrder> {
    return apiFetch<BuyerOrder>(`/orders/${id}/`);
  },
  cancelOrder(id: number | string): Promise<BuyerOrder> {
    return apiFetch<BuyerOrder>(`/orders/${id}/cancel/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  reorder(id: number | string): Promise<BuyerCart> {
    return apiFetch<BuyerCart>(`/orders/${id}/reorder/`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
  },
  createBulkOrder(data: {
    satis_kanali_id: number;
    rows?: Array<{ sku: string; miktar: string; birim?: string }>;
    csv?: string;
  }): Promise<BulkOrderResult> {
    return apiFetch<BulkOrderResult>("/bulk-orders/", {
      method: "POST",
      body: data,
      idempotencyKey: newIdempotencyKey(),
    });
  },
  async getSupplierHazirlama(): Promise<SupplierHazirlamaEmri[]> {
    const res = await apiFetch<
      SupplierHazirlamaEmri[] | { results?: SupplierHazirlamaEmri[] }
    >("/supplier/hazirlama/");
    return Array.isArray(res) ? res : (res.results ?? []);
  },
  markSupplierHazir(orderId: number | string): Promise<SupplierHazirlamaEmri> {
    return apiFetch<SupplierHazirlamaEmri>(
      `/supplier/hazirlama/${orderId}/hazir/`,
      {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }
    );
  },
  async downloadSupplierHazirlamaIrsaliye(
    orderId: number | string
  ): Promise<void> {
    await apiDownloadPost(
      `/supplier/hazirlama/${orderId}/irsaliye/`,
      {},
      `tedarikci-irsaliye-${orderId}.pdf`
    );
  },
};
