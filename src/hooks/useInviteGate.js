import { useState, useEffect } from 'react';
import {
  APP_STORAGE_KEYS,
  loadInitialInviteState,
  setStoredBoolean
} from '../services/appStorage';
import { getFirebaseAuthInstance } from '../services/firebase';

import { isBuiltInAdmin } from '../config/appConfig';

export function useInviteGate() {
  const [isInvited, setIsInvited] = useState(loadInitialInviteState);
  const [isAuthChecking, setIsAuthChecking] = useState(() => {
    // If already verified invited from storage, no initial blocking needed
    if (loadInitialInviteState()) return false;
    // If a googleUser exists in storage, hold screen until Firebase checks auth state
    const storedUser = localStorage.getItem(APP_STORAGE_KEYS.googleUser);
    return Boolean(storedUser);
  });

  useEffect(() => {
    const auth = getFirebaseAuthInstance();
    if (!auth) {
      setIsAuthChecking(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user?.email) {
        if (isBuiltInAdmin(user.email)) {
          unlockInvite(user.email);
          setIsAuthChecking(false);
          return;
        }
        const storedEmail = localStorage.getItem(APP_STORAGE_KEYS.authorizedEmail);
        const storedInvited = localStorage.getItem(APP_STORAGE_KEYS.invited) === 'true';
        if (storedInvited || (storedEmail && storedEmail.toLowerCase() === user.email.toLowerCase())) {
          setIsInvited(true);
        }
      }
      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const unlockInvite = (email) => {
    localStorage.setItem(APP_STORAGE_KEYS.authorizedEmail, email);
    setStoredBoolean(APP_STORAGE_KEYS.invited, true);
    setIsInvited(true);
  };

  const resetInvite = () => {
    setIsInvited(false);
  };

  return {
    isInvited,
    isAuthChecking,
    unlockInvite,
    resetInvite
  };
}
