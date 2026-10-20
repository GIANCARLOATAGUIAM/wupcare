// A same-site path to continue to after an auth callback. Resolving against
// the request origin and comparing origins also rejects "//host" and "/\host"
// (browsers treat a backslash as a slash), which a prefix check misses.
export function sameOriginPath(value: string | null | undefined, origin: string, fallback = "/") {
  if (!value || !value.startsWith("/")) return fallback;
  try {
    const target = new URL(value, origin);
    return target.origin === new URL(origin).origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}
