import type { FileCategory } from "./fileTypes";

/**
 * Maps file categories to subtle background and foreground tint classes
 * that work in both light and dark themes
 */
export function getFileTypeTintClasses(category: FileCategory): string {
  const tintMap: Record<FileCategory, string> = {
    image: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    video: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
    audio: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
    archive: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    code: "bg-green-500/10 text-green-700 dark:text-green-300",
    document: "bg-red-500/10 text-red-700 dark:text-red-300",
    text: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    generic: "bg-gray-500/10 text-gray-700 dark:text-gray-300",
  };

  return tintMap[category];
}

/**
 * Returns tint classes for folder badges (clear yellow)
 */
export function getFolderTintClasses(): string {
  return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
}

/**
 * Returns tint classes for unknown/N/A type badges (neutral gray)
 */
export function getUnknownTypeTintClasses(): string {
  return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
}
