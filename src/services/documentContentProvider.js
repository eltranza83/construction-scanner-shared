/**
 * Google Drive Document Content Provider Interface
 * 
 * Provides unified, backend-agnostic live document read/write capabilities
 * supporting both native Google Docs and Microsoft Word .docx files.
 * 
 * Flow:
 * Document Engine -> Document Content Provider -> Google Apps Script / Drive API -> Google Drive (Source of Truth)
 */

export const DOCUMENT_STATES = {
  DOCUMENT_MISSING: 'DOCUMENT_MISSING',
  DOCUMENT_EMPTY: 'DOCUMENT_EMPTY',
  DOCUMENT_READ_ERROR: 'DOCUMENT_READ_ERROR',
  DOCUMENT_READ_SUCCESS: 'DOCUMENT_READ_SUCCESS',
  DOCUMENT_WRITE_SUCCESS: 'DOCUMENT_WRITE_SUCCESS',
  DOCUMENT_WRITE_ERROR: 'DOCUMENT_WRITE_ERROR'
};

// In-memory / session cache keyed by (documentId + modifiedTime)
const contentCache = new Map();

let customContentProvider = null;

/**
 * Sets a custom provider implementation (used for tests or cloud adapters)
 */
export function setCustomContentProvider(provider) {
  customContentProvider = provider;
}

/**
 * Resets the content provider to default
 */
export function resetContentProvider() {
  customContentProvider = null;
  contentCache.clear();
}

/**
 * Clears the internal document cache
 */
export function clearDocumentContentCache(documentId = null) {
  if (documentId) {
    for (const key of contentCache.keys()) {
      if (key.startsWith(documentId + ':')) {
        contentCache.delete(key);
      }
    }
  } else {
    contentCache.clear();
  }
}

/**
 * Fetches live document content from Google Drive with smart freshness caching.
 */
export async function fetchDocumentContent(params = {}) {
  const {
    documentId,
    mimeType = 'application/vnd.google-apps.document',
    fileName = 'Document.docx',
    modifiedTime = null,
    forceRefresh = false,
    projectContext = {}
  } = params;

  if (!documentId) {
    return {
      success: false,
      state: DOCUMENT_STATES.DOCUMENT_MISSING,
      content: null,
      error: 'No document ID provided for content fetch.'
    };
  }

  // 1. Check custom provider override (e.g. Unit tests or custom cloud worker)
  if (customContentProvider && typeof customContentProvider.fetchDocumentContent === 'function') {
    return await customContentProvider.fetchDocumentContent(params);
  }

  // 2. Check Freshness Cache
  const cacheKey = documentId + ':' + (modifiedTime || 'live');
  if (!forceRefresh && contentCache.has(cacheKey)) {
    const cached = contentCache.get(cacheKey);
    return {
      success: true,
      state: DOCUMENT_STATES.DOCUMENT_READ_SUCCESS,
      content: cached.content,
      modifiedTime: cached.modifiedTime,
      format: cached.format,
      isCached: true,
      error: null
    };
  }

  // 3. Resolve Apps Script URL from project context or environment
  const scriptUrl = projectContext?.scriptUrl ||
    (typeof window !== 'undefined' ? (localStorage.getItem('jobscan_apps_script_url') || localStorage.getItem('jobscan_script_url')) : null);

  if (!scriptUrl) {
    // If no Apps Script URL configured, return local/cached content safely if available
    let localContent = typeof localStorage !== 'undefined' ? localStorage.getItem('sitetactix_doc_cache_' + documentId) : null;
    if (!localContent && typeof localStorage !== 'undefined' && projectContext?.projectId) {
      const cleanProj = String(projectContext.projectId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      localContent = localStorage.getItem('sitetactix_purchasing_doc_' + cleanProj);
    }
    if (localContent) {
      return {
        success: true,
        state: DOCUMENT_STATES.DOCUMENT_READ_SUCCESS,
        content: localContent,
        modifiedTime: modifiedTime || new Date().toISOString(),
        format: fileName.endsWith('.docx') ? 'docx' : 'google_doc',
        isCached: true,
        error: null
      };
    }

    return {
      success: false,
      state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
      content: null,
      error: 'Google Drive Apps Script connection is not configured.'
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'read_document_text',
        fileId: documentId,
        fileName,
        mimeType
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
        content: null,
        error: 'Drive returned HTTP status ' + response.status
      };
    }

    const resData = await response.json();
    if (!resData.success && resData.error) {
      return {
        success: false,
        state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
        content: null,
        error: resData.error
      };
    }

    const textContent = resData.content || resData.text || '';
    const format = fileName.toLowerCase().endsWith('.docx') ? 'docx' : 'google_doc';

    // Store in cache
    contentCache.set(cacheKey, {
      content: textContent,
      modifiedTime: resData.modifiedTime || modifiedTime || new Date().toISOString(),
      format
    });

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sitetactix_doc_cache_' + documentId, textContent);
      } catch (_) {}
    }

    return {
      success: true,
      state: DOCUMENT_STATES.DOCUMENT_READ_SUCCESS,
      content: textContent,
      modifiedTime: resData.modifiedTime || modifiedTime || new Date().toISOString(),
      format,
      isCached: false,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
      content: null,
      error: err.name === 'AbortError' ? 'Drive content fetch timed out.' : (err.message || 'Drive read network error.')
    };
  }
}

