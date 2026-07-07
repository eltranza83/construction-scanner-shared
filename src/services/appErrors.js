export const SESSION_EXPIRED_MESSAGE = 'Google Drive session expired. Please sign in again.';

export const STATUS_MESSAGES = {
  loadingDashboard: 'Loading dashboard data...',
  loadingBlueprint: 'Loading blueprint vault...',
  loadingPhotos: 'Loading project photos...',
  loadingFolders: 'Loading Google Drive folders...',
  retrievingPdf: 'Opening PDF from Google Drive...',
  uploadingToDrive: 'Uploading to Google Drive...',
  syncingSpreadsheet: 'Syncing spreadsheet...',
  refreshing: 'Refreshing...',
  refresh: 'Refresh'
};

export function isAuthError(error) {
  if (!error) return false;

  const status = Number(error.status || error.code);
  if (status === 401 || status === 403) return true;

  const message = String(error.message || error).toLowerCase();
  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthenticated') ||
    message.includes('unauthorized') ||
    message.includes('invalid credentials') ||
    message.includes('invalid token') ||
    message.includes('session expired') ||
    message.includes('invalid_grant') ||
    message.includes('credential')
  );
}

export function getDriveErrorMessage(error, action = 'complete that Google Drive action') {
  if (isAuthError(error)) {
    return SESSION_EXPIRED_MESSAGE;
  }

  const message = String(error?.message || '').trim();
  if (!message) {
    return `Could not ${action}. Please try again.`;
  }

  return `Could not ${action}. ${message}`;
}

export function getUploadErrorMessage(error, target = 'file') {
  if (isAuthError(error)) {
    return SESSION_EXPIRED_MESSAGE;
  }

  const message = String(error?.message || '').trim();
  return message
    ? `Could not upload ${target}. ${message}`
    : `Could not upload ${target}. Please try again.`;
}

export function getFolderErrorMessage(error, action = 'load Google Drive folders') {
  return getDriveErrorMessage(error, action);
}

export function getValidationErrorMessage(message) {
  return message || 'Please check the highlighted fields and try again.';
}
