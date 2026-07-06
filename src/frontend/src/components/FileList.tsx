import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileQuestion,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderPlus,
  FolderUp,
  Image as ImageIcon,
  LayoutGrid,
  LayoutList,
  Link2,
  Loader2,
  Lock,
  MoveRight,
  Music,
  Search,
  Trash2,
  Upload,
  Video as VideoIcon,
  X,
} from "lucide-react";
import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { toast } from "sonner";
import type {
  FileMetadata,
  FileMove,
  FileSystemItem,
  FolderMetadata,
} from "../backend";
import { ExternalBlob } from "../backend";
import {
  type ViewMode,
  usePerFolderViewMode,
} from "../hooks/usePerFolderViewMode";
import {
  useAddFile,
  useCreateFolder,
  useDeleteFile,
  useDeleteFolder,
  useGetAllFolders,
  useGetFolderContents,
  useMoveItem,
  useMoveItems,
  useSearchSubtree,
} from "../hooks/useQueries";
import { extractDroppedFiles } from "../lib/dragDropDirectory";
import {
  decryptBytes,
  encryptBytes,
  isEncryptedBytes,
} from "../lib/encryption";
import { copyFileLink, downloadFile } from "../lib/fileLinks";
import {
  getFileTypeTintClasses,
  getFolderTintClasses,
  getUnknownTypeTintClasses,
} from "../lib/fileTypeTints";
import {
  type FileCategory,
  detectTypeFromBytes,
  getFileCategory,
  getFileExtension,
  getFileTypeLabel,
  getMimeType,
  isImage,
  isPreviewable,
} from "../lib/fileTypes";
import {
  buildBreadcrumbPath,
  getContainingFolderPath,
  getFolderContainingPath,
  getFolderPathString,
  resolveFileParentPath,
  resolvePathSegment,
} from "../lib/folderNavigation";
import {
  extractFolderFiles,
  uploadFolderRecursively,
  validateFolderFiles,
} from "../lib/folderUpload";
import { formatFileSize } from "../lib/formatFileSize";
import { formatCompactTimestamp } from "../lib/formatTime";
import { generateSecure32ByteId } from "../lib/id";
import {
  type SortDirection,
  type SortField,
  sortFileSystemItems,
} from "../lib/sortFileSystemItems";
import { FileGallery } from "./FileGallery";
import { FileListHeaderRow } from "./FileListHeaderRow";
import { FilePreviewModal } from "./FilePreviewModal";

interface FileListProps {
  currentFolderId: string | null;
  onFolderNavigate: (folderId: string | null) => void;
}

interface FileUploadProgress {
  fileName: string;
  percentage: number;
  status: "uploading" | "complete" | "error" | "warning";
}

// Module-level cache to avoid re-fetching bytes for type detection
const _typeDetectionCache = new Map<string, string>();

