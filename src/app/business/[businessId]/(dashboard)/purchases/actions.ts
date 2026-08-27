"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { recalculateProductCostsForIngredient } from "@/lib/recalculate-product-cost";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Return value: pesan error kalau posting jurnal gagal, null kalau sukses —
// baris purchases sudah kadung tersimpan di titik pemanggilan, jadi kegagalan
// di sini hanya dilaporkan, bukan membatalkan pembelian (lihat [[mini-erp-scope]]).
export async function postPurchaseJournal(
  supabase: SupabaseServerClient,
  businessId: string,
  date: string,
  description: string,
  amount: number,
  paidAmount: number,
  debitAccountCode: string = "1-200",
): Promise<string | null> {
  const lines: { account_code: string; debit: number; credit: number }[] = [
    { account_code: debitAccountCode, debit: amount, credit: 0 },
  ];
  if (paidAmount > 0) {
    lines.push({ account_code: "1-001", debit: 0, credit: paidAmount });
  }
  const sisaUtang = amount - paidAmount;
  if (sisaUtang > 0) {
    lines.push({ account_code: "2-001", debit: 0, credit: sisaUtang });
  }
  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: lines,
    p_source: "pembelian",
  });
  return error?.message ?? null;
}

// Validasi akun beban yang dipilih untuk pembelian kategori "Lainnya" --
// harus benar-benar ada di Daftar Akun bisnis ini dan bertipe "beban" (bukan
// sembarang kode). Return pesan error kalau tidak valid, null kalau OK.
async function validateExpenseAccount(
  supabase: SupabaseServerClient,
  businessId: string,
  code: string,
): Promise<string | null> {
  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("business_id", businessId)
    .eq("code", code)
    .maybeSingle();

  if (!account) return "Akun beban tidak ditemukan.";
  if (account.type !== "beban") return "Akun yang dipilih bukan akun beban.";
  return null;
}

export type AddPurchaseState = { error: string | null; resetToken: number };

