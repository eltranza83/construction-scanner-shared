import { getFirebaseAuthInstance } from './firebase';

async function getAuthorizationHeader() {
  const auth = getFirebaseAuthInstance();
  if (!auth) throw new Error('Your secure app session expired. Please sign in again.');
  
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((u) => {
        unsubscribe();
        resolve(u);
      });
      setTimeout(() => resolve(null), 3000);
    });
  }

  if (!user) throw new Error('Your secure app session expired. Please sign in again.');
  const idToken = await user.getIdToken(true);
  return `Bearer ${idToken}`;
}

async function parseApiResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The secure server request failed.');
  return payload;
}

export async function triggerAppsScriptSync(folderId, fetchImpl = fetch) {
  if (!folderId) throw new Error('The active project does not have a Google Drive folder.');

  const auth = getFirebaseAuthInstance();
  const user = auth?.currentUser;
  const email = user?.email ? String(user.email).trim().toLowerCase() : '';

  const accountUrlKey = email ? `jobscan_apps_script_url_${email}` : 'jobscan_apps_script_url';
  const accountSecretKey = email ? `jobscan_apps_script_secret_${email}` : 'jobscan_apps_script_secret';

  const customScriptUrl = localStorage.getItem(accountUrlKey) || localStorage.getItem('jobscan_apps_script_url') || '';
  const customScriptSecret = localStorage.getItem(accountSecretKey) || localStorage.getItem('jobscan_apps_script_secret') || '';

  if (customScriptUrl) {
    try {
      const url = new URL(customScriptUrl);
      url.searchParams.set('action', 'sync');
      url.searchParams.set('folderId', folderId);
      if (customScriptSecret) {
        url.searchParams.set('secret', customScriptSecret);
      }
      const res = await fetchImpl(url.toString(), { method: 'POST', redirect: 'follow' });
      if (res.ok) return { ok: true };
    } catch (err) {
      console.warn('Direct Apps Script URL call failed, attempting backend sync endpoint:', err);
    }
  }

  const authorization = await getAuthorizationHeader();
  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json'
  };

  if (customScriptUrl) {
    headers['x-apps-script-url'] = customScriptUrl;
  }
  if (customScriptSecret) {
    headers['x-apps-script-secret'] = customScriptSecret;
  }

  const response = await fetchImpl('/api/apps-script-sync', {
    method: 'POST',
    headers,
    body: JSON.stringify({ folderId })
  });
  return parseApiResponse(response);
}
