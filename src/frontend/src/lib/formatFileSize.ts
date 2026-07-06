/**
 * Formats a file size in bytes to a human-readable string using base-1024 units
 * @param bytes - File size in bytes (number or bigint)
 * @returns Formatted string like "1.2 KB", "5.4 MB", etc.
 */
export function formatFileSize(bytes: number | bigint): string {
  const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes;

  if (numBytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;

  // Find the appropriate unit
  let unitIndex = 0;
  let size = numBytes;

  while (size >= k && unitIndex < units.length - 1) {
    size /= k;
    unitIndex++;
  }

  // Format with appropriate decimal places
  const formatted =
    unitIndex === 0
      ? size.toString() // No decimals for bytes
      : size.toFixed(1); // One decimal for KB, MB, GB, TB

  return `${formatted} ${units[unitIndex]}`;
}
