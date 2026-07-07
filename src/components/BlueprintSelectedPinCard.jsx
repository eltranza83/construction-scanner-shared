import React from 'react';
import { Eye, X } from 'lucide-react';
import { getBlueprintPhotoMediaUrl } from '../services/blueprintDrive';

export default function BlueprintSelectedPinCard({
  pin,
  tradeSectionsConfig,
  onClose,
  onDelete
}) {
  if (!pin) return null;

  return (
    <div style={{ backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', animation: 'slideUp 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: tradeSectionsConfig[pin.category]?.color || '#fff', fontWeight: 800, letterSpacing: '0.05em' }}>
            {tradeSectionsConfig[pin.category]?.label || 'General'}
          </span>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{pin.phase}</h4>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--color-zinc-500)', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-300)', lineHeight: 1.4, backgroundColor: 'var(--color-zinc-900)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}>
        {pin.note}
      </p>

      {pin.photoUrl && (
        <div style={{ position: 'relative', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-zinc-800)' }}>
          <a href={pin.photoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
            <div style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Eye size={10} /> Open in Drive
            </div>
            <img
              src={getBlueprintPhotoMediaUrl(pin.photoFileId)}
              alt="Verification preview"
              style={{ width: '100%', maxHeight: '180px', objectFit: 'cover' }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div style={{ backgroundColor: 'var(--color-zinc-900)', padding: '8px', textAlign: 'center', fontSize: '0.74rem', color: 'var(--color-amber-500)', fontWeight: 600 }}>
              View Verification Photo
            </div>
          </a>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button
          onClick={() => onDelete(pin.id)}
          className="btn"
          style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--color-rose-500)', fontSize: '0.75rem', padding: '6px 12px', fontWeight: 600 }}
        >
          Delete Pin
        </button>
      </div>
    </div>
  );
}
