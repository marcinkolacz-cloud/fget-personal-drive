import { toast } from "sonner";
import type { FileMetadata } from "../backend";
import {
  detectTypeFromBytes,
  getFileExtension,
  getMimeType,
} from "./fileTypes";

/**
 * Generates a fully-qualified direct download URL from a file blob
 */
export function getFileDirectURL(file: FileMetadata): string {
  return file.blob.getDirectURL();
}

/**
 * Copies a file's direct URL to the clipboard
 */
export async function copyFileLink(file: FileMetadata): Promise<void> {
  const url = getFileDirectURL(file);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();

      try {
        document.execCommand("copy");
        toast.success("Link copied to clipboard");
      } catch {
        toast.error("Failed to copy link");
      }

      document.body.removeChild(textArea);
    }
  } catch {
    toast.error("Failed to copy link");
  }
}

/**
 * Downloads a file with the correct filename.
 * Uses explicit MIME type (from extension or magic bytes) so the browser
 * never appends its own extension to the downloaded filename.
 */
export async function downloadFile(file: FileMetadata): Promise<void> {
  try {
    const bytes = await file.blob.getBytes();

    // Determine MIME type: first by extension, then by magic bytes, then octet-stream
    const ext = getFileExtension(file.name);
    let mimeType = ext ? getMimeType(ext) : "";
    if (!mimeType) {
      mimeType = detectTypeFromBytes(bytes) || "application/octet-stream";
    }

    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = file.name;
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 100);

    toast.success(`Downloading ${file.name}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    toast.error(`Failed to download file: ${errorMessage}`);
    console.error("Download error:", error);
  }
}
