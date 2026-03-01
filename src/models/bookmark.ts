/**
 * Represents a single bookmark entry — either a workspace file or an external URL.
 */
export interface Bookmark {
  /** Unique identifier (crypto.randomUUID) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Bookmark type */
  type: 'file' | 'url';
  /**
   * For files: workspace-relative path (e.g. "src/index.ts").
   * For URLs: full URL string (e.g. "https://github.com/org/repo/issues").
   */
  target: string;
  /** Optional group name this bookmark belongs to */
  group?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

/**
 * A named group for organizing bookmarks (flat, no nesting).
 */
export interface BookmarkGroup {
  name: string;
}

/**
 * The root data structure stored in QuickMark.json and VS Code settings.
 */
export interface BookmarkStore {
  groups: BookmarkGroup[];
  bookmarks: Bookmark[];
}

/**
 * Returns a default empty store.
 */
export function createEmptyStore(): BookmarkStore {
  return { groups: [], bookmarks: [] };
}
