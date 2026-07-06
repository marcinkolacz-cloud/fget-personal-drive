import { toast } from "sonner";
import { ExternalBlob } from "../backend";
import { generateSecure32ByteId } from "./id";

export interface FolderFile {
  file: File;
  relativePath: string;
}

export interface UploadCallbacks {
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  addFile: (params: {
    id: string;
    name: string;
    size: bigint;
    blob: ExternalBlob;
    parentId: string | null;
    isEncrypted: boolean;
  }) => Promise<void>;
  onProgress?: (current: number, total: number, fileName: string) => void;
  onSkipEmptyFile?: (fileName: string) => void;
  /** Optional: encrypt each file's bytes before upload */
  encryptFile?: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Optional: called after each file is uploaded, with its generated ID */
  onFileUploaded?: (fileId: string) => void;
}

/**
 * Extracts folder structure from FileList with webkitRelativePath
 */
export function extractFolderFiles(files: FileList): FolderFile[] {
  const result: FolderFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = (file as any).webkitRelativePath || file.name;

    // Normalize path: remove leading slash, use forward slashes
    const normalizedPath = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");

    result.push({
      file,
      relativePath: normalizedPath,
    });
  }

  return result;
}

/**
 * Validates that files have relative paths (folder structure)
 */
export function validateFolderFiles(files: File[]): boolean {
  if (files.length === 0) return false;

  // Check if at least one file has a webkitRelativePath
  return files.some((file) => {
    const path = (file as any).webkitRelativePath;
    return path?.includes("/");
  });
}

/**
 * Two-step folder upload:
 * 1. Create all required folders (deduped, depth-sorted)
 * 2. Upload all files using the resolved destination folder IDs
 *
 * Empty files (0 bytes) are skipped with info messages
 */
export async function uploadFolderRecursively(
  folderFiles: FolderFile[],
  rootParentId: string | null,
  callbacks: UploadCallbacks,
): Promise<void> {
  if (folderFiles.length === 0) return;

  // Filter out empty files and notify
  const nonEmptyFiles: FolderFile[] = [];
  const skippedFiles: string[] = [];

  for (const folderFile of folderFiles) {
    if (folderFile.file.size === 0) {
      skippedFiles.push(folderFile.file.name);
      if (callbacks.onSkipEmptyFile) {
        callbacks.onSkipEmptyFile(folderFile.file.name);
      }
    } else {
      nonEmptyFiles.push(folderFile);
    }
  }

  // Show info toast for skipped empty files
  if (skippedFiles.length > 0) {
    if (skippedFiles.length === 1) {
      toast.info(`Skipped empty file: ${skippedFiles[0]}`);
    } else {
      toast.info(`Skipped ${skippedFiles.length} empty files`);
    }
  }

  // If all files were empty, return early
  if (nonEmptyFiles.length === 0) {
    toast.info("No non-empty files to upload");
    return;
  }

  // Step 1: Build folder structure map
  const folderMap = new Map<string, string>(); // path -> folderId
  const foldersToCreate: Array<{
    path: string;
    name: string;
    parentPath: string | null;
  }> = [];

  // Extract unique folder paths
  const folderPaths = new Set<string>();
  for (const { relativePath } of nonEmptyFiles) {
    const parts = relativePath.split("/");
    // Build all ancestor paths
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      folderPaths.add(folderPath);
    }
  }

  // Sort by depth (shallow first) to ensure parents are created before children
  const sortedPaths = Array.from(folderPaths).sort((a, b) => {
    const depthA = a.split("/").length;
    const depthB = b.split("/").length;
    return depthA - depthB;
  });

  // Prepare folder creation list
  for (const path of sortedPaths) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;

    foldersToCreate.push({ path, name, parentPath });
  }

  // Create all folders
  for (const { path, name, parentPath } of foldersToCreate) {
    const parentId = parentPath
      ? folderMap.get(parentPath) || null
      : rootParentId;
    const folderId = await callbacks.createFolder(name, parentId);
    folderMap.set(path, folderId);
  }

  // Step 2: Upload all non-empty files
  for (let i = 0; i < nonEmptyFiles.length; i++) {
    const { file, relativePath } = nonEmptyFiles[i];

    // Determine parent folder
    const parts = relativePath.split("/");
    const fileName = parts[parts.length - 1];
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const parentId = folderPath
      ? folderMap.get(folderPath) || rootParentId
      : rootParentId;

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    let uint8Array = new Uint8Array(arrayBuffer);

    // Encrypt if callback provided
    if (callbacks.encryptFile) {
      uint8Array = new Uint8Array(await callbacks.encryptFile(uint8Array));
    }

    const fileId = generateSecure32ByteId();

    const blob = ExternalBlob.fromBytes(uint8Array).withUploadProgress(
      (_percentage) => {
        if (callbacks.onProgress) {
          callbacks.onProgress(i + 1, nonEmptyFiles.length, fileName);
        }
      },
    );

    // Upload file
    await callbacks.addFile({
      id: fileId,
      name: fileName,
      size: BigInt(uint8Array.length),
      blob,
      parentId,
      isEncrypted: !!callbacks.encryptFile,
    });

    // Notify caller of uploaded file ID (for tracking encrypted files etc.)
    if (callbacks.onFileUploaded) {
      callbacks.onFileUploaded(fileId);
    }

    if (callbacks.onProgress) {
      callbacks.onProgress(i + 1, nonEmptyFiles.length, fileName);
    }
  }
}
