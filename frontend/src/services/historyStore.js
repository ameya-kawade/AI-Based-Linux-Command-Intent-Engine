/**
 * LCIE Multi-User History Storage Engine
 * Supports high-capacity IndexedDB with seamless LocalStorage fallback and user partitioning.
 */

const DB_NAME = 'LCIE_History_DB';
const DB_VERSION = 1;
const STORE_NAME = 'history_records';
const PROFILES_KEY = 'lcie_user_profiles';
const ACTIVE_USER_KEY = 'lcie_active_user_id';
const STORAGE_ENGINE_KEY = 'lcie_preferred_storage_engine'; // 'indexeddb' | 'localstorage'

// Default starter user profiles
export const DEFAULT_PROFILES = [
  {
    id: 'default',
    name: 'Default Operator',
    role: 'Root / Administrator',
    color: 'cyan', // 'cyan' | 'rose' | 'amber' | 'emerald' | 'purple' | 'blue'
    icon: 'terminal',
    created_at: new Date().toISOString(),
  },
  {
    id: 'secops',
    name: 'SecOps Auditor',
    role: 'Security Analyst',
    color: 'rose',
    icon: 'shield',
    created_at: new Date().toISOString(),
  },
  {
    id: 'devops',
    name: 'DevOps Engineer',
    role: 'Infrastructure & CI/CD',
    color: 'amber',
    icon: 'server',
    created_at: new Date().toISOString(),
  },
  {
    id: 'sandbox',
    name: 'Sandbox Analyst',
    role: 'eBPF Isolation Testing',
    color: 'emerald',
    icon: 'box',
    created_at: new Date().toISOString(),
  },
];

// --- IndexedDB Helper ---
let dbPromise = null;

function isIndexedDBSupported() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export function getPreferredEngine() {
  if (typeof window === 'undefined') return 'localstorage';
  const saved = localStorage.getItem(STORAGE_ENGINE_KEY);
  if (saved === 'localstorage' || saved === 'indexeddb') return saved;
  return isIndexedDBSupported() ? 'indexeddb' : 'localstorage';
}

export function setPreferredEngine(engine) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_ENGINE_KEY, engine);
  window.dispatchEvent(new CustomEvent('lcie-storage-engine-changed', { detail: { engine } }));
}

function openDB() {
  if (!isIndexedDBSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('command', 'command', { unique: false });
        store.createIndex('risk_level', 'risk_level', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('target', 'target', { unique: false });
        store.createIndex('userId_timestamp', ['userId', 'timestamp'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

// --- User Profile Management ---

export function getUserProfiles() {
  if (typeof window === 'undefined') return DEFAULT_PROFILES;
  try {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (!stored) {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(DEFAULT_PROFILES));
      return DEFAULT_PROFILES;
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PROFILES;
  } catch (err) {
    console.error('Failed to read user profiles:', err);
    return DEFAULT_PROFILES;
  }
}

export function getActiveUserId() {
  if (typeof window === 'undefined') return 'default';
  return localStorage.getItem(ACTIVE_USER_KEY) || 'default';
}

export function getActiveUserProfile() {
  const profiles = getUserProfiles();
  const activeId = getActiveUserId();
  return profiles.find((p) => p.id === activeId) || profiles[0] || DEFAULT_PROFILES[0];
}

export function setActiveUserId(userId) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_USER_KEY, userId);
  window.dispatchEvent(new CustomEvent('lcie-user-changed', { detail: { userId } }));
}

export function saveUserProfile(profile) {
  if (typeof window === 'undefined') return profile;
  const profiles = getUserProfiles();
  const index = profiles.findIndex((p) => p.id === profile.id);
  
  const updatedProfile = {
    ...profile,
    id: profile.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    updated_at: new Date().toISOString(),
  };

  let newProfiles;
  if (index >= 0) {
    newProfiles = [...profiles];
    newProfiles[index] = { ...newProfiles[index], ...updatedProfile };
  } else {
    newProfiles = [...profiles, updatedProfile];
  }

  localStorage.setItem(PROFILES_KEY, JSON.stringify(newProfiles));
  window.dispatchEvent(new CustomEvent('lcie-profiles-updated', { detail: { profiles: newProfiles } }));
  return updatedProfile;
}

export function deleteUserProfile(profileId) {
  if (typeof window === 'undefined' || profileId === 'default') return false;
  let profiles = getUserProfiles();
  profiles = profiles.filter((p) => p.id !== profileId);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

  if (getActiveUserId() === profileId) {
    setActiveUserId('default');
  }

  // Clear data for deleted profile
  clearUserHistory(profileId).catch(console.error);

  window.dispatchEvent(new CustomEvent('lcie-profiles-updated', { detail: { profiles } }));
  return true;
}

// --- LocalStorage Fallback CRUD ---

function getLocalStorageKey(userId) {
  return `lcie_hist_${userId || 'default'}`;
}

function getFromLocalStorage(userId) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('LocalStorage read error:', err);
    return [];
  }
}

function saveToLocalStorage(userId, records) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(records));
  } catch (err) {
    console.error('LocalStorage write error:', err);
  }
}

