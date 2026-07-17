/**
 * IndexedDB — documents, attempts, drafts, problemNotes, settings
 */
export const DB_NAME = "cpa-workspace-db";
export const DB_VERSION = 4;

export const PDF_STORE = "pdfs";
export const TEMPLATE_STORE = "templates";
export const DOCUMENTS_STORE = "documents";
export const PROBLEMS_STORE = "problems";
export const ATTEMPTS_STORE = "attempts";
export const PROBLEM_NOTES_STORE = "problemNotes";
export const DRAFTS_STORE = "drafts";
export const SETTINGS_STORE = "settings";

let dbPromise = null;

export function openWorkspaceDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PDF_STORE)) {
          db.createObjectStore(PDF_STORE, { keyPath: "fingerprint" });
        }
        if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
          db.createObjectStore(TEMPLATE_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
          db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PROBLEMS_STORE)) {
          const store = db.createObjectStore(PROBLEMS_STORE, { keyPath: "id" });
          store.createIndex("source", "source", { unique: false });
          store.createIndex("year", "year", { unique: false });
          store.createIndex("reviewStatus", "reviewStatus", { unique: false });
          store.createIndex("favorite", "favorite", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("lastSolvedAt", "lastSolvedAt", { unique: false });
          store.createIndex("lastViewedAt", "lastViewedAt", { unique: false });
          store.createIndex("problemKey", "problemKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) {
          const store = db.createObjectStore(ATTEMPTS_STORE, { keyPath: "id" });
          store.createIndex("documentId", "documentId", { unique: false });
          store.createIndex("problemKey", "problemKey", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("sourceType", "sourceType", { unique: false });
        }
        if (!db.objectStoreNames.contains(PROBLEM_NOTES_STORE)) {
          db.createObjectStore(PROBLEM_NOTES_STORE, { keyPath: "problemKey" });
        }
        if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
          const store = db.createObjectStore(DRAFTS_STORE, { keyPath: "id" });
          store.createIndex("problemKey", "problemKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openWorkspaceDb().then(
    (db) => db.transaction(storeName, mode).objectStore(storeName)
  );
}

export async function idbGet(storeName, key) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(storeName, value) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(storeName, key) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll(storeName) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllByIndex(storeName, indexName, query) {
  const db = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const txObj = db.transaction(storeName, "readonly");
    const store = txObj.objectStore(storeName);
    const idx = store.index(indexName);
    const req = typeof query === "undefined" ? idx.getAll() : idx.getAll(query);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
