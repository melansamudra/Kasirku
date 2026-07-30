// Wrapper tipis di atas IndexedDB bawaan browser — dipakai untuk menyimpan
// antrian penjualan yang gagal disinkronkan karena jaringan putus di
// pos-screen.tsx / ticket-pos-screen.tsx, cache katalog POS (sejak v2) di
// pos-cache.ts untuk render instan di pembukaan berikutnya, dan (sejak v3)
// antrian cetak dapur/bar/struk yang gagal terkirim di print-queue.ts.
// Tidak ada dependency baru; hanya jalan di client (semua pemanggil harus
// mengecek `typeof window !== "undefined"` / dipanggil dari komponen
// "use client").

const DB_NAME = "kasirku-offline";
const DB_VERSION = 3;
const STORE_NAME = "pending_sales";
const POS_CACHE_STORE = "pos_cache";
const PENDING_PRINTS_STORE = "pending_prints";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "clientRef" });
        store.createIndex("by-business", "businessId", { unique: false });
      }
      if (!db.objectStoreNames.contains(POS_CACHE_STORE)) {
        db.createObjectStore(POS_CACHE_STORE, { keyPath: "businessId" });
      }
      if (!db.objectStoreNames.contains(PENDING_PRINTS_STORE)) {
        const store = db.createObjectStore(PENDING_PRINTS_STORE, { keyPath: "id" });
        store.createIndex("by-business", "businessId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPut<T>(record: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllByBusiness<T>(businessId: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("by-business");
    const request = index.getAll(IDBKeyRange.only(businessId));
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function idbDelete(clientRef: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(clientRef);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPutPosCache<T>(record: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POS_CACHE_STORE, "readwrite");
    tx.objectStore(POS_CACHE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetPosCache<T>(businessId: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POS_CACHE_STORE, "readonly");
    const request = tx.objectStore(POS_CACHE_STORE).get(businessId);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPutPendingPrint<T>(record: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_PRINTS_STORE, "readwrite");
    tx.objectStore(PENDING_PRINTS_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllPendingPrintsByBusiness<T>(businessId: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_PRINTS_STORE, "readonly");
    const index = tx.objectStore(PENDING_PRINTS_STORE).index("by-business");
    const request = index.getAll(IDBKeyRange.only(businessId));
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function idbDeletePendingPrint(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_PRINTS_STORE, "readwrite");
    tx.objectStore(PENDING_PRINTS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
