import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { STATUS_MESSAGES, getDriveErrorMessage, getUploadErrorMessage, isAuthError } from '../services/appErrors';
import {
  getCachedDashboardSpreadsheetId,
  loadCachedDashboard,
  listDashboardPhasePhotos,
  loadProjectDashboardFromFolder,
  persistDashboardCache,
  persistDashboardSpreadsheetId,
  uploadDashboardPhasePhoto
} from '../services/dashboardDrive';
import DashboardContractorSearch from './DashboardContractorSearch';
import DashboardKpiCards from './DashboardKpiCards';
import DashboardPhotoReminders from './DashboardPhotoReminders';
import DashboardPhotoGallery from './DashboardPhotoGallery';
import DashboardTradeSections from './DashboardTradeSections';

export default function Dashboard({ googleToken, activeProject, selectedFolder, onSessionExpired, onShowToast }) {
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
        const list = await listDashboardPhasePhotos({
          accessToken: googleToken,
          projectFolderId: selectedFolder.id,
          phase: activeGalleryPhase
        });
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
  const handlePhotoUpload = async (e, targetPhase = activeGalleryPhase) => {
    const file = e.target.files[0];
    if (!file || !targetPhase) return;

    setActiveGalleryPhase(targetPhase);

    setUploadingPhoto(true);
    try {
      const updatedList = await uploadDashboardPhasePhoto({
        accessToken: googleToken,
        projectFolderId: selectedFolder.id,
        phase: targetPhase,
        file
      });
      setPhotos(updatedList);
    } catch (err) {
      console.error(err);
      setError(getUploadErrorMessage(err, 'photo'));
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
      const cachedSpreadsheetId = getCachedDashboardSpreadsheetId(localStorage, activeProject?.id);
      const { spreadsheetId, data: parsedData } = await loadProjectDashboardFromFolder({
        accessToken: googleToken,
        projectFolderId: selectedFolder.id,
        cachedSpreadsheetId
      });
      if (spreadsheetId !== cachedSpreadsheetId) {
        persistDashboardSpreadsheetId(localStorage, activeProject.id, spreadsheetId);
      }
      setData(parsedData);

      // Cache values for offline usage
      persistDashboardCache(localStorage, activeProject.id, parsedData);

    } catch (err) {
      console.error(err);
      if (isAuthError(err)) {
        if (onSessionExpired) {
          onSessionExpired();
          return;
        }
      }
      // Try to load cached data offline
      const cached = loadCachedDashboard(localStorage, activeProject?.id);
      if (cached) {
        setData(cached);
        setError('Could not load live dashboard data. Displaying cached report from last load.');
      } else {
        setError(getDriveErrorMessage(err, 'load dashboard data'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Load on mount or active project change
  useEffect(() => {
    if (activeProject && selectedFolder) {
      // Load cached first for instant responsiveness
      const cached = loadCachedDashboard(localStorage, activeProject.id);
      if (cached) {
        setData(cached);
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
          {loading ? STATUS_MESSAGES.refreshing : STATUS_MESSAGES.refresh}
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
          <span style={{ fontSize: '0.85rem', color: 'var(--color-zinc-500)' }}>{STATUS_MESSAGES.loadingDashboard}</span>
        </div>
      )}

      {data && (
        <>
          <DashboardKpiCards
            projectInfo={data?.projectInfo || {}}
            formatCurrency={formatCurrency}
          />

          <DashboardPhotoReminders
            reminders={activeReminders}
            getPhaseReminderTip={getPhaseReminderTip}
            onSnoozeReminder={snoozeReminder}
            onDismissReminder={dismissReminder}
            onPhotoUpload={handlePhotoUpload}
          />

          <DashboardContractorSearch
            searchTerm={searchTerm}
            suggestions={suggestions}
            selectedSub={selectedSub}
            formatCurrency={formatCurrency}
            getStatusStyle={getStatusStyle}
            onSearchTermChange={(value) => {
              setSearchTerm(value);
              setSelectedSub(null);
            }}
            onSelectSubcontractor={selectSubcontractor}
            onClearSelection={() => setSelectedSub(null)}
            onViewPhasePhotos={setActiveGalleryPhase}
            onShowToast={onShowToast}
          />

          {/* Trade Phase Categories Accordion List */}
          <DashboardTradeSections
            categories={data?.categories || []}
            subcontractors={data?.subcontractors || []}
            expandedCategories={expandedCategories}
            onToggleCategory={toggleCategory}
            onSelectSubcontractor={selectSubcontractor}
            formatCurrency={formatCurrency}
          />
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
