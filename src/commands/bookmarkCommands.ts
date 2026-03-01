import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { Bookmark } from '../models/bookmark';
import { IBookmarkStorage } from '../storage/storageProvider';
import { BookmarkTreeItem, StorageType } from '../views/bookmarkTreeProvider';

export type StorageMap = Record<StorageType, IBookmarkStorage>;

/**
 * Registers all bookmark-related commands (add, remove, edit, open, move).
 */
export function registerBookmarkCommands(
  context: vscode.ExtensionContext,
  storageMap: StorageMap
): void {
  const personal = storageMap.personal;
  const team = storageMap.team;

  // ── Generic add (prompts for storage target) ─────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.addBookmark', () =>
      addBookmarkFlow(storageMap)
    )
  );

  // ── Add specifically to Personal or Team (view title buttons) ────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.addPersonalBookmark', () =>
      addBookmarkFlow(storageMap, 'personal')
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.addTeamBookmark', () =>
      addBookmarkFlow(storageMap, 'team')
    )
  );

  // ── Add from Explorer context menu ───────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'quickmark.addBookmarkFromExplorer',
      (uri: vscode.Uri) => addFileBookmark(uri, storageMap)
    )
  );

  // ── Remove ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.removeBookmark', async (item: BookmarkTreeItem) => {
      if (!item?.bookmark) { return; }
      const storage = storageMap[item.storageType];

      const answer = await vscode.window.showWarningMessage(
        `Remove bookmark "${item.bookmark.name}"?`,
        { modal: true },
        'Remove'
      );
      if (answer === 'Remove') {
        await storage.removeBookmark(item.bookmark.id);
      }
    })
  );

  // ── Edit ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.editBookmark', async (item: BookmarkTreeItem) => {
      if (!item?.bookmark) { return; }
      const storage = storageMap[item.storageType];
      await editBookmarkFlow(item.bookmark, storage);
    })
  );

  // ── Open ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.openBookmark', async (item: BookmarkTreeItem) => {
      if (!item?.bookmark) { return; }
      const b = item.bookmark;

      if (item.isDeleted) {
        const action = await vscode.window.showWarningMessage(
          `The file "${b.target}" no longer exists.`,
          'Remove bookmark',
          'Dismiss'
        );
        if (action === 'Remove bookmark') {
          await storageMap[item.storageType].removeBookmark(b.id);
        }
        return;
      }

      if (b.type === 'url') {
        await vscode.env.openExternal(vscode.Uri.parse(b.target));
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
          const fileUri = vscode.Uri.joinPath(folders[0].uri, b.target);
          await vscode.window.showTextDocument(fileUri);
        }
      }
    })
  );

  // ── Move between storages ────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.moveToPersonal', async (item: BookmarkTreeItem) => {
      if (!item?.bookmark) { return; }
      await team.removeBookmark(item.bookmark.id);
      await personal.addBookmark({ ...item.bookmark, id: crypto.randomUUID() });
      vscode.window.showInformationMessage(`Moved "${item.bookmark.name}" to Personal.`);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.moveToTeam', async (item: BookmarkTreeItem) => {
      if (!item?.bookmark) { return; }
      await personal.removeBookmark(item.bookmark.id);
      await team.addBookmark({ ...item.bookmark, id: crypto.randomUUID() });
      vscode.window.showInformationMessage(`Moved "${item.bookmark.name}" to Team.`);
    })
  );
}

// ── Helper flows ─────────────────────────────────────────────────────

