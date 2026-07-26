import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore/lite';
import { DEFAULT_FIREBASE_CONFIG, STORAGE_KEYS, getStoredConfigValue } from '../config/appConfig';

/**
 * Dynamically gets or initializes the Firestore database instance
 * using settings configured by the administrator, falling back to 
 * pre-configured default credentials for zero-setup execution.
 */
function getFirebaseAppInstance() {
  const apiKey = getStoredConfigValue(STORAGE_KEYS.firebaseApiKey, DEFAULT_FIREBASE_CONFIG.apiKey);
  const projectId = getStoredConfigValue(STORAGE_KEYS.firebaseProjectId, DEFAULT_FIREBASE_CONFIG.projectId);
  
  if (!apiKey || !projectId) {
    return null; 
  }

  const firebaseConfig = {
    apiKey,
    authDomain: localStorage.getItem('jobscan_firebase_auth_domain') || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: localStorage.getItem('jobscan_firebase_storage_bucket') || `${projectId}.appspot.com`,
    messagingSenderId: localStorage.getItem('jobscan_firebase_messaging_sender_id') || '',
    appId: getStoredConfigValue(STORAGE_KEYS.firebaseAppId, DEFAULT_FIREBASE_CONFIG.appId)
  };

  try {
    if (getApps().length === 0) {
      return initializeApp(firebaseConfig);
    }
    return getApp();
  } catch (err) {
    console.error('Failed to initialize Firebase app:', err);
    return null;
  }
}

export function getFirebaseDb() {
  const app = getFirebaseAppInstance();
  return app ? getFirestore(app) : null;
}

export function getFirebaseAuthInstance() {
  const app = getFirebaseAppInstance();
  return app ? getAuth(app) : null;
}

export async function signInToFirebaseWithGooglePopup(scopes = []) {
  const auth = getFirebaseAuthInstance();
  if (!auth) {
    throw new Error('Firebase is not configured.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  scopes.forEach((scope) => provider.addScope(scope));
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);

  if (!credential?.accessToken) {
    throw new Error('Google did not return the permissions token required for Drive access.');
  }

  return {
    user: result.user,
    accessToken: credential.accessToken,
  };
}

export async function signOutFromFirebase() {
  const auth = getFirebaseAuthInstance();
  if (!auth) return;
  await signOut(auth);
}
