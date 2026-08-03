import React from 'react';
import { Camera, X } from 'lucide-react';

export default function DashboardContractorDetail({
  selectedSub,
  formatCurrency,
  getStatusStyle,
  onViewPhasePhotos,
  onClearSelection
}) {
  if (!selectedSub) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-zinc-500)', fontStyle: 'italic' }}>
        Type a contractor name or phase (e.g. "framing" or "paint") above to verify their quote & payments.
      </div>
    );
  }

  const statusStyle = getStatusStyle(selectedSub.status);

  return (
    <div style={{
      backgroundColor: 'var(--color-zinc-950)',
      border: '1px solid var(--color-zinc-800)',
      borderRadius: '8px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginTop: '4px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-zinc-900)', paddingBottom: '8px', position: 'relative' }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: '40px' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{selectedSub.payee}</h4>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-zinc-500)', marginTop: '2px' }}>
            Phase: <strong>{selectedSub.phase}</strong> ({selectedSub.category})
          </p>
          <button
            type="button"
            onClick={() => onViewPhasePhotos({ category: selectedSub.category, phase: selectedSub.phase })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-amber-500)',
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: 0,
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            <Camera size={12} /> View Phase Photos
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'absolute', right: '0', top: '0', height: '100%', maxHeight: '32px' }}>
          <button
            type="button"
            onClick={onClearSelection}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-zinc-500)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'all 0.15s'
            }}
            title="Clear Selection"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
        <div style={{ padding: '8px', backgroundColor: 'var(--color-zinc-900)', borderRadius: '6px' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)', textTransform: 'uppercase', fontWeight: 600 }}>Original Quote</span>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-zinc-200)', marginTop: '2px' }}>
            {formatCurrency(selectedSub.originalQuote)}
          </div>
        </div>
        <div style={{ padding: '8px', backgroundColor: 'var(--color-zinc-900)', borderRadius: '6px' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)', textTransform: 'uppercase', fontWeight: 600 }}>Summary Spent</span>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-zinc-200)', marginTop: '2px' }}>
            {formatCurrency(selectedSub.totalLabor || selectedSub.totalPaid || 0)}
          </div>
        </div>
        <div style={{ padding: '8px', backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', borderRadius: '6px' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--color-amber-500)', textTransform: 'uppercase', fontWeight: 700 }}>Remaining Balance</span>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
            {formatCurrency(selectedSub.remainingBalance)}
          </div>
        </div>
      </div>

      <div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-zinc-400)', display: 'block', marginBottom: '6px' }}>
          Payment History Logs ({selectedSub.payments.length})
        </span>

        {selectedSub.payments.length === 0 ? (
          <p style={{ fontSize: '0.72rem', color: 'var(--color-zinc-600)', fontStyle: 'italic', padding: '6px 0' }}>
            No payments recorded yet for this trade.
          </p>
        ) : (
          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {selectedSub.payments.map((p, idx) => {
              const mat = parseFloat(p.materialCost.replace(/[^0-9.-]/g, '')) || 0;
              const lab = parseFloat(p.laborCost.replace(/[^0-9.-]/g, '')) || 0;
              return (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  backgroundColor: 'var(--color-zinc-900)',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  color: 'var(--color-zinc-300)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{p.vendor}</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)' }}>
                      Date: {p.date} {p.checkNumber && p.checkNumber !== 'N/A' ? `- Check: ${p.checkNumber}` : ''}
                    </span>
                  </div>

                  <div style={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatCurrency(mat + lab)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
