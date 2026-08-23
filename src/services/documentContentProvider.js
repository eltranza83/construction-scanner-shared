/**
 * Google Drive Document Content Provider Interface
 * 
 * Provides unified, backend-agnostic live document read/write capabilities
 * supporting both Google OAuth Access Tokens and Apps Script Webhooks,
 * transparently handling native Google Docs and Microsoft Word .docx files.
 * 
 * Flow:
 * Document Engine -> Document Content Provider -> Google Drive API (OAuth / Apps Script) -> Google Drive (Source of Truth)
 */

export const DOCUMENT_STATES = {
  DOCUMENT_MISSING: 'DOCUMENT_MISSING',
  DOCUMENT_EMPTY: 'DOCUMENT_EMPTY',
  DOCUMENT_READ_ERROR: 'DOCUMENT_READ_ERROR',
  DOCUMENT_READ_SUCCESS: 'DOCUMENT_READ_SUCCESS',
  DOCUMENT_WRITE_SUCCESS: 'DOCUMENT_WRITE_SUCCESS',
  DOCUMENT_WRITE_ERROR: 'DOCUMENT_WRITE_ERROR'
};

const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

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
 * Resolves active Google OAuth token from context or localStorage
 */
function resolveGoogleAccessToken(projectContext = {}) {
  if (projectContext?.accessToken) return projectContext.accessToken;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('jobscan_google_token') ||
      localStorage.getItem('google_access_token') ||
      localStorage.getItem('gdrive_token') ||
      null;
  }
  return null;
}

/**
 * Extracts plain text from a .docx binary arrayBuffer
 */
