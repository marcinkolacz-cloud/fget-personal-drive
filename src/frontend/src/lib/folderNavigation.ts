import type { FolderMetadata } from "../backend";

/**
 * Builds a breadcrumb path array from a folder ID
 */
export function buildBreadcrumbPath(
  folderId: string | null,
  allFolders: FolderMetadata[],
): Array<{ id: string | null; name: string }> {
  if (folderId === null) {
    return [{ id: null, name: "Drive" }];
  }

  const path: Array<{ id: string | null; name: string }> = [];
  let currentId: string | null = folderId;

  // Build path from target folder up to root
  while (currentId !== null) {
    const folder = allFolders.find((f) => f.id === currentId);
    if (!folder) break;

    path.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId || null;
  }

  // Add root
  path.unshift({ id: null, name: "Drive" });

  return path;
}

/**
 * Resolves a path segment to a folder ID
 * Returns null if the path is the root, or the folder ID if found
 * Throws an error if the path cannot be resolved
 */
export function resolvePathSegment(
  pathSegment: string,
  _currentFolderId: string | null,
  allFolders: FolderMetadata[],
): string | null {
  // Split the path into parts
  const parts = pathSegment.split("/").filter((p) => p.length > 0);

  if (parts.length === 0) {
    // Empty path means root
    return null;
  }

  // Start from root and navigate down
  let currentId: string | null = null;

  for (const part of parts) {
    const folder = allFolders.find(
      (f) => f.name === part && f.parentId === currentId,
    );

    if (!folder) {
      throw new Error(`Folder "${part}" not found in path "${pathSegment}"`);
    }

    currentId = folder.id;
  }

  return currentId;
}

/**
 * Gets the full path string for a folder
 */
export function getFolderPath(
  folderId: string | null,
  allFolders: FolderMetadata[],
): string {
  if (folderId === null) return "";

  const path: string[] = [];
  let currentId: string | null = folderId;

  while (currentId !== null) {
    const folder = allFolders.find((f) => f.id === currentId);
    if (!folder) break;

    path.unshift(folder.name);
    currentId = folder.parentId || null;
  }

  return path.join("/");
}

/**
 * Gets the full path string for a folder (alias for getFolderPath for clarity)
 */
export function getFolderPathString(
  folderId: string | undefined,
  allFolders: FolderMetadata[],
): string {
  if (!folderId) {
    return "Drive";
  }
  const path = getFolderPath(folderId, allFolders);
  return path || "Drive";
}

/**
 * Resolves a file's parent folder path to a navigable folder ID
 * Used for navigating from search results to the folder containing a file
 */
export function resolveFileParentPath(
  parentId: string | undefined,
  allFolders: FolderMetadata[],
): string | null {
  // If file has no parent, it's in root
  if (!parentId) {
    return null;
  }

  // Find the parent folder
  const parentFolder = allFolders.find((f) => f.id === parentId);
  if (!parentFolder) {
    throw new Error("Parent folder not found");
  }

  return parentFolder.id;
}

/**
 * Gets the containing folder path string for a file (excludes the filename)
 * Accepts parentId which can be string | undefined from FileMetadata
 */
export function getContainingFolderPath(
  parentId: string | undefined,
  allFolders: FolderMetadata[],
): string {
  if (!parentId) {
    return "Drive";
  }

  return getFolderPath(parentId, allFolders) || "Drive";
}

/**
 * Gets the containing folder path string for a folder (path to its parent)
 * Accepts parentId which can be string | undefined from FolderMetadata
 */
export function getFolderContainingPath(
  parentId: string | undefined,
  allFolders: FolderMetadata[],
): string {
  if (!parentId) {
    return "Drive";
  }

  return getFolderPath(parentId, allFolders) || "Drive";
}
