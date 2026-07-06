import React from 'react';
import { ChevronDown, ChevronUp, Database, Share2, Trash2 } from 'lucide-react';

export default function SettingsAdminPanel({
  adminPassInput,
  firebaseApiKey,
  firebaseAppId,
  firebaseProjectId,
  invites,
  isAdminUnlocked,
  loadingInvites,
  savingGeminiKey,
  showAdminPanel,
  tempGeminiKey,
  onAdminPassInputChange,
  onDeleteInvite,
  onFirebaseApiKeyChange,
  onFirebaseAppIdChange,
  onFirebaseProjectIdChange,
  onGenerateInvite,
  onSaveFirebaseConfig,
  onSaveSharedGeminiKey,
  onShareInvite,
  onTempGeminiKeyChange,
  onToggleAdminPanel,
  onVerifyAdmin
}) {
  return (
    <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '4px' }}>
      <h3
        className="settings-title"
        onClick={onToggleAdminPanel}
        style={{ color: 'var(--color-zinc-200)', marginBottom: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={18} style={{ color: 'var(--color-amber-500)' }} />
          Admin Invite Settings
        </span>
        <span style={{ color: 'var(--color-zinc-500)', fontSize: '0.8rem' }}>
          {showAdminPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </h3>

      {showAdminPanel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
          {!isAdminUnlocked ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Admin Passcode</label>
                <input
                  type="password"
                  className="form-input"
                  value={adminPassInput}
                  onChange={(e) => onAdminPassInputChange(e.target.value)}
                  placeholder="Enter admin passcode"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onVerifyAdmin();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onVerifyAdmin}
              >
                Verify Admin
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '16px' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-amber-400)', marginBottom: '10px' }}>
                  Firebase Database Credentials
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Firebase API Key</label>
                    <input
                      type="password"
                      className="form-input"
                      value={firebaseApiKey}
                      onChange={(e) => onFirebaseApiKeyChange(e.target.value)}
                      placeholder="AIzaSy..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Firebase Project ID</label>
                    <input
                      type="text"
                      className="form-input"
                      value={firebaseProjectId}
                      onChange={(e) => onFirebaseProjectIdChange(e.target.value)}
                      placeholder="e.g. project-12345"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Firebase App ID (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={firebaseAppId}
                      onChange={(e) => onFirebaseAppIdChange(e.target.value)}
                      placeholder="e.g. 1:12345:web:abcdef"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onSaveFirebaseConfig}
                  >
                    Save Configuration
                  </button>
                </div>
              </div>

              <div style={{ borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '16px' }}>
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
                      onChange={(e) => onTempGeminiKeyChange(e.target.value)}
                      placeholder="Paste new Gemini Key (AIzaSy... or AQ...)"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onSaveSharedGeminiKey}
                    disabled={savingGeminiKey}
                  >
                    {savingGeminiKey ? 'Saving Key...' : 'Save Gemini Key to Database'}
                  </button>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-amber-400)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Invite Code Management</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onGenerateInvite}
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
                  >
                    Generate Code
                  </button>
                </h4>

                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  backgroundColor: 'var(--color-zinc-900)',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-zinc-800)'
                }}>
                  {loadingInvites ? (
                    <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--color-zinc-500)' }}>
                      Loading invites...
                    </div>
                  ) : invites.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--color-zinc-600)' }}>
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
                          backgroundColor: 'var(--color-zinc-950)',
                          borderRadius: '6px',
                          border: '1px solid var(--color-zinc-800)',
                          fontSize: '0.8rem'
                        }}
                      >
                        <span style={{ fontWeight: 700, letterSpacing: '1px', fontFamily: 'monospace', color: inv.used ? 'var(--color-zinc-500)' : 'var(--color-zinc-100)' }}>
                          {inv.id}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 'bold',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: inv.used ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.15)',
                            color: inv.used ? 'var(--color-zinc-500)' : 'var(--color-emerald-500)'
                          }}>
                            {inv.used ? 'CLAIMED' : 'ACTIVE'}
                          </span>
                          {!inv.used && (
                            <button
                              type="button"
                              onClick={() => onShareInvite(inv.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-amber-500)',
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
                            onClick={() => onDeleteInvite(inv.id)}
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
    </div>
  );
}
