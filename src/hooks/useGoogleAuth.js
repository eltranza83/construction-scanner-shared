import { useEffect, useState } from 'react';
import {
  clearGoogleIdentity,
  clearGoogleSession,
  loadStoredAppState,
  persistGoogleToken,
  persistGoogleUser,
} from '../services/appStorage';
import { signInToFirebaseWithGoogleToken, signOutFromFirebase } from '../services/firebase';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets email profile';
const GOOGLE_SCRIPT_ID = 'google-gis-script';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function getFriendlyAuthError(err) {
  const message = err?.message || err?.error || String(err || '');
  if (!message) return 'Google sign-in was cancelled or failed.';
  if (message.includes('origin_mismatch')) {
    return `Google rejected the sign-in because this origin is not authorized for the OAuth client. Add ${window.location.origin} to the Google Cloud Console Authorized JavaScript origins and redirect URIs, then refresh the page.`;
  }
  if (message.includes('popup')) {
    return 'The sign-in popup was blocked. Please allow popups for this site and try again.';
  }
  if (message.includes('auth/operation-not-allowed') || message.includes('auth/configuration-not-found')) {
    return 'Firebase Google sign-in is not enabled yet. In Firebase Console, enable Authentication > Sign-in method > Google, then try again.';
  }
  return `Google Sign In failed: ${message}`;
}

async function fetchGoogleUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to retrieve Google profile: ${res.status} ${errText}`);
  }

  return await res.json();
}

async function buildSignedInUser(accessToken) {
  const info = await fetchGoogleUserInfo(accessToken);
  const firebaseUser = await signInToFirebaseWithGoogleToken(accessToken);
  return {
    ...info,
    firebaseUid: firebaseUser.uid,
  };
}

export function useGoogleAuth({ setError, setSuccess, onMissingClientId, onSignedOut } = {}) {
  const [googleClientId, setGoogleClientId] = useState(() => loadStoredAppState().googleClientId);
  const [googleToken, setGoogleToken] = useState(() => loadStoredAppState().googleToken);
  const [googleUser, setGoogleUser] = useState(() => loadStoredAppState().googleUser);

  useEffect(() => {
    const initClient = () => {
      if (!googleClientId || !window.google?.accounts?.oauth2 || window.googleTokenClient) return;

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: GOOGLE_SCOPE,
          callback: async (tokenResponse) => {
            if (tokenResponse.access_token) {
              setGoogleToken(tokenResponse.access_token);
              persistGoogleToken(tokenResponse.access_token);
              setError?.(null);

              try {
                const info = await buildSignedInUser(tokenResponse.access_token);
                setGoogleUser(info);
                persistGoogleUser(info);
              } catch (err) {
                console.error('Quiet Google/Firebase user update failed:', err);
                setGoogleToken(null);
                setGoogleUser(null);
                clearGoogleIdentity();
              }
            } else if (tokenResponse.error) {
              console.warn('Google authentication failed or was cancelled:', tokenResponse);
              setGoogleToken(null);
              setGoogleUser(null);
              clearGoogleIdentity();

              if (tokenResponse.error === 'user_logged_out' || tokenResponse.error === 'immediate_failed') {
                setError?.('Google Drive session expired. Please sign in again.');
              } else {
                setError?.(`Google Sign-In failed: ${tokenResponse.error}`);
              }
            }
          }
        });
        window.googleTokenClient = client;
        console.log('Google token client pre-initialized successfully.');
      } catch (err) {
        console.error('Failed to pre-initialize GIS token client:', err);
      }
    };

    let script = document.getElementById(GOOGLE_SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = GOOGLE_SCRIPT_ID;
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = initClient;
      document.body.appendChild(script);
    } else {
      initClient();
    }
  }, [googleClientId, setError]);

  const signIn = () => {
    if (!googleClientId) {
      setError?.('Please set your Google Web Client ID in the Settings tab first.');
      onMissingClientId?.();
      return;
    }

    setError?.(null);
    try {
      if (window.google?.accounts?.oauth2?.initTokenClient) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: GOOGLE_SCOPE,
          callback: async (tokenResponse) => {
            if (tokenResponse.access_token) {
              setGoogleToken(tokenResponse.access_token);
              persistGoogleToken(tokenResponse.access_token);

              try {
                const info = await buildSignedInUser(tokenResponse.access_token);
                setGoogleUser(info);
                persistGoogleUser(info);
                setSuccess?.('Successfully signed in with Google!');
                setTimeout(() => setSuccess?.(null), 3000);
              } catch (err) {
                console.error('Failed to sign in with Google/Firebase:', err);
                setGoogleToken(null);
                setGoogleUser(null);
                clearGoogleIdentity();
                setError?.(getFriendlyAuthError(err));
              }
            } else if (tokenResponse.error) {
              setGoogleToken(null);
              setGoogleUser(null);
              clearGoogleIdentity();
              setError?.(getFriendlyAuthError(tokenResponse));
            }
          },
          error_callback: (err) => {
            setGoogleToken(null);
            setGoogleUser(null);
            clearGoogleIdentity();
            setError?.(getFriendlyAuthError(err));
          }
        });
        window.googleTokenClient = client;
        client.requestAccessToken();
        return;
      }

      setError?.('Google Identity Services did not load. Please refresh the page and try again.');
    } catch (err) {
      console.error(err);
      setError?.('Failed to initialize Google login client. Make sure client ID is valid.');
    }
  };

  const signOut = async () => {
    setGoogleToken(null);
    setGoogleUser(null);
    clearGoogleSession();
    try {
      await signOutFromFirebase();
    } catch (err) {
      console.warn('Firebase sign out failed:', err);
    }
    onSignedOut?.();
    setSuccess?.('Signed out of Google account.');
    setTimeout(() => setSuccess?.(null), 3000);
  };

  const handleSessionExpired = () => {
    console.warn('Session expired. Attempting silent token refresh...');

    try {
      if (window.googleTokenClient) {
        window.googleTokenClient.requestAccessToken({ prompt: '' });
        return;
      }
    } catch (err) {
      console.error('Silent token refresh failed:', err);
    }

    setGoogleToken(null);
    setGoogleUser(null);
    clearGoogleIdentity();
    setError?.('Google Drive session expired. Please sign in again.');
  };

  return {
    googleClientId,
    setGoogleClientId,
    googleToken,
    setGoogleToken,
    googleUser,
    signIn,
    signOut,
    handleSessionExpired,
  };
}