export function FileList({ currentFolderId, onFolderNavigate }: FileListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [folderPath, setFolderPath] = useState<
    Array<{ id: string | null; name: string }>
  >([{ id: null, name: "Drive" }]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState<
    Map<string, FileUploadProgress>
  >(new Map());
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Per-folder view mode
  const { getViewMode, setViewMode } = usePerFolderViewMode();
  const currentViewMode = getViewMode(currentFolderId);

  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [detectedTypeLabels, setDetectedTypeLabels] = useState<
    Map<string, string>
  >(new Map());

  // Encryption state
  const [encryptUploads, setEncryptUploads] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState("");
  const [encryptedFileIds, setEncryptedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [showDecryptDialog, setShowDecryptDialog] = useState(false);
  const [decryptTargetFile, setDecryptTargetFile] =
    useState<FileMetadata | null>(null);
  const [decryptPassword, setDecryptPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: items,
    isLoading,
    error,
  } = useGetFolderContents(currentFolderId);
  const { data: searchResults, isLoading: searchLoading } = useSearchSubtree(
    searchTerm,
    currentFolderId,
  );
  const { data: allFolders } = useGetAllFolders();

  // Detect file types from magic bytes for files showing as N/A
  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      for (const item of items ?? []) {
        if (cancelled) break;
        const file = "file" in item ? item.file : null;
        if (!file) continue;
        // scan all files for encryption, not just N/A ones
        if (_typeDetectionCache.has(file.id)) continue;
        try {
          const rawBytes = await file.blob.getBytes();
          if (cancelled) break;
          const uint8 = new Uint8Array(rawBytes);
          const mime = detectTypeFromBytes(uint8);
          if (mime === "application/x-fget-encrypted") {
            _typeDetectionCache.set(file.id, "ENC");
            setDetectedTypeLabels((prev) => {
              const next = new Map(prev);
              next.set(file.id, "ENC");
              return next;
            });
            setEncryptedFileIds((prev) => new Set([...prev, file.id]));
            continue;
          }
          if (mime && mime !== "application/octet-stream") {
            const sub = mime.split("/")[1] || "";
            const labelMap: Record<string, string> = {
              jpeg: "JPEG",
              png: "PNG",
              gif: "GIF",
              webp: "WEBP",
              bmp: "BMP",
              pdf: "PDF",
              zip: "ZIP",
              gzip: "GZIP",
              mp4: "MP4",
              webm: "WEBM",
              "x-msvideo": "AVI",
              mpeg: "MP3",
              wav: "WAV",
              flac: "FLAC",
              ogg: "OGG",
              rtf: "RTF",
              "x-rar-compressed": "RAR",
              "x-7z-compressed": "7Z",
            };
            const label = labelMap[sub] || sub.toUpperCase() || "?";
            _typeDetectionCache.set(file.id, label);
            setDetectedTypeLabels((prev) => {
              const next = new Map(prev);
              next.set(file.id, label);
              return next;
            });
          } else {
            // Try to decode as UTF-8 text as last resort
            try {
              const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
                uint8,
              );
              if (decoded.length > 0) {
                _typeDetectionCache.set(file.id, "TXT");
                setDetectedTypeLabels((prev) => {
                  const next = new Map(prev);
                  next.set(file.id, "TXT");
                  return next;
                });
              } else {
                _typeDetectionCache.set(file.id, "N/A");
              }
            } catch {
              _typeDetectionCache.set(file.id, "N/A");
            }
          }
        } catch {
          // skip on error
        }
      }
    };
    detect();
    return () => {
      cancelled = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: items is intentional
  }, [items]);
  const createFolder = useCreateFolder();
  const addFile = useAddFile();

  // Determine if we're in search mode
  const isSearchActive = searchTerm.trim().length > 0;

  const deleteFile = useDeleteFile();
  const deleteFolder = useDeleteFolder();
  const moveItem = useMoveItem();
  const moveItems = useMoveItems();

  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    name: string;
    isFolder: boolean;
  } | null>(null);
  const [itemToMove, setItemToMove] = useState<{
    id: string;
    name: string;
    isFolder: boolean;
  } | null>(null);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);

  // Bulk action states
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkMoveDestination, setBulkMoveDestination] = useState<string | null>(
    null,
  );

  const rawDisplayItems = isSearchActive ? searchResults : items;

  // Apply sorting to display items
  const displayItems = useMemo(() => {
    if (!rawDisplayItems) return undefined;
    return sortFileSystemItems(rawDisplayItems, sortField, sortDirection);
  }, [rawDisplayItems, sortField, sortDirection]);

  // Get ALL files in current context for navigation (not just previewable), sorted
  const allFilesInContext = useMemo(() => {
    if (!displayItems) return [];
    return displayItems
      .filter(
        (item): item is { __kind__: "file"; file: FileMetadata } =>
          item.__kind__ === "file",
      )
      .map((item) => item.file);
  }, [displayItems]);

  const handleFileClick = useCallback(
    (file: FileMetadata) => {
      const fileIndex = allFilesInContext.findIndex((f) => f.id === file.id);
      if (fileIndex !== -1) {
        setCurrentFileIndex(fileIndex);
        setPreviewFile(file);
        setShowPreview(true);
      }
    },
    [allFilesInContext],
  );

  const handleNavigateFile = useCallback(
    (index: number) => {
      if (
        allFilesInContext.length === 0 ||
        index < 0 ||
        index >= allFilesInContext.length
      )
        return;

      setCurrentFileIndex(index);
      setPreviewFile(allFilesInContext[index]);
    },
    [allFilesInContext],
  );

  const handleEncryptionDetected = useCallback((fileId: string) => {
    _typeDetectionCache.set(fileId, "ENC");
    setEncryptedFileIds((prev) => new Set([...prev, fileId]));
    setDetectedTypeLabels((prev) => {
      const next = new Map(prev);
      next.set(fileId, "ENC");
      return next;
    });
  }, []);

  const handleFolderClick = (folder: FolderMetadata) => {
    onFolderNavigate(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
    setSearchTerm("");
    setSelectedItems(new Set());
  };

  const handleBreadcrumbClick = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    onFolderNavigate(newPath[newPath.length - 1].id);
    setSearchTerm("");
    setSelectedItems(new Set());
  };

  // Navigate to containing folder from search result path click
  const handleSearchResultPathClick = (
    item: FileSystemItem,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();

    if (!allFolders) {
      toast.error("Folder list not loaded");
      return;
    }

    try {
      let targetFolderId: string | null;

      if (item.__kind__ === "folder") {
        // For folders, navigate to the parent folder
        targetFolderId = item.folder.parentId || null;
      } else {
        // For files, navigate to the containing folder (parent)
        targetFolderId = item.file.parentId || null;
      }

      const newPath = buildBreadcrumbPath(targetFolderId, allFolders);

      onFolderNavigate(targetFolderId);
      setFolderPath(newPath);
      setSearchTerm("");
      setSelectedItems(new Set());

      const targetName =
        targetFolderId === null
          ? "Drive"
          : allFolders.find((f) => f.id === targetFolderId)?.name || "folder";
      toast.success(`Navigated to ${targetName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to navigate";
      toast.error(errorMessage);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("Folder name cannot be empty");
      return;
    }

    try {
      await createFolder.mutateAsync({
        name: newFolderName.trim(),
        parentId: currentFolderId,
      });
      toast.success("Folder created successfully");
      setShowCreateFolder(false);
      setNewFolderName("");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create folder";
      toast.error(errorMessage);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.isFolder) {
        await deleteFolder.mutateAsync(itemToDelete.id);
        toast.success("Folder deleted successfully");
      } else {
        await deleteFile.mutateAsync(itemToDelete.id);
        toast.success("File deleted successfully");
      }
      setItemToDelete(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete item";
      toast.error(errorMessage);
    }
  };

  const handleMoveConfirm = async () => {
    if (!itemToMove) return;

    try {
      await moveItem.mutateAsync({
        itemId: itemToMove.id,
        newParentId: moveDestination,
        isFolder: itemToMove.isFolder,
      });
      toast.success("Item moved successfully");
      setItemToMove(null);
      setMoveDestination(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to move item";
      toast.error(errorMessage);
    }
  };

  // Multi-select handlers
  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelection = new Set(selectedItems);
    if (checked) {
      newSelection.add(itemId);
    } else {
      newSelection.delete(itemId);
    }
    setSelectedItems(newSelection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (!displayItems) return;

    if (checked) {
      const allIds = new Set(
        displayItems.map((item) =>
          item.__kind__ === "file" ? item.file.id : item.folder.id,
        ),
      );
      setSelectedItems(allIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedItems.size === 0) return;

    try {
      const itemsToDelete =
        displayItems?.filter((item) => {
          const id = item.__kind__ === "file" ? item.file.id : item.folder.id;
          return selectedItems.has(id);
        }) || [];

      for (const item of itemsToDelete) {
        if (item.__kind__ === "folder") {
          await deleteFolder.mutateAsync(item.folder.id);
        } else {
          await deleteFile.mutateAsync(item.file.id);
        }
      }

      toast.success(`${selectedItems.size} item(s) deleted successfully`);
      setSelectedItems(new Set());
      setShowBulkDelete(false);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete items";
      toast.error(errorMessage);
    }
  };

  const handleBulkMoveConfirm = async () => {
    if (selectedItems.size === 0) return;

    try {
      const itemsToMove =
        displayItems?.filter((item) => {
          const id = item.__kind__ === "file" ? item.file.id : item.folder.id;
          return selectedItems.has(id);
        }) || [];

      const moves: FileMove[] = itemsToMove.map((item) => ({
        id: item.__kind__ === "file" ? item.file.id : item.folder.id,
        isFolder: item.__kind__ === "folder",
        newParentId: bulkMoveDestination || undefined,
      }));

      await moveItems.mutateAsync(moves);

      toast.success(`${selectedItems.size} item(s) moved successfully`);
      setSelectedItems(new Set());
      setShowBulkMove(false);
      setBulkMoveDestination(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to move items";
      toast.error(errorMessage);
    }
  };

  const allSelected = Boolean(
    displayItems &&
      displayItems.length > 0 &&
      selectedItems.size === displayItems.length,
  );
  const someSelected = selectedItems.size > 0 && !allSelected;

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (encryptUploads && encryptPassword.trim().length === 0) {
      // Reset file input so the same file can be re-selected after the user sets a password
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast.error(
        "Encryption password is required. Enter a password or uncheck Encrypt.",
      );
      return;
    }

    const fileArray = Array.from(files);

    // Filter out empty files
    const nonEmptyFiles: File[] = [];
    const emptyFiles: string[] = [];

    for (const file of fileArray) {
      if (file.size === 0) {
        emptyFiles.push(file.name);
      } else {
        nonEmptyFiles.push(file);
      }
    }

    // Show info for skipped empty files
    if (emptyFiles.length > 0) {
      if (emptyFiles.length === 1) {
        toast.info(`Skipped empty file: ${emptyFiles[0]}`);
      } else {
        toast.info(`Skipped ${emptyFiles.length} empty files`);
      }
    }

    // If all files were empty, return early
    if (nonEmptyFiles.length === 0) {
      toast.info("No non-empty files to upload");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Initialize progress for all files
    const newProgress = new Map<string, FileUploadProgress>();
    for (const file of nonEmptyFiles) {
      newProgress.set(file.name, {
        fileName: file.name,
        percentage: 0,
        status: "uploading",
      });
    }
    setFileUploadProgress((prev) => new Map([...prev, ...newProgress]));

    for (let i = 0; i < nonEmptyFiles.length; i++) {
      const file = nonEmptyFiles[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Encrypt if enabled
        const fileId = generateSecure32ByteId();
        const uploadBytes =
          encryptUploads && encryptPassword.length > 0
            ? await encryptBytes(uint8Array, encryptPassword)
            : (uint8Array as Uint8Array<ArrayBuffer>);

        const blob = ExternalBlob.fromBytes(uploadBytes).withUploadProgress(
          (percentage) => {
            setFileUploadProgress((prev) => {
              const updated = new Map(prev);
              const current = updated.get(file.name);
              if (current) {
                updated.set(file.name, { ...current, percentage });
              }
              return updated;
            });
          },
        );

        await addFile.mutateAsync({
          id: fileId,
          name: file.name,
          size: BigInt(uploadBytes.length),
          blob,
          parentId: currentFolderId,
          isEncrypted: encryptUploads && encryptPassword.length > 0,
        });

        // Track encrypted file IDs
        if (encryptUploads && encryptPassword.length > 0) {
          setEncryptedFileIds((prev) => new Set([...prev, fileId]));
          _typeDetectionCache.set(fileId, "ENC");
          setDetectedTypeLabels((prev) => {
            const next = new Map(prev);
            next.set(fileId, "ENC");
            return next;
          });
        }

        // Mark as complete
        setFileUploadProgress((prev) => {
          const updated = new Map(prev);
          const current = updated.get(file.name);
          if (current) {
            updated.set(file.name, {
              ...current,
              percentage: 100,
              status: "complete",
            });
          }
          return updated;
        });

        toast.success(`${file.name} uploaded successfully`);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        // Check if file was actually saved despite the error (false positive)
        const fileExistsInList = (items ?? []).some(
          (item) => item.__kind__ === "file" && item.file.name === file.name,
        );
        const uploadStatus = fileExistsInList ? "warning" : "error";
        setFileUploadProgress((prev) => {
          const updated = new Map(prev);
          const current = updated.get(file.name);
          if (current) {
            updated.set(file.name, { ...current, status: uploadStatus });
          }
          return updated;
        });

        if (fileExistsInList) {
          toast.warning(
            `${file.name} upload status uncertain — file may have been saved`,
          );
        } else {
          toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
        }
      }
    }

    // Clear progress after a delay, only if no uploads are still in progress
    setTimeout(() => {
      setFileUploadProgress((prev) => {
        const anyUploading = Array.from(prev.values()).some(
          (p) => p.status === "uploading",
        );
        return anyUploading ? prev : new Map();
      });
    }, 10000);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFolderUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (encryptUploads && encryptPassword.trim().length === 0) {
      // Reset folder input so the same folder can be re-selected after the user sets a password
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
      toast.error(
        "Encryption password is required. Enter a password or uncheck Encrypt.",
      );
      return;
    }

    const fileArray = Array.from(files);

    // Validate that all files have relative paths
    if (!validateFolderFiles(fileArray)) {
      toast.error(
        "Browser does not support folder upload with structure. Please try drag-and-drop instead.",
      );
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
      return;
    }

    const folderFiles = extractFolderFiles(files);

    if (folderFiles.length === 0) {
      toast.error("No files found in the selected folder");
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
      return;
    }

    const shouldEncrypt = encryptUploads && encryptPassword.length > 0;

    try {
      // Initialize progress for all files
      const newProgress = new Map<string, FileUploadProgress>();
      for (const folderFile of folderFiles) {
        newProgress.set(folderFile.file.name, {
          fileName: folderFile.file.name,
          percentage: 0,
          status: "uploading",
        });
      }
      setFileUploadProgress((prev) => new Map([...prev, ...newProgress]));

      await uploadFolderRecursively(folderFiles, currentFolderId, {
        createFolder: async (name: string, parentId: string | null) => {
          return createFolder.mutateAsync({ name, parentId });
        },
        addFile: async (params) => {
          return addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          const percentage = Math.round((current / total) * 100);
          setFileUploadProgress((prev) => {
            const updated = new Map(prev);
            const fileProgress = updated.get(fileName);
            if (fileProgress) {
              updated.set(fileName, { ...fileProgress, percentage });
            }
            return updated;
          });
        },
        ...(shouldEncrypt
          ? {
              encryptFile: async (bytes: Uint8Array) =>
                encryptBytes(bytes, encryptPassword),
              onFileUploaded: (fileId: string) => {
                _typeDetectionCache.set(fileId, "ENC");
                setEncryptedFileIds((prev) => new Set([...prev, fileId]));
                setDetectedTypeLabels((prev) => {
                  const next = new Map(prev);
                  next.set(fileId, "ENC");
                  return next;
                });
              },
            }
          : {}),
      });

      // Mark all as complete
      setFileUploadProgress((prev) => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: "complete" });
        }
        return updated;
      });

      toast.success("Folder uploaded successfully");

      // Clear progress after a delay, only if no uploads are still in progress
      setTimeout(() => {
        setFileUploadProgress((prev) => {
          const anyUploading = Array.from(prev.values()).some(
            (p) => p.status === "uploading",
          );
          return anyUploading ? prev : new Map();
        });
      }, 10000);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Folder upload failed";
      toast.error(errorMessage);

      // Mark all as error
      setFileUploadProgress((prev) => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, status: "error" });
        }
        return updated;
      });
    } finally {
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer || !dataTransfer.items || dataTransfer.items.length === 0)
      return;

    if (encryptUploads && encryptPassword.trim().length === 0) {
      toast.error(
        "Encryption password is required. Enter a password or uncheck Encrypt.",
      );
      return;
    }

    const shouldEncrypt = encryptUploads && encryptPassword.length > 0;

    try {
      const folderFiles = await extractDroppedFiles(dataTransfer);

      if (folderFiles.length === 0) {
        toast.error("No files found in the dropped items");
        return;
      }

      // Initialize progress for all files
      const newProgress = new Map<string, FileUploadProgress>();
      for (const folderFile of folderFiles) {
        newProgress.set(folderFile.file.name, {
          fileName: folderFile.file.name,
          percentage: 0,
          status: "uploading",
        });
      }
      setFileUploadProgress((prev) => new Map([...prev, ...newProgress]));

      await uploadFolderRecursively(folderFiles, currentFolderId, {
        createFolder: async (name: string, parentId: string | null) => {
          return createFolder.mutateAsync({ name, parentId });
        },
        addFile: async (params) => {
          return addFile.mutateAsync(params);
        },
        onProgress: (current, total, fileName) => {
          const percentage = Math.round((current / total) * 100);
          setFileUploadProgress((prev) => {
            const updated = new Map(prev);
            const fileProgress = updated.get(fileName);
            if (fileProgress) {
              updated.set(fileName, { ...fileProgress, percentage });
            }
            return updated;
          });
        },
        ...(shouldEncrypt
          ? {
              encryptFile: async (bytes: Uint8Array) =>
                encryptBytes(bytes, encryptPassword),
              onFileUploaded: (fileId: string) => {
                _typeDetectionCache.set(fileId, "ENC");
                setEncryptedFileIds((prev) => new Set([...prev, fileId]));
                setDetectedTypeLabels((prev) => {
                  const next = new Map(prev);
                  next.set(fileId, "ENC");
                  return next;
                });
              },
            }
          : {}),
      });

      // Mark all as complete
      setFileUploadProgress((prev) => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, percentage: 100, status: "complete" });
        }
        return updated;
      });

      toast.success("Files uploaded successfully");

      // Clear progress after a delay, only if no uploads are still in progress
      setTimeout(() => {
        setFileUploadProgress((prev) => {
          const anyUploading = Array.from(prev.values()).some(
            (p) => p.status === "uploading",
          );
          return anyUploading ? prev : new Map();
        });
      }, 10000);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      toast.error(errorMessage);

      // Mark all as error
      setFileUploadProgress((prev) => {
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          updated.set(key, { ...value, status: "error" });
        }
        return updated;
      });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleCopyLink = useCallback(async (file: FileMetadata) => {
    await copyFileLink(file);
  }, []);

  const handleDownload = useCallback(
    async (file: FileMetadata) => {
      // If already known to be encrypted, show decrypt dialog immediately
      if (
        encryptedFileIds.has(file.id) ||
        detectedTypeLabels.get(file.id) === "ENC"
      ) {
        setDecryptTargetFile(file);
        setDecryptPassword("");
        setShowDecryptDialog(true);
        return;
      }
      // Always fetch bytes and check for encryption before downloading
      try {
        const rawBytes = await file.blob.getBytes();
        const uint8 = new Uint8Array(rawBytes);
        if (detectTypeFromBytes(uint8) === "application/x-fget-encrypted") {
          // Discovered to be encrypted — update state and show decrypt dialog
          _typeDetectionCache.set(file.id, "ENC");
          setDetectedTypeLabels((prev) => {
            const next = new Map(prev);
            next.set(file.id, "ENC");
            return next;
          });
          setEncryptedFileIds((prev) => new Set([...prev, file.id]));
          setDecryptTargetFile(file);
          setDecryptPassword("");
          setShowDecryptDialog(true);
          return;
        }
        // Not encrypted — download using already-fetched bytes
        const ext = getFileExtension(file.name);
        const detectedMime = detectTypeFromBytes(uint8);
        const mime =
          getMimeType(ext) ||
          (detectedMime !== "application/octet-stream" ? detectedMime : null) ||
          "application/octet-stream";
        const blob = new Blob([uint8], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 100);
      } catch {
        await downloadFile(file);
      }
    },
    [encryptedFileIds, detectedTypeLabels],
  );

  const handleDecryptAndDownload = async () => {
    if (!decryptTargetFile || !decryptPassword) return;
    setIsDecrypting(true);
    try {
      const rawBytes = await decryptTargetFile.blob.getBytes();
      const decrypted = await decryptBytes(
        new Uint8Array(rawBytes),
        decryptPassword,
      );
      const ext = getFileExtension(decryptTargetFile.name);
      const mime = getMimeType(ext) || "application/octet-stream";
      const blob = new Blob([decrypted], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = decryptTargetFile.name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      setShowDecryptDialog(false);
      setDecryptPassword("");
      setDecryptTargetFile(null);
      toast.success(`${decryptTargetFile.name} downloaded`);
    } catch {
      toast.error("Decryption failed. Check your password.");
    } finally {
      setIsDecrypting(false);
    }
  };

  const isUploading = fileUploadProgress.size > 0;

  return (
    <TooltipProvider>
      <div
        className="space-y-4"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center space-x-2 text-sm">
          {folderPath.map((segment, index) => (
            <React.Fragment key={segment.id || "root"}>
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(index)}
                className="breadcrumb-link"
              >
                {segment.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Search and Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search files and folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Single View Toggle Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setViewMode(
                      currentFolderId,
                      currentViewMode === "list" ? "gallery" : "list",
                    )
                  }
                  aria-label={
                    currentViewMode === "list"
                      ? "Switch to Grid View"
                      : "Switch to List View"
                  }
                >
                  {currentViewMode === "list" ? (
                    <LayoutGrid className="h-4 w-4" />
                  ) : (
                    <LayoutList className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {currentViewMode === "list"
                  ? "Switch to Grid View"
                  : "Switch to List View"}
              </TooltipContent>
            </Tooltip>

            {/* Upload Files Button */}
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-background text-foreground border border-blue-500/25 hover:bg-accent hover:text-accent-foreground"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />

            {/* New Folder Button */}
            <Button
              onClick={() => setShowCreateFolder(true)}
              className="bg-background text-foreground border border-yellow-500/25 hover:bg-accent hover:text-accent-foreground"
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>

            {/* Upload Folder Button */}
            <Button
              onClick={() => folderInputRef.current?.click()}
              className="bg-background text-foreground border border-yellow-500/25 hover:bg-accent hover:text-accent-foreground"
            >
              <FolderUp className="h-4 w-4 mr-2" />
              Upload Folder
            </Button>
            <input
              ref={folderInputRef}
              type="file"
              /* @ts-ignore - webkitdirectory is not in the type definition */
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderUpload}
              className="hidden"
            />

            {/* Encrypt uploads option — inline with upload buttons */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-muted-foreground border border-transparent px-2 py-1.5 rounded hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={encryptUploads}
                onChange={(e) => {
                  setEncryptUploads(e.target.checked);
                  if (!e.target.checked) setEncryptPassword("");
                }}
                className="h-3.5 w-3.5"
              />
              <Lock className="h-3.5 w-3.5" />
              <span>Encrypt</span>
            </label>
            {encryptUploads && (
              <Input
                type="password"
                placeholder="Password"
                value={encryptPassword}
                onChange={(e) => setEncryptPassword(e.target.value)}
                className="h-9 w-36 text-sm"
              />
            )}
          </div>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium">Uploading files...</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from(fileUploadProgress.values()).map((progress) => (
                <div key={progress.fileName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className="truncate max-w-[70%]"
                      title={progress.fileName}
                    >
                      {progress.fileName}
                    </span>
                    <span className="text-muted-foreground">
                      {progress.status === "complete" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : progress.status === "error" ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : progress.status === "warning" ? (
                        <span title="Upload status uncertain — file may have been saved">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </span>
                      ) : (
                        `${progress.percentage}%`
                      )}
                    </span>
                  </div>
                  <Progress
                    value={progress.percentage}
                    className={`h-1.5 ${
                      progress.status === "error"
                        ? "bg-destructive/20"
                        : progress.status === "warning"
                          ? "bg-amber-500/20"
                          : ""
                    }`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Multi-select actions */}
        {selectedItems.size > 0 && (
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedItems.size} item(s) selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkMove(true)}
                  >
                    <MoveRight className="h-4 w-4 mr-2" />
                    Move
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Drag and Drop Overlay */}
        {isDragging && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="text-center">
              <Upload className="h-16 w-16 mx-auto mb-4 text-primary" />
              <p className="text-xl font-semibold">
                Drop files or folders here
              </p>
            </div>
          </div>
        )}

        {/* File List or Gallery */}
        {currentViewMode === "list" ? (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <FileListHeaderRow
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  allSelected={allSelected}
                  someSelected={someSelected}
                  onSelectAll={handleSelectAll}
                  showLocationColumn={isSearchActive}
                />
                <tbody>
                  {isLoading || searchLoading ? (
                    <tr>
                      <td colSpan={isSearchActive ? 6 : 5} className="p-8">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td
                        colSpan={isSearchActive ? 6 : 5}
                        className="p-8 text-center text-destructive"
                      >
                        Error loading files: {error.message}
                      </td>
                    </tr>
                  ) : !displayItems || displayItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isSearchActive ? 6 : 5}
                        className="p-8 text-center text-muted-foreground"
                      >
                        {isSearchActive
                          ? "No results found"
                          : "No files or folders yet"}
                      </td>
                    </tr>
                  ) : (
                    displayItems.map((item) => {
                      const isFolder = item.__kind__ === "folder";
                      const data = isFolder ? item.folder : item.file;
                      const itemId = data.id;
                      const isSelected = selectedItems.has(itemId);

                      return (
                        <tr
                          key={itemId}
                          className="border-t hover:bg-muted/50 transition-colors"
                        >
                          {/* Selection Checkbox */}
                          <td className="p-3 w-12">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleSelectItem(itemId, checked as boolean)
                              }
                              aria-label={`Select ${data.name}`}
                            />
                          </td>

                          {/* Name */}
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                isFolder
                                  ? handleFolderClick(item.folder)
                                  : handleFileClick(item.file)
                              }
                              className="flex items-center gap-3 text-left w-full group"
                            >
                              {isFolder ? (
                                <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
                              ) : (
                                <span className="relative shrink-0 inline-flex">
                                  <File className="h-5 w-5 text-blue-400" />
                                  {detectedTypeLabels.get(item.file.id) ===
                                    "ENC" && (
                                    <Lock
                                      className="h-4 w-4 text-red-500 absolute -bottom-1 -right-1"
                                      strokeWidth={3}
                                    />
                                  )}
                                </span>
                              )}
                              <span
                                className="font-medium group-hover:text-primary transition-colors truncate max-w-xs"
                                title={data.name}
                              >
                                {data.name}
                              </span>
                            </button>
                          </td>

                          {/* Location (only in search mode) */}
                          {isSearchActive && (
                            <td className="p-3 text-sm text-muted-foreground">
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleSearchResultPathClick(item, e)
                                }
                                className="hover:text-foreground transition-colors flex items-center gap-1 truncate max-w-xs"
                                title="Click to navigate to containing folder"
                              >
                                <ChevronRight className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {isFolder
                                    ? getFolderContainingPath(
                                        item.folder.parentId,
                                        allFolders || [],
                                      )
                                    : getContainingFolderPath(
                                        item.file.parentId,
                                        allFolders || [],
                                      )}
                                </span>
                              </button>
                            </td>
                          )}

                          {/* Type */}
                          <td className="p-3 text-center">
                            {isFolder ? (
                              <Badge className={getFolderTintClasses()}>
                                Folder
                              </Badge>
                            ) : (
                              (() => {
                                const rawLabel = getFileTypeLabel(data.name);
                                const detectedLabel = detectedTypeLabels.get(
                                  item.file.id,
                                );
                                // Show original file type; ENC badge is on the file icon in Name column
                                const typeLabel =
                                  rawLabel === "N/A"
                                    ? detectedLabel && detectedLabel !== "ENC"
                                      ? detectedLabel
                                      : "N/A"
                                    : rawLabel;
                                const category = getFileCategory(data.name);
                                const tintClasses =
                                  typeLabel === "N/A"
                                    ? getUnknownTypeTintClasses()
                                    : getFileTypeTintClasses(category);
                                return (
                                  <Badge className={tintClasses}>
                                    {typeLabel}
                                  </Badge>
                                );
                              })()
                            )}
                          </td>

                          {/* Created */}
                          <td className="p-3 text-sm text-muted-foreground text-center">
                            {formatCompactTimestamp(data.createdAt)}
                          </td>

                          {/* Size */}
                          <td className="p-3 text-sm text-muted-foreground text-center">
                            {isFolder
                              ? "\u2014"
                              : formatFileSize(item.file.size)}
                          </td>

                          {/* Actions */}
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1">
                              {!isFolder && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          handleDownload(item.file)
                                        }
                                        className="h-8 w-8"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Download</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          !encryptedFileIds.has(item.file.id) &&
                                          handleCopyLink(item.file)
                                        }
                                        disabled={encryptedFileIds.has(
                                          item.file.id,
                                        )}
                                        className={
                                          encryptedFileIds.has(item.file.id)
                                            ? "h-8 w-8 opacity-40 cursor-not-allowed"
                                            : "h-8 w-8"
                                        }
                                      >
                                        <Link2
                                          className={
                                            encryptedFileIds.has(item.file.id)
                                              ? "h-4 w-4 text-red-500"
                                              : "h-4 w-4"
                                          }
                                        />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {encryptedFileIds.has(item.file.id)
                                        ? "Not available for encrypted files"
                                        : "Copy Link"}
                                    </TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setItemToMove({
                                        id: itemId,
                                        name: data.name,
                                        isFolder,
                                      })
                                    }
                                    className="h-8 w-8"
                                  >
                                    <MoveRight className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Move</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setItemToDelete({
                                        id: itemId,
                                        name: data.name,
                                        isFolder,
                                      })
                                    }
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <FileGallery
            items={displayItems || []}
            isLoading={isLoading || searchLoading}
            error={error}
            isSearchActive={isSearchActive}
            selectedItems={selectedItems}
            onSelectItem={handleSelectItem}
            onFolderClick={handleFolderClick}
            onFileClick={handleFileClick}
            onDownload={handleDownload}
            onCopyLink={handleCopyLink}
            onMove={(id, name, isFolder) =>
              setItemToMove({ id, name, isFolder })
            }
            onDelete={(id, name, isFolder) =>
              setItemToDelete({ id, name, isFolder })
            }
            onSearchResultPathClick={handleSearchResultPathClick}
            allFolders={allFolders || []}
          />
        )}

        {/* Create Folder Dialog */}
        <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
              <DialogDescription>
                Enter a name for the new folder
              </DialogDescription>
            </DialogHeader>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateFolder();
                }
              }}
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateFolder(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={createFolder.isPending}
              >
                {createFolder.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!itemToDelete}
          onOpenChange={() => setItemToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete{" "}
                {itemToDelete?.isFolder ? "the folder" : "the file"} "
                {itemToDelete?.name}"
                {itemToDelete?.isFolder && " and all its contents"}. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteFile.isPending || deleteFolder.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {selectedItems.size} item(s)?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the selected items and all their
                contents. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteFile.isPending || deleteFolder.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete All"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Move Dialog */}
        <Dialog open={!!itemToMove} onOpenChange={() => setItemToMove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move "{itemToMove?.name}"</DialogTitle>
              <DialogDescription>Select a destination folder</DialogDescription>
            </DialogHeader>
            <Select
              value={moveDestination || "root"}
              onValueChange={(value) =>
                setMoveDestination(value === "root" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Drive (Root)</SelectItem>
                {allFolders?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setItemToMove(null)}>
                Cancel
              </Button>
              <Button onClick={handleMoveConfirm} disabled={moveItem.isPending}>
                {moveItem.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Moving...
                  </>
                ) : (
                  "Move"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Move Dialog */}
        <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move {selectedItems.size} item(s)</DialogTitle>
              <DialogDescription>Select a destination folder</DialogDescription>
            </DialogHeader>
            <Select
              value={bulkMoveDestination || "root"}
              onValueChange={(value) =>
                setBulkMoveDestination(value === "root" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Drive (Root)</SelectItem>
                {allFolders?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkMove(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkMoveConfirm}
                disabled={moveItems.isPending}
              >
                {moveItems.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Moving...
                  </>
                ) : (
                  "Move All"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File Preview Modal */}
        {previewFile && (
          <FilePreviewModal
            file={previewFile}
            isOpen={showPreview}
            onClose={() => {
              setShowPreview(false);
              setPreviewFile(null);
            }}
            allFiles={allFilesInContext}
            currentFileIndex={currentFileIndex}
            onNavigateFile={handleNavigateFile}
            onEncryptionDetected={handleEncryptionDetected}
          />
        )}

        {/* Decrypt Download Dialog */}
        <Dialog
          open={showDecryptDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowDecryptDialog(false);
              setDecryptPassword("");
              setDecryptTargetFile(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Decrypt File
              </DialogTitle>
              <DialogDescription>
                &quot;{decryptTargetFile?.name}&quot; is encrypted. Enter the
                password to download.
              </DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              placeholder="Decryption password"
              value={decryptPassword}
              onChange={(e) => setDecryptPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDecryptAndDownload();
              }}
              autoFocus
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDecryptDialog(false);
                  setDecryptPassword("");
                  setDecryptTargetFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDecryptAndDownload}
                disabled={!decryptPassword || isDecrypting}
              >
                {isDecrypting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Decrypting...
                  </>
                ) : (
                  "Download"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
