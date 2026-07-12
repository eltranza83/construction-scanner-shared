/**
 * Service to interact with the Google Drive and Sheets API client-side using fetch.
 */

const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function escapeDriveQueryString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function assertDriveFolderParent(parentId, action) {
  if (!parentId) {
    throw new Error(`Could not ${action}. No project folder is selected.`);
  }
}

export function getDriveFileMediaUrl(fileId) {
  return `${GOOGLE_DRIVE_API_BASE}/files/${fileId}?alt=media`;
}

export async function fetchDriveFileBlob(accessToken, fileId) {
  const response = await fetch(getDriveFileMediaUrl(fileId), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    const error = new Error('Google Drive session expired while retrieving file content.');
    error.status = 401;
    throw error;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to retrieve file content: ${errText}`);
  }

  return await response.blob();
}

export async function fetchDriveFileAsObjectUrl(accessToken, fileId) {
  const blob = await fetchDriveFileBlob(accessToken, fileId);
  return URL.createObjectURL(blob);
}

/**
 * Creates a file metadata resource and then uploads the media content.
 * This two-step process is highly reliable client-side and avoids multipart assembly.
 */
export async function uploadFileToDrive(accessToken, folderId, fileName, mimeType, fileBlob, description = null) {
  try {
    const body = {
      name: fileName,
      mimeType: mimeType,
      parents: folderId ? [folderId] : [],
    };
    if (description) {
      body.description = description;
    }

    // Step 1: Create file metadata
    const metadataResponse = await fetch(`${GOOGLE_DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!metadataResponse.ok) {
      const errText = await metadataResponse.text();
      throw new Error(`Failed to create file metadata: ${errText}`);
    }

    const fileMetadata = await metadataResponse.json();
    const fileId = fileMetadata.id;

    // Step 2: Upload media content to the created file ID
    const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: fileBlob,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Failed to upload file media: ${errText}`);
    }

    const result = await uploadResponse.json();

    // Step 3: Update description metadata separately to guarantee it persists
    if (description) {
      try {
        const updateResponse = await fetch(`${GOOGLE_DRIVE_API_BASE}/files/${fileId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: description
          }),
        });
        if (!updateResponse.ok) {
          console.warn("Failed to set file description property:", await updateResponse.text());
        }
      } catch (err) {
        console.warn("Error setting description metadata:", err);
      }
    }

    return {
      id: fileId,
      name: fileName,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
      ...result
    };
  } catch (error) {
    console.error('Google Drive Upload Error:', error);
    throw error;
  }
}

/**
 * Fetch list of folders inside a specific parent folder in Google Drive (defaults to root).
 */
export async function listFolders(accessToken, parentId = 'root') {
  const query = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const url = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to list folders: ${errText}`);
  }

  const data = await response.json();
  return data.files || [];
}

export async function findSpreadsheetInFolder(accessToken, folderId, preferredName = 'JobScan_Expense_Log') {
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const url = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    const error = new Error('Google Drive session expired while searching for the project spreadsheet.');
    error.status = 401;
    throw error;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to search project folder in Google Drive: ${errText}`);
  }

  const searchResult = await response.json();
  const files = searchResult.files || [];
  if (files.length === 0) return null;

  return files.find(file => file.name === preferredName) || files[0];
}

/**
 * Creates a new folder in Google Drive.
 */
export async function createFolder(accessToken, folderName, parentId = null) {
  const body = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create folder: ${errText}`);
  }

  return await response.json();
}

/**
 * Finds the tracking Google Sheet (JobScan_Expense_Log) in the folder, or creates one if it doesn't exist.
 */
export async function findOrCreateTrackingSheet(accessToken, folderId) {
  // Query to find any spreadsheet in the project folder
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const searchUrl = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchResponse.ok) {
    throw new Error('Failed to search for tracking sheet');
  }

  const searchData = await searchResponse.json();
  
  if (searchData.files && searchData.files.length > 0) {
    // Prefer the one named 'JobScan_Expense_Log' if there are multiple, otherwise return the first one
    const preferred = searchData.files.find(f => f.name === 'JobScan_Expense_Log');
    return preferred ? preferred.id : searchData.files[0].id;
  }

  // If not found, create a new Google Sheet
  const createResponse = await fetch(`${GOOGLE_DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'JobScan_Expense_Log',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error('Failed to create tracking sheet');
  }

  const newSheet = await createResponse.json();
  const sheetId = newSheet.id;

  // Initialize the sheet with headers
  const headers = [
    'Date Logged',
    'Date of Transaction',
    'Job Description',
    'Vendor / Subcontractor',
    'Cost Category',
    'Amount',
    'Check Number',
    'PDF Link'
  ];

  await appendRowToSheet(accessToken, sheetId, headers);
  return sheetId;
}

/**
 * Appends a row of data to the Google Sheet.
 */