// --- Unified History Operations ---

export async function addHistoryEntry(userId, entry) {
  const activeUser = userId || getActiveUserId();
  const engine = getPreferredEngine();

  const record = {
    id: entry.id || `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId: activeUser,
    timestamp: entry.timestamp || new Date().toISOString(),
    command: entry.command || '',
    cwd: entry.cwd || '~',
    target: entry.target || 'host', // 'host' | 'sandbox' | 'analyzed'
    status: entry.status || 'analyzed', // 'analyzed' | 'success' | 'error' | 'aborted'
    risk_level: entry.risk_level || entry.analysis?.risk_level || 'SAFE',
    duration_ms: entry.duration_ms,
    exit_code: entry.exit_code,
    output: entry.output,
    analysis: entry.analysis || null,
  };

  if (engine === 'indexeddb' && isIndexedDBSupported()) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      notifyHistoryChanged(activeUser);
      return record;
    } catch (err) {
      console.warn('IndexedDB write failed, falling back to LocalStorage:', err);
    }
  }

  // Fallback to LocalStorage
  const records = getFromLocalStorage(activeUser);
  records.unshift(record);
  // Keep up to 500 records in LocalStorage to prevent quota issues
  if (records.length > 500) records.length = 500;
  saveToLocalStorage(activeUser, records);
  notifyHistoryChanged(activeUser);
  return record;
}

export async function updateHistoryEntry(userId, id, updates) {
  const activeUser = userId || getActiveUserId();
  const engine = getPreferredEngine();

  if (engine === 'indexeddb' && isIndexedDBSupported()) {
    try {
      const db = await openDB();
      const existing = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (existing) {
        const updated = { ...existing, ...updates };
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(updated);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        notifyHistoryChanged(activeUser);
        return updated;
      }
    } catch (err) {
      console.warn('IndexedDB update failed, trying LocalStorage:', err);
    }
  }

  const records = getFromLocalStorage(activeUser);
  const idx = records.findIndex((r) => r.id === id);
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...updates };
    saveToLocalStorage(activeUser, records);
    notifyHistoryChanged(activeUser);
    return records[idx];
  }
  return null;
}

export async function getHistoryEntries(userId, filters = {}) {
  const activeUser = userId || getActiveUserId();
  const engine = getPreferredEngine();
  let entries = [];

  if (engine === 'indexeddb' && isIndexedDBSupported()) {
    try {
      const db = await openDB();
      entries = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const userIndex = store.index('userId');
        const req = userIndex.getAll(activeUser);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB read failed, fallback to LocalStorage:', err);
      entries = getFromLocalStorage(activeUser);
    }
  } else {
    entries = getFromLocalStorage(activeUser);
  }

  // Sort descending by timestamp
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply filters
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    entries = entries.filter((item) => {
      const cmdMatch = item.command?.toLowerCase().includes(q);
      const intentMatch = item.analysis?.intent?.toLowerCase().includes(q);
      const outputMatch = item.output?.toLowerCase().includes(q);
      return cmdMatch || intentMatch || outputMatch;
    });
  }

  if (filters.risk_level && filters.risk_level !== 'ALL') {
    entries = entries.filter((item) => (item.risk_level || item.analysis?.risk_level) === filters.risk_level);
  }

  if (filters.status && filters.status !== 'ALL') {
    entries = entries.filter((item) => item.status === filters.status);
  }

  if (filters.target && filters.target !== 'ALL') {
    entries = entries.filter((item) => item.target === filters.target);
  }

  if (filters.limit && filters.limit > 0) {
    entries = entries.slice(0, filters.limit);
  }

  return entries;
}

export async function deleteHistoryEntry(userId, id) {
  const activeUser = userId || getActiveUserId();
  const engine = getPreferredEngine();

  if (engine === 'indexeddb' && isIndexedDBSupported()) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB delete failed:', err);
    }
  }

  const records = getFromLocalStorage(activeUser).filter((r) => r.id !== id);
  saveToLocalStorage(activeUser, records);
  notifyHistoryChanged(activeUser);
  return true;
}

export async function clearUserHistory(userId) {
  const activeUser = userId || getActiveUserId();
  const engine = getPreferredEngine();

  if (engine === 'indexeddb' && isIndexedDBSupported()) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const userIndex = store.index('userId');
        const req = userIndex.openCursor(IDBKeyRange.only(activeUser));

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB clear failed:', err);
    }
  }

  localStorage.removeItem(getLocalStorageKey(activeUser));
  notifyHistoryChanged(activeUser);
  return true;
}

export async function exportUserHistory(userId) {
  const activeUser = userId || getActiveUserId();
  const profiles = getUserProfiles();
  const currentProfile = profiles.find((p) => p.id === activeUser) || { id: activeUser, name: 'Operator' };
  const entries = await getHistoryEntries(activeUser);

  const exportPayload = {
    lcie_version: '2.0-web',
    exported_at: new Date().toISOString(),
    user: currentProfile,
    total_records: entries.length,
    records: entries,
  };

  return exportPayload;
}

export async function importUserHistory(userId, importedData, overwrite = false) {
  const activeUser = userId || getActiveUserId();
  if (!importedData || !Array.isArray(importedData.records)) {
    throw new Error('Invalid LCIE history backup format');
  }

  if (overwrite) {
    await clearUserHistory(activeUser);
  }

  for (const record of importedData.records) {
    await addHistoryEntry(activeUser, {
      ...record,
      userId: activeUser,
    });
  }

  notifyHistoryChanged(activeUser);
  return importedData.records.length;
}

export async function getStorageUsage(userId) {
  const activeUser = userId || getActiveUserId();
  const engine = getPreferredEngine();
  const entries = await getHistoryEntries(activeUser);
  const jsonString = JSON.stringify(entries);
  const bytes = new Blob([jsonString]).size;
  
  let quota = null;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quota = {
        usage: estimate.usage || bytes,
        quota: estimate.quota || (50 * 1024 * 1024),
      };
    } catch (err) {
      console.warn('Storage estimate failed', err);
    }
  }

  return {
    engine,
    recordCount: entries.length,
    bytes,
    formattedSize: (bytes / 1024).toFixed(2) + ' KB',
    quota,
  };
}

export async function migrateStorageEngine(targetEngine) {
  if (targetEngine !== 'indexeddb' && targetEngine !== 'localstorage') {
    throw new Error(`Invalid engine: ${targetEngine}`);
  }

  const profiles = getUserProfiles();
  
  for (const prof of profiles) {
    // Read current records
    const records = await getHistoryEntries(prof.id);
    if (records.length > 0) {
      if (targetEngine === 'indexeddb' && isIndexedDBSupported()) {
        const db = await openDB();
        for (const record of records) {
          await new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
          });
        }
      } else if (targetEngine === 'localstorage') {
        saveToLocalStorage(prof.id, records);
      }
    }
  }

  setPreferredEngine(targetEngine);
  return true;
}

function notifyHistoryChanged(userId) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lcie-history-changed', { detail: { userId } }));
  }
}
