import React from 'react';

export default function SettingsDeleteProjectModal({ project, onCancel, onConfirm }) {
  if (!project) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div className="settings-card" style={{
        width: '100%',
        maxWidth: '320px',
        backgroundColor: 'var(--color-zinc-950)',
        border: '1px solid var(--color-zinc-800)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{
            fontWeight: 700,
            fontSize: '1.05rem',
            color: 'var(--color-zinc-100)',
            fontFamily: 'var(--font-serif)',
            marginBottom: '8px'
          }}>
            Delete Project Profile
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.4' }}>
            Are you sure you want to delete project <strong>{project.name}</strong>?
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1, backgroundColor: 'var(--color-rose-600)' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
