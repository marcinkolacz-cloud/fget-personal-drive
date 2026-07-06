import { toast } from "sonner";

export interface DroppedFile {
  file: File;
  relativePath: string;
}

/**
 * Recursively traverses a directory entry and extracts all files with their relative paths
 */
async function traverseDirectory(
  entry: FileSystemEntry,
  basePath = "",
): Promise<DroppedFile[]> {
  const files: DroppedFile[] = [];

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });

    const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
    files.push({ file, relativePath });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();

    // Read all entries in the directory
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const allEntries: FileSystemEntry[] = [];

      const readEntries = () => {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readEntries();
          }
        }, reject);
      };

      readEntries();
    });

    // Recursively process each entry with correct path propagation
    const newBasePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    for (const childEntry of entries) {
      const childFiles = await traverseDirectory(childEntry, newBasePath);
      files.push(...childFiles);
    }
  }

  return files;
}

/**
 * Extracts files from dropped items, supporting both files and directories
 */
export async function extractDroppedFiles(
  dataTransfer: DataTransfer,
): Promise<DroppedFile[]> {
  const items = dataTransfer.items;
  const files: DroppedFile[] = [];

  // Check if FileSystem API is available
  if (
    items &&
    items.length > 0 &&
    typeof (items[0] as any).webkitGetAsEntry === "function"
  ) {
    // Use FileSystem API for directory traversal
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = (item as any).webkitGetAsEntry?.();

      if (entry) {
        try {
          const extractedFiles = await traverseDirectory(entry);
          files.push(...extractedFiles);
        } catch (error) {
          console.error("Error traversing directory:", error);
          toast.error("Failed to read some files from the dropped folder");
        }
      }
    }
  } else {
    // Fallback: treat as regular file drop
    const fileList = dataTransfer.files;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      files.push({
        file,
        relativePath: file.name,
      });
    }
  }

  return files;
}

/**
 * Checks if the dropped items contain any directories
 */
export function hasDirectories(dataTransfer: DataTransfer): boolean {
  const items = dataTransfer.items;

  if (!items || items.length === 0) return false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof (item as any).webkitGetAsEntry === "function") {
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        return true;
      }
    }
  }

  return false;
}