export async function addPurchase(
  businessId: string,
  prevState: AddPurchaseState,
  formData: FormData,
): Promise<AddPurchaseState> {
  const fail = (msg: string): AddPurchaseState => ({ error: msg, resetToken: prevState.resetToken });

  const supplierId = (formData.get("supplierId") as string) || null;
  const date = formData.get("date") as string;
  const dueDate = (formData.get("dueDate") as string) || null;
  const category = formData.get("category") as string;
  const note = (formData.get("note") as string)?.trim();
  const amountRaw = formData.get("amount") as string;
  const paidAmountRaw = formData.get("paidAmount") as string;
  const qtyRaw = formData.get("qty") as string;
  // Kas sudah tercatat di tempat lain (mis. sudah disetujui/dibayar lewat
  // Kas Kecil) -- entri ini cuma untuk update stok+unit cost, sama sekali
  // tidak boleh posting ke Kas & Bank/Utang Dagang, supaya kas tidak
  // tercatat dua kali untuk pengeluaran fisik yang sama.
  const stockOnly = formData.get("stockOnly") === "on";

  if (!date) {
    return fail("Tanggal wajib diisi.");
  }
  if (!["Bahan Baku", "Barang Dagang", "Lainnya"].includes(category)) {
    return fail("Kategori tidak valid.");
  }
  if (stockOnly && category === "Lainnya") {
    return fail("\"Cuma update stok\" cuma berlaku untuk kategori Bahan Baku/Barang Dagang.");
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return fail("Total pembelian harus angka lebih dari 0.");
  }

  // stockOnly selalu dianggap lunas (tidak ada konsep utang di sini -- kas
  // untuk pembelian ini sudah selesai dicatat di alur lain).
  const paidAmount = stockOnly ? amount : paidAmountRaw ? Number(paidAmountRaw) : 0;
  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    return fail("Jumlah dibayar harus angka dan tidak boleh negatif.");
  }
  if (paidAmount > amount) {
    return fail("Jumlah dibayar tidak boleh lebih besar dari total pembelian.");
  }

  const supabase = await createClient();

  // Kalau datang dari tombol "Catat sebagai Pembelian" di Permintaan Barang
  // — dibaca di awal karena juga menentukan lokasi tujuan stok untuk bisnis
  // cost-control (lihat di bawah), bukan cuma buat link balik di akhir.
  const fromAllocationId = (formData.get("fromAllocationId") as string) || null;

  let ingredientId: string | null = null;
  let productId: string | null = null;
  let itemName = "";
  let qty = 0;
  let purchaseLocationId: string | null = null;
  let expenseAccountCode: string | null = null;

  if (category === "Lainnya") {
    // Catatan cepat — tidak perlu item atau qty, stok tidak diubah
    itemName = note || "Pembelian";

    expenseAccountCode = (formData.get("expenseAccountCode") as string) || null;
    if (!expenseAccountCode) {
      return fail("Pilih akun beban untuk pembelian kategori Lainnya.");
    }
    const accountError = await validateExpenseAccount(supabase, businessId, expenseAccountCode);
    if (accountError) return fail(accountError);
  } else {
    const qtyVal = Number(qtyRaw);
    if (!qtyRaw || Number.isNaN(qtyVal) || qtyVal <= 0) {
      return fail("Qty dibeli harus angka lebih dari 0.");
    }
    qty = qtyVal;

    if (category === "Bahan Baku") {
      ingredientId = formData.get("ingredientId") as string;
      if (!ingredientId) {
        return fail("Pilih bahan yang dibeli.");
      }

      const { data: ingredient } = await supabase
        .from("ingredients")
        .select("id, name, business_id, stock, unit_cost")
        .eq("id", ingredientId)
        .single();

      if (!ingredient || ingredient.business_id !== businessId) {
        return fail("Bahan baku tidak ditemukan.");
      }
      itemName = ingredient.name;

      // Business cost-control: stok bahan baku dilacak per lokasi fisik
      // (ingredient_location_stock — Gudang Utama/Kitchen Atas/dst), BUKAN
      // ingredients.stock (kolom itu berhenti dipakai sama sekali di jalur
      // cost-control). Default kredit ke lokasi yang ditandai
      // is_default_purchase (Gudang Utama), kecuali pembelian ini datang
      // dari Permintaan Barang yang punya location_id sendiri — maka
      // langsung dikredit ke lokasi peminta itu. unit_cost tetap dihitung
      // rata-rata tertimbang dari TOTAL yang dimiliki di SEMUA lokasi,
      // supaya HPP selalu mencerminkan harga blended yang benar.
      const { data: business } = await supabase
        .from("businesses")
        .select("cost_control_enabled")
        .eq("id", businessId)
        .single();

      let newUnitCost: number;

      if (business?.cost_control_enabled) {
        let targetLocationId: string | null = null;

        if (fromAllocationId) {
          const { data: allocation } = await supabase
            .from("purchase_request_item_allocations")
            .select("purchase_request_item_id")
            .eq("id", fromAllocationId)
            .eq("business_id", businessId)
            .maybeSingle();
          const { data: item } = allocation
            ? await supabase
                .from("purchase_request_items")
                .select("purchase_request_id")
                .eq("id", allocation.purchase_request_item_id)
                .maybeSingle()
            : { data: null };
          const { data: request } = item
            ? await supabase
                .from("purchase_requests")
                .select("location_id")
                .eq("id", item.purchase_request_id)
                .maybeSingle()
            : { data: null };
          targetLocationId = request?.location_id ?? null;
        }

        if (!targetLocationId) {
          const { data: defaultLocation } = await supabase
            .from("stock_locations")
            .select("id")
            .eq("business_id", businessId)
            .eq("is_default_purchase", true)
            .maybeSingle();
          targetLocationId = defaultLocation?.id ?? null;
        }

        // Kalau lokasi default (Gudang Utama) entah kenapa tidak ada (mis.
        // migration belum jalan), gagal eksplisit — jangan lanjut update
        // unit_cost seolah qty-nya sudah tercatat padahal nyasar ke mana pun.
        if (!targetLocationId) {
          return fail("Lokasi default pembelian (Gudang Utama) tidak ditemukan. Hubungi admin untuk migrasi data lokasi.");
        }
        purchaseLocationId = targetLocationId;

        const { data: locStockRows } = await supabase
          .from("ingredient_location_stock")
          .select("id, location_id, stock")
          .eq("ingredient_id", ingredientId)
          .eq("business_id", businessId);

        const totalOwnedBefore = (locStockRows ?? []).reduce((sum, row) => sum + Number(row.stock), 0);
        const oldValue = totalOwnedBefore * Number(ingredient.unit_cost);
        const newTotalOwned = totalOwnedBefore + qty;
        newUnitCost =
          newTotalOwned > 0 ? Math.round((oldValue + amount) / newTotalOwned) : Number(ingredient.unit_cost);

        const targetRow = (locStockRows ?? []).find((row) => row.location_id === targetLocationId);
        const stockError = targetRow
          ? (
              await supabase
                .from("ingredient_location_stock")
                .update({ stock: Number(targetRow.stock) + qty })
                .eq("id", targetRow.id)
            ).error
          : (
              await supabase.from("ingredient_location_stock").insert({
                business_id: businessId,
                location_id: targetLocationId,
                ingredient_id: ingredientId,
                stock: qty,
              })
            ).error;
        if (stockError) return fail(stockError.message);

        const { error: costError } = await supabase
          .from("ingredients")
          .update({ unit_cost: newUnitCost })
          .eq("id", ingredientId);
        if (costError) return fail(costError.message);
      } else {
        const oldValue = Number(ingredient.stock) * Number(ingredient.unit_cost);
        const newStock = Number(ingredient.stock) + qty;
        newUnitCost = newStock > 0 ? Math.round((oldValue + amount) / newStock) : Number(ingredient.unit_cost);

        const { error: updateError } = await supabase
          .from("ingredients")
          .update({ stock: newStock, unit_cost: newUnitCost })
          .eq("id", ingredientId);

        if (updateError) {
          return fail(updateError.message);
        }
      }

      if (newUnitCost !== Number(ingredient.unit_cost)) {
        await supabase.from("ingredient_price_history").insert({
          business_id: businessId,
          ingredient_id: ingredientId,
          unit_cost: newUnitCost,
          source: "pembelian",
        });
        await recalculateProductCostsForIngredient(supabase, ingredientId);
      }
    } else {
      productId = formData.get("productId") as string;
      if (!productId) {
        return fail("Pilih produk yang dibeli.");
      }

      const { data: product } = await supabase
        .from("products")
        .select("id, name, business_id, stock, cost")
        .eq("id", productId)
        .single();

      if (!product || product.business_id !== businessId) {
        return fail("Produk tidak ditemukan.");
      }
      itemName = product.name;

      const oldValue = Number(product.stock) * Number(product.cost);
      const newStock = Number(product.stock) + qty;
      const newCost = newStock > 0 ? Math.round((oldValue + amount) / newStock) : Number(product.cost);

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: newStock, cost: newCost })
        .eq("id", productId);

      if (updateError) {
        return fail(updateError.message);
      }
    }
  }

  const { data: newPurchase, error } = await supabase
    .from("purchases")
    .insert({
      business_id: businessId,
      supplier_id: supplierId,
      date,
      due_date: dueDate,
      category,
      ingredient_id: ingredientId,
      product_id: productId,
      qty,
      note: note || null,
      amount,
      paid_amount: paidAmount,
      stock_only: stockOnly,
      location_id: purchaseLocationId,
      expense_account_code: expenseAccountCode,
    })
    .select("id")
    .single();

  if (error) {
    return fail(error.message);
  }

  // Link balik alokasinya ke pembelian ini biar riwayatnya nyambung — best-
  // effort, kegagalan di sini tidak membatalkan pembelian yang sudah tersimpan.
  if (fromAllocationId) {
    await supabase
      .from("purchase_request_item_allocations")
      .update({ purchase_id: newPurchase.id })
      .eq("id", fromAllocationId)
      .eq("business_id", businessId);
    revalidatePath(`/business/${businessId}/permintaan-barang`);
  }

  const journalError = stockOnly
    ? null
    : await postPurchaseJournal(
        supabase,
        businessId,
        date,
        `Pembelian: ${itemName}`,
        amount,
        paidAmount,
        expenseAccountCode ?? "1-200",
      );

  await logActivity(
    supabase,
    businessId,
    "produk",
    journalError ? "warning" : "sukses",
    `Pembelian: ${itemName}`,
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : stockOnly
        ? `Rp${amount.toLocaleString("id-ID")} · cuma update stok, kas tidak disentuh`
        : `Rp${amount.toLocaleString("id-ID")}${paidAmount < amount ? " · sebagian/seluruhnya utang" : " · lunas"}`,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  return journalError
    ? fail(
        `Pembelian tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`,
      )
    : { error: null, resetToken: prevState.resetToken + 1 };
}

