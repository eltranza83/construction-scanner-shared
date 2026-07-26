export const STORAGE_KEYS = {
  firebaseApiKey: 'jobscan_firebase_api_key',
  firebaseProjectId: 'jobscan_firebase_project_id',
  firebaseAppId: 'jobscan_firebase_app_id',
  googleClientId: 'jobscan_google_client_id',
  geminiApiKey: 'jobscan_gemini_api_key',
  appsScriptUrl: 'jobscan_apps_script_url',
};

const ENV = import.meta.env || {};

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: ENV.VITE_FIREBASE_API_KEY || 'AIzaSyDjYPPkW8ffQMOCByCo9gMlVxQ8PsMpAoU',
  projectId: ENV.VITE_FIREBASE_PROJECT_ID || 'adepec-scanner-invites',
  appId: ENV.VITE_FIREBASE_APP_ID || '1:256926375840:web:1dfab80a93a0f9cfa9cec5',
};

export const DEFAULT_GOOGLE_CLIENT_ID =
  ENV.VITE_GOOGLE_CLIENT_ID ||
  '523814311929-lku3c1m2rq4qpmbf1earpgnm1beuvq8m.apps.googleusercontent.com';


export function getStoredConfigValue(storageKey, fallback) {
  return localStorage.getItem(storageKey) || fallback;
}

export function getAccountAppsScriptUrlKey(email) {
  if (!email) return STORAGE_KEYS.appsScriptUrl;
  return `${STORAGE_KEYS.appsScriptUrl}_${String(email).trim().toLowerCase()}`;
}

export function getAccountAppsScriptSecretKey(email) {
  if (!email) return 'jobscan_apps_script_secret';
  return `jobscan_apps_script_secret_${String(email).trim().toLowerCase()}`;
}
