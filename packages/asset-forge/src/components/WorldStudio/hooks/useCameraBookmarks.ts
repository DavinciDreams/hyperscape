/**
 * useCameraBookmarks — Save and recall named camera positions.
 *
 * Bookmarks stored in localStorage keyed by project ID.
 * Supports up to 10 bookmarks, accessible via Shift+1-9 (recall)
 * and Ctrl+Shift+1-9 (save).
 */

import { useState, useCallback, useEffect } from "react";

export interface CameraBookmark {
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  timestamp: number;
}

const MAX_BOOKMARKS = 10;
const STORAGE_PREFIX = "worldstudio-bookmarks-";

function loadBookmarks(projectId: string): CameraBookmark[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (raw) return JSON.parse(raw) as CameraBookmark[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveBookmarksToStorage(
  projectId: string,
  bookmarks: CameraBookmark[],
) {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${projectId}`,
      JSON.stringify(bookmarks),
    );
  } catch {
    /* ignore */
  }
}

export function useCameraBookmarks(projectId: string) {
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>(() =>
    loadBookmarks(projectId),
  );

  // Sync on project change
  useEffect(() => {
    setBookmarks(loadBookmarks(projectId));
  }, [projectId]);

  const addBookmark = useCallback(
    (
      name: string,
      position: { x: number; y: number; z: number },
      target: { x: number; y: number; z: number },
    ) => {
      setBookmarks((prev) => {
        const next = [
          ...prev,
          {
            name,
            position: { ...position },
            target: { ...target },
            timestamp: Date.now(),
          },
        ].slice(-MAX_BOOKMARKS);
        saveBookmarksToStorage(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const removeBookmark = useCallback(
    (index: number) => {
      setBookmarks((prev) => {
        const next = prev.filter((_, i) => i !== index);
        saveBookmarksToStorage(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const renameBookmark = useCallback(
    (index: number, name: string) => {
      setBookmarks((prev) => {
        const next = prev.map((b, i) => (i === index ? { ...b, name } : b));
        saveBookmarksToStorage(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
    saveBookmarksToStorage(projectId, []);
  }, [projectId]);

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    renameBookmark,
    clearBookmarks,
  };
}
