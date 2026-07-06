/**
 * Helper to compute a folder subtree ID set from a full folder list.
 * Builds parent->children index once, traverses descendants deterministically.
 */
import type { FolderMetadata } from "../backend";

export function buildSubtreeFolderIds(
  allFolders: FolderMetadata[],
  startFolderId: string | null,
): Set<string> {
  const subtreeFolderIds = new Set<string>();

  // Build parent->children index
  const childrenMap = new Map<string | null | undefined, string[]>();
  for (const folder of allFolders) {
    const parentKey = folder.parentId ?? null;
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey)!.push(folder.id);
  }

  // Recursively add folder and its descendants
  const addFolderAndDescendants = (folderId: string) => {
    subtreeFolderIds.add(folderId);
    const children = childrenMap.get(folderId) || [];
    for (const childId of children) {
      addFolderAndDescendants(childId);
    }
  };

  // Build the subtree starting from startFolderId
  if (startFolderId) {
    addFolderAndDescendants(startFolderId);
  } else {
    // If startFolderId is null, include all root folders and their descendants
    const rootChildren = childrenMap.get(null) || [];
    for (const childId of rootChildren) {
      addFolderAndDescendants(childId);
    }
  }

  return subtreeFolderIds;
}
