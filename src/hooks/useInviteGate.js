import { useState } from 'react';
import {
  APP_STORAGE_KEYS,
  loadInitialInviteState,
  setStoredBoolean
} from '../services/appStorage';

export function useInviteGate() {
  const [isInvited, setIsInvited] = useState(loadInitialInviteState);

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
