export function buildAppsScriptSyncUrl(activeProject) {
  if (!activeProject?.appsScriptUrl) return null;
  const params = new URLSearchParams({
    action: 'sync',
    folderId: activeProject.folderId || ''
  });
  if (activeProject.appsScriptSecret) {
    params.set('secret', activeProject.appsScriptSecret);
  }
  const separator = activeProject.appsScriptUrl.includes('?') ? '&' : '?';
  return `${activeProject.appsScriptUrl}${separator}${params.toString()}`;
}

export function shouldFlagUnprocessedUpload(syncResult, activeProject) {
  return Boolean(syncResult?.hasDriveUpload && activeProject?.appsScriptUrl);
}

export function getHistoryFileId(item) {
  return String(item?.id || '').split('_split_')[0];
}
