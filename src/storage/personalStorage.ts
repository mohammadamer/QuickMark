import * as vscode from 'vscode';
import { Bookmark, BookmarkGroup, BookmarkStore, createEmptyStore } from '../models/bookmark';
import { IBookmarkStorage } from './storageProvider';

const CONFIG_SECTION = 'quickmark';
const BOOKMARKS_KEY = 'personalBookmarks';
const SCOPE_KEY = 'personalStorageScope';

/**
 * Stores personal bookmarks in VS Code settings (workspace or global).
 */
export class PersonalStorage implements IBookmarkStorage {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    // Watch for external settings changes (e.g. user edits settings.json directly)
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`${CONFIG_SECTION}.${BOOKMARKS_KEY}`)) {
          this._onDidChange.fire();
        }
      })
    );
  }

  private getScope(): vscode.ConfigurationTarget {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const scope = cfg.get<string>(SCOPE_KEY, 'workspace');
    return scope === 'global'
      ? vscode.ConfigurationTarget.Global
      : vscode.ConfigurationTarget.Workspace;
  }

  private getStore(): BookmarkStore {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const raw = cfg.get<BookmarkStore>(BOOKMARKS_KEY);
    if (!raw || typeof raw !== 'object') {
      return createEmptyStore();
    }
    return {
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
    };
  }

  private async saveStore(store: BookmarkStore): Promise<void> {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await cfg.update(BOOKMARKS_KEY, store, this.getScope());
    this._onDidChange.fire();
  }

  async getAll(): Promise<BookmarkStore> {
    return this.getStore();
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    const store = this.getStore();
    store.bookmarks.push(bookmark);
    await this.saveStore(store);
  }

  async removeBookmark(id: string): Promise<void> {
    const store = this.getStore();
    store.bookmarks = store.bookmarks.filter((b) => b.id !== id);
    await this.saveStore(store);
  }

  async updateBookmark(bookmark: Bookmark): Promise<void> {
    const store = this.getStore();
    const idx = store.bookmarks.findIndex((b) => b.id === bookmark.id);
    if (idx !== -1) {
      store.bookmarks[idx] = bookmark;
    }
    await this.saveStore(store);
  }

  async getGroups(): Promise<BookmarkGroup[]> {
    return this.getStore().groups;
  }

  async addGroup(group: BookmarkGroup): Promise<void> {
    const store = this.getStore();
    if (store.groups.some((g) => g.name === group.name)) {
      vscode.window.showWarningMessage(`Group "${group.name}" already exists.`);
      return;
    }
    store.groups.push(group);
    await this.saveStore(store);
  }

  async removeGroup(name: string, deleteBookmarks = false): Promise<void> {
    const store = this.getStore();
    store.groups = store.groups.filter((g) => g.name !== name);
    if (deleteBookmarks) {
      store.bookmarks = store.bookmarks.filter((b) => b.group !== name);
    } else {
      store.bookmarks = store.bookmarks.map((b) =>
        b.group === name ? { ...b, group: undefined } : b
      );
    }
    await this.saveStore(store);
  }

  async renameGroup(oldName: string, newName: string): Promise<void> {
    const store = this.getStore();
    const group = store.groups.find((g) => g.name === oldName);
    if (group) {
      group.name = newName;
    }
    store.bookmarks = store.bookmarks.map((b) =>
      b.group === oldName ? { ...b, group: newName } : b
    );
    await this.saveStore(store);
  }

  dispose(): void {
    this._onDidChange.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
