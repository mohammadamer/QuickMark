import * as vscode from 'vscode';
import { PersonalStorage } from './storage/personalStorage';
import { TeamStorage } from './storage/teamStorage';
import { BookmarkTreeProvider } from './views/bookmarkTreeProvider';
import { registerBookmarkCommands } from './commands/bookmarkCommands';
import { registerGroupCommands } from './commands/groupCommands';
import { registerSearchCommand } from './commands/searchCommand';
import type { StorageType } from './views/bookmarkTreeProvider';
import type { IBookmarkStorage } from './storage/storageProvider';

export function activate(context: vscode.ExtensionContext): void {
  // ── Storage instances ──────────────────────────────────────────────
  const personalStorage = new PersonalStorage();
  const teamStorage = new TeamStorage();

  const storageMap: Record<StorageType, IBookmarkStorage> = {
    personal: personalStorage,
    team: teamStorage,
  };

  // ── Tree data providers ────────────────────────────────────────────
  const personalTreeProvider = new BookmarkTreeProvider(personalStorage, 'personal');
  const teamTreeProvider = new BookmarkTreeProvider(teamStorage, 'team');

  const personalTreeView = vscode.window.createTreeView('quickmark.personalBookmarks', {
    treeDataProvider: personalTreeProvider,
    showCollapseAll: true,
  });

  const teamTreeView = vscode.window.createTreeView('quickmark.teamBookmarks', {
    treeDataProvider: teamTreeProvider,
    showCollapseAll: true,
  });

  // ── File watcher for deleted-file detection ────────────────────────
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  let refreshTimeout: ReturnType<typeof setTimeout> | undefined;

  const debouncedRefresh = () => {
    if (refreshTimeout) { clearTimeout(refreshTimeout); }
    refreshTimeout = setTimeout(() => {
      personalTreeProvider.refresh();
      teamTreeProvider.refresh();
    }, 500);
  };

  context.subscriptions.push(
    fileWatcher.onDidCreate(debouncedRefresh),
    fileWatcher.onDidDelete(debouncedRefresh),
    fileWatcher
  );

  // ── Commands ───────────────────────────────────────────────────────
  registerBookmarkCommands(context, storageMap);
  registerGroupCommands(context, storageMap);
  registerSearchCommand(context, storageMap);

  // Refresh commands (per-view)
  context.subscriptions.push(
    vscode.commands.registerCommand('quickmark.refreshPersonal', () =>
      personalTreeProvider.refresh()
    ),
    vscode.commands.registerCommand('quickmark.refreshTeam', () =>
      teamTreeProvider.refresh()
    )
  );

  // ── Disposables ────────────────────────────────────────────────────
  context.subscriptions.push(
    personalTreeView,
    teamTreeView,
    personalStorage,
    teamStorage,
    personalTreeProvider,
    teamTreeProvider,
  );
}

export function deactivate(): void {
  // Nothing special — VS Code disposes subscriptions automatically.
}