export async function appendRowToSheet(accessToken, sheetId, rowData) {
  const range = 'Sheet1!A1'; // Google Sheets API will find the table end starting from A1
  const url = `${GOOGLE_SHEETS_API_BASE}/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [rowData],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to append row to spreadsheet: ${errText}`);
  }

  return await response.json();
}

/**
 * Find or create a subfolder inside a parent folder in Google Drive.
 */
export async function findOrCreateFolder(accessToken, folderName, parentId) {
  assertDriveFolderParent(parentId, `find or create folder ${folderName}`);

  const safeFolderName = escapeDriveQueryString(folderName);
  const safeParentId = escapeDriveQueryString(parentId);
  const query = `name='${safeFolderName}' and mimeType='application/vnd.google-apps.folder' and '${safeParentId}' in parents and trashed=false`;
  const url = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to search for folder ${folderName}: ${errText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create it
  const created = await createFolder(accessToken, folderName, parentId);
  return created.id;
}

/**
 * Creates and uploads a photo file into a dynamically resolved subfolder hierarchy in Google Drive.
 */
export async function uploadPhotoToPhaseFolder(accessToken, rootFolderId, categoryName, phaseName, fileName, mimeType, fileBlob) {
  // 1. Find or create "Project_Photos" folder inside the root project folder
  const photosFolderId = await findOrCreateFolder(accessToken, 'Project_Photos', rootFolderId);
  
  // 2. Find or create category folder inside "Project_Photos"
  const cleanCategoryName = categoryName.replace(/[^a-zA-Z0-9_]/g, '_');
  const categoryFolderId = await findOrCreateFolder(accessToken, cleanCategoryName, photosFolderId);
  
  // 3. Find or create phase folder inside category folder
  const cleanPhaseName = phaseName.replace(/[^a-zA-Z0-9_]/g, '_');
  const phaseFolderId = await findOrCreateFolder(accessToken, cleanPhaseName, categoryFolderId);
  
  // 4. Upload file to phase folder
  return await uploadFileToDrive(accessToken, phaseFolderId, fileName, mimeType, fileBlob);
}

/**
 * Finds a folder ID by name and parent ID. Returns null if not found.
 */
export async function findFolder(accessToken, folderName, parentId) {
  assertDriveFolderParent(parentId, `find folder ${folderName}`);

  const safeFolderName = escapeDriveQueryString(folderName);
  const safeParentId = escapeDriveQueryString(parentId);
  const query = `name='${safeFolderName}' and mimeType='application/vnd.google-apps.folder' and '${safeParentId}' in parents and trashed=false`;
  const url = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to search for folder ${folderName}: ${errText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Lists all image files inside a specific phase folder in Google Drive.
 */
export async function listPhotosInPhase(accessToken, rootFolderId, categoryName, phaseName) {
  try {
    const photosFolderId = await findFolder(accessToken, 'Project_Photos', rootFolderId);
    if (!photosFolderId) return [];

    const cleanCategoryName = categoryName.replace(/[^a-zA-Z0-9_]/g, '_');
    const categoryFolderId = await findFolder(accessToken, cleanCategoryName, photosFolderId);
    if (!categoryFolderId) return [];

    const cleanPhaseName = phaseName.replace(/[^a-zA-Z0-9_]/g, '_');
    const phaseFolderId = await findFolder(accessToken, cleanPhaseName, categoryFolderId);
    if (!phaseFolderId) return [];

    const query = `'${phaseFolderId}' in parents and mimeType contains 'image/' and trashed=false`;
    const url = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,thumbnailLink)&pageSize=100`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list files in phase folder');
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Failed to list photos in phase:', error);
    return [];
  }
}

/**
 * Searches for a specific file by name inside a target Google Drive folder.
 */
export async function findFileInFolder(accessToken, folderId, fileName) {
  const query = `'${folderId}' in parents and name='${fileName}' and trashed=false`;
  const url = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Failed to find file in folder: ${await response.text()}`);
  }
  const result = await response.json();
  return result.files && result.files.length > 0 ? result.files[0] : null;
}

/**
 * Downloads and parses JSON content of a specific Google Drive file.
 */
export async function getFileContent(accessToken, fileId) {
  const blob = await fetchDriveFileBlob(accessToken, fileId);
  return await blob.text().then(JSON.parse);
}

/**
 * Overwrites the binary content of an existing Google Drive file.
 */
export async function updateFileContent(accessToken, fileId, fileBlob, mimeType) {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType
    },
    body: fileBlob
  });
  if (!response.ok) {
    throw new Error(`Failed to update file content: ${await response.text()}`);
  }
  return await response.json();
}

/**
 * Updates a file's permission on Google Drive to be publicly readable by anyone with the link.
 */
export async function makeFilePubliclyReadable(accessToken, fileId) {
  const url = `${GOOGLE_DRIVE_API_BASE}/files/${fileId}/permissions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to make file publicly readable: ${errText}`);
  }
  return true;
}


