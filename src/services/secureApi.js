import { getFirebaseAuthInstance } from './firebase';

async function getAuthorizationHeader() {
  const user = getFirebaseAuthInstance()?.currentUser;
  if (!user) throw new Error('Your secure app session expired. Please sign in again.');
  const idToken = await user.getIdToken();
  return `Bearer ${idToken}`;
}

async function parseApiResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The secure server request failed.');
  return payload;
}

export async function triggerAppsScriptSync(folderId, fetchImpl = fetch) {
  if (!folderId) throw new Error('The active project does not have a Google Drive folder.');
  const authorization = await getAuthorizationHeader();
  const response = await fetchImpl('/api/apps-script-sync', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ folderId })
  });
  return parseApiResponse(response);
}
