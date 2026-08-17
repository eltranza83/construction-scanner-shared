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

  useEffect(() => {
    const auth = getFirebaseAuthInstance();
    if (!auth) return;

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user?.email) {
        if (isBuiltInAdmin(user.email)) {
          unlockInvite(user.email);
          return;
        }
        const storedEmail = localStorage.getItem(APP_STORAGE_KEYS.authorizedEmail);
        const storedInvited = localStorage.getItem(APP_STORAGE_KEYS.invited) === 'true';
        if (storedInvited || (storedEmail && storedEmail.toLowerCase() === user.email.toLowerCase())) {
          setIsInvited(true);
        }
      }
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
    unlockInvite,
    resetInvite
  };
}
