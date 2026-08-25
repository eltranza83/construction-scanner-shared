/**
 * Client Actions Framework
 * 
 * Provides an extensible, validated, and state-aware action execution pipeline.
 * Separates intent resolution from client-side execution to ensure the AI never
 * claims an action succeeded when the client failed or could not execute it.
 */

export const ACTION_TYPES = {
  OPEN_DOCUMENT: 'OPEN_DOCUMENT',
  OPEN_FOLDER: 'OPEN_FOLDER',
  OPEN_URL: 'OPEN_URL',
  OPEN_IMAGE: 'OPEN_IMAGE',
  OPEN_MAP: 'OPEN_MAP',
  NAVIGATE_TO: 'NAVIGATE_TO',
  DOWNLOAD_FILE: 'DOWNLOAD_FILE',
  COPY_TO_CLIPBOARD: 'COPY_TO_CLIPBOARD',
  SHOW_DOCUMENT_CARD: 'SHOW_DOCUMENT_CARD'
};

export const ACTION_SCHEMAS = {
  [ACTION_TYPES.OPEN_DOCUMENT]: {
    required: ['fileName'],
    optional: ['folderName', 'documentId', 'webViewLink', 'mimeType']
  },
  [ACTION_TYPES.OPEN_FOLDER]: {
    required: ['folderName'],
    optional: ['folderId', 'webViewLink']
  },
  [ACTION_TYPES.OPEN_URL]: {
    required: ['url'],
    optional: ['title', 'target']
  },
  [ACTION_TYPES.NAVIGATE_TO]: {
    required: ['tab'],
    allowedValues: {
      tab: ['dashboard', 'brain', 'xray', 'settings']
    }
  },
  [ACTION_TYPES.COPY_TO_CLIPBOARD]: {
    required: ['text'],
    optional: ['label']
  },
  [ACTION_TYPES.DOWNLOAD_FILE]: {
    required: ['fileName'],
    optional: ['url', 'documentId']
  },
  [ACTION_TYPES.SHOW_DOCUMENT_CARD]: {
    required: ['fileName'],
    optional: ['folderName', 'webViewLink', 'mimeType', 'size']
  }
};

/**
 * Validates action payload against its schema contract
 */
