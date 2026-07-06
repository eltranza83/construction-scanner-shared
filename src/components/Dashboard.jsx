import React, { useState, useEffect } from 'react';
import { Search, Wallet, ChevronDown, ChevronUp, RefreshCw, AlertCircle, Camera, X } from 'lucide-react';
import { fetchProjectDashboardData } from '../services/sheetsDataService';
import { uploadPhotoToPhaseFolder, listPhotosInPhase } from '../services/googleDrive';
import DashboardPhotoGallery from './DashboardPhotoGallery';

export default function Dashboard({ googleToken, activeProject, selectedFolder, onSessionExpired }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSub, setSelectedSub] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Inspection Photos & Reminders State
  const [activeGalleryPhase, setActiveGalleryPhase] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);

  const [dismissedReminders, setDismissedReminders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`jobscan_dismissed_reminders_${activeProject?.id}`) || '{}');
    } catch {
      return {};
    }
  });

  const [snoozedReminders, setSnoozedReminders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`jobscan_snoozed_reminders_${activeProject?.id}`) || '{}');
    } catch {
      return {};
    }
  });

  // Load photos lazily when active gallery phase opens
  useEffect(() => {
    const loadPhotos = async () => {
      if (!googleToken || !selectedFolder || !activeGalleryPhase) return;
      setLoadingPhotos(true);
      try {
        const list = await listPhotosInPhase(
          googleToken,
          selectedFolder.id,
          activeGalleryPhase.category,
          activeGalleryPhase.phase
        );
        setPhotos(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPhotos(false);
      }
    };
    loadPhotos();
  }, [activeGalleryPhase, googleToken, selectedFolder]);

  // Handle snapping/uploading a photo on-site
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeGalleryPhase) return;

    setUploadingPhoto(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Photo_${timestamp}_${file.name}`;

      await uploadPhotoToPhaseFolder(
        googleToken,
        selectedFolder.id,
        activeGalleryPhase.category,
        activeGalleryPhase.phase,
        fileName,
        file.type,
        file
      );

      // Reload gallery list
      const updatedList = await listPhotosInPhase(
        googleToken,
        selectedFolder.id,
        activeGalleryPhase.category,
        activeGalleryPhase.phase
      );
      setPhotos(updatedList);
    } catch (err) {
      console.error(err);
      alert(`Failed to save photo: ${err.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const dismissReminder = (phaseName) => {
    const updated = { ...dismissedReminders, [phaseName]: true };
    setDismissedReminders(updated);
    localStorage.setItem(`jobscan_dismissed_reminders_${activeProject?.id}`, JSON.stringify(updated));
  };

  const snoozeReminder = (phaseName) => {
    // Snooze for 24 hours
    const snoozeUntil = Date.now() + 24 * 60 * 60 * 1000;
    const updated = { ...snoozedReminders, [phaseName]: snoozeUntil };
    setSnoozedReminders(updated);
    localStorage.setItem(`jobscan_snoozed_reminders_${activeProject?.id}`, JSON.stringify(updated));
  };

  // Get active reminder candidates
  const getActiveReminders = () => {
    if (!data?.subcontractors) return [];

    // Check if Drywall & Sheetrock is Complete or In Progress
    const drywallSub = data.subcontractors.find(sub => sub.phase.toLowerCase().includes('drywall'));
    const isDrywallActive = drywallSub &&
      (drywallSub.status.toLowerCase().includes('progress') || drywallSub.status.toLowerCase().includes('complete') || drywallSub.status.toLowerCase().includes('done'));

    return data.subcontractors.filter(sub => {
      const status = String(sub.status || '').trim().toLowerCase();
      const isActive = status.includes('progress') || (status.includes('started') && !status.includes('not'));
      if (!isActive) return false;

      // If drywall is active/done, silence rough-ins
      const phaseName = sub.phase.toLowerCase();
      if (isDrywallActive) {
        const isRoughIn = phaseName.includes('plumbing') ||
          phaseName.includes('electrical') ||
          phaseName.includes('hvac') ||
          phaseName.includes('insulation') ||
          phaseName.includes('framing') ||
          phaseName.includes('foundation');
        if (isRoughIn) return false;
      }

      // Check if user dismissed it permanently
      if (dismissedReminders[sub.phase]) return false;

      // Check if user snoozed it (and 24 hrs hasn't passed)
      const snoozeUntil = snoozedReminders[sub.phase] || 0;
      if (Date.now() < snoozeUntil) return false;

      return true;
    });
  };

  const activeReminders = getActiveReminders();

  const getPhaseReminderTip = (phaseName) => {
    const name = phaseName.toLowerCase();
    if (name.includes('foundation')) {
      return 'Remember to capture photos of the rebar grids and plumbing sleeves before concrete is poured!';
    }
    if (name.includes('framing')) {
      return 'Take photos of studs, headers, and load-bearing columns before closing them up!';
    }
    if (name.includes('plumbing')) {
      return 'Snap photos of PEX runs, drainage slopes, and supply lines behind the walls!';
    }
    if (name.includes('electrical')) {
      return 'Photograph junction boxes, conduit routes, and panel layouts before drywall hides them!';
    }
    if (name.includes('hvac')) {
      return 'Document duct paths, line sets, and boot locations for future reference!';
    }
    if (name.includes('insulation')) {
      return 'Verify and document full insulation coverage behind batts or spray foam!';
    }
    if (name.includes('tile')) {
      return 'Take pictures of water-proofing pans and mud beds before laying tile!';
    }
    return `Ensure structural, layout, or utility work is fully photographed for reference!`;
  };

  // Fetch dashboard data
  const loadDashboardData = async (_forceRefresh = false) => {
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
        // Search for any spreadsheet inside the project folder
        const query = `'${selectedFolder.id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

        const response = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });

        if (response.status === 401) {
          if (onSessionExpired) {
            onSessionExpired();
            return;
          }
        }

        if (!response.ok) {
          throw new Error('Failed to search project folder in Google Drive.');
        }

        const searchResult = await response.json();
        if (searchResult.files && searchResult.files.length > 0) {
          // Prefer a spreadsheet named 'JobScan_Expense_Log' if multiple exist, otherwise use the first one
          const preferred = searchResult.files.find(f => f.name === 'JobScan_Expense_Log');
          spreadsheetId = preferred ? preferred.id : searchResult.files[0].id;
          localStorage.setItem(`jobscan_sheet_id_${activeProject.id}`, spreadsheetId);
        } else {
          throw new Error("No spreadsheet found in your project folder. Please move your project spreadsheet (e.g. 'test project spreadsheet') into this folder.");
        }
      }

      // Fetch batch data from Sheets API
      const parsedData = await fetchProjectDashboardData(googleToken, spreadsheetId);
      setData(parsedData);

      // Cache values for offline usage
      localStorage.setItem(`jobscan_cached_dashboard_${activeProject.id}`, JSON.stringify(parsedData));

    } catch (err) {
      console.error(err);
      const errMsg = err.message.toLowerCase();
      if (errMsg.includes('401') || errMsg.includes('unauthenticated') || errMsg.includes('auth') || errMsg.includes('credential')) {
        if (onSessionExpired) {
          onSessionExpired();
          return;
        }
      }
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
  }, [activeProject, selectedFolder, googleToken]);

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
    // Smooth scroll the lookup box directly to the top edge of the viewport
    setTimeout(() => {
      const el = document.getElementById('contractor-lookup-container');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  // Status badge styling
  const getStatusStyle = (status) => {
    const clean = String(status || '').trim().toLowerCase();
    if (clean.includes('complete') || clean.includes('done')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
    }
    if (clean.includes('progress') || (clean.includes('started') && !clean.includes('not'))) {
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: 'center' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--color-zinc-500)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Gross Budget</span>
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-zinc-100)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatCurrency(data.projectInfo.budgetGross)}
              </span>
              <span style={{ fontSize: '0.55rem', color: 'var(--color-zinc-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Build: {formatCurrency(data.projectInfo.budgetBuild)}
              </span>
            </div>

            <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: 'center' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--color-zinc-500)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Draws Paid</span>
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-amber-500)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatCurrency(data.projectInfo.totalSpent)}
              </span>
              <span style={{ fontSize: '0.55rem', color: 'var(--color-zinc-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Dep: {formatCurrency(data.projectInfo.deposits)}
              </span>
            </div>

            <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, textAlign: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(0,0,0,0) 100%)' }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--color-emerald-500)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Wallet size={8} /> Net Capital
              </span>
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatCurrency(data.projectInfo.capitalBalance)}
              </span>
              <span style={{ fontSize: '0.55rem', color: 'var(--color-zinc-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Liquidity
              </span>
            </div>
          </div>

          {/* Proactive Construction Alerts */}
          {activeReminders.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeReminders.map(rem => (
                <div
                  key={rem.id}
                  style={{
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(0,0,0,0) 100%)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--color-amber-500)',
                      padding: '6px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Camera size={16} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', lineHeight: '1.2' }}>
                        📸 {rem.phase} is active!
                      </h4>
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-zinc-400)', marginTop: '4px', lineHeight: '1.3' }}>
                        {getPhaseReminderTip(rem.phase)}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid rgba(245, 158, 11, 0.05)', paddingTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => snoozeReminder(rem.phase)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-zinc-500)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      Snooze 24h
                    </button>

                    <button
                      type="button"
                      onClick={() => dismissReminder(rem.phase)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-zinc-500)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      I've Taken Them
                    </button>

                    <label
                      style={{
                        backgroundColor: 'var(--color-amber-500)',
                        border: 'none',
                        color: '#0a0a0a',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={10} /> Snap Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          setActiveGalleryPhase({ category: rem.category, phase: rem.phase });
                          handlePhotoUpload(e);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Subcontractor Balance Checker */}
          <div id="contractor-lookup-container" className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-zinc-900)', paddingBottom: '8px', position: 'relative' }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '140px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{selectedSub.payee}</h4>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-zinc-500)', marginTop: '2px' }}>
                      Phase: <strong>{selectedSub.phase}</strong> ({selectedSub.category})
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveGalleryPhase({ category: selectedSub.category, phase: selectedSub.phase })}
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

                  {/* Status Badge & Close button aligned to the far right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'absolute', right: '0', top: '0', height: '100%', maxHeight: '32px' }}>
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
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap'
                        }}>
                          {selectedSub.status || 'Not Started'}
                        </span>
                      );
                    })()}

                    {/* Close/Dismiss Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedSub(null)}
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

                {/* Quote, Spent, Balance Grid */}
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
                      {formatCurrency(selectedSub.totalSpent)}
                    </div>
                  </div>
                  <div style={{ padding: '8px', backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--color-amber-500)', textTransform: 'uppercase', fontWeight: 700 }}>Remaining Balance</span>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.2' }}>
                          {cat.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', flexWrap: 'wrap', marginTop: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-amber-500)' }}>
                            Mat: {formatCurrency(cat.totalMaterial || 0)}
                          </span>
                          <span style={{ color: 'var(--color-zinc-700)' }}>•</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-blue-500)' }}>
                            Lab: {formatCurrency(cat.totalLabor || 0)}
                          </span>
                          <span style={{ color: 'var(--color-zinc-700)' }}>•</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-emerald-500)' }}>
                            Spent: {formatCurrency(cat.totalPaid || 0)}
                          </span>
                          <span style={{ color: 'var(--color-zinc-700)' }}>•</span>
                          <span style={{ color: 'var(--color-zinc-500)' }}>
                            {cat.phasesCount} Phase{cat.phasesCount > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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
                            {/* Top Row: Phase Name */}
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-zinc-100)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {sub.phase}
                              </span>
                            </div>

                            {/* Bottom Row: Contractor & Metrics */}
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
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>

                                {/* Material Total */}
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
                                  border: '1px solid rgba(96, 165, 250, 0.18)',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.04)'
                                }}>
                                  {/* Labor Total */}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-blue-500)', lineHeight: '1.2' }}>
                                      {formatCurrency(sub.totalLabor || 0)}
                                    </span>
                                    <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-500)', lineHeight: '1.1' }}>
                                      Lab
                                    </span>
                                  </div>

                                  <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'rgba(148, 163, 184, 0.16)' }} />

                                  {/* Balance */}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-zinc-300)', lineHeight: '1.2' }}>
                                      {formatCurrency(sub.remainingBalance)}
                                    </span>
                                    <span style={{ fontSize: '0.58rem', color: 'var(--color-zinc-500)', lineHeight: '1.1' }}>
                                      Bal
                                    </span>
                                  </div>
                                </div>
                              </div>
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

      <DashboardPhotoGallery
        activeGalleryPhase={activeGalleryPhase}
        photos={photos}
        loadingPhotos={loadingPhotos}
        uploadingPhoto={uploadingPhoto}
        fullscreenPhoto={fullscreenPhoto}
        onCloseGallery={() => setActiveGalleryPhase(null)}
        onPhotoUpload={handlePhotoUpload}
        onOpenPhoto={setFullscreenPhoto}
        onClosePhoto={() => setFullscreenPhoto(null)}
        getPhaseReminderTip={getPhaseReminderTip}
      />
    </div>
  );
}
