import React from 'react';
import { Wallet } from 'lucide-react';

export default function DashboardKpiCards({ projectInfo = {}, formatCurrency }) {
  const safeFormat = (val) => {
    if (typeof formatCurrency === 'function') return formatCurrency(val);
    const num = parseFloat(String(val || 0).replace(/[^0-9.-]/g, '')) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.85) 0%, rgba(18, 18, 18, 0.95) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
        borderRadius: '10px',
        padding: '10px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        minWidth: 0,
        textAlign: 'center'
      }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--color-zinc-400)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>Gross Budget</span>
        <span style={{ fontSize: '1.02rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {safeFormat(projectInfo?.budgetGross || 0)}
        </span>
        <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Build: {safeFormat(projectInfo?.budgetBuild || 0)}
        </span>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(197, 160, 89, 0.1) 0%, rgba(18, 18, 18, 0.95) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(197, 160, 89, 0.35)',
        boxShadow: '0 4px 16px rgba(197, 160, 89, 0.12)',
        borderRadius: '10px',
        padding: '10px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        minWidth: 0,
        textAlign: 'center'
      }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--color-amber-400)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>Draws Paid</span>
        <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--color-amber-400)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 0 10px rgba(197, 160, 89, 0.3)' }}>
          {safeFormat(projectInfo?.totalSpent || 0)}
        </span>
        <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Dep: {safeFormat(projectInfo?.deposits || 0)}
        </span>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(18, 18, 18, 0.95) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.12)',
        borderRadius: '10px',
        padding: '10px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        minWidth: 0,
        textAlign: 'center'
      }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>
          <Wallet size={10} /> Net Capital
        </span>
        <span style={{ fontSize: '1.02rem', fontWeight: 800, color: '#34d399', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 0 10px rgba(52, 211, 153, 0.3)' }}>
          {safeFormat(projectInfo?.capitalBalance || 0)}
        </span>
        <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Liquidity
        </span>
      </div>
    </div>
  );
}
