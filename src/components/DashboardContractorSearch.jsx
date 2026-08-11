import React from 'react';
import { Search } from 'lucide-react';
import DashboardContractorDetail from './DashboardContractorDetail';

export default function DashboardContractorSearch({
  searchTerm,
  suggestions,
  selectedSub,
  formatCurrency,
  getStatusStyle,
  onSearchTermChange,
  onSelectSubcontractor,
  onClearSelection,
  onViewPhasePhotos,
  onShowToast
}) {
  return (
    <div id="contractor-lookup-container" className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-zinc-200)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={16} style={{ color: 'var(--color-amber-500)' }} />
        Contractor Balance Lookup
      </h3>

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search payee or trade (e.g. Framing)..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          style={{ width: '100%', paddingLeft: '36px' }}
        />
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-zinc-600)' }} />

        {searchTerm && suggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            backgroundColor: 'var(--color-zinc-950)',
            border: '1px solid var(--color-zinc-800)',
            borderRadius: '8px',
            zIndex: 900,
            maxHeight: '180px',
            overflowY: 'auto',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)'
          }}>
            {suggestions.map(sub => (
              <div
                key={sub.id}
                onClick={() => onSelectSubcontractor(sub)}
                style={{
                  padding: '10px 12px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-zinc-900)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                className="project-profile-row"
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>{sub.payee}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-zinc-500)', marginLeft: '6px' }}>({sub.phase})</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', fontWeight: 600 }}>{formatCurrency(sub.remainingBalance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <DashboardContractorDetail
        selectedSub={selectedSub}
        formatCurrency={formatCurrency}
        getStatusStyle={getStatusStyle}
        onViewPhasePhotos={onViewPhasePhotos}
        onClearSelection={onClearSelection}
        onShowToast={onShowToast}
      />
    </div>
  );
}
