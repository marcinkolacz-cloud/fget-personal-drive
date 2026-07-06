import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronRight,
  Download,
  Folder,
  Link2,
  MoveRight,
  Trash2,
} from "lucide-react";
import type { FileMetadata, FileSystemItem, FolderMetadata } from "../backend";
import { getFileExtension, isImage, isVideo } from "../lib/fileTypes";
import {
  getContainingFolderPath,
  getFolderContainingPath,
} from "../lib/folderNavigation";

interface FileGalleryProps {
  items: FileSystemItem[];
  isLoading: boolean;
  error: Error | null;
  isSearchActive: boolean;
  selectedItems: Set<string>;
  onSelectItem: (itemId: string, checked: boolean) => void;
  onFolderClick: (folder: FolderMetadata) => void;
  onFileClick: (file: FileMetadata) => void;
  onDownload: (file: FileMetadata) => Promise<void>;
  onCopyLink: (file: FileMetadata) => Promise<void>;
  onMove: (id: string, name: string, isFolder: boolean) => void;
  onDelete: (id: string, name: string, isFolder: boolean) => void;
  onSearchResultPathClick: (item: FileSystemItem, e: React.MouseEvent) => void;
  allFolders: FolderMetadata[];
}

export function FileGallery({
  items,
  isLoading,
  error,
  isSearchActive,
  selectedItems,
  onSelectItem,
  onFolderClick,
  onFileClick,
  onDownload,
  onCopyLink,
  onMove,
  onDelete,
  onSearchResultPathClick,
  allFolders,
}: FileGalleryProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {(
          ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"] as const
        ).map((k) => (
          <Skeleton key={k} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading files: {error.message}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {isSearchActive ? "No results found" : "No files or folders yet"}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((item) => {
          const isFolder = item.__kind__ === "folder";
          const data = isFolder ? item.folder : item.file;
          const itemId = data.id;
          const isSelected = selectedItems.has(itemId);

          return (
            <div
              key={itemId}
              className="group relative aspect-square rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Selection checkbox */}
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    onSelectItem(itemId, checked as boolean)
                  }
                  className="bg-background/80 backdrop-blur-sm"
                  aria-label={`Select ${data.name}`}
                />
              </div>

              {/* Actions dropdown */}
              <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                    >
                      <span className="sr-only">Actions</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-label="Actions"
                        role="img"
                      >
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isFolder && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={() => onDownload(item.file)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={() => onCopyLink(item.file)}
                            >
                              <Link2 className="h-4 w-4 mr-2" />
                              Copy link
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>Copy Link</TooltipContent>
                        </Tooltip>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onClick={() => onMove(itemId, data.name, isFolder)}
                        >
                          <MoveRight className="h-4 w-4 mr-2" />
                          Move
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>Move</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onClick={() => onDelete(itemId, data.name, isFolder)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Thumbnail/Preview */}
              <button
                type="button"
                onClick={() =>
                  isFolder ? onFolderClick(item.folder) : onFileClick(item.file)
                }
                className="w-full h-full flex flex-col"
              >
                <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
                  {isFolder ? (
                    <Folder className="h-16 w-16 text-yellow-500" />
                  ) : isImage(getFileExtension(data.name)) ? (
                    <img
                      src={item.file.blob.getDirectURL()}
                      alt={data.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : isVideo(getFileExtension(data.name)) ? (
                    <video
                      src={item.file.blob.getDirectURL()}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    <div className="text-4xl font-bold text-muted-foreground uppercase">
                      {getFileExtension(data.name) || "?"}
                    </div>
                  )}
                </div>

                {/* Name and path */}
                <div className="p-2 bg-background border-t">
                  <p className="text-sm font-medium truncate" title={data.name}>
                    {data.name}
                  </p>
                  {isSearchActive && allFolders && (
                    <button
                      type="button"
                      onClick={(e) => onSearchResultPathClick(item, e)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate flex items-center gap-1 w-full"
                      title="Click to navigate to containing folder"
                    >
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {isFolder
                          ? getFolderContainingPath(
                              item.folder.parentId,
                              allFolders,
                            )
                          : getContainingFolderPath(
                              item.file.parentId,
                              allFolders,
                            )}
                      </span>
                    </button>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
