import { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore/lite';
import { ADMIN_PASSCODE, DEFAULT_FIREBASE_CONFIG, STORAGE_KEYS, getStoredConfigValue } from '../config/appConfig';
import { APP_STORAGE_KEYS } from '../services/appStorage';
import { getFirebaseAuthInstance, getFirebaseDb } from '../services/firebase';

export function useSettingsAdmin({ setGeminiKey, setError, setSuccess }) {
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [firebaseApiKey, setFirebaseApiKey] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseApiKey, DEFAULT_FIREBASE_CONFIG.apiKey));
  const [firebaseProjectId, setFirebaseProjectId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseProjectId, DEFAULT_FIREBASE_CONFIG.projectId));
  const [firebaseAppId, setFirebaseAppId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseAppId, DEFAULT_FIREBASE_CONFIG.appId));
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  const fetchInvitesList = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    setLoadingInvites(true);
    try {
      const qSnapshot = await getDocs(collection(db, 'invites'));
      const list = [];
      qSnapshot.forEach((d) => {
        if (d.id !== 'CONFIG-GEMINI') {
          list.push({ id: d.id, ...d.data() });
        }
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
        return timeB - timeA;
      });
      setInvites(list);
    } catch (err) {
      console.error('Failed to fetch invites:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const fetchSharedGeminiKey = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    try {
      const docRef = doc(db, 'invites', 'CONFIG-GEMINI');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.apiKey) {
          setTempGeminiKey(data.apiKey);
        }
      }
    } catch (err) {
      console.error('Failed to fetch shared Gemini key:', err);
    }
  };

  useEffect(() => {
    if (isAdminUnlocked) {
      fetchInvitesList();
      fetchSharedGeminiKey();
    }
  }, [isAdminUnlocked]);

  const handleGenerateInvite = async () => {
    const db = getFirebaseDb();
    if (!db) {
      setError('Database not configured. Set up Firebase below first.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345689';
      const genPart = () => {
        let p = '';
        for (let i = 0; i < 4; i++) {
          p += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return p;
      };
      const code = `ADPC-${genPart()}-${genPart()}`;
      const authUser = getFirebaseAuthInstance()?.currentUser;

      await setDoc(doc(db, 'invites', code), {
        used: false,
        createdAt: new Date(),
        usedAt: null,
        createdByUid: authUser?.uid || null,
        createdByEmail: authUser?.email || null
      });

      setSuccess(`Generated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error(err);
      setError('Failed to generate invite code. Check database configuration.');
    }
  };

  const handleShareInvite = async (code) => {
    const inviteLink = `${window.location.origin}?code=${code}`;
    const message = `Hey! Here is your private invite link for the Adepec Homes Construction Scanner:\n\n${inviteLink}\n\nJust open the link and tap "Activate Access"!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Adepec Homes Scanner Invite',
          text: message,
          url: inviteLink
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(message);
        setSuccess('Invite details copied to clipboard! You can now paste and send it.');
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        console.error('Failed to copy:', err);
        setError('Failed to copy to clipboard.');
      }
    }
  };

  const handleDeleteInvite = async (code) => {
    const db = getFirebaseDb();
    if (!db) return;
    if (!window.confirm(`Deactivate/delete invite code: ${code}?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteDoc(doc(db, 'invites', code));
      setSuccess(`Deactivated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to deactivate invite code.');
    }
  };

  const handleSaveFirebaseConfig = () => {
    if (!firebaseApiKey.trim() || !firebaseProjectId.trim()) {
      setError('Firebase API Key and Project ID are required.');
      return;
    }
    localStorage.setItem(STORAGE_KEYS.firebaseApiKey, firebaseApiKey.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseProjectId, firebaseProjectId.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseAppId, firebaseAppId.trim());
    setSuccess('Firebase configuration saved successfully!');
    setError(null);
    setTimeout(() => {
      setSuccess(null);
      window.location.reload();
    }, 1500);
  };

  const handleSaveSharedGeminiKey = async () => {
    const db = getFirebaseDb();
    if (!db) {
      setError('Database not configured. Set up Firebase below first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSavingGeminiKey(true);
    try {
      const authUser = getFirebaseAuthInstance()?.currentUser;
      await setDoc(doc(db, 'invites', 'CONFIG-GEMINI'), {
        apiKey: tempGeminiKey.trim(),
        updatedAt: new Date(),
        updatedByUid: authUser?.uid || null,
        updatedByEmail: authUser?.email || null
      });
      setSuccess('Shared Gemini API Key saved to database! Other users will receive it automatically on next load.');

      setGeminiKey(tempGeminiKey.trim());
      localStorage.setItem(APP_STORAGE_KEYS.geminiKey, tempGeminiKey.trim());

      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setError('Failed to save Gemini API Key to database.');
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const handleVerifyAdmin = () => {
    if (adminPassInput === ADMIN_PASSCODE) {
      setIsAdminUnlocked(true);
      setError(null);
    } else {
      setError('Incorrect Admin Passcode.');
    }
  };

  return {
    adminPassInput,
    firebaseApiKey,
    firebaseAppId,
    firebaseProjectId,
    invites,
    isAdminUnlocked,
    loadingInvites,
    savingGeminiKey,
    showAdminPanel,
    tempGeminiKey,
    setAdminPassInput,
    setFirebaseApiKey,
    setFirebaseAppId,
    setFirebaseProjectId,
    setShowAdminPanel,
    setTempGeminiKey,
    handleDeleteInvite,
    handleGenerateInvite,
    handleSaveFirebaseConfig,
    handleSaveSharedGeminiKey,
    handleShareInvite,
    handleVerifyAdmin
  };
}
