const DEFAULT_FIREBASE_API_KEY = 'AIzaSyDjYPPkW8ffQMOCByCo9gMlVxQ8PsMpAoU';
const DEFAULT_FIREBASE_PROJECT_ID = 'adepec-scanner-invites';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function verifyFirebaseIdentity(idToken, fetchImpl = fetch) {
  if (!idToken) {
    throw new HttpError(401, 'Sign in is required.');
  }

  const apiKey = process.env.FIREBASE_WEB_API_KEY || DEFAULT_FIREBASE_API_KEY;
  const response = await fetchImpl(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) {
    throw new HttpError(401, 'Your sign-in session expired. Please sign in again.');
  }

  const payload = await response.json();
  const user = payload.users?.[0];
  if (!user?.localId || !user?.email || user.disabled) {
    throw new HttpError(401, 'Your account is not available. Please sign in again.');
  }

  return {
    uid: user.localId,
    email: user.email.toLowerCase()
  };
}

async function firestoreDocumentExists(path, idToken, fetchImpl) {
  const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const response = await fetchImpl(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`,
    { headers: { authorization: `Bearer ${idToken}` } }
  );

  if (response.ok) return true;
  if (response.status === 403 || response.status === 404) return false;
  throw new HttpError(503, 'Authorization service is temporarily unavailable.');
}

export async function requireScannerAccess(request, fetchImpl = fetch) {
  const idToken = getBearerToken(request);
  const user = await verifyFirebaseIdentity(idToken, fetchImpl);
  const adminPath = `admins/${encodeURIComponent(user.email)}`;
  const accessPath = `user_access/${encodeURIComponent(user.uid)}`;

  const isAdmin = await firestoreDocumentExists(adminPath, idToken, fetchImpl);
  if (isAdmin) return user;

  const hasAccess = await firestoreDocumentExists(accessPath, idToken, fetchImpl);
  if (!hasAccess) {
    throw new HttpError(403, 'Scanner access is not authorized for this account.');
  }

  return user;
}

export function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError
    ? error.message
    : 'The secure processing service could not complete the request.';

  if (!(error instanceof HttpError)) {
    console.error(error);
  }

  return jsonResponse({ error: message }, status);
}