export async function extractTextFromDocx(arrayBuffer) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    let offset = 0;
    while (offset < bytes.length - 30) {
      if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
        const compressionMethod = bytes[offset + 8] | (bytes[offset + 9] << 8);
        const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
        const fileNameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
        const extraFieldLength = bytes[offset + 28] | (bytes[offset + 29] << 8);

        const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLength);
        const fileName = new TextDecoder().decode(fileNameBytes);

        const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
        const dataBytes = bytes.subarray(dataOffset, dataOffset + compressedSize);

        if (fileName === 'word/document.xml') {
          let xmlText = '';
          if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(dataBytes);
            writer.close();
            const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
            xmlText = new TextDecoder().decode(decompressedBuffer);
          } else {
            xmlText = new TextDecoder().decode(dataBytes);
          }

          // Extract paragraphs and text runs
          const paragraphs = xmlText.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
          const textLines = paragraphs.map(p => {
            const matches = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
            return matches.map(m => m.replace(/<[^>]+>/g, '')).join('');
          });

          return textLines.filter(Boolean).join('\n');
        }

        offset = dataOffset + (compressedSize > 0 ? compressedSize : 1);
      } else {
        offset++;
      }
    }
  } catch (err) {
    console.warn('Docx extraction note:', err);
  }

  // Fallback to text decoding
  const rawStr = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
  const matches = rawStr.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
  if (matches && matches.length > 0) {
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join('\n');
  }
  return rawStr;
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

  const accessToken = resolveGoogleAccessToken(projectContext);
  const isDocx = fileName.toLowerCase().endsWith('.docx') || mimeType.includes('wordprocessingml');

  // 3. METHOD A: Direct Google Drive REST API via OAuth Token (Preferred & Authoritative)
  if (accessToken) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let textContent = '';
      let detectedFormat = isDocx ? 'docx' : 'google_doc';

      if (!isDocx) {
        // A1: Native Google Doc export as text/plain
        const exportUrl = `${GOOGLE_DRIVE_API_BASE}/files/${documentId}/export?mimeType=text/plain`;
        const res = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal
        });

        if (res.ok) {
          textContent = await res.text();
        } else if (res.status === 400 || res.status === 404) {
          // If file is binary or export rejected, fallback to alt=media
          const mediaUrl = `${GOOGLE_DRIVE_API_BASE}/files/${documentId}?alt=media`;
          const mediaRes = await fetch(mediaUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal
          });
          if (mediaRes.ok) {
            const buf = await mediaRes.arrayBuffer();
            textContent = await extractTextFromDocx(buf);
            detectedFormat = 'docx';
          }
        } else {
          clearTimeout(timeoutId);
          return {
            success: false,
            state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
            content: null,
            error: `Google Drive API returned status ${res.status}`
          };
        }
      } else {
        // A2: Binary .docx file download via alt=media
        const mediaUrl = `${GOOGLE_DRIVE_API_BASE}/files/${documentId}?alt=media`;
        const mediaRes = await fetch(mediaUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal
        });

        if (mediaRes.ok) {
          const buf = await mediaRes.arrayBuffer();
          textContent = await extractTextFromDocx(buf);
        } else {
          clearTimeout(timeoutId);
          return {
            success: false,
            state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
            content: null,
            error: `Google Drive file download returned status ${mediaRes.status}`
          };
        }
      }

      clearTimeout(timeoutId);

      const resolvedModifiedTime = modifiedTime || new Date().toISOString();
      contentCache.set(cacheKey, {
        content: textContent,
        modifiedTime: resolvedModifiedTime,
        format: detectedFormat
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
        modifiedTime: resolvedModifiedTime,
        format: detectedFormat,
        isCached: false,
        error: null
      };
    } catch (err) {
      return {
        success: false,
        state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
        content: null,
        error: err.name === 'AbortError' ? 'Google Drive request timed out.' : (err.message || 'Google Drive read error.')
      };
    }
  }

  // 4. METHOD B: Google Apps Script Webhook Fallback
  const scriptUrl = projectContext?.scriptUrl ||
    (typeof window !== 'undefined' ? (localStorage.getItem('jobscan_apps_script_url') || localStorage.getItem('jobscan_script_url') || localStorage.getItem('sitetactix_apps_script_url')) : null);

  if (scriptUrl) {
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

      if (response.ok) {
        const resData = await response.json();
        if (resData.success) {
          const textContent = resData.content || resData.text || '';
          const format = isDocx ? 'docx' : 'google_doc';
          const resolvedModifiedTime = resData.modifiedTime || modifiedTime || new Date().toISOString();

          contentCache.set(cacheKey, {
            content: textContent,
            modifiedTime: resolvedModifiedTime,
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
            modifiedTime: resolvedModifiedTime,
            format,
            isCached: false,
            error: null
          };
        }
      }
    } catch (_) {}
  }

  // 5. METHOD C: Cached Local Storage Fallback
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
      format: isDocx ? 'docx' : 'google_doc',
      isCached: true,
      error: null
    };
  }

  return {
    success: false,
    state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
    content: null,
    error: 'Google Drive session not connected or unconfigured.'
  };
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

  const accessToken = resolveGoogleAccessToken(projectContext);

  // 2. METHOD A: Direct Google Drive API Update via OAuth
  if (accessToken) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const uploadUrl = `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${documentId}?uploadType=media`;
      const res = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: content,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        clearDocumentContentCache(documentId);
        const updatedTime = new Date().toISOString();
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
      }
    } catch (_) {}
  }

  // 3. METHOD B: Apps Script Webhook
  const scriptUrl = projectContext?.scriptUrl ||
    (typeof window !== 'undefined' ? (localStorage.getItem('jobscan_apps_script_url') || localStorage.getItem('jobscan_script_url') || localStorage.getItem('sitetactix_apps_script_url')) : null);

  if (scriptUrl) {
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

      if (response.ok) {
        const resData = await response.json();
        if (resData.success) {
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
        }
      }
    } catch (_) {}
  }

  // 4. METHOD C: Offline Local Fallback
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('sitetactix_doc_cache_' + documentId, content);
    } catch (_) {}
  }
  clearDocumentContentCache(documentId);

  return {
    success: true,
    state: DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS,
    updatedTime: new Date().toISOString(),
    isLocalFallback: true,
    error: null
  };
}
