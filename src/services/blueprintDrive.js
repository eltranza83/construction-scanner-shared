import {
  fetchDriveFileBlob,
  findFileInFolder,
  findOrCreateFolder,
  getFileContent,
  updateFileContent,
  uploadFileToDrive,
  uploadPhotoToPhaseFolder
} from './googleDrive';

const X_RAY_FOLDER_NAME = 'X-Ray Photos';
const BLUEPRINT_CONFIG_FILE = 'blueprint_data.json';
const BLUEPRINT_CONFIG_MIME_TYPE = 'application/json';

function buildJsonBlob(data) {
  return new Blob([JSON.stringify(data, null, 2)], { type: BLUEPRINT_CONFIG_MIME_TYPE });
}

function buildBlueprintConfig({ blueprintFileId = null, blueprintFileName = null, pins = [] }) {
  return {
    blueprintFileId,
    blueprintFileName,
    pins
  };
}

async function ensureXRayFolder(accessToken, projectFolderId) {
  return await findOrCreateFolder(accessToken, X_RAY_FOLDER_NAME, projectFolderId);
}

async function saveBlueprintConfig(accessToken, blueprintDataFileId, config) {
  const blob = buildJsonBlob(config);
  return await updateFileContent(accessToken, blueprintDataFileId, blob, BLUEPRINT_CONFIG_MIME_TYPE);
}

export async function loadBlueprintVault(accessToken, projectFolderId) {
  const xRayFolderId = await ensureXRayFolder(accessToken, projectFolderId);
  const configJsonFile = await findFileInFolder(accessToken, xRayFolderId, BLUEPRINT_CONFIG_FILE);

  if (!configJsonFile) {
    return {
      blueprintDataFileId: null,
      blueprintFileId: null,
      blueprintFileName: null,
      pins: [],
      blueprintBlob: null
    };
  }

  const data = await getFileContent(accessToken, configJsonFile.id);
  const blueprintFileId = data.blueprintFileId || null;

  return {
    blueprintDataFileId: configJsonFile.id,
    blueprintFileId,
    blueprintFileName: data.blueprintFileName || null,
    pins: data.pins || [],
    blueprintBlob: blueprintFileId ? await fetchDriveFileBlob(accessToken, blueprintFileId) : null
  };
}

export async function uploadBlueprintVaultFile({
  accessToken,
  projectFolderId,
  projectName,
  file,
  blueprintDataFileId
}) {
  const xRayFolderId = await ensureXRayFolder(accessToken, projectFolderId);
  const extension = file.name.split('.').pop();
  const blueprintFileName = `${projectName || 'Project'}_Blueprint_${Date.now()}.${extension}`;
  const imgUpload = await uploadFileToDrive(accessToken, xRayFolderId, blueprintFileName, file.type, file);
  const configPayload = buildBlueprintConfig({
    blueprintFileId: imgUpload.id,
    blueprintFileName,
    pins: []
  });
  const blob = buildJsonBlob(configPayload);

  if (blueprintDataFileId) {
    await updateFileContent(accessToken, blueprintDataFileId, blob, BLUEPRINT_CONFIG_MIME_TYPE);
    return blueprintDataFileId;
  }

  const uploadedConfig = await uploadFileToDrive(
    accessToken,
    xRayFolderId,
    BLUEPRINT_CONFIG_FILE,
    BLUEPRINT_CONFIG_MIME_TYPE,
    blob
  );
  return uploadedConfig.id;
}

export async function addBlueprintPin({
  accessToken,
  projectFolderId,
  blueprintDataFileId,
  blueprintFileId,
  blueprintFileName,
  pins,
  pinCoords,
  formData,
  selectedPhoto
}) {
  let photoUrl = '';
  let photoFileId = '';

  if (selectedPhoto) {
    const extension = selectedPhoto.name.split('.').pop();
    const photoFileName = `${formData.tradePhase.replace(/[^a-zA-Z0-9_]/g, '_')}_Pin_${Date.now()}.${extension}`;
    const uploadResult = await uploadPhotoToPhaseFolder(
      accessToken,
      projectFolderId,
      formData.tradeCategory,
      formData.tradePhase,
      photoFileName,
      selectedPhoto.type,
      selectedPhoto
    );
    photoFileId = uploadResult.id;
    photoUrl = uploadResult.webViewLink || '';
  }

  const newPin = {
    id: `pin_${Date.now()}`,
    x: parseFloat(pinCoords.x.toFixed(2)),
    y: parseFloat(pinCoords.y.toFixed(2)),
    category: formData.tradeCategory,
    phase: formData.tradePhase,
    note: formData.note.trim(),
    photoFileId,
    photoUrl,
    createdAt: new Date().toISOString()
  };
  const updatedPins = [...pins, newPin];

  await saveBlueprintConfig(
    accessToken,
    blueprintDataFileId,
    buildBlueprintConfig({ blueprintFileId, blueprintFileName, pins: updatedPins })
  );

  return { newPin, updatedPins };
}

export async function deleteBlueprintPin({
  accessToken,
  blueprintDataFileId,
  blueprintFileId,
  blueprintFileName,
  pins,
  pinId
}) {
  const updatedPins = pins.filter(pin => pin.id !== pinId);

  await saveBlueprintConfig(
    accessToken,
    blueprintDataFileId,
    buildBlueprintConfig({ blueprintFileId, blueprintFileName, pins: updatedPins })
  );

  return updatedPins;
}

export async function resetBlueprintVault(accessToken, blueprintDataFileId) {
  await saveBlueprintConfig(accessToken, blueprintDataFileId, buildBlueprintConfig());
}