async function addBookmarkFlow(
  storageMap: StorageMap,
  preselectedType?: StorageType
): Promise<void> {
  // 1. Choose type
  const type = await vscode.window.showQuickPick(
    [
      { label: '$(file)  File in workspace', value: 'file' as const },
      { label: '$(link-external)  URL / Link', value: 'url' as const },
    ],
    { placeHolder: 'What kind of bookmark?' }
  );
  if (!type) { return; }

  let target: string;
  let name: string;

  if (type.value === 'file') {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Add as Bookmark',
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!uris || uris.length === 0) { return; }
    target = vscode.workspace.asRelativePath(uris[0], false);
    name = path.basename(target);
  } else {
    const urlInput = await vscode.window.showInputBox({
      prompt: 'Enter the URL',
      placeHolder: 'https://…',
      validateInput: (v) => {
        try { new URL(v); return null; } catch { return 'Enter a valid URL'; }
      },
    });
    if (!urlInput) { return; }
    target = urlInput;
    name = urlInput.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/');
  }

  // 2. Custom name
  const customName = await vscode.window.showInputBox({
    prompt: 'Bookmark name',
    value: name,
  });
  if (customName === undefined) { return; }
  name = customName || name;

  // 3. Choose storage (if not preselected)
  let storageType = preselectedType;
  if (!storageType) {
    const storePick = await vscode.window.showQuickPick(
      [
        { label: '$(person)  Personal', value: 'personal' as StorageType },
        { label: '$(organization)  Team', value: 'team' as StorageType },
      ],
      { placeHolder: 'Save to…' }
    );
    if (!storePick) { return; }
    storageType = storePick.value;
  }

  const storage = storageMap[storageType];

  // 4. Choose group (optional)
  const groups = await storage.getGroups();
  let group: string | undefined;
  if (groups.length > 0) {
    const groupPick = await vscode.window.showQuickPick(
      [
        { label: '$(list-unordered)  No group', value: '' },
        ...groups.map((g) => ({ label: `$(folder)  ${g.name}`, value: g.name })),
      ],
      { placeHolder: 'Assign to a group (optional)' }
    );
    if (groupPick === undefined) { return; }
    group = groupPick.value || undefined;
  }

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    name,
    type: type.value,
    target,
    group,
    createdAt: new Date().toISOString(),
  };

  await storage.addBookmark(bookmark);
  vscode.window.showInformationMessage(`Bookmark "${name}" added.`);
}

async function addFileBookmark(
  uri: vscode.Uri,
  storageMap: StorageMap
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { return; }

  const relativePath = vscode.workspace.asRelativePath(uri, false);
  const defaultName = path.basename(relativePath);

  const name = await vscode.window.showInputBox({
    prompt: 'Bookmark name',
    value: defaultName,
  });
  if (name === undefined) { return; }

  const storePick = await vscode.window.showQuickPick(
    [
      { label: '$(person)  Personal', value: 'personal' as StorageType },
      { label: '$(organization)  Team', value: 'team' as StorageType },
    ],
    { placeHolder: 'Save to…' }
  );
  if (!storePick) { return; }
  const storage = storageMap[storePick.value];

  const groups = await storage.getGroups();
  let group: string | undefined;
  if (groups.length > 0) {
    const groupPick = await vscode.window.showQuickPick(
      [
        { label: '$(list-unordered)  No group', value: '' },
        ...groups.map((g) => ({ label: `$(folder)  ${g.name}`, value: g.name })),
      ],
      { placeHolder: 'Assign to a group (optional)' }
    );
    if (groupPick === undefined) { return; }
    group = groupPick.value || undefined;
  }

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    name: name || defaultName,
    type: 'file',
    target: relativePath,
    group,
    createdAt: new Date().toISOString(),
  };

  await storage.addBookmark(bookmark);
  vscode.window.showInformationMessage(`Bookmark "${bookmark.name}" added.`);
}

async function editBookmarkFlow(bookmark: Bookmark, storage: IBookmarkStorage): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Bookmark name',
    value: bookmark.name,
  });
  if (name === undefined) { return; }

  let target = bookmark.target;
  if (bookmark.type === 'url') {
    const urlInput = await vscode.window.showInputBox({
      prompt: 'URL',
      value: bookmark.target,
      validateInput: (v) => {
        try { new URL(v); return null; } catch { return 'Enter a valid URL'; }
      },
    });
    if (urlInput === undefined) { return; }
    target = urlInput;
  }

  const groups = await storage.getGroups();
  let group = bookmark.group;
  if (groups.length > 0) {
    const groupPick = await vscode.window.showQuickPick(
      [
        { label: '$(list-unordered)  No group', value: '' },
        ...groups.map((g) => ({
          label: `$(folder)  ${g.name}`,
          value: g.name,
          picked: g.name === bookmark.group,
        })),
      ],
      { placeHolder: 'Assign to a group' }
    );
    if (groupPick === undefined) { return; }
    group = groupPick.value || undefined;
  }

  const updated: Bookmark = { ...bookmark, name: name || bookmark.name, target, group };
  await storage.updateBookmark(updated);
  vscode.window.showInformationMessage(`Bookmark "${updated.name}" updated.`);
}
