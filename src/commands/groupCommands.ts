import * as vscode from 'vscode';
import { IBookmarkStorage } from '../storage/storageProvider';
import { GroupTreeItem, StorageType } from '../views/bookmarkTreeProvider';

export type StorageMap = Record<StorageType, IBookmarkStorage>;

/**
 * Registers all group-related commands (create, remove, rename).
 */
export function registerGroupCommands(
  context: vscode.ExtensionContext,
  storageMap: StorageMap
): void {
  // ── Generic create group (prompts for storage) ───────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.createGroup', () =>
      createGroupFlow(storageMap)
    )
  );

  // ── Create group in specific storage (view title buttons) ────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.createPersonalGroup', () =>
      createGroupFlow(storageMap, 'personal')
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.createTeamGroup', () =>
      createGroupFlow(storageMap, 'team')
    )
  );

  // ── Remove group ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.removeGroup', async (item: GroupTreeItem) => {
      if (!item?.groupName || item.isVirtual) { return; }
      const storage = storageMap[item.storageType];

      const action = await vscode.window.showWarningMessage(
        `Remove group "${item.groupName}"?`,
        { modal: true },
        'Remove group only',
        'Remove group and bookmarks'
      );
      if (!action) { return; }
      const deleteBookmarks = action === 'Remove group and bookmarks';
      await storage.removeGroup(item.groupName, deleteBookmarks);
    })
  );

  // ── Rename group ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.renameGroup', async (item: GroupTreeItem) => {
      if (!item?.groupName || item.isVirtual) { return; }
      const storage = storageMap[item.storageType];

      const newName = await vscode.window.showInputBox({
        prompt: 'New group name',
        value: item.groupName,
        validateInput: (v) => v.trim() ? null : 'Name cannot be empty',
      });
      if (!newName || newName === item.groupName) { return; }

      await storage.renameGroup(item.groupName, newName.trim());
      vscode.window.showInformationMessage(`Group renamed to "${newName.trim()}".`);
    })
  );
}

// ── Helper ───────────────────────────────────────────────────────────

async function createGroupFlow(
  storageMap: StorageMap,
  preselectedType?: StorageType
): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Group name',
    placeHolder: 'e.g. Documentation, CI/CD, Design…',
    validateInput: (v) => v.trim() ? null : 'Name cannot be empty',
  });
  if (!name) { return; }

  let storageType = preselectedType;
  if (!storageType) {
    const pick = await vscode.window.showQuickPick(
      [
        { label: '$(person)  Personal', value: 'personal' as StorageType },
        { label: '$(organization)  Team', value: 'team' as StorageType },
      ],
      { placeHolder: 'Create group in…' }
    );
    if (!pick) { return; }
    storageType = pick.value;
  }

  await storageMap[storageType].addGroup({ name: name.trim() });
  vscode.window.showInformationMessage(`Group "${name.trim()}" created.`);
}
