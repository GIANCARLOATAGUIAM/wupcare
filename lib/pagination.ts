export const PAGE_SIZE = 10;
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string) {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

export function pageParam(sp: SearchParams) {
  const value = param(sp, "page") ?? "";
  const page = Number(value);
  // PostgreSQL/PostgREST offsets are bounded; reject overflow and odd syntax.
  return /^\d+$/.test(value) && Number.isSafeInteger(page) && page > 0 && page <= 214748364 ? page : 1;
}

export function pageRange(page: number): [number, number] {
  return [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1];
}

export function pageInfo(page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { pages, from: total ? (page - 1) * PAGE_SIZE + 1 : 0, to: Math.min(page * PAGE_SIZE, total) };
}

export function pageOutOfRange(page: number, count: number | null, error: { code?: string } | null) {
  return page > 1 && (error?.code === "PGRST103" || (!error && count !== null && (page - 1) * PAGE_SIZE >= count));
}

export function hrefWith(path: string, sp: SearchParams, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) params.append(key, item);
    }
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
