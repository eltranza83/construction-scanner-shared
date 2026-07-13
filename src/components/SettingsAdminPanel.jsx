import React from 'react';
import { ChevronDown, ChevronUp, Database, Share2, Trash2 } from 'lucide-react';

export default function SettingsAdminPanel({
  checkingAdmin,
  invites,
  isAdminUnlocked,
  loadingInvites,
  showAdminPanel,
  onDeleteInvite,
  onGenerateInvite,
  onShareInvite,
  onToggleAdminPanel
}) {
  return (
    <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '4px' }}>
      <h3 className="settings-title" onClick={onToggleAdminPanel} style={{ color: 'var(--color-zinc-200)', marginBottom: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={18} style={{ color: 'var(--color-amber-500)' }} />
          Admin Invite Settings
        </span>
        {showAdminPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </h3>

      {showAdminPanel && (
        <div style={{ marginTop: '12px' }}>
          {checkingAdmin ? (
            <p style={{ color: 'var(--color-zinc-400)', fontSize: '0.82rem' }}>Checking administrator access...</p>
          ) : !isAdminUnlocked ? (
            <p style={{ color: 'var(--color-zinc-400)', fontSize: '0.82rem', lineHeight: 1.5 }}>
              Administrator authorization is required. Sign in with an account listed in the Firestore admins collection.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.88rem', color: 'var(--color-amber-400)' }}>Invite Code Management</h4>
                <button type="button" className="btn btn-secondary" onClick={onGenerateInvite} style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}>
                  Generate Code
                </button>
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {loadingInvites ? (
                  <p style={{ color: 'var(--color-zinc-500)', fontSize: '0.8rem' }}>Loading invites...</p>
                ) : invites.length === 0 ? (
                  <p style={{ color: 'var(--color-zinc-500)', fontSize: '0.8rem' }}>No invite codes generated yet.</p>
                ) : invites.map((invite) => (
                  <div key={invite.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--color-zinc-800)', borderRadius: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: invite.used ? 'var(--color-zinc-500)' : 'var(--color-zinc-100)' }}>{invite.id}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', color: invite.used ? 'var(--color-zinc-500)' : 'var(--color-emerald-500)' }}>{invite.used ? 'CLAIMED' : 'ACTIVE'}</span>
                      {!invite.used && <button type="button" onClick={() => onShareInvite(invite.id)} className="icon-button" title="Share invite"><Share2 size={14} /></button>}
                      <button type="button" onClick={() => onDeleteInvite(invite.id)} className="icon-button" title="Delete invite" style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
