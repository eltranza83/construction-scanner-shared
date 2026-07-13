import React, { useState, useEffect } from 'react';
import { CheckCircle, ShieldAlert, LogIn, Database, Share2, Trash2 } from 'lucide-react';
import { doc, runTransaction, setDoc, getDocs, collection, query, where, deleteDoc, getDoc } from 'firebase/firestore/lite';
import { getFirebaseAuthInstance, getFirebaseDb } from '../services/firebase';
import { ADMIN_PASSCODE, DEFAULT_FIREBASE_CONFIG, STORAGE_KEYS, getStoredConfigValue } from '../config/appConfig';
import { APP_STORAGE_KEYS, getStoredBoolean, setStoredBoolean } from '../services/appStorage';
import { buildUserAccessRecord, getUserAccessDocId } from '../services/inviteAccess';

export default function InviteScreen({ onUnlocked, onKeyUpdated, defaultGeminiKey, googleUser, authError, signingIn, onGoogleSignIn, onSignOut }) {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Admin Config Panel States
  const [showAdminConfig, setShowAdminConfig] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminPassUnlocked, setAdminPassUnlocked] = useState(false);
  const [apiKey, setApiKey] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseApiKey, DEFAULT_FIREBASE_CONFIG.apiKey));
  const [projectId, setProjectId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseProjectId, DEFAULT_FIREBASE_CONFIG.projectId));
  const [appId, setAppId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseAppId, DEFAULT_FIREBASE_CONFIG.appId));

  // Invites Management States
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(false);

  // Gemini API Key states
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  const db = getFirebaseDb();

  const fetchInvitesList = async () => {
    if (!db) return;
    setLoadingInvites(true);
    try {
      const qSnapshot = await getDocs(collection(db, 'invites'));
      const list = [];
      qSnapshot.forEach((d) => {
        if (d.id !== 'CONFIG-GEMINI') {
          list.push({ id: d.id, ...d.data() });
        }
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
        return timeB - timeA;
      });
      setInvites(list);
    } catch (err) {
      console.error('Failed to fetch invites:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const fetchSharedGeminiKey = async () => {
    if (!db) return;
    try {
      const docRef = doc(db, 'invites', 'CONFIG-GEMINI');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.apiKey) {
          setTempGeminiKey(data.apiKey);
        }
      }
    } catch (err) {
      console.error('Failed to fetch shared Gemini key:', err);
    }
  };

  useEffect(() => {
    if (adminPassUnlocked) {
      fetchInvitesList();
      fetchSharedGeminiKey();
    }
  }, [adminPassUnlocked]);

  // Read URL query parameter for invite code on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      setInviteCode(codeParam.toUpperCase());
    }
  }, []);

  // Check Firestore if Google User is already authorized
  useEffect(() => {
    const checkAuth = async () => {
      if (!googleUser || !googleUser.email) return;
      
      setCheckingAuth(true);
      setError(null);
      
      const db = getFirebaseDb();
      if (!db) {
        setCheckingAuth(false);
        return;
      }
      
      try {
        const emailClean = googleUser.email.toLowerCase();
        const adminSnap = await getDoc(doc(db, 'admins', emailClean));
        if (adminSnap.exists()) {
          onUnlocked(googleUser.email);
          return;
        }

        const accessDocId = getUserAccessDocId(googleUser);
        if (accessDocId) {
          const accessSnap = await getDoc(doc(db, 'user_access', accessDocId));
          if (accessSnap.exists()) {
            onUnlocked(googleUser.email);
            return;
          }
        }

        const invitesRef = collection(db, 'invites');
        const q = query(invitesRef, where('claimedByEmail', '==', emailClean));
        const qSnapshot = await getDocs(q);

        if (!qSnapshot.empty) {
          // User is already authorized in the database! Unlock immediately.
          if (accessDocId) {
            const firstInvite = qSnapshot.docs[0];
            await setDoc(doc(db, 'user_access', accessDocId), buildUserAccessRecord(googleUser, firstInvite.id));
          }
          onUnlocked(googleUser.email);
        } else {
          // If not found in database, check if this browser was already verified under the old version
          const isLegacyInvited = getStoredBoolean(APP_STORAGE_KEYS.invited);
          if (isLegacyInvited) {
            const emailClean = googleUser.email.toLowerCase();
            const legacyDocId = `LEGACY-${emailClean.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            await setDoc(doc(db, 'invites', legacyDocId), {
              used: true,
              usedAt: new Date(),
              claimedByUid: accessDocId || null,
              claimedByEmail: emailClean,
              notes: 'Auto-migrated from legacy device-locked login'
            });
            if (accessDocId) {
              await setDoc(doc(db, 'user_access', accessDocId), buildUserAccessRecord(googleUser, legacyDocId));
            }
            
            // Unlock immediately
            onUnlocked(googleUser.email);
          }
        }
      } catch (err) {
        console.error('Failed to verify user authorization:', err);
        if (err?.code === 'permission-denied') {
          setError('Database security rules are not active yet, or this account is not listed as an admin.');
        } else {
          setError('Failed to check database authorization. Please try again.');
        }
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [googleUser]);

  const handleGenerateInvite = async () => {
    if (!db) {
      setError('Database not configured. Save credentials first.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345689';
      const genPart = () => {
        let p = '';
        for (let i = 0; i < 4; i++) {
          p += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return p;
      };
      const code = `ADPC-${genPart()}-${genPart()}`;
      const authUser = getFirebaseAuthInstance()?.currentUser;
      
      await setDoc(doc(db, 'invites', code), {
        used: false,
        createdAt: new Date(),
        usedAt: null,
        createdByUid: authUser?.uid || null,
        createdByEmail: authUser?.email || null
      });
      
      setSuccess(`Generated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error(err);
      setError('Failed to generate invite code.');
    }
  };

  const handleSaveSharedGeminiKey = async () => {
    if (!db) {
      setError('Database not configured. Save credentials first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSavingGeminiKey(true);
    try {
      const authUser = getFirebaseAuthInstance()?.currentUser;
      await setDoc(doc(db, 'invites', 'CONFIG-GEMINI'), {
        apiKey: tempGeminiKey.trim(),
        updatedAt: new Date(),
        updatedByUid: authUser?.uid || null,
        updatedByEmail: authUser?.email || null
      });
      setSuccess('Shared Gemini API Key saved to database! Other users will receive it automatically on next load.');
      
      // Update local storage and call parent callback if passed
      localStorage.setItem(APP_STORAGE_KEYS.geminiKey, tempGeminiKey.trim());
      if (onKeyUpdated) {
        onKeyUpdated(tempGeminiKey.trim());
      }
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setError('Failed to save Gemini API Key to database.');
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const handleDeleteInvite = async (code) => {
    if (!db) return;
    if (!window.confirm(`Deactivate/delete invite code: ${code}?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteDoc(doc(db, 'invites', code));
      setSuccess(`Deactivated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to deactivate invite code.');
    }
  };

  const handleShareInvite = async (code) => {
    const inviteLink = `${window.location.origin}?code=${code}`;
    const message = `Hey! Here is your private invite link for the Adepec Homes Construction Scanner:\n\n👉 ${inviteLink}\n\nJust open the link and tap "Activate Access"!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Adepec Homes Scanner Invite',
          text: message,
          url: inviteLink
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(message);
        setSuccess('Invite details copied to clipboard! You can now paste and send it.');
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        console.error('Failed to copy:', err);
        setError('Failed to copy to clipboard.');
      }
    }
  };

  const handleVerify = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!db) {
      setError('Database connection is not configured yet. Please configure Firebase settings.');
      return;
    }

    if (!googleUser || !googleUser.email) {
      setError('You must sign in with your Google account first.');
      return;
    }

    if (!googleUser.firebaseUid) {
      setError('Firebase account session is not ready. Please sign out and sign in again.');
      return;
    }

    if (!inviteCode.trim()) {
      setError('Please enter a valid Invite Code.');
      return;
    }

    setLoading(true);
    try {
      const codeId = inviteCode.trim().toUpperCase();
      const docRef = doc(db, 'invites', codeId);

      await runTransaction(db, async (transaction) => {
        const inviteDoc = await transaction.get(docRef);
        if (!inviteDoc.exists()) {
          throw new Error('This invite code does not exist. Check spelling and try again.');
        }

        const data = inviteDoc.data();
        if (data.used) {
          throw new Error('This invite code has already been used.');
        }

        // Atomically mark code as claimed
        transaction.update(docRef, {
          used: true,
          usedAt: new Date(),
          claimedByUid: googleUser.firebaseUid,
          claimedByEmail: googleUser.email.toLowerCase()
        });
        transaction.set(
          doc(db, 'user_access', googleUser.firebaseUid),
          buildUserAccessRecord(googleUser, codeId)
        );
      });

      const finalKey = defaultGeminiKey || '';

      // Save local credentials
      setStoredBoolean(APP_STORAGE_KEYS.invited, true);
      localStorage.setItem(APP_STORAGE_KEYS.geminiKey, finalKey);
      
      onKeyUpdated(finalKey);
      setSuccess('Access activated successfully! Launching scanner...');
      
      setTimeout(() => {
        onUnlocked(googleUser.email);
      }, 1500);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockAdmin = () => {
    if (adminPasscode === ADMIN_PASSCODE) {
      setAdminPassUnlocked(true);
      setError(null);
    } else {
      setError('Incorrect Admin Passcode.');
    }
  };

  const handleSaveConfig = () => {
    if (!apiKey.trim() || !projectId.trim()) {
      setError('API Key and Project ID are required.');
      return;
    }

    localStorage.setItem(STORAGE_KEYS.firebaseApiKey, apiKey.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseProjectId, projectId.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseAppId, appId.trim());
    setSuccess('Database configuration saved! Reloading application...');
    setError(null);
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'var(--font-sans)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#121212',
        border: '1px solid #1a1a1a',
        borderRadius: '12px',
        padding: '30px 24px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <svg style={{ width: '42px', height: '42px' }} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="invite-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#C5A059" />
                <stop offset="50%" stopColor="#F1D7A7" />
                <stop offset="100%" stopColor="#B28741" />
              </linearGradient>
            </defs>
            <path d="M50 15 L80 45 V85 H71 V45 L50 24 L29 45 V85 H20 V45 Z" fill="url(#invite-gold)" />
            <path fillRule="evenodd" d="M50 33.5 L66.5 50 V85 H50.5 V73 H49.5 V85 H33.5 V50 Z M50 42.5 L57.5 50 V63 H42.5 V50 Z" fill="url(#invite-gold)" />
          </svg>
          <div className="logo-text-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '180px', marginTop: '4px' }}>
            <span className="logo-main-text" style={{ fontSize: '1.25rem' }}>
              ADEPEC
            </span>
            <div className="header-logo-homes" style={{ fontSize: '0.68rem', marginTop: '1px' }}>
              HOMES
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-zinc-500)', marginTop: '4px' }}>
            Private Invite-Only Construction Scanner
          </span>
        </div>

        {(error || authError) && (
          <div className="alert-box alert-error" style={{ fontSize: '0.82rem', padding: '10px 12px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error || authError}</span>
          </div>
        )}

        {success && (
          <div className="alert-box alert-success" style={{ fontSize: '0.82rem', padding: '10px 12px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{success}</span>
          </div>
        )}

        {!showAdminConfig ? (
          checkingAuth ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
              <div className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px', margin: '0 auto' }}></div>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)' }}>Checking account authorization...</span>
            </div>
          ) : !googleUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px 0' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-zinc-400)', textAlign: 'center', lineHeight: '1.5', marginBottom: '8px' }}>
                Please sign in with your Google account first to verify your scanner invitation status.
              </p>
              <button 
                type="button" 
                onClick={onGoogleSignIn} 
                className="btn btn-primary" 
                style={{ backgroundColor: '#fff', color: '#18181b', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}
                disabled={signingIn}
              >
                <LogIn size={18} /> {signingIn ? 'Signing in...' : 'Sign In with Google'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ 
                fontSize: '0.8rem', 
                backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                border: '1px solid rgba(245, 158, 11, 0.15)', 
                borderRadius: '8px', 
                padding: '10px 12px',
                color: 'var(--color-zinc-300)',
                lineHeight: '1.4'
              }}>
                Signed in as <strong style={{ color: 'var(--color-amber-400)' }}>{googleUser.email}</strong>. 
                Enter your invite code below to unlock scanner access for this account.
              </div>

              {/* Invite Code */}
              <div className="form-group">
                <label className="form-label" htmlFor="invite-code">Invite Code</label>
                <input 
                  type="text" 
                  id="invite-code" 
                  className="form-input" 
                  value={inviteCode} 
                  onChange={(e) => setInviteCode(e.target.value)} 
                  placeholder="e.g. ADPC-XXXX-XXXX" 
                  style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '2px', fontWeight: 700 }}
                  disabled={loading}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ marginTop: '6px' }}
                disabled={loading}
              >
                {loading ? 'Activating Access...' : 'Activate Access'}
              </button>

              <button 
                type="button" 
                onClick={onSignOut}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '6px 12px', marginTop: '4px', borderColor: 'var(--color-zinc-800)', color: 'var(--color-zinc-400)', width: '100%' }}
                disabled={loading}
              >
                Sign Out / Use Different Account
              </button>
            </form>
          )
        ) : (
          /* Admin configuration UI */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid #1a1a1a', paddingTop: '16px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#C5A059', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={16} /> Database Configuration
            </h4>

            {!adminPassUnlocked ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Admin Passcode</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={adminPasscode} 
                    onChange={(e) => setAdminPasscode(e.target.value)} 
                    placeholder="Enter admin passcode" 
                  />
                </div>
                <button type="button" className="btn btn-secondary" onClick={handleUnlockAdmin}>
                  Unlock Settings
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Config Database */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid #1a1a1a', paddingBottom: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Firebase API Key</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      value={apiKey} 
                      onChange={(e) => setApiKey(e.target.value)} 
                      placeholder="AIzaSy..." 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Firebase Project ID</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={projectId} 
                      onChange={(e) => setProjectId(e.target.value)} 
                      placeholder="e.g. project-12345" 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Firebase App ID (Optional)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={appId} 
                      onChange={(e) => setAppId(e.target.value)} 
                      placeholder="e.g. 1:123:web:abc" 
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setAdminPassUnlocked(false); setShowAdminConfig(false); }}>
                      Back
                    </button>
                    <button type="button" className="btn btn-primary" style={{ flex: 1.2 }} onClick={handleSaveConfig}>
                      Save Config
                    </button>
                  </div>
                </div>

                {/* 1.5. Config Gemini API Key */}
                <div style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-amber-400)', marginBottom: '10px' }}>
                    Shared Gemini API Key
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-zinc-400)', marginBottom: '8px', lineHeight: '1.4' }}>
                    Set the Gemini API Key that all invited users will share. This key will be securely fetched from Firestore and is not stored in the GitHub repository.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Gemini API Key</label>
                      <input 
                        type="password"
                        className="form-input"
                        value={tempGeminiKey}
                        onChange={(e) => setTempGeminiKey(e.target.value)}
                        placeholder="Paste new Gemini Key (AIzaSy... or AQ...)"
                      />
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={handleSaveSharedGeminiKey}
                      disabled={savingGeminiKey}
                    >
                      {savingGeminiKey ? 'Saving Key...' : 'Save Gemini Key to Database'}
                    </button>
                  </div>
                </div>

                {/* 2. Invite Code Management */}
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#C5A059', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Invite Code Management</span>
                    <button 
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGenerateInvite}
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      Generate Code
                    </button>
                  </h4>

                  {/* Invites list */}
                  <div style={{ 
                    maxHeight: '150px', 
                    overflowY: 'auto', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px',
                    backgroundColor: '#0a0a0a',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #1a1a1a'
                  }}>
                    {loadingInvites ? (
                      <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: '#555' }}>
                        Loading invites...
                      </div>
                    ) : invites.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: '#444' }}>
                        No invite codes generated yet.
                      </div>
                    ) : (
                      invites.map(inv => (
                        <div 
                          key={inv.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '6px 10px',
                            backgroundColor: '#121212',
                            borderRadius: '6px',
                            border: '1px solid #1a1a1a',
                            fontSize: '0.8rem'
                          }}
                        >
                          <span style={{ fontWeight: 700, letterSpacing: '1px', fontFamily: 'monospace', color: inv.used ? '#555' : '#fff' }}>
                            {inv.id}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              fontSize: '0.72rem', 
                              fontWeight: 'bold',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: inv.used ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.15)',
                              color: inv.used ? '#555' : '#10b981'
                            }}>
                              {inv.used ? 'CLAIMED' : 'ACTIVE'}
                            </span>
                            {!inv.used && (
                              <button
                                type="button"
                                onClick={() => handleShareInvite(inv.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#C5A059',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="Share Invite Link"
                              >
                                <Share2 size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteInvite(inv.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0.8
                              }}
                              title="Delete/Deactivate Invite Code"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer hidden link to unlock admin */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button 
            type="button" 
            onClick={() => {
              setShowAdminConfig(!showAdminConfig);
              setError(null);
            }} 
            style={{ background: 'none', border: 'none', color: '#2a2a2a', fontSize: '0.72rem', cursor: 'pointer' }}
          >
            {showAdminConfig ? 'Hide Config' : 'Database Setup (Admin)'}
          </button>
        </div>
      </div>
    </div>
  );
}
