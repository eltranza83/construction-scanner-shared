export function getUserAccessDocId(googleUser) {
  return googleUser?.firebaseUid || '';
}

export function buildUserAccessRecord(googleUser, sourceInviteId) {
  const uid = getUserAccessDocId(googleUser);
  const email = googleUser?.email ? googleUser.email.toLowerCase() : '';

  return {
    uid,
    email,
    sourceInviteId,
    createdAt: new Date()
  };
}
