import { useState, useEffect } from 'react';
import { loadIssuesVault, saveIssuesVault, uploadIssuePhoto, mergeIssues } from '../services/issuesDrive';
import { syncIssuesToSheet } from '../services/sheetsDataService';
import { getDriveErrorMessage } from '../services/appErrors';

const OFFLINE_QUEUE_KEY = 'jobscan_offline_issues_queue';
const CACHED_ISSUES_PREFIX = 'jobscan_cached_issues_';

// Helper to convert File to Base64 (for offline storage)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Helper to convert Base64 to Blob (for uploading when going online)
function base64ToBlob(base64Str, mimeType) {
  const parts = base64Str.split(';base64,');
  const raw = window.atob(parts[1] || parts[0]);
  const rawLength = raw.length;
  const u8arr = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    u8arr[i] = raw.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mimeType });
}

export function useIssues({ googleToken, activeProject }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [issuesDataFileId, setIssuesDataFileId] = useState(null);

  const projectId = activeProject?.id || 'default';
  const offlineQueueKey = `${OFFLINE_QUEUE_KEY}_${projectId}`;
  const cacheKey = `${CACHED_ISSUES_PREFIX}_${projectId}`;

  // Get local queue
  const getOfflineQueue = () => {
    try {
      return JSON.parse(localStorage.getItem(offlineQueueKey)) || [];
    } catch {
      return [];
    }
  };

  // Save local queue
  const saveOfflineQueue = (queue) => {
    localStorage.setItem(offlineQueueKey, JSON.stringify(queue));
  };

  // Load issues (either from Drive or local cache if offline)
  const loadIssues = async (forceSync = false) => {
    if (!activeProject?.folderId) {
      // Offline fallback: load from localStorage cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          setIssues(JSON.parse(cached));
        } catch {
          setIssues([]);
        }
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { issuesDataFileId: fileId, issues: remoteList } = await loadIssuesVault(
        googleToken,
        activeProject.folderId
      );
      setIssuesDataFileId(fileId);

      const queue = getOfflineQueue();
      if (queue.length > 0 || forceSync) {
        // We have pending offline operations, trigger merge & upload
        await processAndSyncQueue(remoteList, fileId);
      } else {
        setIssues(remoteList);
        localStorage.setItem(cacheKey, JSON.stringify(remoteList));
      }
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'load issues from Google Drive'));
      // Fallback to cache on error
      const cached = localStorage.getItem(cacheKey);
      if (cached) setIssues(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  };

  // Sync effect on project/auth state changes
  useEffect(() => {
    loadIssues();
  }, [googleToken, activeProject?.id]);

  // Execute and upload the merged operations to Drive & Sheets
  const processAndSyncQueue = async (remoteList, fileId) => {
    if (!googleToken || !activeProject?.folderId) return;

    setSyncing(true);
    setError(null);
    try {
      const queue = getOfflineQueue();
      const currentFileId = fileId || issuesDataFileId;

      // 1. Process any pending image uploads inside the queue
      for (const op of queue) {
        if (op.type === 'CREATE' && op.payload.photoBase64 && !op.payload.photoUrl) {
          try {
            const mimeType = op.payload.photoBase64.match(/:(.*?);/)[1] || 'image/jpeg';
            const blob = base64ToBlob(op.payload.photoBase64, mimeType);
            const fileObj = new File([blob], `offline_issue_photo.jpg`, { type: mimeType });

            const uploadResult = await uploadIssuePhoto(googleToken, activeProject.folderId, fileObj);
            op.payload.photoUrl = uploadResult.url;
            op.payload.photoFileId = uploadResult.id;
            delete op.payload.photoBase64; // Remove base64 data to keep JSON light
          } catch (uploadErr) {
            console.error('Failed to upload offline photo during sync:', uploadErr);
          }
        }
      }

      // 2. Perform the merge
      const mergedList = mergeIssues(remoteList, queue);

      // 3. Save merged config back to Google Drive
      const savedFileId = await saveIssuesVault(
        googleToken,
        activeProject.folderId,
        currentFileId,
        { issues: mergedList }
      );
      setIssuesDataFileId(savedFileId);

      // 4. Overwrite/Sync Google Sheet mirror (only active, non-deleted issues)
      if (activeProject?.spreadsheetId) {
        const activeIssues = mergedList.filter(i => !i.deletedAt);
        await syncIssuesToSheet(googleToken, activeProject.spreadsheetId, activeIssues);
      }

      // 5. Success! Clear local queue, update states and cache
      saveOfflineQueue([]);
      setIssues(mergedList);
      localStorage.setItem(cacheKey, JSON.stringify(mergedList));
      setSuccess('Issues synchronized successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'sync offline issues to Google Drive'));
    } finally {
      setSyncing(false);
    }
  };

  // Add issue action
  const addIssue = async ({ title, description, category, tradePhase, contractorName, phoneNumber, priority, photoFile }) => {
    setError(null);
    const newId = `issue_${Date.now()}`;
    const timestamp = Date.now();

    let photoBase64 = null;
    let photoUrl = null;
    let photoFileId = null;

    // Handle photo attachment
    if (photoFile) {
      const isOnline = !!(googleToken && activeProject?.folderId);
      if (isOnline) {
        setLoading(true);
        try {
          const uploadResult = await uploadIssuePhoto(googleToken, activeProject.folderId, photoFile);
          photoUrl = uploadResult.url;
          photoFileId = uploadResult.id;
        } catch (uploadErr) {
          console.error('Failed to upload photo immediately:', uploadErr);
          setError('Failed to upload photo to Drive, queuing issue locally...');
          // Fallback to offline mode for photo
          photoBase64 = await fileToBase64(photoFile);
        } finally {
          setLoading(false);
        }
      } else {
        // Offline: convert to base64 to store in queue
        photoBase64 = await fileToBase64(photoFile);
      }
    }

    const payload = {
      title,
      description,
      category,
      tradePhase: tradePhase || '',
      contractorName: contractorName || '',
      phoneNumber: phoneNumber || '',
      priority,
      status: 'open',
      photoBase64,
      photoUrl,
      photoFileId
    };

    const newOp = {
      type: 'CREATE',
      id: newId,
      payload,
      timestamp
    };

    // Update queue
    const queue = [...getOfflineQueue(), newOp];
    saveOfflineQueue(queue);

    // Update local UI state immediately (optimistic update)
    const localNewIssue = {
      id: newId,
      ...payload,
      createdAt: new Date(timestamp).toISOString(),
      updatedAt: new Date(timestamp).toISOString(),
      deletedAt: null
    };
    const updatedList = [...issues, localNewIssue];
    setIssues(updatedList);
    localStorage.setItem(cacheKey, JSON.stringify(updatedList));

    // Try to trigger online sync
    if (googleToken && activeProject?.folderId) {
      try {
        const { issues: latestRemote } = await loadIssuesVault(googleToken, activeProject.folderId);
        await processAndSyncQueue(latestRemote, issuesDataFileId);
      } catch {
        // If sync fails, it will remain in queue and sync next time
      }
    } else {
      setSuccess('Issue saved locally. Will sync when online.');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  // Update status action
  const updateIssueStatus = async (id, status) => {
    setError(null);
    const timestamp = Date.now();
    const newOp = {
      type: 'UPDATE_STATUS',
      id,
      payload: { status },
      timestamp
    };

    // Update queue
    const queue = [...getOfflineQueue(), newOp];
    saveOfflineQueue(queue);

    // Optimistic local state update
    const updatedList = issues.map(i => {
      if (i.id === id) {
        return {
          ...i,
          status,
          updatedAt: new Date(timestamp).toISOString()
        };
      }
      return i;
    });
    setIssues(updatedList);
    localStorage.setItem(cacheKey, JSON.stringify(updatedList));

    // Try sync
    if (googleToken && activeProject?.folderId) {
      try {
        const { issues: latestRemote } = await loadIssuesVault(googleToken, activeProject.folderId);
        await processAndSyncQueue(latestRemote, issuesDataFileId);
      } catch {
        // Remains in queue
      }
    }
  };

  // Soft delete action
  const softDeleteIssue = async (id) => {
    setError(null);
    const timestamp = Date.now();
    const newOp = {
      type: 'SOFT_DELETE',
      id,
      timestamp
    };

    // Update queue
    const queue = [...getOfflineQueue(), newOp];
    saveOfflineQueue(queue);

    // Optimistic local state update
    const updatedList = issues.map(i => {
      if (i.id === id) {
        return {
          ...i,
          deletedAt: new Date(timestamp).toISOString(),
          updatedAt: new Date(timestamp).toISOString()
        };
      }
      return i;
    });
    setIssues(updatedList);
    localStorage.setItem(cacheKey, JSON.stringify(updatedList));

    // Try sync
    if (googleToken && activeProject?.folderId) {
      try {
        const { issues: latestRemote } = await loadIssuesVault(googleToken, activeProject.folderId);
        await processAndSyncQueue(latestRemote, issuesDataFileId);
      } catch {
        // Remains in queue
      }
    }
  };

  // Manual trigger sync
  const triggerSync = async () => {
    await loadIssues(true);
  };

  return {
    issues,
    loading,
    syncing,
    error,
    success,
    addIssue,
    updateIssueStatus,
    softDeleteIssue,
    triggerSync
  };
}