export type VoidPurchaseState = { error: string | null };

// Batalkan pembelian — bukan hapus baris, tapi ditandai voided + otomatis
// membalik efeknya: stok bahan/produk yang sempat bertambah dikurangi lagi
// (di-floor ke 0, tidak boleh negatif — kalau sebagian stok itu sudah
// kepakai/kejual duluan, sisanya hilang begitu saja, tidak dipaksa minus),
// unit_cost dibalikkan pakai kebalikan rumus rata-rata tertimbang (best
// effort — akurat kalau belum ada pembelian/penyesuaian lain sejak itu,
// yang merupakan kasus umum untuk "baru salah input, langsung dibatalkan"),
// dan jurnal koreksi (kebalikan dari jurnal saat pembelian dicatat,
// berdasarkan paid_amount TERKINI — termasuk pembayaran cicilan yang mungkin
// sudah ditambahkan lewat purchase_payments).
export async function voidPurchase(
  businessId: string,
  purchaseId: string,
  reason: string,
): Promise<VoidPurchaseState> {
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan pembatalan wajib diisi." };
  }

  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select(
      "id, date, category, ingredient_id, product_id, qty, amount, paid_amount, voided, stock_only, location_id, expense_account_code",
    )
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .single();

  if (!purchase) {
    return { error: "Data pembelian tidak ditemukan." };
  }
  if (purchase.voided) {
    return { error: "Pembelian ini sudah dibatalkan sebelumnya." };
  }

  let itemName = "Pembelian";
  const purchaseQty = Number(purchase.qty);
  const purchaseAmount = Number(purchase.amount);

  if (purchase.category === "Bahan Baku" && purchase.ingredient_id) {
    const { data: ingredient } = await supabase
      .from("ingredients")
      .select("id, name, stock, unit_cost")
      .eq("id", purchase.ingredient_id)
      .single();

    if (ingredient) {
      itemName = ingredient.name;
      const unitCostBefore = Number(ingredient.unit_cost);

      const { data: business } = await supabase
        .from("businesses")
        .select("cost_control_enabled")
        .eq("id", businessId)
        .single();

      let unitCostAfter: number;

      if (business?.cost_control_enabled) {
        // Simetris dengan addPurchase: pembelian bahan baku mengkredit
        // ingredient_location_stock di lokasi yang tercatat di
        // purchases.location_id, jadi pembatalannya juga mengurangi lokasi
        // itu, bukan ingredients.stock (tidak pernah disentuh saat pembelian
        // cost-control dicatat).
        const { data: locStockRows } = await supabase
          .from("ingredient_location_stock")
          .select("id, location_id, stock")
          .eq("ingredient_id", purchase.ingredient_id)
          .eq("business_id", businessId);

        const totalOwnedBefore = (locStockRows ?? []).reduce((sum, row) => sum + Number(row.stock), 0);
        const targetRow = purchase.location_id
          ? (locStockRows ?? []).find((row) => row.location_id === purchase.location_id)
          : undefined;
        const targetBefore = Number(targetRow?.stock ?? 0);
        const targetAfter = Math.max(0, targetBefore - purchaseQty);
        const totalOwnedAfter = totalOwnedBefore - (targetBefore - targetAfter);
        const valueAfter = totalOwnedBefore * unitCostBefore - purchaseAmount;
        unitCostAfter = totalOwnedAfter > 0 ? Math.max(0, Math.round(valueAfter / totalOwnedAfter)) : unitCostBefore;

        const { error: costError } = await supabase
          .from("ingredients")
          .update({ unit_cost: unitCostAfter })
          .eq("id", purchase.ingredient_id);
        if (costError) return { error: costError.message };

        if (targetRow) {
          const { error: stockError } = await supabase
            .from("ingredient_location_stock")
            .update({ stock: targetAfter })
            .eq("id", targetRow.id);
          if (stockError) return { error: stockError.message };
        }
      } else {
        const stockBefore = Number(ingredient.stock);
        const stockAfter = Math.max(0, stockBefore - purchaseQty);
        const valueAfter = stockBefore * unitCostBefore - purchaseAmount;
        unitCostAfter = stockAfter > 0 ? Math.max(0, Math.round(valueAfter / stockAfter)) : unitCostBefore;

        const { error: updateError } = await supabase
          .from("ingredients")
          .update({ stock: stockAfter, unit_cost: unitCostAfter })
          .eq("id", purchase.ingredient_id);
        if (updateError) return { error: updateError.message };
      }

      if (unitCostAfter !== unitCostBefore) {
        await supabase.from("ingredient_price_history").insert({
          business_id: businessId,
          ingredient_id: purchase.ingredient_id,
          unit_cost: unitCostAfter,
          source: "manual",
        });
        await recalculateProductCostsForIngredient(supabase, purchase.ingredient_id);
      }
    }
  } else if (purchase.category === "Barang Dagang" && purchase.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("id, name, stock, cost")
      .eq("id", purchase.product_id)
      .single();

    if (product) {
      itemName = product.name;
      const stockBefore = Number(product.stock);
      const costBefore = Number(product.cost);
      const stockAfter = Math.max(0, stockBefore - purchaseQty);
      const valueAfter = stockBefore * costBefore - purchaseAmount;
      const costAfter = stockAfter > 0 ? Math.max(0, Math.round(valueAfter / stockAfter)) : costBefore;

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: stockAfter, cost: costAfter })
        .eq("id", purchase.product_id);
      if (updateError) return { error: updateError.message };
    }
  }

  const amount = Number(purchase.amount);
  const paidAmount = Number(purchase.paid_amount);
  const sisaUtang = amount - paidAmount;

  // stock_only tidak pernah posting jurnal saat dicatat (lihat addPurchase),
  // jadi tidak ada apa pun untuk dibalikkan di sini juga.
  let journalError: string | null = null;
  if (!purchase.stock_only) {
    const debitAccountCode = purchase.expense_account_code || "1-200";
    const reversalLines: { account_code: string; debit: number; credit: number }[] = [
      { account_code: debitAccountCode, debit: 0, credit: amount },
    ];
    if (paidAmount > 0) {
      reversalLines.push({ account_code: "1-001", debit: paidAmount, credit: 0 });
    }
    if (sisaUtang > 0) {
      reversalLines.push({ account_code: "2-001", debit: sisaUtang, credit: 0 });
    }
    const { error: journalRpcError } = await supabase.rpc("post_journal_entry", {
      p_business_id: businessId,
      p_date: new Date().toISOString().slice(0, 10),
      p_description: `Batal pembelian: ${itemName}`,
      p_lines: reversalLines,
      p_source: "void",
    });
    journalError = journalRpcError?.message ?? null;
  }

  const { error } = await supabase
    .from("purchases")
    .update({ voided: true, voided_at: new Date().toISOString(), void_reason: reason })
    .eq("id", purchaseId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  // Lepas link ke Permintaan Barang biar tombol "Catat sebagai Pembelian"
  // muncul lagi kalau mau dicatat ulang.
  await supabase
    .from("purchase_request_item_allocations")
    .update({ purchase_id: null })
    .eq("purchase_id", purchaseId)
    .eq("business_id", businessId);

  await logActivity(
    supabase,
    businessId,
    "produk",
    journalError ? "warning" : "warning",
    `Pembelian dibatalkan: ${itemName}`,
    journalError
      ? `${reason} — GAGAL posting jurnal koreksi: ${journalError}`
      : reason,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return journalError
    ? {
        error: `Pembelian dibatalkan, tapi gagal posting jurnal koreksi (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`,
      }
    : { error: null };
}

export type UpdateCategoryState = { error: string | null };

// Re-kategorikan pembelian yang salah akun -- kasus paling umum: nota hutang
// dari Kas Kecil cuma punya 2 pilihan kategori ("Bahan Baku"/"Bukan Bahan
// Baku") saat diinput, gampang kepencet salah (mis. banner MMT ke-tag "Bahan
// Baku"). Sengaja dibatasi ke baris tanpa ingredient_id/product_id -- begitu
// ada item bahan/produk terhubung, kategorinya juga menentukan stok mana yang
// disentuh (lihat addPurchase), jadi mengubahnya lepas dari situ butuh
// migrasi stok manual, bukan sekadar ganti label.
export async function updatePurchaseCategory(
  businessId: string,
  purchaseId: string,
  newCategory: string,
  expenseAccountCode?: string,
): Promise<UpdateCategoryState> {
  if (!["Bahan Baku", "Barang Dagang", "Lainnya"].includes(newCategory)) {
    return { error: "Kategori tidak valid." };
  }

  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, category, ingredient_id, product_id, voided, amount, expense_account_code")
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .single();

  if (!purchase) {
    return { error: "Data pembelian tidak ditemukan." };
  }
  if (purchase.voided) {
    return { error: "Pembelian ini sudah dibatalkan." };
  }
  if (purchase.ingredient_id || purchase.product_id) {
    return {
      error: "Pembelian ini terhubung ke bahan/produk tertentu, kategori tidak bisa diubah dari sini.",
    };
  }

  let newExpenseAccountCode: string | null = null;
  if (newCategory === "Lainnya") {
    newExpenseAccountCode = expenseAccountCode || null;
    if (!newExpenseAccountCode) {
      return { error: "Pilih akun beban untuk kategori Lainnya." };
    }
    const accountError = await validateExpenseAccount(supabase, businessId, newExpenseAccountCode);
    if (accountError) return { error: accountError };
  }

  // Akun yang sebenarnya didebit di jurnal saat pembelian ini dicatat --
  // "Lainnya" pakai akun beban pilihan (fallback 1-200 untuk data lama
  // sebelum kolom ini ada), kategori lain selalu 1-200 Persediaan.
  const oldDebitAccount =
    purchase.category === "Lainnya" ? purchase.expense_account_code || "1-200" : "1-200";
  const newDebitAccount = newCategory === "Lainnya" ? newExpenseAccountCode! : "1-200";

  if (purchase.category === newCategory && oldDebitAccount === newDebitAccount) {
    return { error: null };
  }

  const { error } = await supabase
    .from("purchases")
    .update({ category: newCategory, expense_account_code: newExpenseAccountCode })
    .eq("id", purchaseId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  // Kategori cuma label, tapi akun jurnalnya beda -- perlu jurnal koreksi
  // (pindah dari akun lama ke akun baru) supaya buku besar ikut benar, bukan
  // cuma tampilan di halaman ini.
  let journalError: string | null = null;
  if (oldDebitAccount !== newDebitAccount) {
    const amount = Number(purchase.amount);
    const { error: journalRpcError } = await supabase.rpc("post_journal_entry", {
      p_business_id: businessId,
      p_date: new Date().toISOString().slice(0, 10),
      p_description: `Koreksi akun pembelian: ${purchase.category} → ${newCategory}`,
      p_lines: [
        { account_code: newDebitAccount, debit: amount, credit: 0 },
        { account_code: oldDebitAccount, debit: 0, credit: amount },
      ],
      p_source: "pembelian",
    });
    journalError = journalRpcError?.message ?? null;
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "info",
    "Kategori pembelian diubah",
    journalError
      ? `${purchase.category} → ${newCategory} — GAGAL posting jurnal koreksi: ${journalError}`
      : `${purchase.category} → ${newCategory}`,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  return journalError
    ? {
        error: `Kategori tersimpan, tapi gagal posting jurnal koreksi (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`,
      }
    : { error: null };
}

export type AddPaymentState = { error: string | null };

export async function addPurchasePayment(
  businessId: string,
  purchaseId: string,
  _prevState: AddPaymentState,
  formData: FormData,
): Promise<AddPaymentState> {
  const date = formData.get("date") as string;
  const amountRaw = formData.get("amount") as string;
  const note = (formData.get("note") as string)?.trim();

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah bayar harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, business_id, amount, paid_amount, ingredient_id, product_id, voided")
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .single();

  if (!purchase) {
    return { error: "Data pembelian tidak ditemukan." };
  }
  if (purchase.voided) {
    return { error: "Pembelian ini sudah dibatalkan, tidak bisa dibayar." };
  }

  const sisaUtang = Number(purchase.amount) - Number(purchase.paid_amount);
  if (amount > sisaUtang) {
    return { error: `Jumlah bayar melebihi sisa utang (${sisaUtang.toLocaleString("id-ID")}).` };
  }

  const newPaidAmount = Number(purchase.paid_amount) + amount;

  const { error: updateError } = await supabase
    .from("purchases")
    .update({ paid_amount: newPaidAmount })
    .eq("id", purchaseId);

  if (updateError) {
    return { error: updateError.message };
  }

  const { error } = await supabase.from("purchase_payments").insert({
    business_id: businessId,
    purchase_id: purchaseId,
    date,
    amount,
    note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  const { error: journalRpcError } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: "Bayar utang dagang",
    p_lines: [
      { account_code: "2-001", debit: amount, credit: 0 },
      { account_code: "1-001", debit: 0, credit: amount },
    ],
  });
  const journalError = journalRpcError?.message ?? null;

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "info",
    "Bayar utang dagang",
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${amount.toLocaleString("id-ID")}${note ? ` · ${note}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  return {
    error: journalError
      ? `Pembayaran tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}
