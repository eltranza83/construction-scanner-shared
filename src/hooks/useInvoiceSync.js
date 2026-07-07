import { useState } from 'react';
import {
  APP_STORAGE_KEYS,
  loadStoredAppState,
  persistHistory,
  setStoredBoolean
} from '../services/appStorage';
import { STATUS_MESSAGES, getDriveErrorMessage, isAuthError } from '../services/appErrors';
import { fetchDriveFileBlob } from '../services/googleDrive';
import { syncInvoiceDocument } from '../services/invoiceUpload';

function writePdfLoadingState(newWindow) {
  if (!newWindow) return;

  newWindow.document.write(`
    <div style="
      font-family: system-ui, -apple-system, sans-serif;
      color: #fafafa;
      background: #0a0a0a;
      height: 100vh;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
    ">
      <div style="
        width: 28px;
        height: 28px;
        border: 3px solid rgba(197, 160, 89, 0.2);
        border-top-color: #C5A059;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      "></div>
      <span style="font-size: 0.95rem; font-weight: 500; letter-spacing: 0.02em;">${STATUS_MESSAGES.retrievingPdf}</span>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </div>
  `);
}

export function useInvoiceSync({
  activeProject,
  googleToken,
  selectedFolder,
  projects,
  stagedItems,
  removeStagedItem,
  handleSessionExpired,
  setError,
  setSuccess
}) {
  const [uploading, setUploading] = useState(null);
  const [history, setHistory] = useState(() => loadStoredAppState().history);
  const [hasUnprocessedUploads, setHasUnprocessedUploads] = useState(() => (
    loadStoredAppState().hasUnprocessedUploads
  ));
  const [triggeringSync, setTriggeringSync] = useState(false);

  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    persistHistory(newHistory);
  };

  const handleTriggerAppsScriptSync = async () => {
    if (!activeProject?.appsScriptUrl) return;
    setTriggeringSync(true);
    setError(null);
    try {
      const syncUrl = `${activeProject.appsScriptUrl}?action=sync&folderId=${activeProject.folderId}`;
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors'
      });

      setTimeout(() => {
        setHasUnprocessedUploads(false);
        setStoredBoolean(APP_STORAGE_KEYS.hasUnprocessedUploads, false);
        setTriggeringSync(false);
        setSuccess('Spreadsheet sync triggered successfully! Check your spreadsheet in a few seconds.');
        setTimeout(() => setSuccess(null), 4000);
      }, 2000);
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'trigger spreadsheet sync'));
      setTriggeringSync(false);
    }
  };

  const handleSyncToDrive = async (id) => {
    const itemToSync = stagedItems.find(item => item.id === id);
    if (!itemToSync) return;

    setError(null);
    setUploading(id);

    try {
      const result = await syncInvoiceDocument({
        item: itemToSync,
        googleToken,
        selectedFolder,
        projects
      });

      saveHistory([...result.logs, ...history]);

      if (result.hasDriveUpload && activeProject?.appsScriptUrl) {
        setHasUnprocessedUploads(true);
        setStoredBoolean(APP_STORAGE_KEYS.hasUnprocessedUploads, true);
      }

      setSuccess(result.successMessage);

      removeStagedItem(id);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      if (isAuthError(err)) {
        handleSessionExpired();
      } else {
        setError(getDriveErrorMessage(err, 'save report'));
      }
    } finally {
      setUploading(null);
    }
  };

  const handleViewPDF = async (item) => {
    if (!item.link) return;

    const newWindow = window.open('about:blank', '_blank');
    writePdfLoadingState(newWindow);

    if (googleToken) {
      try {
        const fileId = item.id.split('_split_')[0];
        const blob = await fetchDriveFileBlob(googleToken, fileId);
        const fileURL = URL.createObjectURL(blob);
        if (newWindow) {
          newWindow.location.href = fileURL;
        } else {
          window.open(fileURL, '_blank');
        }
        return;
      } catch (err) {
        console.error('Failed to view PDF via API, falling back to web link:', err);
        if (isAuthError(err)) {
          handleSessionExpired();
        }
      }
    }

    if (newWindow) {
      newWindow.location.href = item.link;
    } else {
      window.open(item.link, '_blank');
    }
  };

  return {
    uploading,
    history,
    hasUnprocessedUploads,
    triggeringSync,
    handleTriggerAppsScriptSync,
    handleSyncToDrive,
    handleViewPDF
  };
}
