export function buildAppsScriptSyncUrl(activeProject) {
  if (!activeProject?.appsScriptUrl) return null;
  const folderId = encodeURIComponent(activeProject.folderId || '');
  return `${activeProject.appsScriptUrl}?action=sync&folderId=${folderId}`;
}

export function shouldFlagUnprocessedUpload(syncResult, activeProject) {
  return Boolean(syncResult?.hasDriveUpload && activeProject?.appsScriptUrl);
}

export function getHistoryFileId(item) {
  return String(item?.id || '').split('_split_')[0];
}
