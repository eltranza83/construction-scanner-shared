import { useState, useEffect } from 'react';
import { fetchDriveFileBlob } from '../services/googleDrive.js';

// In-memory cache for downloaded Blobs so repeated mounts do not re-fetch over the network
const rawBlobCache = new Map();

export function getCachedDriveBlob(fileId) {
  return rawBlobCache.get(fileId);
}

export function setCachedDriveBlob(fileId, blob) {
  rawBlobCache.set(fileId, blob);
}

export function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function useAuthenticatedDriveImage({ googleToken, fileId, url, base64 }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If base64 or a local blob/data URL is already supplied, use it directly without network call
  const directSrc = base64 || (url && (url.startsWith('data:') || url.startsWith('blob:')) ? url : null);
  const resolvedFileId = fileId || extractDriveFileId(url);

  useEffect(() => {
    if (directSrc) {
      setObjectUrl(null);
      return;
    }

    if (!resolvedFileId || !googleToken) {
      setObjectUrl(null);
      return;
    }

    let active = true;
    let localUrl = null;

    const loadBlob = async () => {
      // 1. Check in-memory raw Blob cache
      let blob = rawBlobCache.get(resolvedFileId);
      if (!blob) {
        setLoading(true);
        try {
          blob = await fetchDriveFileBlob(googleToken, resolvedFileId);
          rawBlobCache.set(resolvedFileId, blob);
        } catch (err) {
          if (active) {
            console.warn('[useAuthenticatedDriveImage] Failed to load Drive image blob:', err);
            setError(err);
          }
          return;
        } finally {
          if (active) setLoading(false);
        }
      }

      if (active && blob) {
        localUrl = URL.createObjectURL(blob);
        setObjectUrl(localUrl);
      }
    };

    loadBlob();

    return () => {
      active = false;
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [googleToken, resolvedFileId, directSrc]);

  return {
    src: directSrc || objectUrl || null,
    loading,
    error
  };
}
