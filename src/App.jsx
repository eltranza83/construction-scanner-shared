import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Camera, Settings as SettingsIcon, Sparkles, Folder, LogIn, FileText, TrendingUp, MapPin, Check, Database, ClipboardCheck } from 'lucide-react';
import StagingCard from './components/StagingCard';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useInvoiceSync } from './hooks/useInvoiceSync';
import { useInviteGate } from './hooks/useInviteGate';
import { useProjects } from './hooks/useProjects';
import { useStagedDocuments } from './hooks/useStagedDocuments';
import { STATUS_MESSAGES } from './services/appErrors';

const Scanner = lazy(() => import('./components/Scanner'));
const EditForm = lazy(() => import('./components/EditForm'));
const Settings = lazy(() => import('./components/Settings'));
const InviteScreen = lazy(() => import('./components/InviteScreen'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const BlueprintPinboard = lazy(() => import('./components/BlueprintPinboard'));
const Inspections = lazy(() => import('./components/Inspections'));

function LazyScreenFallback() {
  return (
    <div className="settings-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px' }}>
      <div className="spinner" />
    </div>
  );
}

export default function App() {
  // App Navigation & UI State
  const [activeTab, setActiveTab] = useState('scanner');
  const [invoicesSubTab, setInvoicesSubTab] = useState('staged'); // 'staged' or 'history'
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const {
    isInvited,
    unlockInvite,
    resetInvite
  } = useInviteGate();
  const {
    googleClientId,
    setGoogleClientId,
    googleToken,
    setGoogleToken,
    googleUser,
    signingIn,
    signIn: handleGoogleSignIn,
    signOut: googleSignOut,
    handleSessionExpired
  } = useGoogleAuth({
    setError,
    setSuccess,
    onSignedOut: () => {
      resetInvite();
    }
  });
  const {
    selectedFolder,
    setSelectedFolder,
    projects,
    activeProject,
    setActiveProject,
    updateProjects: handleUpdateProjects,
    selectActiveProject: handleSelectActiveProject,
    resetProjectSelection
  } = useProjects({
    googleToken,
    setSuccess
  });
  const {
    stagedItems,
    animateBadge,
    editingItemId,
    setEditingItemId,
    draftToDelete,
    setDraftToDelete,
    handleDataExtracted,
    handleSaveStagedEdits,
    handleDeleteStaged,
    confirmDeleteDraft,
    handleAdjustTimer,
    handleResetTimer,
    handleUpdateDraftField,
    removeStagedItem
  } = useStagedDocuments({
    activeProject,
    setError,
    setSuccess
  });
  const {
    uploading,
    history,
    hasUnprocessedUploads,
    triggeringSync,
    handleTriggerAppsScriptSync,
    handleSyncToDrive,
    handleViewPDF
  } = useInvoiceSync({
    activeProject,
    googleToken,
    selectedFolder,
    projects,
    stagedItems,
    removeStagedItem,
    handleSessionExpired,
    setError,
    setSuccess
  });

  const handleSignOut = () => {
    googleSignOut();
    resetProjectSelection();
  };

  // Close project dropdown when clicking outside
  useEffect(() => {
    if (!showProjectDropdown) return;

    const handleOutsideClick = (e) => {
      const headerSection = document.querySelector('.header-project-section');
      if (headerSection && !headerSection.contains(e.target)) {
        setShowProjectDropdown(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showProjectDropdown]);

  if (!isInvited) {
    return (
      <Suspense fallback={<LazyScreenFallback />}>
        <InviteScreen
          onUnlocked={unlockInvite}
          googleUser={googleUser}
          authError={error}
          signingIn={signingIn}
          onGoogleSignIn={handleGoogleSignIn}
          onSignOut={handleSignOut}
        />
      </Suspense>
    );
  }

  return (
    <div className="app-container">
      {/* 1. Header */}
      <header className="app-header">
        <div className="logo-section">
          <svg className="logo-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="header-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#C5A059" />
                <stop offset="50%" stopColor="#F1D7A7" />
                <stop offset="100%" stopColor="#B28741" />
              </linearGradient>
            </defs>
            <path d="M50 15 L80 45 V85 H71 V45 L50 24 L29 45 V85 H20 V45 Z" fill="url(#header-gold)" />
            <path fillRule="evenodd" d="M50 33.5 L66.5 50 V85 H50.5 V73 H49.5 V85 H33.5 V50 Z M50 42.5 L57.5 50 V63 H42.5 V50 Z" fill="url(#header-gold)" />
          </svg>
          <div className="logo-text-group">
            <span className="logo-main-text">
              ADEPEC
            </span>
            <div className="header-logo-homes">
              HOMES
            </div>
          </div>
        </div>

        {/* Centered Project Selector Pill (Interactive Selector) */}
        <div 
          className="header-project-section" 
          onClick={(e) => {
            e.stopPropagation();
            setShowProjectDropdown(!showProjectDropdown);
          }}
          style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowProjectDropdown(!showProjectDropdown);
            }
          }}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            fontSize: '0.78rem', 
            color: 'var(--color-zinc-300)', 
            backgroundColor: 'var(--color-zinc-900)', 
            border: '1px solid var(--color-zinc-800)', 
            padding: '5px 12px', 
            borderRadius: '20px', 
            cursor: 'pointer', 
            maxWidth: '90%',
            userSelect: 'none'
          }}>
            <span style={{ color: 'var(--color-zinc-400)', whiteSpace: 'nowrap' }}>Current Project:</span>
            <span style={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
              {activeProject ? activeProject.name : 'None'}
            </span>
            <span style={{ color: 'var(--color-zinc-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
              ({selectedFolder ? selectedFolder.name : 'Set in Settings'})
            </span>
            <span style={{ fontSize: '0.55rem', color: 'var(--color-amber-500)', marginLeft: '1px', flexShrink: 0 }}>▼</span>
          </div>
          
          {showProjectDropdown && (
            /* Custom styled project dropdown popup centered */
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '240px',
              backgroundColor: 'var(--color-zinc-950)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
              zIndex: 1000,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-zinc-500)', borderBottom: '1px solid var(--color-zinc-800)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select Project
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {projects.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--color-zinc-500)', textAlign: 'center' }}>
                    No saved projects.
                  </div>
                ) : (
                  projects.map(proj => {
                    const isActive = activeProject && activeProject.id === proj.id;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectActiveProject(proj.id);
                          setShowProjectDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          backgroundColor: isActive ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                          border: 'none',
                          color: isActive ? 'var(--color-amber-400)' : 'var(--color-zinc-200)',
                          textAlign: 'left',
                          fontSize: '0.82rem',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          transition: 'var(--transition-all)'
                        }}
                        className="project-dropdown-item"
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {proj.name}
                        </span>
                        {isActive && <Check size={12} style={{ color: 'var(--color-amber-500)', flexShrink: 0 }} />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="app-content">
        {success && <div className="alert-box alert-success">{success}</div>}
        {error && <div className="alert-box alert-error">{error}</div>}

        {activeProject?.folderId && hasUnprocessedUploads && (
          <div className="settings-card" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            gap: '12px', 
            border: '1px solid rgba(16, 185, 129, 0.3)', 
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            padding: '10px 14px',
            borderRadius: '10px',
            marginTop: '-4px',
            marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Database size={16} style={{ color: 'var(--color-emerald-400)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-zinc-200)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Files uploaded! Sync spreadsheet?
              </span>
            </div>
            <button 
              onClick={handleTriggerAppsScriptSync}
              className="btn btn-primary" 
              style={{ 
                width: 'auto', 
                padding: '5px 12px',
                fontSize: '0.75rem',
                fontWeight: 700, 
                backgroundColor: 'var(--color-emerald-500)',
                color: '#000',
                border: 'none',
                height: '28px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              disabled={triggeringSync}
            >
              {triggeringSync ? (
                <>
                  <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.2px', borderColor: '#000', borderTopColor: 'transparent', margin: 0 }}></div>
                  {STATUS_MESSAGES.syncingSpreadsheet}
                </>
              ) : (
                "Sync Now"
              )}
            </button>
          </div>
        )}

        {/* Tab view routing */}
        <Suspense fallback={<LazyScreenFallback />}>
        {editingItemId && stagedItems.find(item => item.id === editingItemId) ? (
          <EditForm 
            stagedItem={stagedItems.find(item => item.id === editingItemId)}
            onSave={handleSaveStagedEdits}
            onCancel={() => setEditingItemId(null)}
            history={history}
            stagedItems={stagedItems}
            projects={projects}
          />
        ) : activeTab === 'scanner' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Scanner 
              onDataExtracted={handleDataExtracted}
              onError={setError}
            />

            {/* Google Drive Sign In Banner if not signed in */}
            {!googleToken && (
              <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--color-zinc-800)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Folder size={20} style={{ color: 'var(--color-amber-500)', marginTop: '2px', flex: 'none' }} />
                  <div>
                    <h4 style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>Connect Google Drive</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-500)', lineHeight: '1.4', marginTop: '2px' }}>
                      Sign in to save PDFs directly to your Google Drive and log expense items into a Google Sheet automatically.
                    </p>
                  </div>
                </div>
                <button onClick={handleGoogleSignIn} className="btn btn-secondary" style={{ backgroundColor: '#fff', color: '#18181b', fontWeight: 700 }}>
                  <LogIn size={16} /> Sign In with Google
                </button>
              </div>
            )}

            {/* No Projects Setup Warning */}
            {projects.length === 0 && (
              <div className="settings-card" style={{ 
                display: 'flex', 
                gap: '12px', 
                alignItems: 'flex-start',
                border: '1px solid rgba(245, 158, 11, 0.25)', 
                backgroundColor: 'rgba(245, 158, 11, 0.04)',
                borderLeft: '4px solid var(--color-amber-500)'
              }}>
                <Sparkles size={20} style={{ color: 'var(--color-amber-500)', marginTop: '2px', flex: 'none' }} />
                <div>
                  <h4 style={{ fontWeight: 700, color: 'var(--color-zinc-100)', fontSize: '0.88rem' }}>No Active Project Profiles</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-400)', lineHeight: '1.4', marginTop: '3px' }}>
                    You don't have any projects set up. Please go to your **Settings** tab to create your first project.
                  </p>
                  <button 
                    onClick={() => setActiveTab('settings')} 
                    className="btn btn-secondary" 
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', marginTop: '8px', borderColor: 'var(--color-amber-500)', color: 'var(--color-amber-400)' }}
                  >
                    Go to Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'invoices' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Sliding Pill Selector Segmented Control */}
            <div className="sliding-toggle-container">
              <div className={`sliding-toggle-active-bg ${invoicesSubTab === 'staged' ? 'left' : 'right'}`} />
              <button 
                type="button"
                className={`sliding-toggle-btn ${invoicesSubTab === 'staged' ? 'active' : ''}`}
                onClick={() => setInvoicesSubTab('staged')}
              >
                Staged ({stagedItems.length})
              </button>
              <button 
                type="button"
                className={`sliding-toggle-btn ${invoicesSubTab === 'history' ? 'active' : ''}`}
                onClick={() => setInvoicesSubTab('history')}
              >
                History ({history.length})
              </button>
            </div>

            {/* Sliding Sub Tab Panels */}
            {invoicesSubTab === 'staged' ? (
              <div key="staged-subtab" className="slide-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Staged Drafts ({stagedItems.length})</h2>
                  {stagedItems.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-500)', fontStyle: 'italic' }}>
                      Saved locally on device
                    </span>
                  )}
                </div>

                {!googleToken && stagedItems.length > 0 && (
                  <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--color-zinc-800)', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <Folder size={20} style={{ color: 'var(--color-amber-500)', marginTop: '2px', flex: 'none' }} />
                      <div>
                        <h4 style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>Connect Google Drive to Sync</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-500)', lineHeight: '1.4', marginTop: '2px' }}>
                          Sign in to sync your staged documents directly to your active project's Google Drive folder.
                        </p>
                      </div>
                    </div>
                    <button onClick={handleGoogleSignIn} className="btn btn-secondary" style={{ backgroundColor: '#fff', color: '#18181b', fontWeight: 700 }}>
                      <LogIn size={16} /> Sign In with Google
                    </button>
                  </div>
                )}
                
                {stagedItems.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.9rem', border: '1px dashed var(--color-zinc-800)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <FileText size={24} style={{ color: 'var(--color-zinc-700)' }} />
                    No staged documents. Scanned checks and receipts waiting for sync will appear here.
                    <button className="btn btn-secondary" onClick={() => setActiveTab('scanner')} style={{ width: 'auto', marginTop: '8px', fontSize: '0.8rem' }}>
                      Go Scan Document
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {stagedItems.map(item => (
                      <StagingCard 
                        key={item.id}
                        stagedItem={item}
                        onEditClick={() => setEditingItemId(item.id)}
                        onUploadClick={() => handleSyncToDrive(item.id)}
                        onDeleteClick={() => handleDeleteStaged(item.id)}
                        onAdjustTimer={(minutes) => handleAdjustTimer(item.id, minutes)}
                        onResetTimer={() => handleResetTimer(item.id)}
                        onDescriptionChange={(val) => handleUpdateDraftField(item.id, 'description', val)}
                        onCostCategoryChange={(val) => handleUpdateDraftField(item.id, 'costCategory', val)}
                        onLotNumberChange={(val) => handleUpdateDraftField(item.id, 'lotNumber', val)}
                        uploading={uploading === item.id}
                        googleToken={googleToken}
                        selectedFolder={selectedFolder}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key="history-subtab" className="slide-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Sync Log & History ({history.length})</h2>
                
                {history.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.9rem', border: '1px dashed var(--color-zinc-800)', borderRadius: '12px' }}>
                    No documents uploaded yet. Scans will be logged here.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {history.map(item => (
                      <div key={item.id} className="history-item">
                        <div className="history-info" style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                          <div className="history-title-text" style={{ wordBreak: 'break-word' }}>{item.description}</div>
                          <div className="history-meta">
                            {item.vendor} • {item.dateTransaction || 'N/A'}
                          </div>
                          {item.tradeCategory && item.tradePhase && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-amber-400)', marginTop: '2px', fontWeight: 500 }}>
                              Logged: {item.tradeCategory.replace(/_/g, ' ').replace(/&/g, '&')} → {item.tradePhase}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: item.costCategory === 'labor' ? 'var(--color-blue-500)' : 'var(--color-amber-500)', textTransform: 'uppercase' }}>
                              {item.costCategory}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-zinc-600)' }}>•</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-zinc-500)' }}>Logged {item.dateLogged}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                          <div className="history-price">${Number(item.amount).toFixed(2)}</div>
                          {item.link ? (
                            <button 
                              type="button"
                              onClick={() => handleViewPDF(item)}
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto', borderRadius: '6px', whiteSpace: 'nowrap' }}
                            >
                              View PDF
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-600)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                              Downloaded
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'dashboard' ? (
          <Dashboard 
            googleToken={googleToken}
            activeProject={activeProject}
            selectedFolder={selectedFolder}
            onSessionExpired={handleSessionExpired}
          />
        ) : activeTab === 'xray' ? (
          <BlueprintPinboard
            googleToken={googleToken}
            activeProject={activeProject}
            selectedFolder={selectedFolder}
          />
        ) : activeTab === 'inspections' ? (
          <Inspections
            activeProject={activeProject}
            selectedFolder={selectedFolder}
          />
        ) : (
          <Settings 
            googleClientId={googleClientId}
            setGoogleClientId={setGoogleClientId}
            googleToken={googleToken}
            setGoogleToken={setGoogleToken}
            selectedFolder={selectedFolder}
            setSelectedFolder={setSelectedFolder}
            googleUser={googleUser}
            onSignOut={handleSignOut}
            onSignIn={handleGoogleSignIn}
            projects={projects}
            setProjects={handleUpdateProjects}
            activeProject={activeProject}
            setActiveProject={setActiveProject}
            handleSelectActiveProject={handleSelectActiveProject}
          />
        )}
        </Suspense>
      </main>

      {/* 3. Navigation Footer */}
      {!editingItemId && (
        <nav className="app-nav">
          <button 
            className={`nav-item ${activeTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setActiveTab('scanner')}
          >
            <Camera size={20} />
            <span>Scanner</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('invoices');
              setInvoicesSubTab('staged'); // Default to staged drafts on tab switch
            }}
            style={{ position: 'relative' }}
          >
            <div key={stagedItems.length} className={`nav-item-inner ${animateBadge ? 'badge-bounce-pop' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%' }}>
              <FileText size={20} />
              <span>Invoices</span>
            </div>
            {stagedItems.length > 0 && (
              <span key={`badge-${stagedItems.length}`} className={`nav-badge ${animateBadge ? 'badge-bounce-pop' : ''}`}>
                {stagedItems.length}
              </span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <TrendingUp size={20} />
            <span>Dashboard</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'xray' ? 'active' : ''}`}
            onClick={() => setActiveTab('xray')}
          >
            <MapPin size={20} />
            <span>X-Ray</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'inspections' ? 'active' : ''}`}
            onClick={() => setActiveTab('inspections')}
          >
            <ClipboardCheck size={20} />
            <span>Inspections</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>Settings</span>
          </button>
        </nav>
      )}

      {/* Custom Delete Draft Confirmation Modal */}
      {draftToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1300,
          padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="settings-card" style={{
            width: '100%',
            maxWidth: '320px',
            backgroundColor: 'var(--color-zinc-950)',
            border: '1px solid var(--color-zinc-800)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            borderTop: '4px solid var(--color-rose-500)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h4 style={{ 
                fontWeight: 700, 
                fontSize: '1.05rem', 
                color: 'var(--color-zinc-100)',
                fontFamily: 'var(--font-serif)',
                marginBottom: '8px'
              }}>
                Discard Draft
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.4' }}>
                Are you sure you want to delete this draft?
                {draftToDelete.metadata?.description && (
                  <span style={{ display: 'block', marginTop: '6px', fontWeight: 600, color: 'var(--color-zinc-200)' }}>
                    "{draftToDelete.metadata.description}"
                  </span>
                )}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setDraftToDelete(null)}
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={confirmDeleteDraft}
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1, backgroundColor: 'var(--color-rose-600)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
