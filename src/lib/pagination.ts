// Supabase/PostgREST caps any unbounded select() at the project's Max Rows
// API setting (default 1000) — past that it silently truncates instead of
// erroring, so a business with 1000+ marked mirror transactions loses rows
// off the end of every "give me everything for this business_id" query
// without any error to catch. Wrap those queries in this so pages that
// expect the FULL set (visibility toggles, rekap totals, mirror reports)
// actually get it via .range() pagination instead of silently truncating.
export async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error || !data) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
