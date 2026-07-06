import { useCallback, useState } from "react";

export type ViewMode = "list" | "gallery";

/**
 * Hook to manage per-folder view mode in memory for the current session.
 * Each folder can have its own view mode, defaulting to 'list'.
 */
export function usePerFolderViewMode() {
  const [viewModes, setViewModes] = useState<Map<string, ViewMode>>(new Map());

  const getViewMode = useCallback(
    (folderId: string | null): ViewMode => {
      const key = folderId ?? "__root__";
      return viewModes.get(key) ?? "list";
    },
    [viewModes],
  );

  const setViewMode = useCallback((folderId: string | null, mode: ViewMode) => {
    const key = folderId ?? "__root__";
    setViewModes((prev) => {
      const next = new Map(prev);
      next.set(key, mode);
      return next;
    });
  }, []);

  return { getViewMode, setViewMode };
}
