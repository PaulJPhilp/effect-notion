import { blogArticleAdapter } from "./articles/blog.adapter.js";
import type { EntityAdapter } from "./Adapter.js";
import type { BaseEntity } from "../logical/Common.js";
import type { Kind } from "../registry/sources.js";

/**
 * Registry of all available adapters by kind and name.
 *
 * To add a new adapter:
 * 1. Import the adapter module
 * 2. Add it to the appropriate kind section below
 * 3. Optionally set it as the 'default' for that kind
 *
 * Example:
 * ```typescript
 * import { handbookArticleAdapter } from "./articles/handbook.adapter.js";
 *
 * articles: {
 *   blog: blogArticleAdapter,
 *   handbook: handbookArticleAdapter,
 *   default: blogArticleAdapter,
 * }
 * ```
 */
export const AdapterRegistry: Record<
  Kind,
  Record<string, EntityAdapter<BaseEntity>>
> = {
  articles: {
    blog: blogArticleAdapter,
    default: blogArticleAdapter, // Fallback when no adapter specified
  },
  changelog: {
    // Add changelog adapters here when implemented
    // default: defaultChangelogAdapter,
  },
  projects: {
    // Add project adapters here when implemented
    // default: defaultProjectAdapter,
  },
};

/**
 * Retrieves an adapter for a given kind and adapter name.
 * Falls back to the 'default' adapter for the kind if the specified adapter is not found.
 *
 * @param kind - The entity kind (articles, changelog, projects)
 * @param adapterName - The adapter name to lookup
 * @returns The adapter instance, or null if neither the named nor default adapter exists
 *
 * @example
 * ```typescript
 * const adapter = getAdapter("articles", "blog");
 * if (!adapter) {
 *   throw new Error("No adapter available for articles/blog");
 * }
 * ```
 */
export const getAdapter = (
  kind: Kind,
  adapterName: string
): EntityAdapter<BaseEntity> | null => {
  const kindAdapters = AdapterRegistry[kind];
  if (!kindAdapters) {
    return null;
  }

  // Try to find the specific adapter by name
  const adapter = kindAdapters[adapterName];
  if (adapter) {
    return adapter;
  }

  // Fallback to default adapter for this kind
  const defaultAdapter = kindAdapters.default;
  if (defaultAdapter) {
    return defaultAdapter;
  }

  return null;
};

/**
 * Checks if an adapter exists for a given kind and name.
 *
 * @param kind - The entity kind
 * @param adapterName - The adapter name
 * @returns true if the adapter exists (either by name or via default)
 */
export const hasAdapter = (kind: Kind, adapterName: string): boolean => {
  return getAdapter(kind, adapterName) !== null;
};

/**
 * Lists all available adapter names for a given kind.
 *
 * @param kind - The entity kind
 * @returns Array of adapter names (excluding 'default')
 */
export const listAdapters = (kind: Kind): readonly string[] => {
  const kindAdapters = AdapterRegistry[kind];
  if (!kindAdapters) {
    return [];
  }

  return Object.keys(kindAdapters).filter((name) => name !== "default");
};
