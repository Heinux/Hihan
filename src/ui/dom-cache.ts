// ── Lazy DOM element cache ────────────────────────────────────────────
// Avoids repeated getElementById calls by caching lookups.

const _cache = new Map<string, HTMLElement | null>();

/**
 * Lazily look up and cache an element by ID.
 * Returns null if the element doesn't exist.
 */
export function lazyEl(id: string): HTMLElement | null {
  if (!_cache.has(id)) {
    _cache.set(id, document.getElementById(id));
  }
  return _cache.get(id)!;
}

/**
 * Typed variant that casts to a specific HTMLElement subtype.
 * Returns null if the element doesn't exist.
 */
export function lazyElAs<T extends HTMLElement>(id: string): T | null {
  return lazyEl(id) as T | null;
}

/**
 * Clear the cache (useful in tests or when DOM is rebuilt).
 */
export function clearDomCache(): void {
  _cache.clear();
}