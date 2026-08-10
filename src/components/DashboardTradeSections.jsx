import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

function PhaseMetricGroup({ sub, formatCurrency }) {
  const safeFormat = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0).replace(/[^0-9.-]/g, '')) || 0;
    const hasCents = Math.abs(num % 1) > 0.009;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
  };

  const phaseTotal = sub.totalSpent || (
    (parseFloat(String(sub.totalMaterial || 0).replace(/[^0-9.-]/g, '')) || 0) +
    (parseFloat(String(sub.totalLabor || 0).replace(/[^0-9.-]/g, '')) || 0)
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', width: '100%' }}>
      <div style={{
        fontWeight: 700,
        color: 'var(--color-amber-400)',
        backgroundColor: 'rgba(197, 160, 89, 0.1)',
        padding: '3px 4px',
        borderRadius: '5px',
        border: '1px solid rgba(197, 160, 89, 0.2)',
        fontSize: '0.66rem',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        Mat: {safeFormat(sub.totalMaterial || 0)}
      </div>

      <div style={{
        fontWeight: 700,
        color: '#60a5fa',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        padding: '3px 4px',
        borderRadius: '5px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        fontSize: '0.66rem',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        Lab: {safeFormat(sub.totalLabor || 0)}
      </div>

      <div style={{
        fontWeight: 700,
        color: '#34d399',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        padding: '3px 4px',
        borderRadius: '5px',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        fontSize: '0.66rem',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        Total: {safeFormat(phaseTotal)}
      </div>
    </div>
  );
}

export default function DashboardTradeSections({
  categories = [],
  subcontractors = [],
  expandedCategories = {},
  onToggleCategory,
  onSelectSubcontractor,
  formatCurrency
}) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeSubcontractors = Array.isArray(subcontractors) ? subcontractors : [];

  const safeFormat = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0).replace(/[^0-9.-]/g, '')) || 0;
    const hasCents = Math.abs(num % 1) > 0.009;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <div>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-zinc-200)', marginBottom: '10px' }}>
        Trade Sections & Phase Totals
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {safeCategories.map((cat, index) => {
          const isExpanded = !!expandedCategories[cat.name];
          const catSubs = safeSubcontractors.filter(sub => sub.category === cat.name);

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
              {/* Category Card Header - Structured 2-Row Layout */}
              <div
                onClick={() => onToggleCategory(cat.name)}
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  backgroundColor: isExpanded ? 'rgba(10, 10, 10, 0.9)' : 'transparent',
                  borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                  transition: 'background-color 0.2s ease'
                }}
              >
                {/* Row 1: Category Title + Phase Count & Expand Arrow */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    color: '#E5C158',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    lineHeight: '1.2',
                    textShadow: '0 0 12px rgba(197, 160, 89, 0.25)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {cat.name}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ color: 'var(--color-zinc-400)', fontSize: '0.7rem', fontWeight: 600 }}>
                      {cat.phasesCount} Phase{cat.phasesCount > 1 ? 's' : ''}
                    </span>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--color-amber-400)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-zinc-500)' }} />}
                  </div>
                </div>

                {/* Row 2: Fixed 3-Column Pill Bar (Mat, Lab, Spent) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  <div style={{
                    fontWeight: 700,
                    color: 'var(--color-amber-400)',
                    backgroundColor: 'rgba(197, 160, 89, 0.12)',
                    padding: '3px 4px',
                    borderRadius: '5px',
                    border: '1px solid rgba(197, 160, 89, 0.25)',
                    fontSize: '0.68rem',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    Mat: {safeFormat(cat.totalMaterial || 0)}
                  </div>

                  <div style={{
                    fontWeight: 700,
                    color: '#60a5fa',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    padding: '3px 4px',
                    borderRadius: '5px',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    fontSize: '0.68rem',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    Lab: {safeFormat(cat.totalLabor || 0)}
                  </div>

                  <div style={{
                    fontWeight: 700,
                    color: '#34d399',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    padding: '3px 4px',
                    borderRadius: '5px',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: '0.68rem',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    Spent: {safeFormat(cat.totalPaid || 0)}
                  </div>
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
                    {catSubs.map(sub => {
                      const cleanPayee = String(sub.payee || '').trim();
                      const cleanPhase = String(sub.phase || '').trim();
                      const isPlaceholder = !cleanPayee ||
                        cleanPayee.toLowerCase() === cleanPhase.toLowerCase() ||
                        cleanPayee.toLowerCase().endsWith('payee') ||
                        cleanPayee.toLowerCase() === `${cleanPhase.toLowerCase()} payee`;

                      const isAssigned = !isPlaceholder;
                      const displayPayee = isAssigned ? cleanPayee : 'Assign Payee (Unassigned)';

                      return (
                        <div
                          key={sub.id}
                          onClick={() => onSelectSubcontractor(sub)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(24, 24, 27, 0.9)',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                          className="project-profile-row"
                        >
                          {/* Row 1: Full Phase Name & Payee Status */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-zinc-100)', fontSize: '0.84rem' }}>
                              {sub.phase}
                            </span>
                            <span style={{
                              fontWeight: isAssigned ? 600 : 400,
                              color: isAssigned ? 'var(--color-amber-400)' : 'var(--color-zinc-500)',
                              fontSize: '0.73rem',
                              fontStyle: isAssigned ? 'normal' : 'italic'
                            }}>
                              {displayPayee}
                            </span>
                          </div>

                          {/* Row 2: Fixed 3-Column Pill Bar (Mat, Lab, Total) */}
                          <PhaseMetricGroup sub={sub} formatCurrency={formatCurrency} />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
