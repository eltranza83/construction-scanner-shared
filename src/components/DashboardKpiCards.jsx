import React from 'react';
import { Wallet } from 'lucide-react';

export default function DashboardKpiCards({ projectInfo, formatCurrency }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
      <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: 'center' }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--color-zinc-500)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Gross Budget</span>
        <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-zinc-100)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatCurrency(projectInfo.budgetGross)}
        </span>
        <span style={{ fontSize: '0.55rem', color: 'var(--color-zinc-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Build: {formatCurrency(projectInfo.budgetBuild)}
        </span>
      </div>

      <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: 'center' }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--color-zinc-500)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Draws Paid</span>
        <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-amber-500)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatCurrency(projectInfo.totalSpent)}
        </span>
        <span style={{ fontSize: '0.55rem', color: 'var(--color-zinc-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Dep: {formatCurrency(projectInfo.deposits)}
        </span>
      </div>

      <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(0,0,0,0) 100%)' }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--color-emerald-500)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Wallet size={8} /> Net Capital
        </span>
        <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatCurrency(projectInfo.capitalBalance)}
        </span>
        <span style={{ fontSize: '0.55rem', color: 'var(--color-zinc-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Liquidity
        </span>
      </div>
    </div>
  );
}