/**
 * Writes updated document content back to Google Drive and confirms write before caching.
 */
export async function writeDocumentContent(params = {}) {
  const {
    documentId,
    mimeType = 'application/vnd.google-apps.document',
    fileName = 'Document.docx',
    content = '',
    expectedVersion = null,
    projectContext = {}
  } = params;

  if (!documentId) {
    return {
      success: false,
      state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR,
      error: 'No document ID provided for content write.'
    };
  }

  // 1. Custom Provider Override (e.g. Unit tests or custom cloud worker)
  if (customContentProvider && typeof customContentProvider.writeDocumentContent === 'function') {
    return await customContentProvider.writeDocumentContent(params);
  }

  const scriptUrl = projectContext?.scriptUrl ||
    (typeof window !== 'undefined' ? (localStorage.getItem('jobscan_apps_script_url') || localStorage.getItem('jobscan_script_url')) : null);

  if (!scriptUrl) {
    // If no backend configured, save to local cache for offline/standalone execution
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sitetactix_doc_cache_' + documentId, content);
      } catch (_) {}
    }

    // Invalidate memory cache
    clearDocumentContentCache(documentId);

    return {
      success: true,
      state: DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS,
      updatedTime: new Date().toISOString(),
      isLocalFallback: true,
      error: null
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'write_document_text',
        fileId: documentId,
        fileName,
        mimeType,
        content,
        expectedVersion
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR,
        error: 'Drive write returned HTTP status ' + response.status
      };
    }

    const resData = await response.json();
    if (!resData.success) {
      return {
        success: false,
        state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR,
        error: resData.error || 'Drive write operation failed on backend.'
      };
    }

    // On confirmed Drive write success, update local cache and invalidate stale keys
    clearDocumentContentCache(documentId);
    const updatedTime = resData.updatedTime || new Date().toISOString();
    const newCacheKey = documentId + ':' + updatedTime;
    contentCache.set(newCacheKey, {
      content,
      modifiedTime: updatedTime,
      format: fileName.toLowerCase().endsWith('.docx') ? 'docx' : 'google_doc'
    });

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sitetactix_doc_cache_' + documentId, content);
      } catch (_) {}
    }

    return {
      success: true,
      state: DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS,
      updatedTime,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR,
      error: err.name === 'AbortError' ? 'Drive write-back timed out.' : (err.message || 'Drive write network error.')
    };
  }
}
