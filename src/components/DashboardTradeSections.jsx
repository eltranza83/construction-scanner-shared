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
        {categories.map(cat => {
          const isExpanded = !!expandedCategories[cat.name];
          const catSubs = subcontractors.filter(sub => sub.category === cat.name);

          return (
            <div
              key={cat.name}
              style={{
                border: '1px solid var(--color-zinc-800)',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'var(--color-zinc-900)'
              }}
            >
              <div
                onClick={() => onToggleCategory(cat.name)}
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: isExpanded ? 'var(--color-zinc-950)' : 'transparent',
                  borderBottom: isExpanded ? '1px solid var(--color-zinc-800)' : 'none'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.2' }}>
                    {cat.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-amber-500)' }}>
                      Mat: {formatCurrency(cat.totalMaterial || 0)}
                    </span>
                    <span style={{ color: 'var(--color-zinc-700)' }}>-</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-blue-500)' }}>
                      Lab: {formatCurrency(cat.totalLabor || 0)}
                    </span>
                    <span style={{ color: 'var(--color-zinc-700)' }}>-</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-emerald-500)' }}>
                      Spent: {formatCurrency(cat.totalPaid || 0)}
                    </span>
                    <span style={{ color: 'var(--color-zinc-700)' }}>-</span>
                    <span style={{ color: 'var(--color-zinc-500)' }}>
                      {cat.phasesCount} Phase{cat.phasesCount > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--color-zinc-500)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-zinc-500)' }} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--color-zinc-950)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {catSubs.map(sub => (
                    <div
                      key={sub.id}
                      onClick={() => onSelectSubcontractor(sub)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-zinc-900)',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        border: '1px solid var(--color-zinc-800)',
                        transition: 'all 0.15s'
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
                        borderTop: '1px solid rgba(255,255,255,0.03)',
                        paddingTop: '6px'
                      }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-zinc-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingBottom: '2px' }}>
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
