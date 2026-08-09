import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

function PhaseMetricGroup({ sub, formatCurrency }) {
  const phaseTotal = sub.totalSpent || (
    (parseFloat(String(sub.totalMaterial || 0).replace(/[^0-9.-]/g, '')) || 0) +
    (parseFloat(String(sub.totalLabor || 0).replace(/[^0-9.-]/g, '')) || 0)
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-amber-500)', lineHeight: '1.2' }}>
          {formatCurrency(sub.totalMaterial || 0)}
        </span>
        <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-500)', lineHeight: '1.1' }}>
          Mat
        </span>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '4px 7px',
        border: '1px solid rgba(52, 211, 153, 0.22)',
        borderRadius: '6px',
        backgroundColor: 'rgba(52, 211, 153, 0.04)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-blue-500)', lineHeight: '1.2' }}>
            {formatCurrency(sub.totalLabor || 0)}
          </span>
          <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-500)', lineHeight: '1.1' }}>
            Lab
          </span>
        </div>

        <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'rgba(148, 163, 184, 0.16)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-emerald-400)', lineHeight: '1.2' }}>
            {formatCurrency(phaseTotal)}
          </span>
          <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-500)', lineHeight: '1.1' }}>
            Total
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTradeSections({
  categories,
  subcontractors,
  expandedCategories,
  onToggleCategory,
  onSelectSubcontractor,
  formatCurrency
}) {
  return (
    <div>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-zinc-200)', marginBottom: '10px' }}>
        Trade Sections & Phase Totals
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {categories.map((cat, index) => {
          const isExpanded = !!expandedCategories[cat.name];
          const catSubs = subcontractors.filter(sub => sub.category === cat.name);

          return (
            <div
              key={cat.name}
              style={{
                border: isExpanded ? '1px solid rgba(197, 160, 89, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: 'rgba(24, 24, 27, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: isExpanded ? '0 6px 20px rgba(0, 0, 0, 0.3), 0 0 12px rgba(197, 160, 89, 0.08)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.25s ease'
              }}
            >
              <div
                onClick={() => onToggleCategory(cat.name)}
                style={{
                  padding: '13px 15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: isExpanded ? 'rgba(10, 10, 10, 0.9)' : 'transparent',
                  borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                  <span style={{
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    color: '#E5C158',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    lineHeight: '1.2',
                    textShadow: '0 0 12px rgba(197, 160, 89, 0.25)'
                  }}>
                    {cat.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-amber-400)', backgroundColor: 'rgba(197, 160, 89, 0.12)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(197, 160, 89, 0.25)' }}>
                      Mat: {formatCurrency(cat.totalMaterial || 0)}
                    </span>
                    <span style={{ fontWeight: 700, color: '#60a5fa', backgroundColor: 'rgba(59, 130, 246, 0.12)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                      Lab: {formatCurrency(cat.totalLabor || 0)}
                    </span>
                    <span style={{ fontWeight: 700, color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                      Spent: {formatCurrency(cat.totalPaid || 0)}
                    </span>
                    <span style={{ color: 'var(--color-zinc-400)', fontSize: '0.66rem' }}>
                      {cat.phasesCount} Phase{cat.phasesCount > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, paddingLeft: '4px' }}>
                  {isExpanded ? <ChevronUp size={18} style={{ color: 'var(--color-amber-400)' }} /> : <ChevronDown size={18} style={{ color: 'var(--color-zinc-500)' }} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(10, 10, 10, 0.95)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {catSubs.map(sub => (
                    <div
                      key={sub.id}
                      onClick={() => onSelectSubcontractor(sub)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '11px 13px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(24, 24, 27, 0.9)',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      className="project-profile-row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-zinc-100)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {sub.phase}
                        </span>
                      </div>

                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        width: '100%',
                        gap: '10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        paddingTop: '6px'
                      }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-zinc-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingBottom: '2px' }}>
                          {sub.payee}
                        </span>
                        <PhaseMetricGroup sub={sub} formatCurrency={formatCurrency} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
