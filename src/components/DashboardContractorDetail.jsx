import React, { useState } from 'react';
import { Camera, X, Copy, Check } from 'lucide-react';

export default function DashboardContractorDetail({
  selectedSub,
  formatCurrency,
  getStatusStyle,
  onViewPhasePhotos,
  onClearSelection,
  onShowToast
}) {
  const [copied, setCopied] = useState(false);

  if (!selectedSub) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-zinc-500)', fontStyle: 'italic' }}>
        Type a contractor name or phase (e.g. "framing" or "paint") above to verify their quote & payments.
      </div>
    );
  }

  const handleCopySummary = () => {
    const summaryText = `${selectedSub.payee} - ${selectedSub.phase} (${selectedSub.category})\nQuote: ${formatCurrency(selectedSub.originalQuote)}\nSpent: ${formatCurrency(selectedSub.totalLabor || selectedSub.totalPaid || 0)}\nRemaining: ${formatCurrency(selectedSub.remainingBalance)}`;
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    if (onShowToast) {
      onShowToast(`Copied payment summary for ${selectedSub.payee}!`, 'success');
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const statusStyle = getStatusStyle(selectedSub.status);

  const laborPayments = (selectedSub.payments || []).filter((p) => {
    const lab = parseFloat(String(p.laborCost || '').replace(/[^0-9.-]/g, '')) || 0;
    return lab > 0;
  });

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(20, 20, 22, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(197, 160, 89, 0.3)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(197, 160, 89, 0.1)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      marginTop: '6px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', position: 'relative' }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: '40px' }}>
          <h4 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>{selectedSub.payee}</h4>
          <p style={{ fontSize: '0.74rem', color: 'var(--color-zinc-400)', marginTop: '2px' }}>
            Phase: <strong style={{ color: 'var(--color-amber-400)' }}>{selectedSub.phase}</strong> ({selectedSub.category})
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onViewPhasePhotos({ category: selectedSub.category, phase: selectedSub.phase })}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-amber-400)',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              <Camera size={13} /> View Phase Photos
            </button>
            <button
              type="button"
              onClick={handleCopySummary}
              style={{
                background: 'rgba(197, 160, 89, 0.12)',
                border: '1px solid rgba(197, 160, 89, 0.3)',
                color: 'var(--color-amber-400)',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {copied ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
              {copied ? 'Copied Summary!' : 'Copy Payment Summary'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'absolute', right: '0', top: '0', height: '100%', maxHeight: '32px' }}>
          <button
            type="button"
            onClick={onClearSelection}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--color-zinc-400)',
              cursor: 'pointer',
              padding: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.15s'
            }}
            title="Clear Selection"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
        <div style={{ padding: '9px 6px', backgroundColor: 'rgba(30, 30, 35, 0.8)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-400)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Original Quote</span>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', marginTop: '3px' }}>
            {formatCurrency(selectedSub.originalQuote)}
          </div>
        </div>
        <div style={{ padding: '9px 6px', backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.62rem', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Summary Spent</span>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#60a5fa', marginTop: '3px' }}>
            {formatCurrency(selectedSub.totalLabor || selectedSub.totalPaid || 0)}
          </div>
        </div>
        <div style={{ padding: '9px 6px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--color-amber-400)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Remaining Balance</span>
          <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-amber-400)', marginTop: '3px', textShadow: '0 0 10px rgba(197, 160, 89, 0.3)' }}>
            {formatCurrency(selectedSub.remainingBalance)}
          </div>
        </div>
      </div>

      <div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-zinc-400)', display: 'block', marginBottom: '6px' }}>
          Payment History Logs ({laborPayments.length})
        </span>

        {laborPayments.length === 0 ? (
          <p style={{ fontSize: '0.72rem', color: 'var(--color-zinc-600)', fontStyle: 'italic', padding: '6px 0' }}>
            No labor payments recorded yet for this contractor.
          </p>
        ) : (
          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {laborPayments.map((p, idx) => {
              const lab = parseFloat(String(p.laborCost || '').replace(/[^0-9.-]/g, '')) || 0;
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

                  <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-blue-400)' }}>
                    {formatCurrency(lab)}
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
