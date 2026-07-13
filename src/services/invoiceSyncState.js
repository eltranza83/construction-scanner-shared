export function shouldFlagUnprocessedUpload(syncResult) {
  return Boolean(syncResult?.hasDriveUpload);
}

export function getHistoryFileId(item) {
  return String(item?.id || '').split('_split_')[0];
}