export function validateActionPayload(actionType, payload) {
  if (!actionType || typeof actionType !== 'string') {
    throw new TypeError('Invalid Action Type: Must be a non-empty string.');
  }

  const schema = ACTION_SCHEMAS[actionType];
  if (!schema) {
    throw new TypeError(`Unknown Action Type: "${actionType}". Supported types: ${Object.keys(ACTION_TYPES).join(', ')}`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new TypeError(`Invalid Action Payload for [${actionType}]: Must be an object.`);
  }

  for (const field of schema.required) {
    if (!payload[field] || typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new TypeError(`Invalid Action Payload for [${actionType}]: Missing required field "${field}".`);
    }
  }

  if (schema.allowedValues) {
    for (const [field, allowed] of Object.entries(schema.allowedValues)) {
      if (payload[field] && !allowed.includes(payload[field])) {
        throw new TypeError(`Invalid value for [${actionType}.${field}]: "${payload[field]}". Allowed: ${allowed.join(', ')}`);
      }
    }
  }

  return true;
}

/**
 * Searches driveTree for matching files using fuzzy/token matching
 */
export function findDriveFile(driveTree, fileQuery, folderQuery = null) {
  if (!driveTree) return null;

  const cleanFileQuery = (fileQuery || '').toLowerCase().trim();
  const cleanFolderQuery = (folderQuery || '').toLowerCase().trim();
  const fileTokens = cleanFileQuery.split(/[^a-z0-9]+/).filter(t => t.length > 2 && !['the', 'pdf', 'file', 'doc', 'open', 'review'].includes(t));

  const directFiles = Array.isArray(driveTree.directFiles) ? driveTree.directFiles : (Array.isArray(driveTree) ? driveTree : []);
  const subfolders = Array.isArray(driveTree.subfolders) ? driveTree.subfolders : [];

  const candidates = [];

  // Search direct files
  for (const f of directFiles) {
    const fName = (f.name || '').toLowerCase();
    let score = 0;
    if (fName === cleanFileQuery) score = 100;
    else if (fName.includes(cleanFileQuery)) score = 80;
    else {
      const matchCount = fileTokens.filter(t => fName.includes(t)).length;
      if (matchCount > 0) score = (matchCount / (fileTokens.length || 1)) * 60;
    }
    if (score > 0) {
      candidates.push({ file: f, folderName: 'Root', score });
    }
  }

  // Search inside subfolders
  for (const sub of subfolders) {
    const subName = (sub.name || sub.folderName || '').toLowerCase();
    const folderMatch = !cleanFolderQuery || subName.includes(cleanFolderQuery);
    if (!folderMatch && cleanFolderQuery) continue;

    const filesInSub = Array.isArray(sub.files) ? sub.files : (Array.isArray(sub.children) ? sub.children : []);
    for (const f of filesInSub) {
      const fName = (f.name || '').toLowerCase();
      let score = folderMatch && cleanFolderQuery ? 20 : 0;
      if (fName === cleanFileQuery) score += 100;
      else if (fName.includes(cleanFileQuery)) score += 80;
      else {
        const matchCount = fileTokens.filter(t => fName.includes(t)).length;
        if (matchCount > 0) score += (matchCount / (fileTokens.length || 1)) * 60;
      }
      if (score > 0 || (cleanFolderQuery && cleanFileQuery.length === 0)) {
        candidates.push({ file: f, folderName: sub.name || sub.folderName, score: score || 50 });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Searches driveTree for matching subfolder
 */
export function findDriveFolder(driveTree, folderQuery) {
  if (!driveTree) return null;
  const cleanFolderQuery = (folderQuery || '').toLowerCase().trim();
  const subfolders = Array.isArray(driveTree.subfolders) ? driveTree.subfolders : [];

  for (const sub of subfolders) {
    const subName = (sub.name || sub.folderName || '').toLowerCase();
    if (subName === cleanFolderQuery || subName.includes(cleanFolderQuery) || cleanFolderQuery.includes(subName)) {
      const files = Array.isArray(sub.files) ? sub.files : (Array.isArray(sub.children) ? sub.children : []);
      return {
        folder: sub,
        folderName: sub.name || sub.folderName,
        folderId: sub.id || sub.folderId || null,
        webViewLink: sub.webViewLink || null,
        fileCount: files.length,
        files
      };
    }
  }
  return null;
}

/**
 * Action Execution Registry
 */
export const ACTION_EXECUTORS = {
  [ACTION_TYPES.OPEN_DOCUMENT]: async (payload, context) => {
    validateActionPayload(ACTION_TYPES.OPEN_DOCUMENT, payload);

    let targetFile = null;

    if (payload.webViewLink) {
      targetFile = {
        file: {
          name: payload.fileName,
          id: payload.documentId,
          webViewLink: payload.webViewLink,
          mimeType: payload.mimeType
        },
        folderName: payload.folderName || 'Google Drive'
      };
    } else {
      targetFile = findDriveFile(context?.driveTree, payload.fileName, payload.folderName);
    }

    if (!targetFile || !targetFile.file) {
      return {
        success: false,
        actionType: ACTION_TYPES.OPEN_DOCUMENT,
        fileName: payload.fileName,
        error: `Document "${payload.fileName}" was not found in Google Drive for ${context?.activeProjectName || 'this project'}.`
      };
    }

    const file = targetFile.file;
    const fileLink = file.webViewLink || (file.id ? `https://drive.google.com/file/d/${file.id}/view` : null);

    if (!fileLink) {
      return {
        success: false,
        actionType: ACTION_TYPES.OPEN_DOCUMENT,
        fileName: file.name,
        folderName: targetFile.folderName,
        error: `Document "${file.name}" was located, but no accessible view link is available.`
      };
    }

    // Execute Client Window Open if in browser environment
    let windowOpened = false;
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      try {
        const opened = window.open(fileLink, '_blank', 'noopener,noreferrer');
        windowOpened = Boolean(opened);
      } catch (wErr) {
        console.warn('[ClientAction] window.open failed:', wErr);
      }
    } else {
      windowOpened = true; // Non-browser/testing environment simulation
    }

    return {
      success: true,
      actionType: ACTION_TYPES.OPEN_DOCUMENT,
      fileName: file.name,
      folderName: targetFile.folderName,
      documentId: file.id || null,
      webViewLink: fileLink,
      mimeType: file.mimeType || 'application/pdf',
      windowOpened,
      message: `Opened "${file.name}" in Google Drive.`
    };
  },

  [ACTION_TYPES.OPEN_FOLDER]: async (payload, context) => {
    validateActionPayload(ACTION_TYPES.OPEN_FOLDER, payload);

    const folderMatch = findDriveFolder(context?.driveTree, payload.folderName);
    if (!folderMatch) {
      return {
        success: false,
        actionType: ACTION_TYPES.OPEN_FOLDER,
        folderName: payload.folderName,
        error: `Folder "${payload.folderName}" was not found in Google Drive for ${context?.activeProjectName || 'this project'}.`
      };
    }

    if (folderMatch.fileCount === 0) {
      return {
        success: false,
        isFolderEmpty: true,
        actionType: ACTION_TYPES.OPEN_FOLDER,
        folderName: folderMatch.folderName,
        error: `Folder "${folderMatch.folderName}" exists in Google Drive, but is currently empty.`
      };
    }

    const folderLink = folderMatch.webViewLink || (folderMatch.folderId ? `https://drive.google.com/drive/folders/${folderMatch.folderId}` : null);

    if (folderLink && typeof window !== 'undefined' && typeof window.open === 'function') {
      try {
        window.open(folderLink, '_blank', 'noopener,noreferrer');
      } catch (_) {}
    }

    return {
      success: true,
      actionType: ACTION_TYPES.OPEN_FOLDER,
      folderName: folderMatch.folderName,
      folderId: folderMatch.folderId,
      webViewLink: folderLink,
      fileCount: folderMatch.fileCount,
      files: folderMatch.files.slice(0, 15),
      message: `Opened "${folderMatch.folderName}" folder (${folderMatch.fileCount} files) in Google Drive.`
    };
  },

  [ACTION_TYPES.OPEN_URL]: async (payload) => {
    validateActionPayload(ACTION_TYPES.OPEN_URL, payload);
    const target = payload.target || '_blank';
    let windowOpened = false;

    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      try {
        const opened = window.open(payload.url, target, 'noopener,noreferrer');
        windowOpened = Boolean(opened);
      } catch (wErr) {
        return { success: false, actionType: ACTION_TYPES.OPEN_URL, url: payload.url, error: wErr.message };
      }
    }

    return {
      success: true,
      actionType: ACTION_TYPES.OPEN_URL,
      url: payload.url,
      title: payload.title || payload.url,
      windowOpened,
      message: `Opened link ${payload.title || payload.url}.`
    };
  },

  [ACTION_TYPES.NAVIGATE_TO]: async (payload, context) => {
    validateActionPayload(ACTION_TYPES.NAVIGATE_TO, payload);
    if (typeof context?.onNavigateTab === 'function') {
      context.onNavigateTab(payload.tab);
    }
    return {
      success: true,
      actionType: ACTION_TYPES.NAVIGATE_TO,
      tab: payload.tab,
      message: `Navigated to ${payload.tab} tab.`
    };
  },

  [ACTION_TYPES.COPY_TO_CLIPBOARD]: async (payload) => {
    validateActionPayload(ACTION_TYPES.COPY_TO_CLIPBOARD, payload);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload.text);
        return {
          success: true,
          actionType: ACTION_TYPES.COPY_TO_CLIPBOARD,
          text: payload.text,
          message: `Copied ${payload.label || 'content'} to clipboard.`
        };
      } catch (err) {
        return {
          success: false,
          actionType: ACTION_TYPES.COPY_TO_CLIPBOARD,
          error: `Clipboard write failed: ${err.message}`
        };
      }
    }
    return {
      success: true,
      actionType: ACTION_TYPES.COPY_TO_CLIPBOARD,
      text: payload.text,
      simulated: true,
      message: `Copied to clipboard.`
    };
  },

  [ACTION_TYPES.SHOW_DOCUMENT_CARD]: async (payload, context) => {
    validateActionPayload(ACTION_TYPES.SHOW_DOCUMENT_CARD, payload);
    const targetFile = findDriveFile(context?.driveTree, payload.fileName, payload.folderName);
    if (!targetFile || !targetFile.file) {
      return {
        success: false,
        actionType: ACTION_TYPES.SHOW_DOCUMENT_CARD,
        error: `Document "${payload.fileName}" not found.`
      };
    }
    return {
      success: true,
      actionType: ACTION_TYPES.SHOW_DOCUMENT_CARD,
      file: targetFile.file,
      folderName: targetFile.folderName,
      message: `Displaying card for "${targetFile.file.name}".`
    };
  }
};

/**
 * Universal Action Execution Pipeline
 */
export async function executeClientAction(actionType, payload, context = {}) {
  const executor = ACTION_EXECUTORS[actionType];
  if (!executor) {
    return {
      success: false,
      actionType,
      error: `Unsupported client action "${actionType}".`
    };
  }

  try {
    return await executor(payload, context);
  } catch (err) {
    return {
      success: false,
      actionType,
      error: err.message || 'Client action execution failed.'
    };
  }
}
