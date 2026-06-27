import React, { useState, useEffect } from 'react';
import { Search, DollarSign, Wallet, TrendingUp, ChevronDown, ChevronUp, RefreshCw, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { fetchProjectDashboardData } from '../services/sheetsDataService';

export default function Dashboard({ googleToken, activeProject, selectedFolder }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSub, setSelectedSub] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Fetch dashboard data
  const loadDashboardData = async (forceRefresh = false) => {
    if (!googleToken) {
      setError('Please connect your Google account in Settings to load the dashboard.');
      return;
    }
    
    // We need the tracking spreadsheet ID. Currently, it is stored or we find it in active project.
    // In our system, the spreadsheet ID is defined in the script.
    // For a fully dynamic client dashboard, we can search for the 'JobScan_Expense_Log' spreadsheet in the selectedFolder.
    // Let's first look in localStorage for a cached sheetId for this project, or search for it.
    setLoading(true);
    setError(null);
    
    try {
      let spreadsheetId = localStorage.getItem(`jobscan_sheet_id_${activeProject?.id}`);
      
      if (!spreadsheetId) {
        // Search for the JobScan_Expense_Log spreadsheet in Drive
        const query = `name='JobScan_Expense_Log' and '${selectedFolder.id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
        
        const response = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to find spreadsheet in Google Drive. Make sure you have synced at least once.');
        }
        
        const searchResult = await response.json();
        if (searchResult.files && searchResult.files.length > 0) {
          spreadsheetId = searchResult.files[0].id;
          localStorage.setItem(`jobscan_sheet_id_${activeProject.id}`, spreadsheetId);
        } else {
          throw new Error("Tracking spreadsheet 'JobScan_Expense_Log' not found in project folder. Please sync a receipt first to create the sheet.");
        }
      }

      // Fetch batch data from Sheets API
      const parsedData = await fetchProjectDashboardData(googleToken, spreadsheetId);
      setData(parsedData);
      
      // Cache values for offline usage
      localStorage.setItem(`jobscan_cached_dashboard_${activeProject.id}`, JSON.stringify(parsedData));
      
    } catch (err) {
      console.error(err);
      // Try to load cached data offline
      const cached = localStorage.getItem(`jobscan_cached_dashboard_${activeProject?.id}`);
      if (cached) {
        setData(JSON.parse(cached));
        setError(`Failed to load live data (offline). Displaying cached report from last load.`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Load on mount or active project change
  useEffect(() => {
    if (activeProject && selectedFolder) {
      // Load cached first for instant responsiveness
      const cached = localStorage.getItem(`jobscan_cached_dashboard_${activeProject.id}`);
      if (cached) {
        setData(JSON.parse(cached));
      }
      loadDashboardData();
    } else {
      setData(null);
      setError('Please select an active project in Settings to load the dashboard.');
    }
  }, [activeProject, selectedFolder]);

  // Autocomplete suggestions for contractor search
  const suggestions = data?.subcontractors
    ? data.subcontractors.filter(sub => {
        const query = searchTerm.toLowerCase();
        return (
          sub.payee.toLowerCase().includes(query) ||
          sub.phase.toLowerCase().includes(query) ||
          sub.category.toLowerCase().includes(query)
        );
      })
    : [];

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  const selectSubcontractor = (sub) => {
    setSelectedSub(sub);
    setSearchTerm('');
  };

  // Status badge styling
  const getStatusStyle = (status) => {
    const clean = String(status || '').trim().toLowerCase();
    if (clean.includes('complete') || clean.includes('done')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
    }
    if (clean.includes('progress') || clean.includes('started')) {
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
    }
    return { bg: 'rgba(113, 113, 122, 0.15)', text: '#a1a1aa', border: 'rgba(113, 113, 122, 0.3)' };
  };

  // Helper to format currency values safely
  const formatCurrency = (val) => {
    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }
    // If it's already a formatted string, return as-is
    if (String(val).startsWith('$')) return val;
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  if (!googleToken) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-zinc-400)' }}>
        <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <AlertCircle size={32} style={{ color: 'var(--color-amber-500)', margin: '0 auto' }} />
          <h3 style={{ fontWeight: 700, color: '#fff' }}>Google Drive Connection Required</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-500)', lineHeight: '1.4' }}>
            The dashboard reads financial data directly from your Google spreadsheet in real-time. Please connect your Google account in Settings to view this page.
          </p>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-zinc-400)' }}>
        <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <AlertCircle size={32} style={{ color: 'var(--color-amber-500)', margin: '0 auto' }} />
          <h3 style={{ fontWeight: 700, color: '#fff' }}>No Project Selected</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-500)', lineHeight: '1.4' }}>
            Go to Settings and create or select an active project profile linked to a Google Drive folder to load your spreadsheet financial data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>Project Financial Dashboard</h2>
          {data?.projectInfo?.address && (
            <p style={{ fontSize: '0.78rem', color: 'var(--color-zinc-500)', marginTop: '2px' }}>
              {data.projectInfo.address}, {data.projectInfo.cityStateZip}
            </p>
          )}
        </div>
        <button 
          onClick={() => loadDashboardData(true)} 
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '6px 10px', height: '32px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}
          disabled={loading}
        >
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="alert-box alert-error" style={{ fontSize: '0.78rem', margin: 0, padding: '10px 12px' }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Loading Placeholder */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '40px 0', alignItems: 'center' }}>
          <div className="spinner" style={{ width: '28px', height: '28px', borderWidth: '3px' }}></div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-zinc-500)' }}>Syncing spreadsheet variables...</span>
        </div>
      )}

      {data && (
        <>
          {/* KPI Financial Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-zinc-500)', textTransform: 'uppercase' }}>Gross Budget</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-zinc-100)', letterSpacing: '-0.02em' }}>
                {formatCurrency(data.projectInfo.budgetGross)}
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-600)' }}>
                Build: {formatCurrency(data.projectInfo.budgetBuild)}
              </span>
            </div>
            
            <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-zinc-500)', textTransform: 'uppercase' }}>Total Draws Paid</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-amber-500)', letterSpacing: '-0.02em' }}>
                {formatCurrency(data.projectInfo.totalSpent)}
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-600)' }}>
                Deposits: {formatCurrency(data.projectInfo.deposits)}
              </span>
            </div>

            <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(0,0,0,0) 100%)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-emerald-500)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wallet size={10} /> Net Capital
              </span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>
                {formatCurrency(data.projectInfo.capitalBalance)}
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-600)' }}>
                Real-Time Liquidity
              </span>
            </div>
          </div>

          {/* Subcontractor Balance Checker */}
          <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-zinc-200)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={16} style={{ color: 'var(--color-amber-500)' }} />
              Contractor Balance Lookup
            </h3>
            
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <input 
                type="text"
                className="form-input"
                placeholder="Search contractor payee (e.g. Painter, Electrician)..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedSub(null);
                }}
                style={{ width: '100%', paddingLeft: '36px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-zinc-600)' }} />
              
              {/* Autocomplete suggestions */}
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
                      onClick={() => selectSubcontractor(sub)}
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

            {/* Selected Contractor Balance Details Card */}
            {selectedSub ? (
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
                {/* Payee & Phase Headers */}
                <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-zinc-900)', paddingBottom: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{selectedSub.payee}</h4>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-zinc-500)', marginTop: '2px' }}>
                      Phase: <strong>{selectedSub.phase}</strong> ({selectedSub.category})
                    </p>
                  </div>
                  
                  {/* Status Badge */}
                  {(() => {
                    const style = getStatusStyle(selectedSub.status);
                    return (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 'bold',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: style.bg,
                        color: style.text,
                        border: `1px solid ${style.border}`,
                        textTransform: 'uppercase'
                      }}>
                        {selectedSub.status || 'Not Started'}
                      </span>
                    );
                  })()}
                </div>

                {/* Quote, Paid, Balance Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                  <div style={{ padding: '8px', backgroundColor: 'var(--color-zinc-900)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)', textTransform: 'uppercase', fontWeight: 600 }}>Original Quote</span>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-zinc-200)', marginTop: '2px' }}>
                      {formatCurrency(selectedSub.originalQuote)}
                    </div>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'var(--color-zinc-900)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)', textTransform: 'uppercase', fontWeight: 600 }}>Total Paid</span>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-zinc-200)', marginTop: '2px' }}>
                      {formatCurrency(selectedSub.totalPaid)}
                    </div>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-amber-500)', textTransform: 'uppercase', fontWeight: 700 }}>Remaining Balz</span>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                      {formatCurrency(selectedSub.remainingBalance)}
                    </div>
                  </div>
                </div>

                {/* Subcontractor Payments Log */}
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
                      {selectedSub.payments.map((p, idx) => (
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
                              Date: {p.date} {p.checkNumber && p.checkNumber !== 'N/A' ? `• Check: ${p.checkNumber}` : ''}
                            </span>
                          </div>
                          
                          <div style={{ textAlign: 'right', fontWeight: 700 }}>
                            {/* Compute total payment */}
                            {(() => {
                              const mat = parseFloat(p.materialCost.replace(/[^0-9.-]/g, '')) || 0;
                              const lab = parseFloat(p.laborCost.replace(/[^0-9.-]/g, '')) || 0;
                              return formatCurrency(mat + lab);
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-zinc-500)', fontStyle: 'italic' }}>
                Type a contractor name or phase (e.g. "framing" or "paint") above to verify their quote & payments.
              </div>
            )}
          </div>

          {/* Trade Phase Categories Accordion List */}
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-zinc-200)', marginBottom: '10px' }}>
              Trade Sections & Phase Totals
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.categories.map(cat => {
                const isExpanded = !!expandedCategories[cat.name];
                
                // Get subcontractors in this specific category
                const catSubs = data.subcontractors.filter(sub => sub.category === cat.name);

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
                    {/* Header */}
                    <div 
                      onClick={() => toggleCategory(cat.name)}
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
                      <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {cat.name}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-zinc-500)', marginLeft: '8px' }}>
                          ({cat.phasesCount} Phase{cat.phasesCount > 1 ? 's' : ''})
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)', textTransform: 'uppercase', fontWeight: 600 }}>Total Spent</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-zinc-200)' }}>
                            {formatCurrency(cat.totalPaid)}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--color-zinc-500)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-zinc-500)' }} />}
                      </div>
                    </div>

                    {/* Expanded Content list */}
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
                            onClick={() => selectSubcontractor(sub)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--color-zinc-900)',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              border: '1px solid transparent',
                              transition: 'all 0.15s'
                            }}
                            className="project-profile-row"
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, paddingRight: '8px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-zinc-200)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sub.phase}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-zinc-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Contractor: {sub.payee}
                              </span>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-zinc-300)' }}>
                                  {formatCurrency(sub.totalPaid)}
                                </span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--color-zinc-500)' }}>
                                  Bal: {formatCurrency(sub.remainingBalance)}
                                </span>
                              </div>
                              
                              {(() => {
                                const style = getStatusStyle(sub.status);
                                return (
                                  <span style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 'bold',
                                    padding: '2px 5px',
                                    borderRadius: '3px',
                                    backgroundColor: style.bg,
                                    color: style.text,
                                    border: `1px solid ${style.border}`,
                                    textTransform: 'uppercase',
                                    scale: '0.9',
                                    width: '78px',
                                    textAlign: 'center'
                                  }}>
                                    {sub.status || 'Not Started'}
                                  </span>
                                );
                              })()}
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
        </>
      )}
    </div>
  );
}
