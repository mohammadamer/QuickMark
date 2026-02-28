import * as vscode from 'vscode';
import { Bookmark, BookmarkGroup, BookmarkStore } from '../models/bookmark';

/**
 * Abstract storage interface that both Personal and Team storage implement.
 */
export interface IBookmarkStorage {
  /** Fires whenever the underlying data changes. */
  readonly onDidChange: vscode.Event<void>;

  /** Retrieve the full store. */
  getAll(): Promise<BookmarkStore>;

  /** Add a bookmark. */
  addBookmark(bookmark: Bookmark): Promise<void>;

  /** Remove a bookmark by id. */
  removeBookmark(id: string): Promise<void>;

  /** Update a bookmark (matched by id). */
  updateBookmark(bookmark: Bookmark): Promise<void>;

  /** Get all groups. */
  getGroups(): Promise<BookmarkGroup[]>;

  /** Add a group. */
  addGroup(group: BookmarkGroup): Promise<void>;

  /** Remove a group by name. Bookmarks in the group become ungrouped. */
  removeGroup(name: string, deleteBookmarks?: boolean): Promise<void>;

  /** Rename a group — updates all bookmarks that reference it. */
  renameGroup(oldName: string, newName: string): Promise<void>;

  /** Dispose watchers / listeners. */
  dispose(): void;
}
