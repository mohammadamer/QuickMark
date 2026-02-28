import * as vscode from 'vscode';
import { Bookmark, BookmarkGroup } from '../models/bookmark';
import { IBookmarkStorage } from '../storage/storageProvider';
import { detectDeletedFiles } from '../services/deletedFileDetector';

// ── Virtual group names ──────────────────────────────────────────────
const UNGROUPED_LABEL = 'Ungrouped';
const DELETED_LABEL = 'Deleted Files';

export type StorageType = 'personal' | 'team';

// ── Tree item types ──────────────────────────────────────────────────

export class GroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly groupName: string,
    public readonly isVirtual: boolean,
    public readonly storageType: StorageType,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(groupName, collapsibleState);

    if (groupName === DELETED_LABEL) {
      this.iconPath = new vscode.ThemeIcon('warning');
      this.contextValue = 'bookmark-deleted-group';
    } else if (groupName === UNGROUPED_LABEL) {
      this.iconPath = new vscode.ThemeIcon('list-unordered');
      this.contextValue = 'bookmark-ungrouped';
    } else {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'bookmark-group';
    }
  }
}

export class BookmarkTreeItem extends vscode.TreeItem {
  constructor(
    public readonly bookmark: Bookmark,
    public readonly isDeleted: boolean,
    public readonly storageType: StorageType
  ) {
    super(bookmark.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = bookmark.target;
    this.description = bookmark.target;

    if (isDeleted) {
      this.iconPath = new vscode.ThemeIcon('warning');
      this.contextValue = 'bookmark-deleted';
      this.description = `(deleted) ${bookmark.target}`;
    } else if (bookmark.type === 'url') {
      this.iconPath = new vscode.ThemeIcon('link-external');
      this.contextValue = 'bookmark-url';
    } else {
      // file bookmark — use resourceUri so VS Code shows file-type icon
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        this.resourceUri = vscode.Uri.joinPath(folders[0].uri, bookmark.target);
      }
      this.iconPath = vscode.ThemeIcon.File;
      this.contextValue = 'bookmark-file';
    }

    this.command = {
      command: 'quickmark.openBookmark',
      title: 'Open Bookmark',
      arguments: [this],
    };
  }
}

type TreeItem = GroupTreeItem | BookmarkTreeItem;

// ── Provider ─────────────────────────────────────────────────────────

export class BookmarkTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cachedBookmarks: Bookmark[] = [];
  private cachedGroups: BookmarkGroup[] = [];
  private deletedIds: Set<string> = new Set();

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly storage: IBookmarkStorage,
    private readonly storageType: StorageType
  ) {
    this._disposables.push(
      storage.onDidChange(() => this.refresh())
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // -- TreeDataProvider --

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      // Root level → return groups
      return this.getRootItems();
    }

    if (element instanceof GroupTreeItem) {
      return this.getBookmarksForGroup(element.groupName);
    }

    return [];
  }

  // -- Internal --

  private async getRootItems(): Promise<TreeItem[]> {
    const store = await this.storage.getAll();
    this.cachedBookmarks = store.bookmarks;
    this.cachedGroups = store.groups;
    this.deletedIds = await detectDeletedFiles(this.cachedBookmarks);

    const items: TreeItem[] = [];

    // User-defined groups
    for (const group of this.cachedGroups) {
      const count = this.cachedBookmarks.filter(
        (b) => b.group === group.name && !this.deletedIds.has(b.id)
      ).length;
      if (count > 0) {
        items.push(
          new GroupTreeItem(group.name, false, this.storageType, vscode.TreeItemCollapsibleState.Expanded)
        );
      } else {
        // Show empty groups collapsed
        items.push(
          new GroupTreeItem(group.name, false, this.storageType, vscode.TreeItemCollapsibleState.Collapsed)
        );
      }
    }

    // Ungrouped
    const ungrouped = this.cachedBookmarks.filter(
      (b) => !b.group && !this.deletedIds.has(b.id)
    );
    if (ungrouped.length > 0) {
      items.push(
        new GroupTreeItem(UNGROUPED_LABEL, true, this.storageType, vscode.TreeItemCollapsibleState.Expanded)
      );
    }

    // Deleted files
    const deleted = this.cachedBookmarks.filter((b) => this.deletedIds.has(b.id));
    if (deleted.length > 0) {
      items.push(
        new GroupTreeItem(DELETED_LABEL, true, this.storageType, vscode.TreeItemCollapsibleState.Collapsed)
      );
    }

    return items;
  }

  private getBookmarksForGroup(groupName: string): TreeItem[] {
    if (groupName === DELETED_LABEL) {
      return this.cachedBookmarks
        .filter((b) => this.deletedIds.has(b.id))
        .map((b) => new BookmarkTreeItem(b, true, this.storageType));
    }

    if (groupName === UNGROUPED_LABEL) {
      return this.cachedBookmarks
        .filter((b) => !b.group && !this.deletedIds.has(b.id))
        .map((b) => new BookmarkTreeItem(b, false, this.storageType));
    }

    return this.cachedBookmarks
      .filter((b) => b.group === groupName && !this.deletedIds.has(b.id))
      .map((b) => new BookmarkTreeItem(b, false, this.storageType));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
