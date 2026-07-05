import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  LogOut, 
  CheckCircle, 
  FolderPlus, 
  HelpCircle, 
  ChevronRight, 
  Check, 
  Trash2, 
  FolderOpen,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Database,
  Share2,
  Pencil
} from 'lucide-react';
import { listFolders, createFolder } from '../services/googleDrive';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../services/firebase';
import { ADMIN_PASSCODE, DEFAULT_FIREBASE_CONFIG, STORAGE_KEYS, getStoredConfigValue } from '../config/appConfig';

export default function Settings({ 
  geminiKey: _geminiKey, 
  setGeminiKey, 
  googleClientId: _googleClientId, 
  setGoogleClientId: _setGoogleClientId, 
  googleToken, 
  setGoogleToken: _setGoogleToken,
  selectedFolder: _selectedFolder,
  setSelectedFolder,
  googleUser,
  onSignOut,
  onSignIn,
  projects,
  setProjects,
  activeProject,
  setActiveProject,
  handleSelectActiveProject
}) {
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Admin & Invite management states
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  
  // Firebase credentials states
  const [firebaseApiKey, setFirebaseApiKey] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseApiKey, DEFAULT_FIREBASE_CONFIG.apiKey));
  const [firebaseProjectId, setFirebaseProjectId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseProjectId, DEFAULT_FIREBASE_CONFIG.projectId));
  const [firebaseAppId, setFirebaseAppId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseAppId, DEFAULT_FIREBASE_CONFIG.appId));

  // Gemini API Key states
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  const fetchInvitesList = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    setLoadingInvites(true);
    try {
      const qSnapshot = await getDocs(collection(db, 'invites'));
      const list = [];
      qSnapshot.forEach((d) => {
        if (d.id !== 'CONFIG-GEMINI') {
          list.push({ id: d.id, ...d.data() });
        }
      });
      // Sort by createdAt desc
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
        return timeB - timeA;
      });
      setInvites(list);
    } catch (err) {
      console.error('Failed to fetch invites:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const fetchSharedGeminiKey = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    try {
      const docRef = doc(db, 'invites', 'CONFIG-GEMINI');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.apiKey) {
          setTempGeminiKey(data.apiKey);
        }
      }
    } catch (err) {
      console.error('Failed to fetch shared Gemini key:', err);
    }
  };

  useEffect(() => {
    if (isAdminUnlocked) {
      fetchInvitesList();
      fetchSharedGeminiKey();
    }
  }, [isAdminUnlocked]);

  const handleGenerateInvite = async () => {
    const db = getFirebaseDb();
    if (!db) {
      setError('Database not configured. Set up Firebase below first.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      // Generate a code: ADPC-XXXX-XXXX
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345689';
      const genPart = () => {
        let p = '';
        for (let i = 0; i < 4; i++) {
          p += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return p;
      };
      const code = `ADPC-${genPart()}-${genPart()}`;
      
      await setDoc(doc(db, 'invites', code), {
        used: false,
        createdAt: new Date(),
        usedAt: null
      });
      
      setSuccess(`Generated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error(err);
      setError('Failed to generate invite code. Check database configuration.');
    }
  };

  const handleShareInvite = async (code) => {
    const inviteLink = `${window.location.origin}?code=${code}`;
    const message = `Hey! Here is your private invite link for the Adepec Homes Construction Scanner:\n\n👉 ${inviteLink}\n\nJust open the link and tap "Activate Access"!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Adepec Homes Scanner Invite',
          text: message,
          url: inviteLink
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(message);
        setSuccess('Invite details copied to clipboard! You can now paste and send it.');
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        console.error('Failed to copy:', err);
        setError('Failed to copy to clipboard.');
      }
    }
  };

  const handleDeleteInvite = async (code) => {
    const db = getFirebaseDb();
    if (!db) return;
    if (!window.confirm(`Deactivate/delete invite code: ${code}?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteDoc(doc(db, 'invites', code));
      setSuccess(`Deactivated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to deactivate invite code.');
    }
  };

  const handleSaveFirebaseConfig = () => {
    if (!firebaseApiKey.trim() || !firebaseProjectId.trim()) {
      setError('Firebase API Key and Project ID are required.');
      return;
    }
    localStorage.setItem(STORAGE_KEYS.firebaseApiKey, firebaseApiKey.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseProjectId, firebaseProjectId.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseAppId, firebaseAppId.trim());
    setSuccess('Firebase configuration saved successfully!');
    setError(null);
    setTimeout(() => {
      setSuccess(null);
      window.location.reload();
    }, 1500);
  };

  const handleSaveSharedGeminiKey = async () => {
    const db = getFirebaseDb();
    if (!db) {
      setError('Database not configured. Set up Firebase below first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSavingGeminiKey(true);
    try {
      await setDoc(doc(db, 'invites', 'CONFIG-GEMINI'), {
        apiKey: tempGeminiKey.trim(),
        updatedAt: new Date()
      });
      setSuccess('Shared Gemini API Key saved to database! Other users will receive it automatically on next load.');
      
      // Update local state and storage
      setGeminiKey(tempGeminiKey.trim());
      localStorage.setItem('jobscan_gemini_key', tempGeminiKey.trim());
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setError('Failed to save Gemini API Key to database.');
    } finally {
      setSavingGeminiKey(false);
    }
  };

  // Folder Explorer Navigation States
  const [currentParentId, setCurrentParentId] = useState('root');
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);

  // Redesign state variables
  const [projectNameInput, setProjectNameInput] = useState('');
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFolderPickerModal, setShowFolderPickerModal] = useState(false);
  const [showProjectsAccordion, setShowProjectsAccordion] = useState(false);
  const [tempSelectedFolder, setTempSelectedFolder] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [editingProject, setEditingProject] = useState(null);

  const handleSaveProject = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!projectNameInput.trim()) {
      setError('Please enter a Project Name');
      return;
    }
    if (!tempSelectedFolder) {
      setError('Please select a target Google Drive folder first');
      return;
    }

    if (editingProject) {
      // Edit existing project
      const updatedProjects = projects.map(p => {
        if (p.id === editingProject.id) {
          return {
            ...p,
            name: projectNameInput.trim(),
            folderId: tempSelectedFolder.id,
            folderName: tempSelectedFolder.name,
            appsScriptUrl: appsScriptUrlInput.trim() || ''
          };
        }
        return p;
      });
      setProjects(updatedProjects);
      localStorage.setItem('jobscan_projects', JSON.stringify(updatedProjects));

      const updatedProj = updatedProjects.find(p => p.id === editingProject.id);

      // If the edited project is the active one, update it in activeProject state/localStorage
      if (activeProject && activeProject.id === editingProject.id) {
        setActiveProject(updatedProj);
        localStorage.setItem('jobscan_active_project', JSON.stringify(updatedProj));
        
        setSelectedFolder({ id: updatedProj.folderId, name: updatedProj.folderName });
        localStorage.setItem('jobscan_folder_id', updatedProj.folderId);
        localStorage.setItem('jobscan_folder_name', updatedProj.folderName);
      }

      setProjectNameInput('');
      setAppsScriptUrlInput('');
      setTempSelectedFolder(null);
      setEditingProject(null);
      setShowCreateModal(false);
      setSuccess(`Project "${updatedProj.name}" updated successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      // Create new project
      if (projects.some(p => p.name.toLowerCase() === projectNameInput.trim().toLowerCase())) {
        setError(`A project named "${projectNameInput.trim()}" already exists.`);
        return;
      }

      const newProj = {
        id: `proj_${Date.now()}`,
        name: projectNameInput.trim(),
        folderId: tempSelectedFolder.id,
        folderName: tempSelectedFolder.name,
        appsScriptUrl: appsScriptUrlInput.trim() || ''
      };

      const updatedProjects = [...projects, newProj];
      setProjects(updatedProjects);
      localStorage.setItem('jobscan_projects', JSON.stringify(updatedProjects));

      // Automatically set the new project as active
      setActiveProject(newProj);
      localStorage.setItem('jobscan_active_project', JSON.stringify(newProj));

      // Update global selected folder to match active project
      setSelectedFolder({ id: newProj.folderId, name: newProj.folderName });
      localStorage.setItem('jobscan_folder_id', newProj.folderId);
      localStorage.setItem('jobscan_folder_name', newProj.folderName);

      setProjectNameInput('');
      setAppsScriptUrlInput('');
      setTempSelectedFolder(null);
      setShowCreateModal(false);
      setSuccess(`Project "${newProj.name}" saved and set as active!`);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleCancelCreateProject = () => {
    setProjectNameInput('');
    setAppsScriptUrlInput('');
    setTempSelectedFolder(null);
    setEditingProject(null);
    setShowCreateModal(false);
    setError(null);
  };

  const confirmDeleteProject = () => {
    if (!projectToDelete) return;
    const projectId = projectToDelete.id;
    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);
    localStorage.setItem('jobscan_projects', JSON.stringify(updatedProjects));

    if (activeProject && activeProject.id === projectId) {
      setActiveProject(null);
      localStorage.setItem('jobscan_active_project', 'null');
      setSelectedFolder(null);
      localStorage.removeItem('jobscan_folder_id');
      localStorage.removeItem('jobscan_folder_name');
    }

    setSuccess(`Project "${projectToDelete.name}" deleted.`);
    setProjectToDelete(null);
    setTimeout(() => setSuccess(null), 2500);
  };

  // Load folders once authenticated or when parent directory changes
  useEffect(() => {
    if (googleToken && showFolderPickerModal) {
      fetchFolders(currentParentId);
    }
  }, [googleToken, currentParentId, showFolderPickerModal]);

  const fetchFolders = async (parentId = 'root') => {
    setLoadingFolders(true);
    setError(null);
    try {
      const folderList = await listFolders(googleToken, parentId);
      setFolders(folderList);
    } catch (err) {
      console.error(err);
      setError('Could not retrieve Google Drive folders. The session may have expired.');
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleCreateFolder = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newFolderName.trim()) return;

    setError(null);
    setSuccess(null);
    try {
      await createFolder(
        googleToken, 
        newFolderName.trim(), 
        currentParentId === 'root' ? null : currentParentId
      );
      setSuccess(`Folder "${newFolderName}" created successfully!`);
      setNewFolderName('');
      await fetchFolders(currentParentId); // refresh current view
    } catch (err) {
      console.error(err);
      setError('Failed to create folder. Make sure you have permission.');
    }
  };

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '10px' }}>Application Settings</h2>
      
      {success && <div className="alert-box alert-success">{success}</div>}
      {error && <div className="alert-box alert-error">{error}</div>}

      {/* 1. Google Drive Account / Sign In */}
      {!googleToken ? (
        <div className="settings-card" style={{ marginBottom: '16px' }}>
          <h3 className="settings-title">
            <FolderOpen size={18} className="logo-icon" style={{ color: 'var(--color-amber-500)' }} />
            Connect Google Drive
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.4', marginBottom: '12px' }}>
            Sign in to link your Google Drive. This allows you to save PDF reports and automatically log expense details into Google Sheets.
          </p>
          <button onClick={onSignIn} className="btn btn-primary" style={{ backgroundColor: '#fff', color: '#18181b', fontWeight: 700 }}>
            Sign In with Google
          </button>
        </div>
      ) : (
        <div className="settings-card" style={{ marginBottom: '16px' }}>
          <h3 className="settings-title">
            <FolderOpen size={18} className="logo-icon" style={{ color: 'var(--color-amber-500)' }} />
            Google Drive Connection
          </h3>
          <div style={{ padding: '12px', backgroundColor: 'var(--color-zinc-900)', borderRadius: '8px', border: '1px solid var(--color-zinc-800)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-zinc-500)', fontWeight: 600 }}>SIGNED IN AS</div>
              <div style={{ fontWeight: 600, color: 'var(--color-zinc-100)', fontSize: '0.9rem' }}>{googleUser?.name || 'Google User'}</div>
            </div>
            <button onClick={onSignOut} className="btn btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* 2. Project Profiles Card (Only available if logged in) */}
      {googleToken && (
        <div className="settings-card" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 className="settings-title" style={{ marginBottom: '4px' }}>
            <FolderOpen size={18} className="logo-icon" style={{ color: 'var(--color-amber-500)' }} />
            Project Profiles
          </h3>



          {/* B. Create New Project Button */}
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => {
              setProjectNameInput('');
              setTempSelectedFolder(null);
              setShowCreateModal(true);
            }}
            style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Create New Project
          </button>

          {/* C. Collapsible Saved Projects Accordion */}
          {projects.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-zinc-800)', paddingTop: '12px' }}>
              <div 
                onClick={() => setShowProjectsAccordion(!showProjectsAccordion)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  cursor: 'pointer',
                  padding: '4px 0'
                }}
              >
                <label className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
                  Manage Project Profiles ({projects.length})
                </label>
                <div style={{ color: 'var(--color-zinc-400)' }}>
                  {showProjectsAccordion ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {showProjectsAccordion && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginTop: '12px' }}>
                  {projects.map(proj => {
                    const isActive = activeProject && activeProject.id === proj.id;
                    return (
                      <div 
                        key={proj.id} 
                        onClick={() => handleSelectActiveProject(proj.id)}
                        className="project-profile-row"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectActiveProject(proj.id);
                          }
                        }}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between', 
                          padding: '8px 12px', 
                          borderRadius: '6px', 
                          backgroundColor: isActive ? 'rgba(245, 158, 11, 0.05)' : 'var(--color-zinc-900)', 
                          border: isActive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--color-zinc-800)',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                          <div style={{ 
                            fontWeight: 600, 
                            color: isActive ? 'var(--color-amber-400)' : 'var(--color-zinc-200)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {proj.name} {isActive && <span style={{ fontSize: '0.7rem', color: 'var(--color-emerald-500)', marginLeft: '6px', fontWeight: 'bold' }}>(ACTIVE)</span>}
                          </div>
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--color-zinc-500)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            Folder: {proj.folderName} {proj.appsScriptUrl ? ' • Script Linked' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' }} onClick={(e) => e.stopPropagation()}>
                          <button 
                            type="button" 
                            onClick={() => {
                              setEditingProject(proj);
                              setProjectNameInput(proj.name);
                              setAppsScriptUrlInput(proj.appsScriptUrl || '');
                              setTempSelectedFolder({ id: proj.folderId, name: proj.folderName });
                              setShowCreateModal(true);
                            }}
                            className="nav-item" 
                            style={{ width: 'auto', padding: '4px', color: 'var(--color-amber-500)' }}
                            title="Edit Project Profile"
                          >
                            <Pencil size={14} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => {
                              setProjectToDelete(proj);
                            }}
                            className="nav-item" 
                            style={{ width: 'auto', padding: '4px', color: 'var(--color-rose-500)' }}
                            title="Delete Project Profile"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Help Card / How it works */}
      <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '4px' }}>
        <h3 className="settings-title" style={{ color: 'var(--color-zinc-200)', marginBottom: '8px' }}>
          <HelpCircle size={18} style={{ color: 'var(--color-amber-500)' }} />
          How it works
        </h3>
        <ol style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.5' }}>
          <li>Snap a photo of your receipt or check using your camera, or select an existing image from your gallery.</li>
          <li>The AI extracts description, totals, and category.</li>
          <li>Review details and optionally attach a receipt before uploading to Drive.</li>
        </ol>
      </div>

      {/* 3.5 Admin Invite & Database Management Card */}
      <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '4px' }}>
        <h3 
          className="settings-title" 
          onClick={() => setShowAdminPanel(!showAdminPanel)}
          style={{ color: 'var(--color-zinc-200)', marginBottom: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} style={{ color: 'var(--color-amber-500)' }} />
            Admin Invite Settings
          </span>
          <span style={{ color: 'var(--color-zinc-500)', fontSize: '0.8rem' }}>
            {showAdminPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </h3>

        {showAdminPanel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            {!isAdminUnlocked ? (
              /* Passcode protection form */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Admin Passcode</label>
                  <input 
                    type="password"
                    className="form-input"
                    value={adminPassInput}
                    onChange={(e) => setAdminPassInput(e.target.value)}
                    placeholder="Enter admin passcode"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (adminPassInput === ADMIN_PASSCODE) {
                          setIsAdminUnlocked(true);
                          setError(null);
                        } else {
                          setError('Incorrect Admin Passcode.');
                        }
                      }
                    }}
                  />
                </div>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    if (adminPassInput === ADMIN_PASSCODE) {
                      setIsAdminUnlocked(true);
                      setError(null);
                    } else {
                      setError('Incorrect Admin Passcode.');
                    }
                  }}
                >
                  Verify Admin
                </button>
              </div>
            ) : (
              /* Unlocked admin settings */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Config Database */}
                <div style={{ borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-amber-400)', marginBottom: '10px' }}>
                    Firebase Database Credentials
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Firebase API Key</label>
                      <input 
                        type="password"
                        className="form-input"
                        value={firebaseApiKey}
                        onChange={(e) => setFirebaseApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Firebase Project ID</label>
                      <input 
                        type="text"
                        className="form-input"
                        value={firebaseProjectId}
                        onChange={(e) => setFirebaseProjectId(e.target.value)}
                        placeholder="e.g. project-12345"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Firebase App ID (Optional)</label>
                      <input 
                        type="text"
                        className="form-input"
                        value={firebaseAppId}
                        onChange={(e) => setFirebaseAppId(e.target.value)}
                        placeholder="e.g. 1:12345:web:abcdef"
                      />
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={handleSaveFirebaseConfig}
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>

                {/* 1.5. Config Gemini API Key */}
                <div style={{ borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-amber-400)', marginBottom: '10px' }}>
                    Shared Gemini API Key
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-zinc-400)', marginBottom: '8px', lineHeight: '1.4' }}>
                    Set the Gemini API Key that all invited users will share. This key will be securely fetched from Firestore and is not stored in the GitHub repository.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Gemini API Key</label>
                      <input 
                        type="password"
                        className="form-input"
                        value={tempGeminiKey}
                        onChange={(e) => setTempGeminiKey(e.target.value)}
                        placeholder="Paste new Gemini Key (AIzaSy... or AQ...)"
                      />
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={handleSaveSharedGeminiKey}
                      disabled={savingGeminiKey}
                    >
                      {savingGeminiKey ? 'Saving Key...' : 'Save Gemini Key to Database'}
                    </button>
                  </div>
                </div>

                {/* 2. Create and Monitor Invites */}
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-amber-400)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Invite Code Management</span>
                    <button 
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGenerateInvite}
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      Generate Code
                    </button>
                  </h4>

                  {/* Invites list */}
                  <div style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px',
                    backgroundColor: 'var(--color-zinc-900)',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-zinc-800)'
                  }}>
                    {loadingInvites ? (
                      <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--color-zinc-500)' }}>
                        Loading invites...
                      </div>
                    ) : invites.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--color-zinc-600)' }}>
                        No invite codes generated yet.
                      </div>
                    ) : (
                      invites.map(inv => (
                        <div 
                          key={inv.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '6px 10px',
                            backgroundColor: 'var(--color-zinc-950)',
                            borderRadius: '6px',
                            border: '1px solid var(--color-zinc-800)',
                            fontSize: '0.8rem'
                          }}
                        >
                          <span style={{ fontWeight: 700, letterSpacing: '1px', fontFamily: 'monospace', color: inv.used ? 'var(--color-zinc-500)' : 'var(--color-zinc-100)' }}>
                            {inv.id}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              fontSize: '0.72rem', 
                              fontWeight: 'bold',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: inv.used ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.15)',
                              color: inv.used ? 'var(--color-zinc-500)' : 'var(--color-emerald-500)'
                            }}>
                              {inv.used ? 'CLAIMED' : 'ACTIVE'}
                            </span>
                            {!inv.used && (
                              <button
                                type="button"
                                onClick={() => handleShareInvite(inv.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-amber-500)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="Share Invite Link"
                              >
                                <Share2 size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteInvite(inv.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0.8
                              }}
                              title="Delete/Deactivate Invite Code"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Delete Confirmation Modal */}
      {projectToDelete && (
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
          zIndex: 1100,
          padding: '20px'
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
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h4 style={{ 
                fontWeight: 700, 
                fontSize: '1.05rem', 
                color: 'var(--color-zinc-100)',
                fontFamily: 'var(--font-serif)',
                marginBottom: '8px'
              }}>
                Delete Project Profile
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.4' }}>
                Are you sure you want to delete project <strong>{projectToDelete.name}</strong>?
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setProjectToDelete(null)}
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={confirmDeleteProject}
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1, backgroundColor: 'var(--color-rose-600)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create New Project Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 900,
          padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="settings-card" style={{
            width: '100%',
            maxWidth: '380px',
            backgroundColor: 'var(--color-zinc-950)',
            border: '1px solid var(--color-zinc-800)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '12px' }}>
              <h3 style={{ fontWeight: 700, color: 'var(--color-zinc-100)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={18} style={{ color: 'var(--color-amber-500)' }} />
                {editingProject ? 'Edit Project Profile' : 'Create New Project'}
              </h3>
              <button 
                type="button" 
                onClick={handleCancelCreateProject}
                style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Project Name Field */}
              <div className="form-group">
                <label className="form-label" htmlFor="new-project-name">Project Name</label>
                <input 
                  type="text"
                  id="new-project-name"
                  className="form-input"
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  placeholder="e.g. Lot 102, 456 Oak St"
                  required
                />
              </div>

              {/* Linked Folder Indicator / Button */}
              <div className="form-group">
                <label className="form-label">Google Drive Folder</label>
                
                {tempSelectedFolder ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '10px 12px', 
                    backgroundColor: 'rgba(16, 185, 129, 0.08)', 
                    border: '1px solid rgba(16, 185, 129, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    color: 'var(--color-emerald-500)', 
                    fontWeight: 500,
                    marginBottom: '8px'
                  }}>
                    <CheckCircle size={16} style={{ flex: 'none' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Linked Folder: <strong>{tempSelectedFolder.name}</strong>
                    </span>
                  </div>
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '10px 12px', 
                    backgroundColor: 'rgba(245, 158, 11, 0.08)', 
                    border: '1px solid rgba(245, 158, 11, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.85rem', 
                    color: 'var(--color-amber-500)', 
                    fontWeight: 500,
                    marginBottom: '8px'
                  }}>
                    <span>No folder linked yet.</span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowFolderPickerModal(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                >
                  <FolderOpen size={16} /> 
                  {tempSelectedFolder ? 'Change Folder...' : 'Select Target Folder...'}
                </button>
              </div>

              {/* Optional Apps Script Web App URL */}
              <div className="form-group">
                <label className="form-label" htmlFor="new-project-script-url">Apps Script URL (Optional)</label>
                <input 
                  type="text"
                  id="new-project-script-url"
                  className="form-input"
                  value={appsScriptUrlInput}
                  onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--color-zinc-500)', marginTop: '2px', display: 'block', lineHeight: '1.3' }}>
                  If provided, this enables a "Sync Now" button inside the app to trigger spreadsheet logging immediately on upload.
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', borderTop: '1px solid var(--color-zinc-800)', paddingTop: '12px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1 }}
                onClick={handleCancelCreateProject}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={handleSaveProject}
                disabled={!projectNameInput.trim() || !tempSelectedFolder}
              >
                {editingProject ? 'Update Project' : 'Save Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Google Drive Folder Picker Modal */}
      {showFolderPickerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="settings-card" style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: 'var(--color-zinc-950)',
            border: '1px solid var(--color-zinc-800)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '12px' }}>
              <h3 style={{ fontWeight: 700, color: 'var(--color-zinc-100)', fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderOpen size={18} style={{ color: 'var(--color-amber-500)' }} />
                Select Google Drive Folder
              </h3>
              <button 
                type="button" 
                onClick={() => setShowFolderPickerModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Breadcrumbs Navigation */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              alignItems: 'center', 
              gap: '4px', 
              fontSize: '0.82rem', 
              backgroundColor: 'var(--color-zinc-900)', 
              padding: '8px 12px', 
              borderRadius: '8px', 
              border: '1px solid var(--color-zinc-800)' 
            }}>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight size={12} style={{ color: 'var(--color-zinc-600)' }} />}
                  <button 
                    type="button"
                    onClick={() => {
                      setBreadcrumbs(breadcrumbs.slice(0, idx + 1));
                      setCurrentParentId(crumb.id);
                    }}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: idx === breadcrumbs.length - 1 ? 'var(--color-amber-500)' : 'var(--color-zinc-400)', 
                      fontWeight: idx === breadcrumbs.length - 1 ? '700' : '500', 
                      cursor: 'pointer', 
                      padding: '2px 4px', 
                      borderRadius: '4px' 
                    }}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Folder Explorer Browser list */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '6px', 
              maxHeight: '220px', 
              overflowY: 'auto', 
              backgroundColor: 'var(--color-zinc-900)', 
              border: '1px solid var(--color-zinc-800)', 
              borderRadius: '8px', 
              padding: '6px', 
              minHeight: '120px' 
            }}>
              {loadingFolders ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.85rem' }}>
                  <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px', margin: '0 auto 8px auto' }}></div>
                  Loading directories...
                </div>
              ) : folders.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--color-zinc-600)', fontSize: '0.85rem' }}>
                  No subfolders found inside this directory.
                </div>
              ) : (
                folders.map(folder => (
                  <div 
                    key={folder.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '6px 10px', 
                      borderRadius: '6px', 
                      backgroundColor: 'var(--color-zinc-950)', 
                      border: '1px solid var(--color-zinc-800)',
                      fontSize: '0.85rem'
                    }}
                  >
                    {/* Open subfolder */}
                    <div 
                      onClick={() => {
                        setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
                        setCurrentParentId(folder.id);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, fontWeight: 500, minWidth: 0, paddingRight: '8px' }}
                    >
                      <Folder size={16} style={{ color: 'var(--color-amber-500)', flex: 'none' }} />
                      <span style={{ color: 'var(--color-zinc-200)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
                    </div>

                    {/* Select Folder */}
                    <button
                      type="button"
                      onClick={() => {
                        setTempSelectedFolder({ id: folder.id, name: folder.name });
                        // Pre-fill project name if it is empty
                        if (!projectNameInput.trim()) {
                          setProjectNameInput(folder.name);
                        }
                        setShowFolderPickerModal(false);
                        setSuccess(`Linked folder: "${folder.name}"`);
                        setTimeout(() => setSuccess(null), 2500);
                      }}
                      className="btn btn-secondary"
                      style={{ 
                        width: 'auto', 
                        padding: '4px 10px', 
                        fontSize: '0.75rem', 
                        borderColor: tempSelectedFolder?.id === folder.id ? 'var(--color-emerald-500)' : 'var(--color-zinc-700)',
                        backgroundColor: tempSelectedFolder?.id === folder.id ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-zinc-800)',
                        color: tempSelectedFolder?.id === folder.id ? 'var(--color-emerald-500)' : 'var(--color-zinc-200)'
                      }}
                    >
                      {tempSelectedFolder?.id === folder.id ? <Check size={12} /> : 'Select'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Helper to select current opened folder */}
            {currentParentId !== 'root' && (
              <button
                type="button"
                onClick={() => {
                  const currentFolder = breadcrumbs[breadcrumbs.length - 1];
                  setTempSelectedFolder({ id: currentFolder.id, name: currentFolder.name });
                  // Pre-fill project name if it is empty
                  if (!projectNameInput.trim()) {
                    setProjectNameInput(currentFolder.name);
                  }
                  setShowFolderPickerModal(false);
                  setSuccess(`Linked folder: "${currentFolder.name}"`);
                  setTimeout(() => setSuccess(null), 2500);
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '8px 12px', fontWeight: 600, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                Use Current Folder: "{breadcrumbs[breadcrumbs.length - 1].name}"
              </button>
            )}

            {/* Create Folder Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--color-zinc-800)', paddingTop: '12px' }}>
              <label className="form-label" style={{ fontSize: '0.78rem' }}>Create New Folder in Here</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem', minWidth: 0 }}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New Folder name"
                />
                <button 
                  type="button"
                  onClick={handleCreateFolder}
                  className="btn btn-primary" 
                  style={{ 
                    width: 'auto', 
                    padding: '8px 14px', 
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap', 
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  disabled={!newFolderName.trim()}
                >
                  <FolderPlus size={14} /> Create
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid var(--color-zinc-800)', paddingTop: '12px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ width: '100%' }}
                onClick={() => setShowFolderPickerModal(false)}
              >
                Back to Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
