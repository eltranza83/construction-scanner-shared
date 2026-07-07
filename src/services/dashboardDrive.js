import { fetchProjectDashboardData } from './sheetsDataService.js';
import {
  findSpreadsheetInFolder,
  listPhotosInPhase,
  uploadPhotoToPhaseFolder
} from './googleDrive.js';

export function buildDashboardPhotoFileName(originalName, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `Photo_${timestamp}_${originalName}`;
}

export async function loadProjectDashboardFromFolder({
  accessToken,
  projectFolderId,
  cachedSpreadsheetId
}) {
  let spreadsheetId = cachedSpreadsheetId || null;

  if (!spreadsheetId) {
    const spreadsheet = await findSpreadsheetInFolder(accessToken, projectFolderId);
    if (!spreadsheet) {
      throw new Error("No spreadsheet found in your project folder. Please move your project spreadsheet (e.g. 'test project spreadsheet') into this folder.");
    }
    spreadsheetId = spreadsheet.id;
  }

  const data = await fetchProjectDashboardData(accessToken, spreadsheetId);
  return { spreadsheetId, data };
}

export async function listDashboardPhasePhotos({
  accessToken,
  projectFolderId,
  phase
}) {
  return await listPhotosInPhase(
    accessToken,
    projectFolderId,
    phase.category,
    phase.phase
  );
}

export async function uploadDashboardPhasePhoto({
  accessToken,
  projectFolderId,
  phase,
  file
}) {
  const fileName = buildDashboardPhotoFileName(file.name);

  await uploadPhotoToPhaseFolder(
    accessToken,
    projectFolderId,
    phase.category,
    phase.phase,
    fileName,
    file.type,
    file
  );

  return await listDashboardPhasePhotos({ accessToken, projectFolderId, phase });
}
