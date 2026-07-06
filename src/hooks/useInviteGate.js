import { useEffect, useState } from 'react';
import {
  APP_STORAGE_KEYS,
  loadInitialInviteState,
  setStoredBoolean
} from '../services/appStorage';

export function useInviteGate() {
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(APP_STORAGE_KEYS.geminiKey) || '');
  const [isInvited, setIsInvited] = useState(loadInitialInviteState);

  useEffect(() => {
    const fetchSharedGeminiKey = async () => {
      const [{ getFirebaseDb }, { doc, getDoc }] = await Promise.all([
        import('../services/firebase'),
        import('firebase/firestore')
      ]);
      const db = getFirebaseDb();
      if (!db) return;

      try {
        const docRef = doc(db, 'invites', 'CONFIG-GEMINI');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.apiKey) {
            setGeminiKey(data.apiKey);
            localStorage.setItem(APP_STORAGE_KEYS.geminiKey, data.apiKey);
          }
        }
      } catch (err) {
        console.error('Failed to fetch shared Gemini key from Firestore:', err);
      }
    };

    if (isInvited) {
      fetchSharedGeminiKey();
    }
  }, [isInvited]);

  const unlockInvite = (email) => {
    localStorage.setItem(APP_STORAGE_KEYS.authorizedEmail, email);
    setStoredBoolean(APP_STORAGE_KEYS.invited, true);
    setIsInvited(true);
  };

  const updateGeminiKey = (key) => {
    setGeminiKey(key);
  };

  const resetInvite = () => {
    setIsInvited(false);
  };

  return {
    geminiKey,
    setGeminiKey,
    isInvited,
    unlockInvite,
    updateGeminiKey,
    resetInvite
  };
}
