import { idbDelete, idbGetAllByBusiness, idbPut } from "@/lib/offline-db";
import type { DiscountType } from "@/app/business/[businessId]/pos/actions";
import type { TicketCartItemInput } from "@/app/business/[businessId]/pos/ticket-actions";

export type PendingSaleStatus = "pending" | "syncing" | "error";

export type PendingRetailSale = {
  clientRef: string;
  businessId: string;
  kind: "retail";
  createdAt: string;
  status: PendingSaleStatus;
  errorMessage?: string;
  payload: {
    cashierId: string;
    items: { productId: string; qty: number; disc: number; discType: DiscountType }[];
    paymentMethod: string;
    received: number | null;
    orderDisc: number;
    orderDiscType: DiscountType;
    customerId: string | null;
    selfOrderIds: string[];
  };
};

export type PendingTicketSale = {
  clientRef: string;
  businessId: string;
  kind: "ticket";
  createdAt: string;
  status: PendingSaleStatus;
  errorMessage?: string;
  payload: {
    cashierId: string;
    items: TicketCartItemInput[];
    paymentMethod: string;
    received: number | null;
    memberId: string | null;
  };
};

export type PendingSale = PendingRetailSale | PendingTicketSale;

export async function enqueueSale(sale: PendingSale): Promise<void> {
  await idbPut(sale);
}

export async function listPending(businessId: string): Promise<PendingSale[]> {
  const rows = await idbGetAllByBusiness<PendingSale>(businessId);
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markSyncing(sale: PendingSale): Promise<void> {
  await idbPut({ ...sale, status: "syncing", errorMessage: undefined });
}

export async function markSynced(clientRef: string): Promise<void> {
  await idbDelete(clientRef);
}

export async function markError(sale: PendingSale, message: string): Promise<void> {
  await idbPut({ ...sale, status: "error", errorMessage: message });
}

export async function discardPending(clientRef: string): Promise<void> {
  await idbDelete(clientRef);
}

// Stok server-side belum tahu apa-apa soal penjualan yang masih di antrian
// offline — kurangi tampilan stok kasir secara lokal supaya tidak menjual
// melebihi yang sebenarnya tersisa, sampai antrian ini tersinkron.
export function pendingStockDeltas(pending: PendingSale[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const sale of pending) {
    if (sale.kind !== "retail") continue;
    for (const item of sale.payload.items) {
      deltas[item.productId] = (deltas[item.productId] ?? 0) + item.qty;
    }
  }
  return deltas;
}
