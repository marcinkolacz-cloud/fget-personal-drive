import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Music,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { FileMetadata } from "../backend";
import { decryptBytes } from "../lib/encryption";
import {
  detectTypeFromBytes,
  getFileExtension,
  getMimeType,
  isAudio,
  isDocument,
  isImage,
  isText,
  isVideo,
} from "../lib/fileTypes";
import { ZoomPanViewer } from "./ZoomPanViewer";

interface FilePreviewModalProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  allFiles?: FileMetadata[];
  currentFileIndex?: number;
  onNavigateFile?: (index: number) => void;
  /** Called when encryption is detected for a file, so parent can update its state */
  onEncryptionDetected?: (fileId: string) => void;
}

export function FilePreviewModal({
  file,
  isOpen,
  onClose,
  allFiles = [],
  currentFileIndex = 0,
  onNavigateFile,
  onEncryptionDetected,
}: FilePreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [overrideMime, setOverrideMime] = useState<string | null>(null);
  const [showDecryptPrompt, setShowDecryptPrompt] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState("");
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [pendingEncryptedBytes, setPendingEncryptedBytes] =
    useState<Uint8Array | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const extension = file ? getFileExtension(file.name) : "";
  const mimeType = getMimeType(extension);
  const isImageFile = isImage(extension);
  const isVideoFile = isVideo(extension);
  const isAudioFile = isAudio(extension);
  const isDocumentFile = isDocument(extension);
  const isTextFile = isText(extension);
  const canNavigate = allFiles.length > 1;
  const hasPrevious = canNavigate && currentFileIndex > 0;
  const hasNext = canNavigate && currentFileIndex < allFiles.length - 1;

  useEffect(() => {
    if (!file || !isOpen) {
      setBlobUrl(null);
      setTextContent(null);
      setOverrideMime(null);
      setIsLoading(true);
      setError(null);
      setShowDecryptPrompt(false);
      setDecryptPassword("");
      setDecryptError(null);
      setPendingEncryptedBytes(null);
      return;
    }

    const loadFile = async () => {
      setIsLoading(true);
      setError(null);
      setOverrideMime(null);
      setShowDecryptPrompt(false);
      setDecryptError(null);
      setPendingEncryptedBytes(null);

      try {
        // Always fetch bytes first to check for encryption regardless of file type
        const rawBytes = await file.blob.getBytes();
        const uint8 = new Uint8Array(rawBytes);
        const detectedMime = detectTypeFromBytes(uint8);

        // Check for encryption before anything else
        if (detectedMime === "application/x-fget-encrypted") {
          setPendingEncryptedBytes(uint8);
          setShowDecryptPrompt(true);
          // Notify parent so the ENC badge updates
          onEncryptionDetected?.(file.id);
          setIsLoading(false);
          return;
        }

        // Not encrypted — render based on file type
        if (isImageFile || isVideoFile || isAudioFile) {
          // Create blob URL from fetched bytes
          const mime = mimeType || detectedMime || "application/octet-stream";
          const blob = new Blob([uint8], { type: mime });
          setBlobUrl(URL.createObjectURL(blob));
          setIsLoading(false);
        } else if (isDocumentFile) {
          const blob = new Blob([uint8], {
            type: mimeType || "application/pdf",
          });
          setBlobUrl(URL.createObjectURL(blob));
          setIsLoading(false);
        } else if (isTextFile) {
          setTextContent(new TextDecoder().decode(uint8));
          setIsLoading(false);
        } else {
          // Unknown extension — try magic bytes then UTF-8
          if (detectedMime && detectedMime !== "application/octet-stream") {
            setOverrideMime(detectedMime);
            if (
              detectedMime.startsWith("image/") ||
              detectedMime.startsWith("video/") ||
              detectedMime.startsWith("audio/")
            ) {
              const blob = new Blob([uint8], { type: detectedMime });
              setBlobUrl(URL.createObjectURL(blob));
            } else if (detectedMime === "application/pdf") {
              const blob = new Blob([uint8], { type: "application/pdf" });
              setBlobUrl(URL.createObjectURL(blob));
            } else {
              setTextContent(new TextDecoder().decode(uint8));
            }
          } else {
            // Try to decode as UTF-8 text as last resort
            try {
              const decoded = new TextDecoder("utf-8", {
                fatal: true,
              }).decode(uint8);
              if (decoded.length > 0) {
                setTextContent(decoded);
              } else {
                setError("Preview not available for this file type");
              }
            } catch {
              setError("Preview not available for this file type");
            }
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Preview error:", err);
        setError("Failed to load preview");
        setIsLoading(false);
      }
    };

    loadFile();

    return () => {
      // Revoke any object URL to avoid memory leaks
      setBlobUrl((prev) => {
        if (prev?.startsWith("blob:")) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional deps
    file,
    isOpen,
    isImageFile,
    isVideoFile,
    isAudioFile,
    isDocumentFile,
    isTextFile,
    mimeType,
    onEncryptionDetected,
  ]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Cleanup fullscreen on unmount
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const handleDownload = async () => {
    if (!file) return;

    try {
      const bytes = await file.blob.getBytes();
      const blob = new Blob([bytes], { type: mimeType });
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

      toast.success("Download started", {
        description: `Downloading ${file.name}`,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Download failed", {
        description: "Please try again",
      });
    }
  };

  const handlePreviewDecrypt = async () => {
    if (!pendingEncryptedBytes || !decryptPassword) return;
    setIsDecrypting(true);
    setDecryptError(null);
    try {
      const decrypted = await decryptBytes(
        pendingEncryptedBytes,
        decryptPassword,
      );
      // Decryption succeeded — close the prompt and render the content
      setShowDecryptPrompt(false);
      setPendingEncryptedBytes(null);
      setDecryptPassword("");
      setDecryptError(null);
      setIsLoading(true);
      const ext = getFileExtension(file?.name ?? "");
      const mime =
        getMimeType(ext) ||
        detectTypeFromBytes(decrypted) ||
        "application/octet-stream";
      if (
        mime.startsWith("image/") ||
        mime.startsWith("video/") ||
        mime.startsWith("audio/") ||
        mime === "application/pdf"
      ) {
        const blob = new Blob([decrypted], { type: mime });
        setBlobUrl(URL.createObjectURL(blob));
        setOverrideMime(mime);
      } else {
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(
            decrypted,
          );
          setTextContent(text);
        } catch {
          setError("Cannot preview this file type after decryption");
        }
      }
      setIsLoading(false);
    } catch {
      // Wrong password — stay on the decrypt prompt, show inline error
      // Do NOT close the prompt or show the download fallback
      setDecryptError("Incorrect password. Please try again.");
      setDecryptPassword("");
    } finally {
      setIsDecrypting(false);
    }
  };

  const handlePrevious = useCallback(() => {
    if (hasPrevious && onNavigateFile) {
      onNavigateFile(currentFileIndex - 1);
    }
  }, [hasPrevious, onNavigateFile, currentFileIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onNavigateFile) {
      onNavigateFile(currentFileIndex + 1);
    }
  }, [hasNext, onNavigateFile, currentFileIndex]);

  const toggleFullscreen = useCallback(async () => {
    const viewerElement = document.getElementById("file-viewer-container");
    if (!viewerElement) return;

    try {
      if (!document.fullscreenElement) {
        await viewerElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  const toggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
  }, []);

  // Keyboard navigation
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleDownload is stable
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept any keys while the decrypt prompt is showing —
      // typing the password would otherwise trigger shortcuts like D=download
      if (showDecryptPrompt) return;
      if (e.key === "ArrowLeft") handlePrevious();
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === "Escape") onClose();
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "d" || e.key === "D") handleDownload();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    showDecryptPrompt,
    handlePrevious,
    handleNext,
    onClose,
    toggleFullscreen,
  ]);

  const getFileIcon = (fileName: string) => {
    const ext = getFileExtension(fileName);
    if (isImage(ext)) return <ImageIcon className="h-3 w-3" />;
    if (isVideo(ext)) return <VideoIcon className="h-3 w-3" />;
    if (isAudio(ext)) return <Music className="h-3 w-3" />;
    if (isText(ext)) return <FileText className="h-3 w-3" />;
    return <File className="h-3 w-3" />;
  };

  const formatFileSize = (bytes: bigint | number): string => {
    let fileSize = Number(bytes);
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024;
      unitIndex++;
    }

    return `${fileSize.toFixed(2)} ${units[unitIndex]}`;
  };

  // Effective type flags — fall back to magic-byte detected MIME when extension is unknown
  const effectiveIsImage =
    isImageFile || (!!overrideMime && overrideMime.startsWith("image/"));
  const effectiveIsVideo =
    isVideoFile || (!!overrideMime && overrideMime.startsWith("video/"));
  const effectiveIsAudio =
    isAudioFile || (!!overrideMime && overrideMime.startsWith("audio/"));
  const effectiveIsDocument =
    isDocumentFile || overrideMime === "application/pdf";
  const effectiveIsText =
    isTextFile || (!overrideMime && textContent !== null && !blobUrl);

  if (!file) return null;

  const viewerSizeClass = isMaximized
    ? "w-[95vw] h-[95vh]"
    : "w-[90vw] max-w-6xl h-[85vh] sm:w-[85vw] sm:h-[80vh]";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <div
            id="file-viewer-container"
            className={`${viewerSizeClass} bg-background rounded-lg shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b bg-background/95 backdrop-blur flex-shrink-0">
              <div className="flex-1 min-w-0 mr-2 sm:mr-4">
                <h2 className="text-sm sm:text-lg font-semibold truncate">
                  {file.name}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {extension.toUpperCase()} &bull;{" "}
                  {formatFileSize(Number(file.size))}
                </p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {canNavigate && (
                  <>
                    <Button
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      size="sm"
                      variant="outline"
                      className="gap-1 sm:gap-2 h-8 sm:h-9"
                      title="Previous (\u2190)"
                    >
                      <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline text-xs sm:text-sm">
                        Previous
                      </span>
                    </Button>
                    <Button
                      onClick={handleNext}
                      disabled={!hasNext}
                      size="sm"
                      variant="outline"
                      className="gap-1 sm:gap-2 h-8 sm:h-9"
                      title="Next (\u2192)"
                    >
                      <span className="hidden sm:inline text-xs sm:text-sm">
                        Next
                      </span>
                      <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleDownload}
                  size="sm"
                  variant="outline"
                  className="gap-1 sm:gap-2 h-8 sm:h-9"
                  title="Download (D)"
                >
                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline text-xs sm:text-sm">
                    Download
                  </span>
                </Button>
                <Button
                  onClick={toggleMaximize}
                  size="sm"
                  variant="outline"
                  className="gap-1 sm:gap-2 h-8 sm:h-9 hidden sm:flex"
                  title="Maximize/Restore"
                >
                  {isMaximized ? (
                    <Minimize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </Button>
                <Button
                  onClick={toggleFullscreen}
                  size="sm"
                  variant="outline"
                  className="gap-1 sm:gap-2 h-8 sm:h-9"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                  <span className="hidden md:inline text-xs sm:text-sm">
                    {isFullscreen ? "Exit" : "Fullscreen"}
                  </span>
                </Button>
                <Button
                  onClick={onClose}
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Main Content Area with Sidebar */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* File List Sidebar */}
              {canNavigate && (
                <div className="w-48 sm:w-64 border-r bg-muted/30 flex-shrink-0 flex flex-col">
                  <div className="px-3 py-2 border-b bg-background/50 flex-shrink-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      Files ({allFiles.length})
                    </p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {allFiles.map((f, idx) => (
                        <button
                          type="button"
                          key={f.id}
                          onClick={() => onNavigateFile?.(idx)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                            idx === currentFileIndex
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                          title={f.name}
                        >
                          {getFileIcon(f.name)}
                          <span className="truncate flex-1">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Preview Content */}
              <div className="relative flex-1 flex items-center justify-center bg-muted/30 overflow-hidden min-h-0">
                {/* Navigation Arrows - Always visible when navigation is available */}
                {canNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background border rounded-full p-2 sm:p-3 shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Previous (\u2190)"
                    >
                      <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!hasNext}
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background border rounded-full p-2 sm:p-3 shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Next (\u2192)"
                    >
                      <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                    </button>
                  </>
                )}

                {/* Decrypt prompt — rendered inside the preview area, above all other content */}
                {showDecryptPrompt && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-20">
                    <div className="bg-card border rounded-lg p-6 shadow-lg max-w-sm w-full mx-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-red-500" />
                        <h3 className="font-semibold">Encrypted File</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This file is encrypted. Enter the password to preview
                        it.
                      </p>
                      <Input
                        type="password"
                        placeholder="Decryption password"
                        value={decryptPassword}
                        onChange={(e) => {
                          setDecryptPassword(e.target.value);
                          setDecryptError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handlePreviewDecrypt();
                        }}
                        autoFocus
                      />
                      {decryptError && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          {decryptError}
                        </p>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={onClose}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handlePreviewDecrypt}
                          disabled={!decryptPassword || isDecrypting}
                        >
                          {isDecrypting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Decrypting...
                            </>
                          ) : (
                            "Decrypt & Preview"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {isLoading && !showDecryptPrompt && (
                  <div className="flex flex-col items-center justify-center gap-3 p-4 sm:p-8">
                    <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Loading preview...
                    </p>
                  </div>
                )}

                {error && !showDecryptPrompt && (
                  <div className="flex flex-col items-center justify-center gap-3 p-4 sm:p-8">
                    <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    <p className="text-xs sm:text-sm text-muted-foreground text-center">
                      {error}
                    </p>
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      className="gap-2"
                      size="sm"
                    >
                      <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                      Download file
                    </Button>
                  </div>
                )}

                {!isLoading && !error && !showDecryptPrompt && (
                  <div className="w-full h-full flex flex-col min-h-0">
                    {/* Image Preview with Zoom/Pan */}
                    {effectiveIsImage && blobUrl && (
                      <ZoomPanViewer className="p-2 sm:p-4">
                        <img
                          src={blobUrl}
                          alt={file.name}
                          className="max-w-full max-h-full object-contain"
                          onError={() => setError("Failed to load image")}
                        />
                      </ZoomPanViewer>
                    )}

                    {/* Video Preview */}
                    {effectiveIsVideo && blobUrl && (
                      <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-auto">
                        <video
                          src={blobUrl}
                          controls
                          className="max-w-full max-h-full"
                          onError={() => setError("Failed to load video")}
                        >
                          <track kind="captions" />
                          Your browser does not support video playback.
                        </video>
                      </div>
                    )}

                    {/* Audio Preview */}
                    {effectiveIsAudio && blobUrl && (
                      <div className="w-full h-full flex items-center justify-center p-4 sm:p-8 overflow-auto">
                        <audio
                          src={blobUrl}
                          controls
                          className="w-full max-w-md"
                          onError={() => setError("Failed to load audio")}
                        >
                          <track kind="captions" />
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    )}

                    {/* Document Preview */}
                    {effectiveIsDocument && blobUrl && (
                      <div className="w-full h-full overflow-auto">
                        <iframe
                          src={blobUrl}
                          className="w-full h-full border-0"
                          title={file.name}
                          onError={() => setError("Failed to load document")}
                        />
                      </div>
                    )}

                    {/* Text Preview */}
                    {(effectiveIsText || overrideMime) &&
                      textContent !== null && (
                        <ScrollArea className="w-full h-full">
                          <pre className="p-4 sm:p-6 text-xs sm:text-sm font-mono whitespace-pre-wrap break-words">
                            {textContent}
                          </pre>
                        </ScrollArea>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
