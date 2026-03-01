import * as vscode from 'vscode';
import { Bookmark } from '../models/bookmark';
import { IBookmarkStorage } from '../storage/storageProvider';
import { StorageType } from '../views/bookmarkTreeProvider';

type StorageMap = Record<StorageType, IBookmarkStorage>;

interface SearchItem extends vscode.QuickPickItem {
  bookmark: Bookmark;
  storageType: StorageType;
}

/**
 * Registers the search-bookmarks command.
 */
export function registerSearchCommand(
  context: vscode.ExtensionContext,
  storageMap: StorageMap
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.searchBookmarks', async () => {
      const [personalStore, teamStore] = await Promise.all([
        storageMap.personal.getAll(),
        storageMap.team.getAll(),
      ]);

      const items: SearchItem[] = [
        ...personalStore.bookmarks.map((b) => toSearchItem(b, 'personal')),
        ...teamStore.bookmarks.map((b) => toSearchItem(b, 'team')),
      ];

      if (items.length === 0) {
        vscode.window.showInformationMessage('No bookmarks yet. Add one first!');
        return;
      }

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search bookmarks…',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked) {
        const b = picked.bookmark;
        if (b.type === 'url') {
          await vscode.env.openExternal(vscode.Uri.parse(b.target));
        } else {
          const folders = vscode.workspace.workspaceFolders;
          if (folders && folders.length > 0) {
            const fileUri = vscode.Uri.joinPath(folders[0].uri, b.target);
            try {
              await vscode.window.showTextDocument(fileUri);
            } catch {
              vscode.window.showWarningMessage(`File "${b.target}" not found.`);
            }
          }
        }
      }
    })
  );
}

function toSearchItem(b: Bookmark, storageType: StorageType): SearchItem {
  const icon = b.type === 'url' ? '$(link-external)' : '$(file)';
  const scope = storageType === 'personal' ? 'Personal' : 'Team';
  const group = b.group ? ` · ${b.group}` : '';

  return {
    label: `${icon}  ${b.name}`,
    description: b.target,
    detail: `${scope}${group}`,
    bookmark: b,
    storageType,
  };
}
