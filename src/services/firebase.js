import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

/**
 * Dynamically gets or initializes the Firestore database instance
 * using settings configured by the administrator, falling back to 
 * pre-configured default credentials for zero-setup execution.
 */
export function getFirebaseDb() {
  const apiKey = localStorage.getItem('jobscan_firebase_api_key') || 'AIzaSyDjYPPkW8ffQMOCByCo9gMlVxQ8PsMpAoU';
  const projectId = localStorage.getItem('jobscan_firebase_project_id') || 'adepec-scanner-invites';
  
  if (!apiKey || !projectId) {
    return null; 
  }

  const firebaseConfig = {
    apiKey,
    authDomain: localStorage.getItem('jobscan_firebase_auth_domain') || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: localStorage.getItem('jobscan_firebase_storage_bucket') || `${projectId}.appspot.com`,
    messagingSenderId: localStorage.getItem('jobscan_firebase_messaging_sender_id') || '',
    appId: localStorage.getItem('jobscan_firebase_app_id') || '1:256926375840:web:1dfab80a93a0f9cfa9cec5'
  };

  try {
    if (getApps().length === 0) {
      const app = initializeApp(firebaseConfig);
      return getFirestore(app);
    } else {
      return getFirestore(getApp());
    }
  } catch (err) {
    console.error('Failed to initialize Firebase app:', err);
    return null;
  }
}
