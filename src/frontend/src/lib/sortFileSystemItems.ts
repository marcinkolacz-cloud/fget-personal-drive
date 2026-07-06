import type { FileMetadata, FileSystemItem, FolderMetadata } from "../backend";
import { getFileTypeLabel } from "./fileTypes";

export type SortField = "name" | "size" | "type" | "created" | "updated";
export type SortDirection = "asc" | "desc";

/**
 * Deterministic sort for FileSystemItem arrays with stable tie-breakers
 */
export function sortFileSystemItems(
  items: FileSystemItem[],
  field: SortField,
  direction: SortDirection,
): FileSystemItem[] {
  const sorted = [...items].sort((a, b) => {
    const aData = a.__kind__ === "file" ? a.file : a.folder;
    const bData = b.__kind__ === "file" ? b.file : b.folder;

    let comparison = 0;

    switch (field) {
      case "name":
        comparison = aData.name.localeCompare(bData.name, "en", {
          sensitivity: "base",
        });
        break;

      case "size": {
        // Folders have size 0 for sorting purposes
        const aSize = a.__kind__ === "file" ? Number(a.file.size) : 0;
        const bSize = b.__kind__ === "file" ? Number(b.file.size) : 0;
        comparison = aSize - bSize;
        break;
      }

      case "type": {
        const aType =
          a.__kind__ === "file" ? getFileTypeLabel(a.file.name) : "Folder";
        const bType =
          b.__kind__ === "file" ? getFileTypeLabel(b.file.name) : "Folder";
        comparison = aType.localeCompare(bType, "en", { sensitivity: "base" });
        break;
      }

      case "created": {
        const aCreated = Number(aData.createdAt);
        const bCreated = Number(bData.createdAt);
        comparison = aCreated - bCreated;
        break;
      }

      case "updated": {
        const aUpdated = Number(aData.updatedAt);
        const bUpdated = Number(bData.updatedAt);
        comparison = aUpdated - bUpdated;
        break;
      }
    }

    // Apply direction
    if (direction === "desc") {
      comparison = -comparison;
    }

    // Tie-breaker 1: kind (folders before files in asc, files before folders in desc)
    if (comparison === 0) {
      const kindComparison =
        a.__kind__ === "folder" && b.__kind__ === "file"
          ? -1
          : a.__kind__ === "file" && b.__kind__ === "folder"
            ? 1
            : 0;
      comparison = direction === "asc" ? kindComparison : -kindComparison;
    }

    // Tie-breaker 2: name (always ascending for stability)
    if (comparison === 0) {
      comparison = aData.name.localeCompare(bData.name, "en", {
        sensitivity: "base",
      });
    }

    // Tie-breaker 3: id (always ascending for absolute stability)
    if (comparison === 0) {
      comparison = aData.id.localeCompare(bData.id);
    }

    return comparison;
  });

  return sorted;
}
