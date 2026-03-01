import * as vscode from 'vscode';
import { Bookmark } from '../models/bookmark';

/**
 * Checks which file-type bookmarks reference files that no longer exist on disk.
 * Returns the set of bookmark IDs whose target files are missing.
 */
export async function detectDeletedFiles(bookmarks: Bookmark[]): Promise<Set<string>> {
  const deletedIds = new Set<string>();

  const fileBookmarks = bookmarks.filter((b) => b.type === 'file');
  if (fileBookmarks.length === 0) {
    return deletedIds;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return deletedIds;
  }

  const rootUri = folders[0].uri;

  await Promise.all(
    fileBookmarks.map(async (b) => {
      const fileUri = vscode.Uri.joinPath(rootUri, b.target);
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        // File does not exist
        deletedIds.add(b.id);
      }
    })
  );

  return deletedIds;
}
