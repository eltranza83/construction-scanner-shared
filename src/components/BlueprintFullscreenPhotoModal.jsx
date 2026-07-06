import React from 'react';
import { X } from 'lucide-react';

export default function BlueprintFullscreenPhotoModal({ photo, onClose }) {
  if (!photo) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
      >
        <X size={24} />
      </button>

      <img
        src={`https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media`}
        alt={photo.name}
        style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}
        onClick={(e) => e.stopPropagation()}
      />

      <div style={{ marginTop: '16px', textAlign: 'center', color: '#fff', fontSize: '0.82rem' }}>
        <p style={{ fontWeight: 600 }}>{photo.name}</p>
        <a
          href={photo.webViewLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-amber-500)', textDecoration: 'none', fontSize: '0.74rem', marginTop: '6px', display: 'inline-block', fontWeight: 600 }}
          onClick={(e) => e.stopPropagation()}
        >
          Open in Google Drive
        </a>
      </div>
    </div>
  );
}
