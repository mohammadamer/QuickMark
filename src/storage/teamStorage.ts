import * as vscode from 'vscode';
import { Bookmark, BookmarkGroup, BookmarkStore, createEmptyStore } from '../models/bookmark';
import { IBookmarkStorage } from './storageProvider';

const TEAM_FILE = 'QuickMark.json';

/**
 * Stores team bookmarks in a QuickMark.json file at the workspace root.
 * The file is intended to be committed to source control and shared with the team.
 */
export class TeamStorage implements IBookmarkStorage {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _watcher: vscode.FileSystemWatcher | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    this.setupWatcher();
  }

  // ----- helpers -----

  private getFileUri(): vscode.Uri | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }
    return vscode.Uri.joinPath(folders[0].uri, TEAM_FILE);
  }

  private setupWatcher(): void {
    this._watcher = vscode.workspace.createFileSystemWatcher(`**/${TEAM_FILE}`);
    const fire = () => this._onDidChange.fire();
    this._disposables.push(
      this._watcher.onDidChange(fire),
      this._watcher.onDidCreate(fire),
      this._watcher.onDidDelete(fire),
      this._watcher
    );
  }

  private async readStore(): Promise<BookmarkStore> {
    const uri = this.getFileUri();
    if (!uri) {
      return createEmptyStore();
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString('utf-8');
      const parsed = JSON.parse(text) as Partial<BookmarkStore>;
      return {
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      };
    } catch {
      // File doesn't exist yet — that's fine
      return createEmptyStore();
    }
  }

  private async writeStore(store: BookmarkStore): Promise<void> {
    const uri = this.getFileUri();
    if (!uri) {
      vscode.window.showErrorMessage('No workspace folder open — cannot save team bookmarks.');
      return;
    }
    const content = JSON.stringify(store, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    this._onDidChange.fire();
  }

  // ----- IBookmarkStorage -----

  async getAll(): Promise<BookmarkStore> {
    return this.readStore();
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    const store = await this.readStore();
    store.bookmarks.push(bookmark);
    await this.writeStore(store);
  }

  async removeBookmark(id: string): Promise<void> {
    const store = await this.readStore();
    store.bookmarks = store.bookmarks.filter((b) => b.id !== id);
    await this.writeStore(store);
  }

  async updateBookmark(bookmark: Bookmark): Promise<void> {
    const store = await this.readStore();
    const idx = store.bookmarks.findIndex((b) => b.id === bookmark.id);
    if (idx !== -1) {
      store.bookmarks[idx] = bookmark;
    }
    await this.writeStore(store);
  }

  async getGroups(): Promise<BookmarkGroup[]> {
    const store = await this.readStore();
    return store.groups;
  }

  async addGroup(group: BookmarkGroup): Promise<void> {
    const store = await this.readStore();
    if (store.groups.some((g) => g.name === group.name)) {
      vscode.window.showWarningMessage(`Group "${group.name}" already exists.`);
      return;
    }
    store.groups.push(group);
    await this.writeStore(store);
  }

  async removeGroup(name: string, deleteBookmarks = false): Promise<void> {
    const store = await this.readStore();
    store.groups = store.groups.filter((g) => g.name !== name);
    if (deleteBookmarks) {
      store.bookmarks = store.bookmarks.filter((b) => b.group !== name);
    } else {
      store.bookmarks = store.bookmarks.map((b) =>
        b.group === name ? { ...b, group: undefined } : b
      );
    }
    await this.writeStore(store);
  }

  async renameGroup(oldName: string, newName: string): Promise<void> {
    const store = await this.readStore();
    const group = store.groups.find((g) => g.name === oldName);
    if (group) {
      group.name = newName;
    }
    store.bookmarks = store.bookmarks.map((b) =>
      b.group === oldName ? { ...b, group: newName } : b
    );
    await this.writeStore(store);
  }

  dispose(): void {
    this._onDidChange.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
