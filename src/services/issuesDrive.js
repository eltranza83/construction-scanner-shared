import {
  fetchDriveFileBlob,
  findFileInFolder,
  findOrCreateFolder,
  getFileContent,
  updateFileContent,
  uploadFileToDrive,
  makeFilePubliclyReadable
} from './googleDrive.js';

const X_RAY_FOLDER_NAME = 'X-Ray Photos';
const ISSUE_PHOTOS_FOLDER_NAME = 'Issue Photos';
const ISSUES_CONFIG_FILE = 'issues_data.json';
const ISSUES_CONFIG_MIME_TYPE = 'application/json';

function buildJsonBlob(data) {
  return new Blob([JSON.stringify(data, null, 2)], { type: ISSUES_CONFIG_MIME_TYPE });
}

async function ensureXRayFolder(accessToken, projectFolderId) {
  return await findOrCreateFolder(accessToken, X_RAY_FOLDER_NAME, projectFolderId);
}

async function ensureIssuePhotosFolder(accessToken, xRayFolderId) {
  return await findOrCreateFolder(accessToken, ISSUE_PHOTOS_FOLDER_NAME, xRayFolderId);
}

export async function loadIssuesVault(accessToken, projectFolderId) {
  const xRayFolderId = await ensureXRayFolder(accessToken, projectFolderId);
  const configJsonFile = await findFileInFolder(accessToken, xRayFolderId, ISSUES_CONFIG_FILE);

  if (!configJsonFile) {
    return {
      issuesDataFileId: null,
      issues: [],
      contacts: {}
    };
  }

  try {
    const data = await getFileContent(accessToken, configJsonFile.id);
    return {
      issuesDataFileId: configJsonFile.id,
      issues: data?.issues || [],
      contacts: data?.contacts || {}
    };
  } catch (err) {
    console.error('Failed to parse issues_data.json content:', err);
    return {
      issuesDataFileId: configJsonFile.id,
      issues: [],
      contacts: {}
    };
  }
}

export async function saveIssuesVault(accessToken, projectFolderId, fileId, config) {
  const xRayFolderId = await ensureXRayFolder(accessToken, projectFolderId);
  const blob = buildJsonBlob(config);

  if (fileId) {
    await updateFileContent(accessToken, fileId, blob, ISSUES_CONFIG_MIME_TYPE);
    return fileId;
  }

  // Create new config file if it didn't exist
  const uploadedConfig = await uploadFileToDrive(
    accessToken,
    xRayFolderId,
    ISSUES_CONFIG_FILE,
    ISSUES_CONFIG_MIME_TYPE,
    blob
  );
  return uploadedConfig.id;
}

export async function uploadIssuePhoto(accessToken, projectFolderId, file) {
  const xRayFolderId = await ensureXRayFolder(accessToken, projectFolderId);
  const photosFolderId = await ensureIssuePhotosFolder(accessToken, xRayFolderId);

  const extension = file.name.split('.').pop();
  const issuePhotoName = `Issue_Photo_${Date.now()}.${extension}`;
  
  // 1. Upload the file to Drive
  const imgUpload = await uploadFileToDrive(accessToken, photosFolderId, issuePhotoName, file.type, file);
  
  // 2. Set file permissions so anyone with the link can view it (required for contractor messaging)
  try {
    await makeFilePubliclyReadable(accessToken, imgUpload.id);
  } catch (permissionErr) {
    console.error('Failed to make issue photo publicly readable:', permissionErr);
  }

  return {
    id: imgUpload.id,
    url: imgUpload.webViewLink
  };
}

export async function uploadIssueFloorPlanSnapshot(accessToken, projectFolderId, issueId, fileBlob) {
  const xRayFolderId = await ensureXRayFolder(accessToken, projectFolderId);
  const photosFolderId = await ensureIssuePhotosFolder(accessToken, xRayFolderId);
  const safeIssueId = String(issueId || 'issue').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `FloorPlan_Pin_${safeIssueId}_${Date.now()}.jpg`;

  const uploadResult = await uploadFileToDrive(accessToken, photosFolderId, fileName, 'image/jpeg', fileBlob);

  try {
    await makeFilePubliclyReadable(accessToken, uploadResult.id);
  } catch (permissionErr) {
    console.error('Failed to make floor plan snapshot publicly readable:', permissionErr);
  }

  return {
    id: uploadResult.id,
    url: uploadResult.webViewLink
  };
}

/**
 * Merges remote issues list with offline operations queue.
 * Handles CREATE, UPDATE_STATUS, and SOFT_DELETE operations in chronological order.
 */
export function mergeIssues(remoteIssues, offlineOperations) {
  const merged = [...(remoteIssues || [])];
  const sortedOps = [...(offlineOperations || [])].sort((a, b) => a.timestamp - b.timestamp);

  sortedOps.forEach(op => {
    const { type, id, payload, timestamp } = op;
    const isoTimestamp = new Date(timestamp).toISOString();

    if (type === 'CREATE') {
      const existingIdx = merged.findIndex(i => i.id === id);
      const newIssue = {
        id,
        ...payload,
        createdAt: payload.createdAt || isoTimestamp,
        updatedAt: isoTimestamp,
        deletedAt: null
      };
      if (existingIdx > -1) {
        merged[existingIdx] = newIssue;
      } else {
        merged.push(newIssue);
      }
    } else if (type === 'UPDATE') {
      const existingIdx = merged.findIndex(i => i.id === id);
      if (existingIdx > -1) {
        merged[existingIdx] = {
          ...merged[existingIdx],
          ...payload,
          updatedAt: isoTimestamp
        };
      }
    } else if (type === 'UPDATE_STATUS') {
      const existingIdx = merged.findIndex(i => i.id === id);
      if (existingIdx > -1) {
        merged[existingIdx] = {
          ...merged[existingIdx],
          status: payload.status,
          updatedAt: isoTimestamp
        };
      }
    } else if (type === 'SOFT_DELETE') {
      const existingIdx = merged.findIndex(i => i.id === id);
      if (existingIdx > -1) {
        merged[existingIdx] = {
          ...merged[existingIdx],
          deletedAt: isoTimestamp,
          updatedAt: isoTimestamp
        };
      }
    }
  });

  return merged;
}
