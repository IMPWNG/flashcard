// lib/cache.ts
export const clearFlashcardsCache = () => {
  if (typeof window !== "undefined" && "indexedDB" in window) {
    const dbRequest = indexedDB.deleteDatabase("flashcards_db");
    return new Promise((resolve) => {
      dbRequest.onsuccess = resolve;
      dbRequest.onerror = resolve;
    });
  }
};
